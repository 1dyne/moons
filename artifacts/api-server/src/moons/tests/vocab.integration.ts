// v8.1: a TEPS study day through the MCP proposal path — terms, one batch, a corrected note, records from an artifact.
import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA,q,newId,type Driver} from '../lib/server/db.ts';
import {initV5,loadWorkspace} from '../lib/server/v5/workspace-store.ts';
import {addInbox,changeStore,decideBatch,decideInbox,listInbox,listRecords,openBatch,storeRecord,type Revision,type Satellite} from '../lib/server/satellites/store.ts';
import {proposalData} from '../lib/server/mcp/tools.ts';
import type {Concept} from '../lib/server/v5/concepts.ts';
import {examplesOf,matcher} from '@workspace/moons-sync/terms';
const memory=new PGlite();let owner:string,other:string;
before(async()=>{
 await memory.exec(SCHEMA);const driver:Driver={query:(s,p)=>memory.query(s,p) as ReturnType<Driver['query']>,transaction:fn=>memory.transaction(tx=>fn({query:(s,p)=>tx.query(s,p) as ReturnType<Driver['query']>}))};
 (globalThis as unknown as {__moonsDb:Promise<Driver>}).__moonsDb=Promise.resolve(driver);await initV5();owner=newId();other=newId();await q('insert into guests(id) values($1),($2)',[owner,other]);
 await changeStore(owner,s=>{s.satellites=[{id:'drill',name:'TEPS 연습',icon:'Orbit',description:'',kind:'external',url:'https://claude.ai/artifact/abc',embed:'tab',madeBy:{type:'ai'},planetIds:[],show:true,agent:{mode:'off'},createdAt:'',updatedAt:''} as Satellite]});
});

const original=`- careen: The taxi careened down the road while poilce was running after it.
- swerve to avoid: I swerved to avoid the careening taxi which poilce was running after.
- trail behind: Did you heard the news? A trail of blood were detected behind a hiking trail. So now he's trailing behind almost 20%/p.
- skid on ice: Last time I skidded on ice.`;
const revised=`- careen: The taxi careened down the road while the police were chasing it.
- swerve to avoid: I swerved to avoid the careening taxi which the police were chasing.
- trail behind: Did you hear the news? A trail of blood was detected behind a hiking trail. So now he's trailing by almost 20 points.
- skid on ice: Last time I skidded on ice.`;
const term=(name:string,extra:Record<string,unknown>={})=>({kind:'concept' as const,name,conceptKind:'term' as const,pos:'v.',meaningKo:`${name} 뜻`,...extra});
const day=()=>[
 term('careen',{relations:[{to:'swerve',rel:'related' as const,note:'careen = 통제 잃고 질주 / swerve = 피하려고 홱 꺾음'}]}),term('swerve',{collocations:['swerve to avoid']}),term('veer'),term('jolt'),term('skid',{relations:[{to:'swerve',rel:'related' as const}]}),
 term('trudge'),term('trail',{pos:'n./v.',collocations:['trail behind']}),term('crooked',{pos:'adj.'}),
 {kind:'note' as const,title:'TEPS Day1 예문',words:'user' as const,text:original,revision:{text:revised,corrections:[{from:'Did you heard',to:'Did you hear',reason:'did + 동사원형'},{from:'A trail of blood were',to:'A trail of blood was',reason:'주어 trail은 단수'}]}},
 {kind:'note' as const,title:'첨삭 메모',words:'ai' as const,text:'police는 복수로 받는다.'},
];
async function send(batchId:string){
 if((await openBatch(owner,batchId)).length)return 'duplicate';
 for(const a of day())await addInbox(owner,{type:'claude',name:'Claude'},a.kind,proposalData(a),{id:batchId,title:'TEPS 10/29 Day1'});
 return 'sent';
}

