import {createHash} from 'node:crypto';
import {q,json,newId} from '../db.ts';
import {splitSentences} from '../../thought.ts';
import {analyzePersonal} from '../personal.ts';
import {ai} from '../ai/index.ts';
import {transcribeChunks} from './audio-chunks.ts';
import {assemble} from '../material.ts';
import {compareTexts,detectEmotions} from './analysis.ts';
import {compareStructure} from './structure-compare.ts';
import {carryUserChoices} from './user-choices.ts';
import {extractConcepts,fillConceptPages,orphansOf,refreshStates} from './concepts.ts';
import {structureMaterial} from '../structure-v3.ts';
import {mapDump} from './dump-map.ts';
import {draftSubQuestions} from './question-ai.ts';
import {chatNote,exploreMap} from './chat-note.ts';
import {alignConcepts,entryKnowledge,nextExplore} from './next-explore.ts';
const bar=(store:Store)=>{const v=Number((store.settings as {explainableBar?:number}|undefined)?.explainableBar);return v>0&&v<=1?v:0.8};
import {extractUrl} from './url-material.ts';
import {chatTurn} from './chat.ts';
import {refreshNotifications} from './notifications.ts';
import {canResplit,validateStore} from './workspace-store.ts';
import {WorkspaceError,type Store,type Entry,now} from './types.ts';
import {maybePlantImpostor,recordImpostorCheck} from './impostor.ts';
import {annotationLines,gapSignals,notationFor,notationPrompt,readNotation} from './notation.ts';

