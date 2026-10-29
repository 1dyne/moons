import type {ConnectedProject,ProjectProposal} from '@workspace/moons-sync/projects';
import type {Store} from './model.ts';
import {newProject,newTask,type Task,today} from './planner.ts';

export const projectTaskId=(p:ConnectedProject)=>p.plannerProjectId||p.id;
export const tasksFor=(store:Store,p:ConnectedProject)=>(store.tasks??[]).filter(t=>t.projectId===projectTaskId(p));
export function ensurePlannerProject(store:Store,p:ConnectedProject):Store {
  const id=projectTaskId(p);
  const existing=(store.projects??[]).find(x=>x.id===id);
  if(existing)return existing.name===p.name?store:{...store,projects:store.projects!.map(x=>x.id===id?{...x,name:p.name}:x)};
  return {...store,projects:[...(store.projects??[]),newProject(p.name,'new',{id})]};
}
export function scheduleBrief(store:Store,p:ConnectedProject,proposal:ProjectProposal,date:string):Store {
  const brief=proposal.briefs.at(-1);
  if(!brief||(store.tasks??[]).some(t=>t.sourceBriefId===brief.id))return store;
  const next=ensurePlannerProject(store,p);
  const title=brief.markdown.split('\n')[0]!.replace(/^#\s+/,'');
  return {...next,tasks:[...(next.tasks??[]),newTask(title,{projectId:projectTaskId(p),plannedDate:date,sourceBriefId:brief.id,sourceProposalId:proposal.id})]};
}
export function scheduleStats(tasks:Task[],day=today()){
  const active=tasks.filter(t=>!t.wish&&t.status!=='dropped');
  const open=active.filter(t=>t.status!=='done');
  return {done:active.filter(t=>t.status==='done').length,total:active.length,overdue:open.filter(t=>t.plannedDate&&t.plannedDate<day),today:open.filter(t=>t.plannedDate===day),unscheduled:open.filter(t=>!t.plannedDate),next:open.filter(t=>t.plannedDate).sort((a,b)=>a.plannedDate!.localeCompare(b.plannedDate!)||(a.plannedStart??'99').localeCompare(b.plannedStart??'99'))[0]};
}
export function weekDays(day:string){const start=new Date(`${day}T12:00:00`);const offset=(start.getDay()+6)%7;start.setDate(start.getDate()-offset);return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});}
