import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {diff} from '@workspace/moons-sync';
import {SCHEMA,q,json,newId,type Driver} from '../lib/server/db';
import {initV5,initialWorkspace,loadWorkspace,persistWorkspace} from '../lib/server/v5/workspace-store';
import {applyDeviceChanges} from '../lib/server/v5/sync';
import type {Store,Entry} from '../lib/server/v5/types';

const memory=new PGlite();
before(async()=>{
 await memory.exec(SCHEMA);
 const driver:Driver={query:(s,p)=>memory.query(s,p) as any,transaction:fn=>memory.transaction(tx=>fn({query:(s,p)=>tx.query(s,p) as any}))};
 (globalThis as any).__moonsDb=Promise.resolve(driver);await initV5();
});
after(async()=>{await memory.close()});

const entry=(body:string,createdAt=new Date().toISOString()):Entry=>({id:newId(),kind:'dump',body,sentences:[body],planetIds:[],createdAt,locked:true,status:'saved'});
async function owner(entries:Entry[]=[]){
 const id=newId();await q('insert into guests(id) values($1)',[id]);
 const store:Store={...initialWorkspace(),entries};
 await q('insert into personal_workspaces(owner_id,store) values($1,$2::jsonb)',[id,json(store)]);
 return id;
}
const batch=()=>newId().replace(/-/g,'');
const events=async(id:string)=>q<{type:string;item:string|null;device:string|null;at:string}>('select type,item,device,at::text from workspace_events where owner_id=$1 order by seq',[id]);

test('Sync: two devices adding different notes from the same copy both land', async()=>{
 const id=await owner();const base=await loadWorkspace(id);
 const phone={...base.store,entries:[entry('From the phone.')]};
 const laptop={...base.store,entries:[entry('From the laptop.')]};
 const a=await applyDeviceChanges(id,{baseRevision:base.revision,batchId:batch(),device:'phone',ops:diff(base.store,phone)});
 const b=await applyDeviceChanges(id,{baseRevision:base.revision,batchId:batch(),device:'laptop',ops:diff(base.store,laptop)});
 assert.equal(a.conflicts,0);assert.equal(b.conflicts,0);assert.equal(b.merged,true);
 assert.deepEqual((await loadWorkspace(id)).store.entries.map(e=>e.body).sort(),['From the laptop.','From the phone.']);
});

test('Sync: the same planet renamed on two devices keeps the newer name and logs the other', async()=>{
 const id=await owner();const base=await loadWorkspace(id);
 const rename=(name:string)=>({...base.store,planets:base.store.planets.map(p=>p.id==='p-learning'?{...p,name}:p)});
 await applyDeviceChanges(id,{baseRevision:base.revision,batchId:batch(),device:'phone',ops:diff(base.store,rename('Study'))});
 const second=await applyDeviceChanges(id,{baseRevision:base.revision,batchId:batch(),device:'laptop',ops:diff(base.store,rename('School'))});
 assert.equal(second.conflicts,1);
 assert.equal((await loadWorkspace(id)).store.planets.find(p=>p.id==='p-learning')!.name,'Study');
 const kept=(await events(id)).filter(e=>e.type==='conflict.kept_newer');
 assert.equal(kept.length,1);assert.equal(kept[0]!.item,'p-learning');assert.equal(kept[0]!.device,'laptop');
});

test('Sync: a repeated batch is not applied twice', async()=>{
 const id=await owner();const base=await loadWorkspace(id);
 const ops=diff(base.store,{...base.store,entries:[entry('Once.')]});const batchId=batch();
 await applyDeviceChanges(id,{baseRevision:base.revision,batchId,device:null,ops});
 const again=await applyDeviceChanges(id,{baseRevision:base.revision,batchId,device:null,ops});
 assert.equal(again.replayed,true);
 assert.equal((await loadWorkspace(id)).store.entries.length,1);
});

test('Sync: originals stay locked through device changes', async()=>{
 const original=entry('The original sentence.');
 const id=await owner([original]);const base=await loadWorkspace(id);
 const edited={...base.store,entries:[{...original,body:'Rewritten.',sentences:['Rewritten.']}]};
 await assert.rejects(()=>applyDeviceChanges(id,{baseRevision:base.revision,batchId:batch(),device:null,ops:diff(base.store,edited)}),(e:any)=>e.status===400);
 assert.equal((await loadWorkspace(id)).store.entries[0]!.body,'The original sentence.');
});

test('Sync: first logged change records the existing store as a dated baseline, then the change', async()=>{
 const old=entry('Written before the log existed.','2026-10-01T09:00:00.000Z');
 const id=await owner([old]);const base=await loadWorkspace(id);
 await applyDeviceChanges(id,{baseRevision:base.revision,batchId:batch(),device:'phone',ops:diff(base.store,{...base.store,entries:[...base.store.entries,entry('New.')]})});
 const log=await events(id);
 const baseline=log.find(e=>e.item===old.id)!;
 assert.equal(baseline.type,'entries.created');assert.equal(baseline.device,'baseline');assert.match(baseline.at,/^2026-10-01/);
 assert.equal(log.at(-1)!.type,'entries.created');assert.equal(log.at(-1)!.device,'phone');
});

