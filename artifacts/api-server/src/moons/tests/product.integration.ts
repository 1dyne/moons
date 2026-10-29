import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SCHEMA,q,json,newId,type Driver} from '../lib/server/db';
import {initV5,initialWorkspace,guest,issueGuestCookie,loadWorkspace} from '../lib/server/v5/workspace-store';
import {comparisonLanguage,followsComparisonLanguage,missedNote} from '../lib/server/v5/comparison-language';
import {compareTexts} from '../lib/server/v5/analysis';
import {openai,openaiEmbedder} from '../lib/server/ai/openai';
import {claimWorkspace,ownsRecording} from '../lib/server/v5/claim';
import {kstDay} from '../lib/server/v5/kst';
import {limitNotifications} from '../lib/server/v5/notifications';
import {runDaily} from '../lib/server/v5/daily';
import {transcribeChunks,command} from '../lib/server/v5/audio-chunks';
import type {Store} from '../lib/server/v5/types';
const memory=new PGlite(),oldJson=openai.json,oldEmbed=openaiEmbedder.embed;
before(async()=>{
 await memory.exec(SCHEMA);
 const driver:Driver={query:(s,p)=>memory.query(s,p) as any,transaction:fn=>memory.transaction(tx=>fn({query:(s,p)=>tx.query(s,p) as any}))};
 (globalThis as any).__moonsDb=Promise.resolve(driver);await initV5();
 openaiEmbedder.embed=async (texts:string[])=>texts.map(()=>[1,0]);
});
after(async()=>{openai.json=oldJson;openaiEmbedder.embed=oldEmbed;await memory.close()});
test('Product: language follows answer, not Chinese original; wrong-language output retries',async()=>{
 let calls=0;
 openai.json=(async(task:any)=>{
  assert.match(task.system,/MUST be written in English/);
  assert.equal(JSON.parse(task.user).responseLanguage,'English');
  calls++;
  return{data:calls===1?{summary:'这是中文总结',items:[{answer:0,verdict:'kept',original:[0],note:'这是中文说明',shiftType:null}]}:{summary:'The meaning is retained.',items:[{answer:0,verdict:'kept',original:[0],note:'The answer retains the central point.',shiftType:null}]},model:'fixture'};
 }) as typeof openai.json;
 const result=await compareTexts({id:'o',sentences:['保留原文意思。']},{sentences:['Keep the original meaning.']});
 assert.equal(calls,2);assert.ok(result.items.every(i=>!/\p{Script=Han}/u.test(i.note)));assert.equal(result.summary,'The meaning is retained.');
});
test('Product: two wrong-language generations fail explicitly, never persist Chinese commentary',async()=>{
 openai.json=(async()=>({data:{summary:'这是中文',items:[{answer:0,verdict:'added',original:[],note:'这是中文说明',shiftType:null}]},model:'fixture'})) as typeof openai.json;
 await assert.rejects(()=>compareTexts({id:'o',sentences:['Original.']},{sentences:['This answer is written in English.']}),/answer language/);
});
test('Product: Korean/Japanese answers and deterministic Missed use the answer language',()=>{
 assert.equal(comparisonLanguage('나는 원문을 그대로 남기고 싶다.'),'Korean');
 assert.equal(comparisonLanguage('私は元の文章を残したいです。'),'Japanese');
 assert.equal(comparisonLanguage('I want to preserve the original words.'),'English');
 assert.ok(followsComparisonLanguage(missedNote('Korean'),'Korean'));
 assert.ok(!followsComparisonLanguage('这是中文说明','English'));
});
test('Product: KST midnight is 15:00 UTC, notification cap uses KST day',()=>{
 assert.equal(kstDay('2026-10-14T14:59:59Z'),'2026-10-14');assert.equal(kstDay('2026-10-14T15:00:00Z'),'2026-10-15');
 const candidates=[1,2].map(i=>({key:`c${i}`,kind:'breaking_news',headline:'Fixture',evidence:[]}));
 const prior=[1,2].map(i=>({id:String(i),kind:'breaking_news',headline:'Before KST midnight',evidence:[],status:'new',createdAt:'2026-10-14T14:59:59Z'}));
 assert.equal(limitNotifications(prior,candidates,undefined,'2026-10-14T15:00:00Z').length,2);
 assert.equal(limitNotifications(prior,candidates,undefined,'2026-10-14T14:59:59Z').length,0);
});
async function newGuest(body:string) {
 const id=newId();await q('insert into guests(id) values($1)',[id]);
 const store=initialWorkspace();store.entries=[{id:newId(),kind:'dump',body,sentences:[body],planetIds:['p-learning'],createdAt:new Date().toISOString(),locked:true,status:'saved'}];
 await q('insert into personal_workspaces(owner_id,store) values($1,$2::jsonb)',[id,json(store)]);
 return {id,store};
}
test('Product: claim first guest, merge second guest atomically, idempotent retry keeps originals',async()=>{
 const first=await newGuest('First original — never rewrite.'),second=await newGuest('Second original — never rewrite.');
 const a=await claimWorkspace('user-product','fixture@example.invalid',first.id);
 assert.equal(a.ownerId,first.id);
 const b=await claimWorkspace('user-product','fixture@example.invalid',second.id);
 assert.equal(b.ownerId,first.id);assert.equal(b.entries,2);
 const current=await loadWorkspace(first.id);
 assert.deepEqual(current.store.entries.map(e=>e.body),[first.store.entries[0].body,second.store.entries[0].body]);
 assert.equal((await loadWorkspace(second.id)).store.entries[0].body,second.store.entries[0].body);
 assert.equal((await claimWorkspace('user-product','fixture@example.invalid',second.id)).entries,2);
 assert.equal((await q('select * from claimed_workspace_snapshots where user_id=$1',['user-product'])).length,2);
 assert.equal(await ownsRecording(first.id,`private/moons/${second.id}/recording.webm`),true);
 await assert.rejects(()=>claimWorkspace('another-user','another@example.invalid',second.id),(e:any)=>e.status===403);
});
test('Product: conflicting original IDs roll back claim, preserving both workspaces',async()=>{
 const source=await newGuest('Conflicting original.');
 const target=(await q<{owner_id:string}>('select owner_id from user_workspaces where user_id=$1',['user-product']))[0].owner_id;
 const current=await loadWorkspace(target);
 source.store.entries[0].id=current.store.entries[0].id;
 await q('update personal_workspaces set store=$2::jsonb where owner_id=$1',[source.id,json(source.store)]);
 await assert.rejects(()=>claimWorkspace('user-product','fixture@example.invalid',source.id),(e:any)=>e.status===409);
 assert.equal((await q<{user_id:string|null}>('select user_id from guests where id=$1',[source.id]))[0].user_id,null);
 assert.equal((await loadWorkspace(target)).store.entries.length,2);
});
test('Product: a claimed guest cookie cannot reopen the account workspace when signed out',async()=>{
 let header='';const req={headers:{},secure:true,get:()=>undefined} as any;
 const res={append:(_k:string,value:string)=>header=value} as any;
 const target=(await q<{owner_id:string}>('select owner_id from user_workspaces where user_id=$1',['user-product']))[0].owner_id;
 issueGuestCookie(req,res,target);assert.match(header,/HttpOnly/);assert.match(header,/Secure/);const stale=header.split(';')[0];
 assert.notEqual(await guest({...req,headers:{cookie:stale}},res),target);
});
test('Product: daily batch runs once per KST day, persists completion',async()=>{
 const result=await runDaily();assert.equal(result.skipped,false);assert.equal(result.timeZone,'Asia/Seoul');
 const again=await runDaily();assert.equal(again.skipped,true);
 const row=(await q<{state:string}>('select state from daily_runs where day=$1',[kstDay()]))[0];assert.equal(row.state,'complete');
});
test('Product: 250 second audio -> independently playable 120s chunks, absolute timestamps, original unchanged',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'moons-product-test-'));
 try{
  const input=path.join(directory,'fixture.ogg');
  await command('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=250','-ac','1','-c:a','libopus','-b:a','16k',input]);
  const original=await readFile(input),before=Buffer.from(original);let calls=0;
  const result=await transcribeChunks(original,async(blob,name)=>{
   calls++;assert.ok(blob.size>0);assert.equal(blob.type,'audio/ogg');assert.match(name,/part-\d{4}\.ogg/);
   return{text:`Chunk ${calls}`,segments:[{start:1,end:2,text:`Chunk ${calls}`}],duration:120};
  });
  assert.equal(calls,3);assert.equal(result.chunkCount,3);assert.equal(result.chunkSeconds,120);
  assert.ok(Math.abs(result.segments[1].start-121)<.1);assert.ok(Math.abs(result.segments[2].start-241)<.1);
  assert.ok(Math.abs(result.duration-250)<.1);assert.deepEqual(original,before);
 }finally{await rm(directory,{recursive:true,force:true})}
});
test('Product: a supporting original (AI summary) is cross-checked without touching the primary comparison', async()=>{
 const {action}=await import('../lib/server/v5/workspace-actions');
 openai.json=(async(task:any)=>{const u=JSON.parse(task.user);return {data:{summary:'Compared.',items:u.answer.map((_:string,i:number)=>({answer:i,verdict:i===0?'kept':'shifted',original:[0],note:'Fixture note.',shiftType:i===0?null:'certainty_raised'}))},model:'fixture'}}) as typeof openai.json;
 const mk=(id:string,kind:'dump'|'media',sentences:string[])=>({id,kind,body:sentences.join(' '),sentences,planetIds:[],createdAt:new Date().toISOString(),locked:true,status:'saved',title:id});
 const store=initialWorkspace();
 store.entries=[mk('transcript','media',['We ship low-poly first.','Textures come later if time allows.']),mk('summary','media',['Low-poly ships first.','Textures come later.']),mk('answer','dump',['Low-poly first.','Textures definitely next week.'])] as any;
 await action('owner-x',store,'compare',{entryId:'answer',originalId:'transcript',extraIds:['summary','transcript','nope']}).catch(e=>assert.equal(e.status,404));
 await action('owner-x',store,'compare',{entryId:'answer',originalId:'transcript',extraIds:['summary','transcript']});
 const answer=store.entries.find(e=>e.id==='answer')!;
 assert.equal(answer.comparison!.materialEntryId,'transcript');
 assert.equal(answer.crossChecks!.length,1,'the primary is never its own supporting original');
 const cc=answer.crossChecks![0]!;
 assert.equal(cc.materialEntryId,'summary');
 assert.ok(cc.items.every(i=>i.verdict!=='missed'),'Missed is counted against the primary only');
 assert.equal(cc.drift.items.filter(i=>i.answer>=0).length,2,'the summary itself is read against the transcript');
});
