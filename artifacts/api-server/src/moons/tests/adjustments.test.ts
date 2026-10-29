import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustmentCandidates} from '../lib/server/v5/adjustments.ts';
import type {Store} from '../lib/server/v5/types.ts';

const base=():Store=>({version:1,entries:[],planets:[{id:'p1',name:'3D',color:'#000000',position:{x:0,y:0},entryCount:0,openSignalRatio:0}],
 forms:[{id:'f1',name:'Work order',blocks:[{kind:'steps',options:['Research','Concept notes','Practice']}]}]});
const project=(id:string,day:number,extra={})=>({id,name:`P${id}`,patternFormId:'f1',familiarity:'new',status:'active',createdAt:`2026-10-${String(day).padStart(2,'0')}T00:00:00Z`,...extra});
const task=(id:string,projectId:string,stepKey:string,extra={})=>({id,title:id,projectId,stepKey,status:'todo',...extra});

test('step_missing: a step skipped in 2 of the last 3 projects is proposed, in Korean by default', ()=>{
 const s={...base(),projects:[project('a',1),project('b',2),project('c',3)],
  tasks:[task('t1','a','Research'),task('t2','b','Research'),task('t3','c','Research'),task('t4','a','Concept notes'),task('t5','a','Practice'),task('t6','b','Practice'),task('t7','c','Practice')]};
 const c=adjustmentCandidates(s);
 assert.equal(c.length,1);
 assert.equal(c[0]!.key,'step_missing:f1:Concept notes');
 assert.match(c[0]!.headline,/단계가 최근 3개 프로젝트 중 2개에서 빠졌어요/);
 assert.deepEqual(c[0]!.evidence.sort(),['b','c']);
});

test('step_missing: dropped tasks count as missing; one project is not a pattern', ()=>{
 const s={...base(),projects:[project('a',1)],tasks:[]};
 assert.equal(adjustmentCandidates(s).length,0);
});

test('estimate_drift: needs five finished tasks and a median far from 1', ()=>{
 const rows=[0,1,2,3,4].map(i=>task(`d${i}`,'a','Practice',{status:'done',estimateMin:30}));
 const sessions=rows.map((t,i)=>({taskId:t.id,startedAt:'2026-10-10T09:00:00Z',endedAt:`2026-10-10T${i<3?'10:00':'09:40'}:00Z`}));
 const s={...base(),projects:[project('a',1)],tasks:rows,sessions,settings:{language:'en' as const}};
 const c=adjustmentCandidates(s).find(x=>x.key==='estimate_drift:Practice');
 assert.ok(c);assert.match(c!.headline,/usually took 2\.0× your estimate/);
 const four={...s,tasks:rows.slice(0,4)};
 assert.equal(adjustmentCandidates(four).some(x=>x.key.startsWith('estimate_drift')),false);
});

test('familiarity_gap: only for fields marked known, and only above the user average', ()=>{
 const entry=(id:string,planet:string,verdicts:string[])=>({id,kind:'dump',body:'x',sentences:['x'],planetIds:[planet],createdAt:'2026-10-10T00:00:00Z',locked:true,status:'done',
  comparison:{materialEntryId:'m',materialTitle:'m',summary:'',quotes:[],items:verdicts.map((v,i)=>({answer:i,verdict:v,original:[],note:''}))}}) as Store['entries'][number];
 const entries=[entry('e1','p1',['missed','shifted','missed','kept','shifted']),entry('e2','p2',['kept','kept','kept','kept','kept','kept','kept','kept','kept','kept'])];
 const known={...base(),entries,projects:[{...project('a',1),planetId:'p1',familiarity:'know'}]};
 assert.equal(adjustmentCandidates(known).filter(x=>x.key.startsWith('familiarity_gap')).length,1);
 const unknown={...known,projects:[{...project('a',1),planetId:'p1',familiarity:'new'}]};
 assert.equal(adjustmentCandidates(unknown).filter(x=>x.key.startsWith('familiarity_gap')).length,0);
});

test('schedule_pattern: same weekday, four tasks, started 30+ minutes late', ()=>{
 const days=['2026-10-05','2026-10-12','2026-10-19','2026-10-26'];// Mondays
 const tasks=days.map((d,i)=>task(`m${i}`,'a','Research',{plannedDate:d,plannedStart:'09:00'}));
 const sessions=days.map((d,i)=>({taskId:`m${i}`,startedAt:new Date(`${d}T09:50:00`).toISOString(),endedAt:new Date(`${d}T10:30:00`).toISOString()}));
 const c=adjustmentCandidates({...base(),projects:[project('a',1)],tasks,sessions});
 const hit=c.find(x=>x.key.startsWith('schedule_pattern'));
 assert.ok(hit);assert.match(hit!.headline,/월요일 계획한 일은 보통 50분 늦게 시작했어요/);
});