test('Sync: server-side persistence (actions, daily batch) is logged too', async()=>{
 const id=await owner();const state=await loadWorkspace(id);
 await persistWorkspace(id,state.revision,{...state.store,settings:{...state.store.settings,profileContext:false}});
 assert.ok((await events(id)).some(e=>e.type==='settings.set'));
});

test('Shares: only chosen notes and parts are public; revoking ends access at once', async()=>{
 const {createShare,readShare,revokeShare,listShares}=await import('../lib/server/v5/shares');
 const a=entry('Shared thought.'),b=entry('Private thought.');
 const id=await owner([a,b]);
 await assert.rejects(()=>createShare(id,{entryIds:['not-mine']}),(e:any)=>e.status===400);
 const share=await createShare(id,{title:'For the team',entryIds:[a.id,b.id].slice(0,1),include:['original','evil']});
 assert.deepEqual(share.include,['original']);
 const view=await readShare(share.token);
 assert.equal(view.notes.length,1);assert.equal(view.notes[0]!.body,'Shared thought.');
 assert.ok(!JSON.stringify(view).includes('Private thought.'));
 assert.ok(!JSON.stringify(view).includes(id));
 assert.equal((await listShares(id))[0]!.active,true);
 await revokeShare(id,share.token);
 await assert.rejects(()=>readShare(share.token),(e:any)=>e.status===404);
});

test('Events: the owner can read their change log in order, page by page', async()=>{
 const {readEvents}=await import('../lib/server/v5/shares');
 const id=await owner();const base=await loadWorkspace(id);
 await applyDeviceChanges(id,{baseRevision:base.revision,batchId:batch(),device:'phone',ops:diff(base.store,{...base.store,entries:[entry('One.'),entry('Two.')]})});
 const first=await readEvents(id,0,1);
 assert.equal(first.events.length,1);assert.ok(first.next);
 const rest=await readEvents(id,first.next!,100);
 assert.ok(rest.events.length>=1);assert.ok(rest.events.every(e=>e.seq>first.next!));
 assert.equal(rest.next,null);
});

test('AI access: the operator key has a daily limit; a saved own key skips it and is never returned', async()=>{
 const {withAi,aiStatus,saveKey,removeKey,aiScope,seal,open}=await import('../lib/server/v5/ai-access');
 process.env.SESSION_SECRET??='test-secret';process.env.MOONS_DAILY_AI_LIMIT='2';
 const id=await owner();
 const seen:(string|undefined)[]=[];
 const call=()=>withAi(id,async()=>{seen.push(aiScope.getStore()?.apiKey);return true});
 await call();await call();
 await assert.rejects(call,(e:any)=>e.status===429);
 assert.equal((await aiStatus(id)).used,2);
 await assert.rejects(()=>saveKey(id,'openai','not-a-key'),(e:any)=>e.status===400);
 const key='sk-test_'+'a'.repeat(40);
 await saveKey(id,'openai',key);
 assert.equal(await call(),true);assert.equal(seen.at(-1),key);
 const status=await aiStatus(id);
 assert.equal(status.ownKey?.provider,'openai');assert.ok(!JSON.stringify(status).includes(key));
 const stored=(await q<{key_enc:string}>('select key_enc from ai_keys where owner_id=$1',[id]))[0]!.key_enc;
 assert.ok(!stored.includes(key));assert.equal(open(stored),key);assert.notEqual(seal(key),stored);
 await removeKey(id);
 await assert.rejects(call,(e:any)=>e.status===429);
 delete process.env.MOONS_DAILY_AI_LIMIT;
});

