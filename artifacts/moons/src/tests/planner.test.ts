import test from 'node:test';
import assert from 'node:assert/strict';
import {completion,setReward,acceptSuggestion,actualMinutes,missedTime,newProject,newTask,plateau,rate,ratingsFor,running,setStatus,startTimer,stopTimer,type PlannerStore} from '../lib/planner.ts';

const at=(h:number,m=0)=>new Date(2026,9,16,h,m).toISOString();

test('one timer at a time: starting another task closes the running one', ()=>{
  const a=newTask('Read'),b=newTask('Write');
  let s:PlannerStore={entries:[],tasks:[a,b]};
  s=startTimer(s,a.id,at(9));s=startTimer(s,b.id,at(9,30));
  assert.equal(s.sessions!.filter(x=>!x.endedAt).length,1);
  assert.equal(running(s.sessions!)!.taskId,b.id);
  s=stopTimer(s,at(10));
  assert.equal(actualMinutes(s.sessions!,a.id),30);assert.equal(actualMinutes(s.sessions!,b.id),30);
});

test('split sessions add up; finishing a task stops its timer', ()=>{
  const t=newTask('Model the asset',{estimateMin:60});
  let s:PlannerStore={entries:[],tasks:[t]};
  s=startTimer(s,t.id,at(9));s=stopTimer(s,at(9,20));
  s=startTimer(s,t.id,at(14));s=setStatus(s,t.id,'done',at(14,25));
  assert.equal(actualMinutes(s.sessions!,t.id),45);
  assert.equal(s.tasks![0]!.status,'done');assert.equal(running(s.sessions!),null);
});

test('missed time comes from records written for the project planet when no timer ran', ()=>{
  const p=newProject('3D assets','new',{planetId:'p-3d'});const t=newTask('Retopology',{projectId:p.id});
  const e=(h:number,m:number)=>({id:`${h}${m}`,createdAt:at(h,m),planetIds:['p-3d']});
  const store:PlannerStore={projects:[p],tasks:[t],sessions:[],entries:[e(14,10),e(14,30),e(15,0),e(18,0),{id:'x',createdAt:at(14,20),planetIds:['other']}]};
  const day=new Date(at(12)).toISOString();
  const s=missedTime(store,`${new Date(day).getFullYear()}-10-16`);
  assert.equal(s.length,2);
  assert.equal(s[0]!.count,3);assert.equal(new Date(s[0]!.startedAt).getHours(),14);assert.equal(new Date(s[0]!.startedAt).getMinutes(),5);
  const accepted=acceptSuggestion(store,s[0]!);
  assert.equal(accepted.sessions![0]!.source,'suggested');
  assert.equal(missedTime(accepted,`${new Date(day).getFullYear()}-10-16`).length,1);
});

test('confidence is clamped 1–10, kept as history, and a flat stretch is flagged', ()=>{
  let s:PlannerStore={entries:[]};
  for(const v of [6,7,7,6,15])s=rate(s,'concept','topology',v);
  const r=ratingsFor(s,'topology');
  assert.deepEqual(r.map(x=>x.value),[6,7,7,6,10]);
  assert.equal(plateau(r.slice(0,4)),true);assert.equal(plateau(r),false);
});

test('wishes never change daily completion; the bonus opens when planned tasks are done', ()=>{
  const a=newTask('Plan'),b=newTask('Model'),w=newTask('Try a new shader',{wish:true}),d=newTask('Old',{status:'dropped'});
  assert.deepEqual(completion([a,b,w,d]),{done:0,total:2,rate:0,bonusOpen:false});
  const done=[{...a,status:'done' as const},{...b,status:'done' as const},w,d];
  assert.deepEqual(completion(done),{done:2,total:2,rate:1,bonusOpen:true});
  assert.equal(completion([...done.slice(0,2),{...w,status:'done' as const}]).rate,1,'a finished wish adds nothing');
  const s=setReward({entries:[],tasks:[w]},w.id,'yes');
  assert.equal(s.tasks![0]!.reward,'yes');
});