const str=(input:unknown,max=20000)=>typeof input==='string'?input.slice(0,max):'';
export async function materialEntry(store:Store,payload:Record<string,unknown>,allowStoredAudio=false) {
 const adapter=str(payload.adapter,20);
 if(!['dump','url','audio','ai_chat','pdf'].includes(adapter))throw new WorkspaceError(400,'This material adapter is designed, shipping next.');
 let text=str(payload.text??payload.audioText,60000),title=str(payload.title,200),url=str(payload.url,2000);
 if(adapter==='url'){const extracted=await extractUrl(url);text=extracted.text;title=title||extracted.title;url=extracted.url}
 if(adapter==='audio'&&(!allowStoredAudio||!payload.objectPath))throw new WorkspaceError(400,'Upload the recording through the audio upload endpoint.');
 if(adapter==='pdf'&&(!allowStoredAudio||!payload.objectPath))throw new WorkspaceError(400,'Upload the PDF through the PDF upload endpoint.');
 if(!text.trim())throw new WorkspaceError(400,'Material text is required.');
 const sentences=splitSentences(text);
 const times=Array.isArray(payload.sentenceTimes)?payload.sentenceTimes:[],pages=Array.isArray(payload.sentencePages)?payload.sentencePages:[];
 const entry:Entry={id:newId(),kind:'media',mediaType:adapter==='url'?'article':adapter==='audio'?'video':adapter==='pdf'?'paper':'custom',body:text,sentences,locked:true,createdAt:now(),status:'saved',title:title||'Original material',planetIds:typeof payload.defaultPlanet==='string'&&store.planets.some(p=>p.id===payload.defaultPlanet)?[payload.defaultPlanet]:[],
  meta:{adapter,url:adapter==='url'?url:undefined,objectPath:payload.objectPath,mime:payload.mime,source:adapter==='ai_chat'?'MOONS response (AI material, not user words)':'Original'},
  anchors:sentences.map((sentence,i)=>adapter==='url'?{kind:'url',url:`${url.split('#')[0]}#:~:text=${encodeURIComponent(sentence)}`} : adapter==='audio'?{kind:'time',seconds:Number(times[i]??0)}:adapter==='ai_chat'?{kind:'message',index:i,role:'assistant'}:adapter==='pdf'?{kind:'page',page:Number(pages[i]??1)}:{kind:'none'})};
 store.entries.unshift(entry);
 const notifications=store.notifications??[];
 if(store.settings?.notificationKinds?.source_ready!==false)notifications.unshift({id:newId(),kind:'source_ready',headline:'Your original is ready to compare.',evidence:[entry.id],status:'new',createdAt:now()});
 store.notifications=notifications;
 return {entryId:entry.id};
}
export async function action(owner:string,store:Store,kind:string,payload:Record<string,unknown>) {
 const entryId=str(payload.entryId,100);
 const entry=store.entries.find(e=>e.id===entryId);
 switch(kind){
  case 'import':{
   const backup=validateStore(payload.backup);
   const hash=createHash('sha256').update(json(backup)).digest('hex');
   if((await q('select owner_id from workspace_imports where owner_id=$1 and content_hash=$2',[owner,hash])).length)return {imported:0,duplicate:true};
   const ids=new Set(store.entries.map(e=>e.id)),planets=new Set(store.planets.map(p=>p.id));
   const wasEmpty=store.entries.length===0;
   for(const e of backup.entries){const existing=store.entries.find(v=>v.id===e.id);if(existing&&existing.body!==e.body)throw new WorkspaceError(409,'Backup contains an ID already used by a different original.')}
   const additions=backup.entries.filter(e=>!ids.has(e.id));
   store.entries=[...additions,...store.entries];
   store.planets=wasEmpty?[...backup.planets,...store.planets.filter(p=>!backup.planets.some(b=>b.id===p.id))]:[...store.planets,...backup.planets.filter(p=>!planets.has(p.id))];
   store.chats=[...(store.chats??[]),...(backup.chats??[]).filter(c=>!store.chats?.some(v=>v.id===c.id))];
   store.tiles=wasEmpty&&backup.tiles?.length?backup.tiles:[...(store.tiles??[]),...(backup.tiles??[]).filter(t=>!store.tiles?.some(v=>v.id===t.id))];
   if(wasEmpty&&backup.settings)store.settings=backup.settings;
   if(!store.universe&&backup.universe)store.universe=backup.universe;
   store.views=[...((store.views as unknown[])??[]),...((backup.views as unknown[])??[])];
   if(!store.profile&&backup.profile)store.profile=backup.profile;
   // The import marker is written by the router only after its CAS save succeeds.
   return {imported:additions.length,importHash:hash};
  }
  case 'analyze':{
   if(!entry)throw new WorkspaceError(404,'Node not found.');
   // Re-structuring an older note first restores the lines its old split dropped (the body is unchanged).
   if(canResplit(entry))entry.sentences=splitSentences(entry.body);
   if(entry.kind==='media'){
    // A material gets its answer map from claims (v7 6.1).
    const analysis=await structureMaterial({sentences:entry.sentences,title:entry.title});
    entry.analysis=carryUserChoices(entry.analysis,analysis as unknown as NonNullable<Entry['analysis']>);
    entry.status='done';
    await conceptsFor(store,entry);
    orphansOf(store,entry);
    entry.knowledge=entryKnowledge(entry,bar(store));
    return {entryId};
   }
   const notation=notationFor(store,entry);
   const skip=annotationLines(entry.sentences,readNotation(store));
   const analysis=await analyzePersonal({skip,sentences:entry.sentences,title:entry.title,mediaType:entry.mediaType,structure:str(payload.structure,30)||undefined,planets:store.planets,notation:notationPrompt(notation)});
   analysis.signals=[...analysis.signals,...gapSignals(entry.sentences,analysis.nodes,notation,skip)] as typeof analysis.signals;
   const emotions=await detectEmotions(analysis.nodes);
   entry.analysis=carryUserChoices(entry.analysis,{...analysis,nodes:analysis.nodes.map(n=>({...n,emotions:emotions.get(n.id)??[]}))});
   entry.status='done';
   // A suggested title is a label beside the original, never part of it. It fills an empty title or replaces
   // MOONS's own earlier one; a title the user wrote or edited stays.
   if(analysis.suggestedTitle&&entry.kind==='dump'&&(!entry.title||entry.meta?.titleSource==='ai')){entry.title=analysis.suggestedTitle;entry.meta={...entry.meta,titleSource:'ai'}}
   await maybePlantImpostor(owner,store,entry);
   await conceptsFor(store,entry);
   // The claims layer on the user's own map (v7 6.2). A failure leaves the map as it is.
   await mapDump(store,entry).catch(()=>null);
   entry.knowledge=entryKnowledge(entry,bar(store));
   return {entryId};
  }
  case 'material':{
   if(payload.adapter==='ai_chat'&&!store.chats?.some(c=>c.messages.some(m=>m.role==='assistant'&&m.text===payload.text)))throw new WorkspaceError(400,'AI material must come from a saved assistant response, not user-authored words.');
   return materialEntry(store,payload);
  }
  case 'compare':{
   const original=store.entries.find(e=>e.id===payload.originalId);
   if(!entry||!original||original.kind!=='media'||original.id===entry.id)throw new WorkspaceError(404,'Choose an original material and a separate answer in your space.');
   const notationText=notationPrompt(notationFor(store,entry));
   entry.comparison=await compareTexts(original,entry,notationText);
   // The structure layer needs the note's structure. A failed reading leaves the sentence layer standing.
   entry.comparison.structure=await compareStructure(original,entry).catch(()=>null);
   // Supporting originals (an AI summary, someone else's minutes): read the answer against each,
   // and read each against the primary original to show where the summary itself drifted.
   const extraIds=Array.isArray(payload.extraIds)?[...new Set(payload.extraIds.filter((x):x is string=>typeof x==='string'&&x!==original.id))].slice(0,2):[];
   const extras=extraIds.map(id=>store.entries.find(e=>e.id===id&&e.kind==='media'&&e.id!==entry.id));
   if(extras.some(e=>!e))throw new WorkspaceError(404,'Choose supporting originals from your materials.');
   entry.crossChecks=[];
   for(const extra of extras as Entry[]){
    const mine=await compareTexts(extra,entry,notationText);
    const drift=await compareTexts(original,extra);
    entry.crossChecks.push({materialEntryId:extra.id,materialTitle:extra.title??'Original',summary:mine.summary,
     items:mine.items.filter(i=>i.verdict!=='missed'),
     drift:{summary:drift.summary,items:drift.items}});
   }
   if(!entry.crossChecks.length)delete entry.crossChecks;
   // The original's concepts join the user's here, so the concept page carries both layers.
   if(!original.meta?.conceptsAt)await conceptsFor(store,original);
   refreshStates(store,[entry.id,original.id]);
   const cmp=entry.comparison as typeof entry.comparison&{concepts?:unknown;next?:unknown};
   cmp.concepts=alignConcepts(store,entry,original);
   cmp.next=await nextExplore(store,entry,original);
   entry.knowledge=entryKnowledge(entry,bar(store));
   return {comparison:entry.comparison};
  }
  case 'question_ai':{
   if(!entry)throw new WorkspaceError(404,'Note not found.');
   return {subQuestions:await draftSubQuestions(store,entry)};
  }
  case 'chat_note':{
   const res=await chatNote(store,str(payload.chatId,100));
   const note=store.entries.find(e=>e.id===res.entryId);
   const ids=(note?.chat as {study?:{conceptIds?:string[]}}|undefined)?.study?.conceptIds??[];
   await fillConceptPages(store,ids).catch(()=>undefined);
   return res;
  }
  case 'explore_map':return await exploreMap(store,payload);
  case 'concepts':{
   if(!entry)throw new WorkspaceError(404,'Note not found.');
   return {concepts:await conceptsFor(store,entry,true)};
  }
  case 'chat':{
   const text=str(payload.text,12000).trim();
   if(!text)throw new WorkspaceError(400,'Enter a message.');
   return chatTurn(owner,store,str(payload.chatId,100),text);
  }
  case 'check':{
   if(!entry)throw new WorkspaceError(404,'Entry not found.');
   const type=str(payload.targetType,20),id=str(payload.targetId,100);
   const targets=type==='node'?entry.analysis?.nodes:entry.analysis?.nodes.flatMap(n=>n.emotions??[]);
   if(!targets?.some(n=>n.id===id)||!['agree','mean'].includes(String(payload.verdict)))throw new WorkspaceError(400,'Invalid intent check.');
   await q(`insert into intent_checks(entry_id,target_type,target_id,owner_id,verdict,comment) values($1,$2,$3,$4,$5,$6) on conflict(entry_id,target_type,target_id,owner_id) do update set verdict=excluded.verdict,comment=excluded.comment`,[entryId,type,id,owner,payload.verdict,str(payload.comment,200)]);
   if(type==='node')await recordImpostorCheck(owner,id,String(payload.verdict));
   const checks=await q<{target_type:string;target_id:string;verdict:string;comment:string}>('select target_type,target_id,verdict,comment from intent_checks where entry_id=$1 and owner_id=$2',[entryId,owner]);
   entry.checks=checks.map(c=>({targetType:c.target_type,targetId:c.target_id,verdict:c.verdict,comment:c.comment}));
   return {checks:entry.checks};
  }
  case 'notifications':{
   const n=store.notifications?.find(v=>v.id===payload.id);
   if(!n)throw new WorkspaceError(404,'Notification not found.');
   if(!['seen','dismissed'].includes(String(payload.status)))throw new WorkspaceError(400,'Invalid notification status.');
   n.status=String(payload.status);return {notification:n};
  }
  case 'refresh_notifications':store.notifications=await refreshNotifications(store,owner);return {notifications:store.notifications};
  default:throw new WorkspaceError(400,'Unknown workspace action.');
 }
}
/** Concepts from one note, then their pages filled. A failure here never undoes the structure that was just made. */
async function conceptsFor(store:Store,entry:Entry,strict=false){
 try{const touched=await extractConcepts(store,entry);await fillConceptPages(store,touched);refreshStates(store,[entry.id]);return touched.length}
 catch(e){if(strict)throw e;return 0}
}
export async function transcribeAudio(data:Buffer,filename:string,mime:string) {
 if(!mime.startsWith('audio/')&&!mime.startsWith('video/'))throw new WorkspaceError(400,'Upload an audio or video recording.');
 const transcript=await transcribeChunks(data);
 if(!transcript.text.trim())throw new WorkspaceError(422,'No speech was recognized. The recording has not been saved.');
 if(!transcript.segments.length)throw new WorkspaceError(422,'No timestamped transcript was returned. Please retry.');
 const assembled=assemble(transcript.segments.map(s=>({start_sec:s.start,end_sec:s.end,text:s.text})));
 return {text:assembled.body,sentenceTimes:assembled.times};
}
