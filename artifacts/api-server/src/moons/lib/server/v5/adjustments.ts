import type {Store} from './types.ts';

// Adjustment proposals from the planner (spec 5.3). Counting only; the wording is an observation,
// never a verdict, and nothing is changed until the user applies it.
type Project={id:string;name:string;planetId?:string;patternFormId?:string;familiarity:string;status:string;createdAt:string};
type Task={id:string;title:string;projectId?:string;stepKey?:string;plannedStart?:string;plannedDate?:string;estimateMin?:number;status:string};
type Session={taskId:string;startedAt:string;endedAt?:string};
type Form={id:string;name:string;blocks:{kind:string;options?:string[]}[]};
export type Candidate={key:string;kind:string;headline:string;evidence:string[]};

const median=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]!:(s[m-1]!+s[m]!)/2};
const minutes=(s:Session)=>s.endedAt?Math.max(0,(Date.parse(s.endedAt)-Date.parse(s.startedAt))/60000):0;
export const uiLang=(store:Store)=>store.settings?.language==='en'?'en':'ko';

export function adjustmentCandidates(store:Store):Candidate[]{
 const ko=uiLang(store)==='ko';
 const projects=((store.projects as Project[]|undefined)??[]).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const tasks=(store.tasks as Task[]|undefined)??[],sessions=(store.sessions as Session[]|undefined)??[],forms=(store.forms as Form[]|undefined)??[];
 const out:Candidate[]=[];

 // step_missing: a step of the user's own work order has no live task in ≥2 of the last 3 projects using that form.
 for(const form of forms){
  const steps=form.blocks.find(b=>b.kind==='steps')?.options?.filter(Boolean)??[];
  const recent=projects.filter(p=>p.patternFormId===form.id).slice(0,3);
  if(recent.length<2)continue;
  for(const step of steps){
   const missing=recent.filter(p=>!tasks.some(t=>t.projectId===p.id&&t.stepKey===step&&t.status!=='dropped'));
   if(missing.length>=2)out.push({key:`step_missing:${form.id}:${step}`,kind:'adjustment',
    headline:ko?`"${step}" 단계가 최근 ${recent.length}개 프로젝트 중 ${missing.length}개에서 빠졌어요.`:`The "${step}" step was skipped in ${missing.length} of your last ${recent.length} projects.`,
    evidence:missing.map(p=>p.id)});
  }
 }

 // estimate_drift: for one step, actual/expected stays far from 1 across ≥5 finished tasks.
 const byStep=new Map<string,{ratio:number;id:string}[]>();
 for(const t of tasks){
  if(t.status!=='done'||!t.estimateMin||!t.stepKey)continue;
  const spent=sessions.filter(s=>s.taskId===t.id).reduce((n,s)=>n+minutes(s),0);
  if(!spent)continue;
  byStep.set(t.stepKey,[...(byStep.get(t.stepKey)??[]),{ratio:spent/t.estimateMin,id:t.id}]);
 }
 for(const [step,rows] of byStep){
  if(rows.length<5)continue;
  const m=median(rows.map(r=>r.ratio));
  if(m>=1.5||m<=0.6)out.push({key:`estimate_drift:${step}`,kind:'adjustment',
   headline:ko?`"${step}" 단계는 예상보다 보통 ${m.toFixed(1)}배 걸렸어요.`:`The "${step}" step usually took ${m.toFixed(1)}× your estimate.`,
   evidence:rows.map(r=>r.id)});
 }

 // familiarity_gap: a field marked known has more Missed+Shifted than the user's average (≥5 compared items).
 const items=(planet?:string)=>store.entries.filter(e=>!planet||e.planetIds.includes(planet)).flatMap(e=>(e.comparison?.items??[]).map(i=>({v:i.verdict,id:e.id})));
 const all=items(),avg=all.length?all.filter(i=>i.v==='missed'||i.v==='shifted').length/all.length:0;
 for(const p of projects.filter(x=>x.status==='active'&&x.planetId&&(x.familiarity==='know'||x.familiarity==='think_i_know'))){
  const here=items(p.planetId);if(here.length<5)continue;
  const r=here.filter(i=>i.v==='missed'||i.v==='shifted').length/here.length;
  if(r>avg+0.1)out.push({key:`familiarity_gap:${p.id}`,kind:'adjustment',
   headline:ko?`"${p.name}"은 안다고 표시했는데, 비교에서 놓치거나 바뀐 부분이 평소보다 많아요 (${Math.round(r*100)}% / 평균 ${Math.round(avg*100)}%).`:`You marked "${p.name}" as known, but more was missed or shifted there than usual (${Math.round(r*100)}% vs ${Math.round(avg*100)}%).`,
   evidence:[...new Set(here.map(i=>i.id))].slice(0,8)});
 }

 // schedule_pattern: planned start vs first actual start on the same weekday, late by ≥30 min across ≥4 tasks.
 const late=new Map<number,{delay:number;id:string}[]>();
 for(const t of tasks){
  if(!t.plannedDate||!t.plannedStart)continue;
  const first=sessions.filter(s=>s.taskId===t.id).map(s=>s.startedAt).sort()[0];if(!first)continue;
  const planned=new Date(`${t.plannedDate}T${t.plannedStart}:00`),actual=new Date(first);
  const wd=planned.getDay();late.set(wd,[...(late.get(wd)??[]),{delay:(actual.getTime()-planned.getTime())/60000,id:t.id}]);
 }
 const days=ko?['일','월','화','수','목','금','토']:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 for(const [wd,rows] of late){
  if(rows.length<4)continue;const m=median(rows.map(r=>r.delay));
  if(m>=30)out.push({key:`schedule_pattern:${wd}`,kind:'adjustment',
   headline:ko?`${days[wd]}요일 계획한 일은 보통 ${Math.round(m)}분 늦게 시작했어요.`:`On ${days[wd]}s, planned work usually started ${Math.round(m)} minutes late.`,
   evidence:rows.map(r=>r.id)});
 }
 return out;
}