test('Impostor: off by default; when on it is planted from fixtures, hidden until reveal, then decided by the user', async()=>{
 const {maybePlantImpostor,recordImpostorCheck,impostorReveals,decideImpostor,impostorNodeIds}=await import('../lib/server/v5/impostor');
 const {openai}=await import('../lib/server/ai/openai');
 const {validateStore}=await import('../lib/server/v5/workspace-store');
 const oldJson=openai.json,oldMod=openai.moderate;
 const note={...entry('I want to test one small prototype first.'),analysis:{structure:'x',nodes:[{id:'n1',text:'I want to test one small prototype first',role:'claim',source:[0],empty:false,updates:[],emotions:[]}],edges:[],signals:[],suggestedPlanets:[],model:'t',promptVersion:'t',createdAt:''}};
 const id=await owner([note,entry('Last week I said feedback is not proof.')]);
 const store=(await loadWorkspace(id)).store;const target=store.entries.find(e=>e.id===note.id)!;
 // Off by default: nothing is planted and no AI call is made.
 let calls=0;openai.json=(async()=>{calls++;return {data:{},model:'t'}}) as any;
 assert.equal(await maybePlantImpostor(id,store,target,()=>0),false);assert.equal(calls,0);
 // On: a verbatim proposal is refused; a safe one is planted next to its node.
 store.settings={...store.settings,impostor:'often'} as any;
 openai.json=(async(task:any)=>task.name==='moons_impostor_safety'?{data:{allowed:true},model:'t'}:{data:{kind:'overreach',text:'I want to test one small prototype first',near:'n1'},model:'t'}) as any;
 openai.moderate=(async()=>false) as any;
 assert.equal(await maybePlantImpostor(id,store,target,()=>0),false,'verbatim quote refused');
 openai.json=(async(task:any)=>task.name==='moons_impostor_safety'?{data:{allowed:true},model:'t'}:{data:{kind:'phantom_premise',text:'Everyone will like the first version.',near:'n1'},model:'t'}) as any;
 assert.equal(await maybePlantImpostor(id,store,target,()=>0),true);
 const planted=target.analysis!.nodes[1]!;
 assert.equal(planted.text,'Everyone will like the first version.');
 assert.deepEqual(Object.keys(planted).sort(),Object.keys(target.analysis!.nodes[0]!).sort(),'looks like any other node');
 // The server lets its own planted node through once, and afterwards only while unchanged.
 const saved=validateStore(store,(await loadWorkspace(id)).store,await impostorNodeIds(id));
 assert.throws(()=>validateStore({...saved,entries:saved.entries.map(e=>e.id===note.id?{...e,analysis:{...e.analysis!,nodes:[...e.analysis!.nodes,{...planted,id:'client-made'}]}}:e)},saved),/own words|original/i);
 assert.doesNotThrow(()=>validateStore(structuredClone(saved),saved));
 // Not revealed right after the check; revealed on a later visit.
 await recordImpostorCheck(id,planted.id,'agree');
 assert.equal((await impostorReveals(id,store)).length,0);
 await q(`update impostors set checked_at=now()-interval '31 minutes' where owner_id=$1`,[id]);
 const reveals=await impostorReveals(id,store);
 assert.equal(reveals.length,1);assert.equal(reveals[0]!.kind,'spy_reveal');assert.match(reveals[0]!.headline,/임포스터/);
 const impostorId=reveals[0]!.key!.split(':')[1]!;
 await assert.rejects(()=>decideImpostor(id,store,impostorId,'not_mine',''),(e:any)=>e.status===400,'comment required');
 await decideImpostor(id,store,impostorId,'not_mine','I never assumed that.');
 assert.equal(target.analysis!.nodes.some(n=>n.id===planted.id),false);
 openai.json=oldJson;openai.moderate=oldMod;
});

test('Teams: invite once, share only on purpose, and members never see each other\'s spaces', async()=>{
 const T=await import('../lib/server/v5/teams');
 const team=await T.createTeam('user-a','Dain',{name:'3D assets'});
 await assert.rejects(()=>T.teamView('user-b',team.id),(e:any)=>e.status===403);
 const {token}=await T.invite('user-a',team.id);
 await T.join('user-b','Min',token);
 await assert.rejects(()=>T.join('user-c','X',token),(e:any)=>e.status===404,'invite is single use');
 const o=await T.addOriginal('user-b',team.id,{title:'Kickoff notes',text:'We ship the low-poly set first. Textures come later.'});
 // Member A copies the original into their own space, writes privately, compares, then shares.
 const ownerA=await owner();const state=await loadWorkspace(ownerA);const store=structuredClone(state.store);
 const {entryId:copyId}=await T.takeOriginal('user-a',team.id,o.id,store);
 const mine={...entry('We ship everything at once.'),comparison:{materialEntryId:copyId,materialTitle:'Kickoff notes',summary:'Shifted.',quotes:[],items:[{answer:0,verdict:'shifted' as const,original:[0],note:'Order changed.',shiftType:null}]}};
 store.entries.push(mine as any);
 let view=await T.teamView('user-b',team.id);
 assert.equal(view.originals[0]!.shares.length,0,'nothing is visible before sharing');
 await assert.rejects(()=>T.shareAnswer('user-a',team.id,'missing',store),(e:any)=>e.status===400);
 await T.shareAnswer('user-a',team.id,mine.id,store);
 view=await T.teamView('user-b',team.id);
 const shared=view.originals[0]!.shares[0]!;
 assert.equal(shared.member,'Dain');assert.equal((shared.snapshot as any).body,'We ship everything at once.');
 assert.ok(!JSON.stringify(view).includes('user-a'),'no account ids leak');
 await T.unshare('user-a',team.id,o.id);
 assert.equal((await T.teamView('user-b',team.id)).originals[0]!.shares.length,0);
});
