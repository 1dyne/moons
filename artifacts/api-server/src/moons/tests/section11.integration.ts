// Real in-memory PostgreSQL queries and real application handlers.
// AI generation/moderation are deterministic fixtures; no paid API or live DB calls.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA,q,json,newId} from '../lib/server/db';
import {guest,initV5,initialWorkspace,loadWorkspace} from '../lib/server/v5/workspace-store';
import {notificationCandidates,limitNotifications} from '../lib/server/v5/notifications';
import {chatTurn,retrievalCandidates} from '../lib/server/v5/chat';
import {missedIndices} from '../lib/server/v5/analysis';
import {openai} from '../lib/server/ai/openai';
import type {Store,Entry,Chat} from '../lib/server/v5/types';

const memory=new PGlite();
let spyText='This approach will always pay off.',draftText='I can test an idea';
const oldJson=openai.json,oldModerate=openai.moderate;
const original='I can test an idea before making a promise.';
const scanOwner=newId();
before(async()=>{
 await memory.exec(SCHEMA);
 (globalThis as any).__moonsDb=Promise.resolve({query:async(sql:string,params:unknown[]=[])=>memory.query(sql,params)});
 // A real legacy row, so initV5's SQL migration (not just a mapping helper) is checked.
 await q('insert into comparisons(entry_id,material_entry_id,items) values($1,$2,$3::jsonb)',['migration-fixture','original-fixture',json([{verdict:'same'},{verdict:'different'},{verdict:'own'}])]);
 await initV5();
 await q('insert into spaces(id,config) values($1,$2::jsonb)',['demo-section11',json({id:'demo-section11',name:'Section 11 isolated fixtures',tagline:'Not real event data',planets:[],questions:[]})]);
 openai.json=(async({name,user}:any)=>{
  if(name==='moons_emotions')return{data:{nodes:[]},model:'test-fixture'};
  if(name==='moons_demo_scan')return{data:{spies:[{kind:'overreach',text:spyText,near:JSON.parse(user).nodes[0].id}]},model:'test-fixture'};
  if(name==='moons_demo_safety')return{data:{allowed:true},model:'test-fixture'};
  return{data:{text:'What do you notice?',refs:[],draftNode:{text:draftText,planetIds:[],relation:'updates'},tagProposal:null},model:'test-fixture'};
 }) as typeof openai.json;
 openai.moderate=async()=>false;
});
after(async()=>{openai.json=oldJson;openai.moderate=oldModerate;await memory.close()});

async function entry(){
 const id=newId();
 await q('insert into entries(id,space_id,participant_id,body,sentences,status) values($1,$2,$3,$4,$5::jsonb,$6)',[id,'demo-section11',scanOwner,original,json([original]),'done']);
 await q('insert into analyses(id,entry_id,structure,nodes,edges,signals,model,prompt_version) values($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)',[newId(),id,'파편',json([{id:'n1',text:original,source:[0],role:'Idea',empty:false,hesitant:false,group:null}]),'[]','[]','test-fixture','section11']);
 return id;
}
test('Section 11: persisted same/different/own migrate to kept/shifted/added',async()=>{
 const rows=await q<{items:{verdict:string}[]}>('select items from comparisons where entry_id=$1',['migration-fixture']);
 assert.deepEqual(rows[0].items.map(i=>i.verdict),['kept','shifted','added']);
});
test('Section 11: Missed is deterministic and excludes kept/shifted-covered originals',()=>{
 const vectors=[[1,0],[1,0],[1,0],[0,1],[-1,0],[0,-1],[.7,.7]];
 assert.deepEqual(missedIndices(vectors,new Set([0])),[1,2]);
 assert.deepEqual(missedIndices(vectors,new Set([0,1,2])),[]);
});
function thread():Chat{return{id:newId(),title:'',draft:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[],contextIds:[],origin:{kind:'free'}}}
test('Section 11: generated node draft is a user-message substring, never assistant words',async()=>{
 const store=initialWorkspace();store.chats=[thread()];
 draftText='I can test an idea';await chatTurn(scanOwner,store,store.chats[0].id,original);
 assert.equal(store.chats[0].messages.at(-1)?.draftNode?.text,draftText);
 store.chats=[thread()];draftText='The assistant invented this sentence.';
 await chatTurn(scanOwner,store,store.chats[0].id,original);
 assert.equal(store.chats[0].messages.at(-1)?.draftNode,undefined);
});
test('Section 11: Retrieved respects node/notification/warning origins',()=>{
 const store=initialWorkspace();
 const note=(id:string,planetIds:string[])=>({id,body:id,sentences:[id],kind:'dump',createdAt:new Date().toISOString(),planetIds}) as Entry;
 store.entries=[note('a',['topic']),note('b',['topic']),note('outside',['other'])];
 const t=thread();t.origin={kind:'node',ref:'a'};
 assert.deepEqual(retrievalCandidates(store,t).map(e=>e.id),['a','b']);
 t.origin={kind:'warning',ref:'a'};assert.deepEqual(retrievalCandidates(store,t),[]);
 store.notifications=[{id:'news',kind:'breaking_news',headline:'Fixture',evidence:['a'],status:'new',createdAt:new Date().toISOString()}];
 t.origin={kind:'notification',ref:'news'};
 assert.deepEqual(retrievalCandidates(store,t).map(e=>e.id),['a','b']);
});
test('Section 11: emotion alone does not create bias_watch (real SQL)',async()=>{
 const store=initialWorkspace();
 store.entries=Array.from({length:4},(_,i)=>({id:`emotion-${i}`,body:'I feel concerned.',sentences:['I feel concerned.'],kind:'dump',locked:true,status:'done',createdAt:new Date().toISOString(),planetIds:['p-learning'],analysis:{structure:'파편',suggestedPlanets:[],model:'test-fixture',promptVersion:'section11',createdAt:new Date().toISOString(),nodes:[{id:'n',text:'I feel concerned.',role:'Idea',empty:false,updates:[],source:[0],emotions:[{id:'e',family:'fear',word:'concern',evidence:'concerned',intensity:3}]}],edges:[],signals:[]}}));
 const candidates=await notificationCandidates(store);
 assert.ok(candidates.some(n=>n.kind==='breaking_news'));
 assert.ok(!candidates.some(n=>n.kind==='bias_watch'));
});
test('Section 11: daily behavior-alert maximum is two, including repeated batch calls',()=>{
 const now=new Date().toISOString();
 const candidates=Array.from({length:5},(_,i)=>({key:`pattern-${i}`,kind:i%2?'bias_watch':'breaking_news',headline:'Fixture',evidence:[]}));
 const first=limitNotifications([],candidates,undefined,now);
 assert.equal(first.length,2);assert.equal(limitNotifications(first,candidates,undefined,now).length,0);
});
test('Section 11: first guest gets HttpOnly cookie; second visit retains the same private space',async()=>{
 let cookie='';const req={headers:{},secure:true,get:()=>undefined} as any;
 const owner=await guest(req,{append:(_name:string,value:string)=>{cookie=value}} as any);
 assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('Secure'));
 const first=await loadWorkspace(owner);let newCookies=0;
 const secondOwner=await guest({...req,headers:{cookie:cookie.split(';')[0]}},{append:()=>{newCookies++}} as any);
 assert.equal(secondOwner,owner);assert.equal(newCookies,0);
 const second=await loadWorkspace(secondOwner);
 assert.equal(second.revision,first.revision);
 assert.equal((await q('select owner_id from personal_workspaces where owner_id=$1',[owner])).length,1);
});