test('a study day arrives as one batch: concepts in one approval, the corrected note checked on its own', async()=>{
 assert.equal(await send('day1'),'sent');
 assert.equal(await send('day1'),'duplicate','the same batch sent twice stays one card');
 const open=(await listInbox(owner)).filter(x=>x.batch?.id==='day1');
 assert.equal(open.length,10);
 const corrected=open.find(x=>x.kind==='note'&&x.data.revision)!;
 const r=await decideBatch(owner,'day1',{action:'approve',ids:open.filter(x=>x!==corrected).map(x=>x.id)});
 assert.equal(r.count,9);
 let s=(await loadWorkspace(owner)).store;const cs=s.concepts as Concept[];
 assert.equal(cs.length,8);
 const careen=cs.find(c=>c.name==='careen')!,swerve=cs.find(c=>c.name==='swerve')!;
 assert.equal(careen.relations[0]!.to,swerve.id,'a relation sent before its target existed points at it');
 assert.equal(careen.relations[0]!.why?.startsWith('careen ='),true);
 assert.deepEqual(swerve.term?.collocations,['swerve to avoid']);
 assert.equal((await listInbox(owner)).filter(x=>x.batch?.id==='day1').length,1,'the corrected note still waits');
 // The user keeps their own sentence for one row and takes the rest.
 const rows=(corrected.data.revision as {rows:{orig?:number;rev?:number}[]}).rows;
 const keep=rows.findIndex(x=>x.orig===0);
 const choices=rows.map((x,i)=>i===keep?'orig':x.rev!==undefined?'rev':'none');
 const d=await decideInbox(owner,corrected.id,{action:'approve',data:{choices}});
 s=(await loadWorkspace(owner)).store;
 const note=s.entries.find(e=>e.id===d.entryId)! as typeof s.entries[number]&{revision:Revision};
 assert.equal(note.body,original,'the original keeps every typo');
 assert.ok(note.body.includes('Did you heard')&&note.revision.text.includes('Did you hear the news?'));
 assert.ok(note.revision.text.includes('poilce was running after it'),'the kept row stays as I wrote it');
 assert.equal(note.revision.by[note.revision.sentences.findIndex(x=>x.includes('Did you hear'))],'user_approved');
 assert.equal(note.revision.by[note.revision.sentences.findIndex(x=>x.includes('skidded on ice'))],'user');
 const ex=examplesOf(s.entries as never,careen,matcher(s.concepts as Concept[]));
 assert.deepEqual([...new Set(ex.map(x=>x.author))],['user_approved','user']);
 assert.equal(ex.filter(x=>x.author==='user').length,2,'the taxi sentence and the "careening taxi" in the swerve sentence');
 await assert.rejects(changeStore(owner,st=>{const e=st.entries.find(x=>x.id===note.id)! as typeof note;e.revision={...e.revision,text:'changed'}}),/approved version is locked/);
});

test('sending the same words again merges into the concepts already there', async()=>{
 await addInbox(owner,{type:'claude'},'concept',proposalData(term('skid',{forms:['skidded'],collocations:['skid on ice']})),{id:'day2',title:'Day2'});
 await addInbox(owner,{type:'claude'},'concept',proposalData(term('veer',{collocations:['veer off the road'],autoLink:false})),{id:'day2',title:'Day2'});
 await decideBatch(owner,'day2',{action:'approve'});
 const cs=(await loadWorkspace(owner)).store.concepts as Concept[];
 assert.equal(cs.length,8);
 assert.deepEqual(cs.find(c=>c.name==='skid')!.term?.collocations,['skid on ice']);
 assert.equal(cs.find(c=>c.name==='veer')!.autoLink,false);
});

test('a batch is all or nothing, and the error names the item', async()=>{
 await addInbox(owner,{type:'claude'},'concept',proposalData(term('hamper')),{id:'bad',title:'bad'});
 await addInbox(owner,{type:'claude'},'note',{title:'빈 노트',text:'',words:'user'},{id:'bad',title:'bad'});
 await assert.rejects(decideBatch(owner,'bad',{action:'approve'}),/빈 노트/);
 assert.ok(!((await loadWorkspace(owner)).store.concepts as Concept[]).some(c=>c.name==='hamper'));
 assert.equal((await listInbox(owner)).filter(x=>x.batch?.id==='bad').length,2);
});

test('add_record: the signed-in user writes to their own Satellite only, once per id; "fixed" counts as missed', async()=>{
 const rec={id:'a1',kind:'attempt',title:'빈칸 10문항',items:[{label:'careen',result:'fixed'},{label:'veer',result:'right'}],userText:['The taxi careened.'],apply:'request'};
 assert.deepEqual(await storeRecord(owner,'drill',rec),{accepted:true,duplicate:false,id:'a1'});
 assert.equal((await storeRecord(owner,'drill',rec)).duplicate,true);
 await assert.rejects(storeRecord(other,'drill',rec),/not found/);
 await assert.rejects(storeRecord(owner,'drill',{id:'big',summary:'x'.repeat(70000)}),/64KB/);
 assert.equal((await listRecords(owner,'drill')).length,1);
 const draft=(await listInbox(owner)).find(x=>x.kind==='record_note')!;
 assert.deepEqual(draft.data.missed,['careen']);
});
