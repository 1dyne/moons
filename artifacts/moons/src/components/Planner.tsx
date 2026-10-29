import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Check,Sparkles,Star,ChevronLeft,ChevronRight,Clock,FolderKanban,Play,Plus,Square,Undo2,X} from 'lucide-react';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {formsOf} from '@/lib/forms';
import {completion,setReward,type Reward,acceptSuggestion,actualMinutes,localDay,missedTime,newProject,newTask,plateau,rate,ratingsFor,running,setStatus,startTimer,stopTimer,today,type Confidence,type Familiarity,type Project,type Task} from '@/lib/planner';
import {tr} from '@/lib/i18n';
import '../styles/planner.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void};
const fam:Record<Familiarity,string>={new:tr('New to me'),think_i_know:tr('I think I know it'),know:tr('I know it well')};
const fmt=(m:number)=>m>=60?tr('{h}h {m}m',{h:Math.floor(m/60),m:Math.round(m%60)}):tr('{m}m',{m:Math.round(m)});
const clock=(iso:string)=>new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const shiftDay=(day:string,d:number)=>{const x=new Date(`${day}T12:00:00`);x.setDate(x.getDate()+d);return localDay(x.toISOString())};

/** Re-render every 30s while a timer runs so the elapsed time moves. */
function useTick(active:boolean){const [,set]=useState(0);useEffect(()=>{if(!active)return;const t=setInterval(()=>set(n=>n+1),30000);return()=>clearInterval(t)},[active])}

/* ---------- Daily planner ---------- */

export function DailyPlanner({ctx}:{ctx:Ctx}){
  const {store,ws}=ctx;const [day,setDay]=useState(today());
  const tasks=store.tasks??[],sessions=store.sessions??[],projects=(store.projects??[]).filter(p=>p.status==='active');
  const live=running(sessions);useTick(!!live);
  const list=tasks.filter(t=>t.plannedDate===day||(day===today()&&t.status==='doing'&&!t.plannedDate)).sort((a,b)=>(a.plannedStart??'99').localeCompare(b.plannedStart??'99'));
  const suggestions=useMemo(()=>missedTime(store,day),[store,day]);
  const plannedTasks=list.filter(t=>!t.wish),wishes=list.filter(t=>t.wish),done=completion(list);
  const planned=plannedTasks.reduce((s,t)=>s+(t.estimateMin??0),0),spent=list.reduce((s,t)=>s+actualMinutes(sessions,t.id),0);
  const commit=(fn:(s:Store)=>Store)=>ws.commit(fn);
  return <section className="page-shell planner">
    <div className="page-heading"><div><h1>{tr('Planner')}</h1></div>
      <div className="day-nav"><button className="icon-button" aria-label={tr('Previous day')} onClick={()=>setDay(shiftDay(day,-1))}><ChevronLeft size={18}/></button><input type="date" aria-label={tr('Date')} value={day} onChange={e=>e.target.value&&setDay(e.target.value)}/><button className="icon-button" aria-label={tr('Next day')} onClick={()=>setDay(shiftDay(day,1))}><ChevronRight size={18}/></button>{day!==today()&&<button className="text-button" onClick={()=>setDay(today())}>{tr('Today')}</button>}</div></div>
    {live&&<RunningBar ctx={ctx}/>}
    <div className="planner-grid">
      <div className="settings-card">
        <div className="day-summary">{done.rate!==null&&<span className="rate">{tr('Done {pct}% ({done}/{total})',{pct:Math.round(done.rate*100),done:done.done,total:done.total})}</span>}<span>{tr('Planned {time}',{time:fmt(planned)})}</span><span>{tr('Actual {time}',{time:fmt(spent)})}</span></div>
        <AddTask projects={projects} day={day} add={t=>commit(s=>({...s,tasks:[...(s.tasks??[]),t]}))}/>
        {plannedTasks.length?<ul className="task-list">{plannedTasks.map(t=><TaskRow key={t.id} task={t} ctx={ctx} projects={store.projects??[]}/>)}</ul>:<p className="empty-note">{tr('No tasks for this day yet.')}</p>}
        {wishes.length>0&&<div className={`bonus ${done.bonusOpen?'open':''}`}><h2><Sparkles size={15}/>{tr('Bonus stage')}<small>{done.bonusOpen?tr('Your tasks are done — the bonus stage is open.'):tr('Opens when today’s tasks are done. Wishes do not count toward completion.')}</small></h2>
          <ul className="task-list">{wishes.map(t=><TaskRow key={t.id} task={t} ctx={ctx} projects={store.projects??[]}/>)}</ul></div>}
        {suggestions.length>0&&<div className="suggestions"><h2><Clock size={15}/>{tr('Time you may have missed')}</h2><p>{tr('You wrote in MOONS for these projects while no timer was running. Add the time only if it is right.')}</p>
          {suggestions.map(s=>{const t=tasks.find(x=>x.id===s.taskId);return <div key={`${s.taskId}-${s.startedAt}`} className="suggestion"><span><b>{clock(s.startedAt)}–{clock(s.endedAt)}</b> {t?.title} <small>{tr('{n} records',{n:s.count})}</small></span><button className="secondary small" onClick={()=>commit(st=>acceptSuggestion(st,s))}><Check size={14}/>{tr('Add this time')}</button></div>})}</div>}
      </div>
      <aside className="settings-card project-side"><div className="side-head"><h2><FolderKanban size={16}/>{tr('Projects')}</h2></div>
        {projects.map(p=>{const pt=tasks.filter(t=>t.projectId===p.id);const done=pt.filter(t=>t.status==='done').length;return <button key={p.id} className="project-link" onClick={()=>ctx.go(`/planner/projects/${p.id}`)}><b>{p.name}</b><small>{fam[p.familiarity]} · {tr('{done}/{all} done',{done,all:pt.length})}</small></button>})}
        <NewProject ctx={ctx}/></aside>
    </div>
  </section>;
}

function RunningBar({ctx}:{ctx:Ctx}){
  const {store,ws}=ctx;const live=running(store.sessions??[])!;const task=(store.tasks??[]).find(t=>t.id===live.taskId);
  const mins=actualMinutes([live],live.taskId);
  return <div className="running-bar" role="status"><span className="pulse" aria-hidden/><span>{tr('Working on {title}',{title:task?.title??''})} · {fmt(mins)}</span><button className="secondary small" onClick={()=>ws.commit(s=>stopTimer(s))}><Square size={13}/>{tr('Stop')}</button></div>;
}

function TaskRow({task,ctx,projects}:{task:Task;ctx:Ctx;projects:Project[]}){
  const {store,ws}=ctx;const sessions=store.sessions??[];const live=running(sessions);const on=live?.taskId===task.id;
  const spent=actualMinutes(sessions,task.id);const project=projects.find(p=>p.id===task.projectId);
  const over=task.estimateMin&&spent>task.estimateMin;
  return <li className={`task-row ${task.status}`}>
    <input type="checkbox" aria-label={tr('Done')} checked={task.status==='done'} onChange={e=>ws.commit(s=>setStatus(s,task.id,e.target.checked?'done':'todo'))}/>
    <div className="task-main"><b>{task.wish&&<Star size={12} className="wish-star" aria-label={tr('Wish')}/>}{task.title}</b><small>{task.plannedStart&&<>{task.plannedStart} · </>}{project&&<button className="chip-link" onClick={()=>ctx.go(`/planner/projects/${project.id}`)}>{project.name}</button>}</small></div>
    <span className={`task-time ${over?'over':''}`} title={tr('Actual / expected')}>{fmt(spent)}{task.estimateMin?<> / {fmt(task.estimateMin)}</>:null}</span>
    {task.status!=='done'&&task.status!=='dropped'&&(on?<button className="icon-button timer on" aria-label={tr('Stop')} onClick={()=>ws.commit(s=>stopTimer(s))}><Square size={15}/></button>:<button className="icon-button timer" aria-label={tr('Start')} onClick={()=>ws.commit(s=>startTimer(s,task.id))}><Play size={15}/></button>)}
    {task.status==='dropped'?<button className="icon-button" aria-label={tr('Bring back')} onClick={()=>ws.commit(s=>setStatus(s,task.id,'todo'))}><Undo2 size={14}/></button>:task.status!=='done'&&<button className="icon-button" aria-label={tr('Drop this task')} title={tr('Drop this task')} onClick={()=>ws.commit(s=>setStatus(s,task.id,'dropped'))}><X size={14}/></button>}
    {task.wish&&task.status==='done'&&<RewardAsk task={task} set={r=>ws.commit(s=>setReward(s,task.id,r))}/>}
  </li>;
}

/** Right after a wish is done: did it feel like a reward? MOONS learns what the person actually wanted. */
function RewardAsk({task,set}:{task:Task;set:(r:Reward)=>void}){
  const options:[Reward,string][]=[['yes',tr('It felt like a reward')],['meh',tr('So-so')],['no',tr('Not really')]];
  return <div className="reward-ask">{task.reward?<small>{options.find(o=>o[0]===task.reward)?.[1]}</small>:<><small>{tr('Did it feel like a reward?')}</small>{options.map(([r,l])=><button key={r} className="chip-mini" onClick={()=>set(r)}>{l}</button>)}</>}</div>;
}

function AddTask({projects,day,add,projectId,stepKey}:{projects:Project[];day?:string;add:(t:Task)=>void;projectId?:string;stepKey?:string}){
  const [title,setTitle]=useState(''),[project,setProject]=useState(projectId??''),[est,setEst]=useState(''),[start,setStart]=useState(''),[wish,setWish]=useState(false);
  return <form className="add-task" onSubmit={e=>{e.preventDefault();if(!title.trim())return;add(newTask(title.trim(),{...(project?{projectId:project}:{}),...(day?{plannedDate:day}:{}),...(est?{estimateMin:Math.max(0,Number(est))}:{}),...(start?{plannedStart:start}:{}),...(stepKey?{stepKey}:{}),...(wish?{wish:true}:{})}));setTitle('');setEst('');setStart('');setWish(false)}}>
    <input aria-label={tr('Task')} placeholder={tr('What will you do?')} value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/>
    {!projectId&&<select aria-label={tr('Project')} value={project} onChange={e=>setProject(e.target.value)}><option value="">{tr('No project')}</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
    <input aria-label={tr('Expected minutes')} type="number" min={0} step={5} placeholder={tr('min')} value={est} onChange={e=>setEst(e.target.value)} className="est"/>
    {day&&<input aria-label={tr('Start time')} type="time" value={start} onChange={e=>setStart(e.target.value)}/>}
    {day&&<label className={`wish-toggle ${wish?'on':''}`} title={tr('A bonus-stage item: something you would like to do once the day’s tasks are done. It does not count toward completion.')}><input type="checkbox" checked={wish} onChange={e=>setWish(e.target.checked)}/><Star size={13}/>{tr('Wish')}</label>}
    <button className="primary small" disabled={!title.trim()}><Plus size={14}/>{tr('Add')}</button></form>;
}

function NewProject({ctx}:{ctx:Ctx}){
  const [open,setOpen]=useState(false),[name,setName]=useState(''),[f,setF]=useState<Familiarity>('new'),[planet,setPlanet]=useState(''),[pattern,setPattern]=useState('');
  const forms=formsOf(ctx.store);
  if(!open)return <button className="text-button" onClick={()=>setOpen(true)}><Plus size={14}/>{tr('New project')}</button>;
  return <form className="new-project" onSubmit={e=>{e.preventDefault();if(!name.trim())return;const p=newProject(name.trim(),f,{...(planet?{planetId:planet}:{}),...(pattern?{patternFormId:pattern}:{})});if(ctx.ws.commit(s=>({...s,projects:[...(s.projects??[]),p]})))ctx.go(`/planner/projects/${p.id}`)}}>
    <input aria-label={tr('Project name')} placeholder={tr('e.g. Physical AI 3D assets')} value={name} onChange={e=>setName(e.target.value)} maxLength={60} autoFocus/>
    <span className="label">{tr('How well do you know this field?')}</span>
    <div className="chip-row">{(Object.keys(fam) as Familiarity[]).map(k=><button type="button" key={k} className={f===k?'selected':''} aria-pressed={f===k} onClick={()=>setF(k)}>{fam[k]}</button>)}</div>
    <label className="form-label">{tr('Mother planet')}<select value={planet} onChange={e=>setPlanet(e.target.value)}><option value="">{tr('None (Dwarf Planet)')}</option>{ctx.store.planets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="form-label">{tr('My work order (a form with steps)')}<select value={pattern} onChange={e=>setPattern(e.target.value)}><option value="">{tr('None')}</option>{forms.filter(x=>x.blocks.some(b=>b.kind==='steps')).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <div className="settings-actions"><button type="button" className="secondary small" onClick={()=>setOpen(false)}>{tr('Cancel')}</button><button className="primary small" disabled={!name.trim()}>{tr('Create')}</button></div></form>;
}

/* ---------- Project ---------- */

export function ProjectPage({id,ctx}:{id:string;ctx:Ctx}){
  const {store,ws}=ctx;const project=(store.projects??[]).find(p=>p.id===id);
  const sessions=store.sessions??[];useTick(!!running(sessions));
  if(!project)return <section className="page-shell"><h1>{tr('Project not found')}</h1><button className="text-button" onClick={()=>ctx.go('/planner')}><ArrowLeft size={15}/>{tr('Planner')}</button></section>;
  const tasks=(store.tasks??[]).filter(t=>t.projectId===id);
  const pattern=formsOf(store).find(f=>f.id===project.patternFormId);
  const steps=pattern?.blocks.find(b=>b.kind==='steps')?.options?.filter(Boolean)??[];
  const est=tasks.reduce((s,t)=>s+(t.estimateMin??0),0),act=tasks.reduce((s,t)=>s+actualMinutes(sessions,t.id),0);
  const patch=(p:Partial<Project>)=>ws.commit(s=>({...s,projects:(s.projects??[]).map(x=>x.id===id?{...x,...p}:x)}));
  const loose=tasks.filter(t=>!t.stepKey||!steps.includes(t.stepKey));
  return <section className="page-shell planner project-page">
    <div className="page-heading"><div><button className="text-button" onClick={()=>ctx.go('/planner')}><ArrowLeft size={15}/>{tr('Planner')}</button><h1>{project.name}</h1>
      <div className="chip-row">{(Object.keys(fam) as Familiarity[]).map(k=><button key={k} className={project.familiarity===k?'selected':''} aria-pressed={project.familiarity===k} onClick={()=>patch({familiarity:k})}>{fam[k]}</button>)}</div></div>
      <div className="day-summary"><span>{tr('Expected {time}',{time:fmt(est)})}</span><span>{tr('Actual {time}',{time:fmt(act)})}</span>{project.status==='active'?<button className="text-button" onClick={()=>patch({status:'done'})}><Check size={14}/>{tr('Mark project done')}</button>:<button className="text-button" onClick={()=>patch({status:'active'})}><Undo2 size={14}/>{tr('Reopen')}</button>}</div></div>
    <div className="planner-grid">
      <div className="settings-card">
        {steps.length>0?<ol className="step-board">{steps.map(step=>{const st=tasks.filter(t=>t.stepKey===step);return <li key={step}><div className="step-head"><b>{step}</b><small>{st.length?tr('{n} tasks',{n:st.length}):tr('No task yet')}</small></div>
          <ul className="task-list">{st.map(t=><TaskRow key={t.id} task={t} ctx={ctx} projects={[project]}/>)}</ul>
          <AddTask projects={[project]} projectId={project.id} stepKey={step} add={t=>ws.commit(s=>({...s,tasks:[...(s.tasks??[]),t]}))}/></li>})}</ol>
        :<p className="empty-note">{tr('Pick a work-order form for this project to see its steps here.')}</p>}
        <h2 className="sub">{steps.length?tr('Other tasks'):tr('Tasks')}</h2>
        <ul className="task-list">{loose.map(t=><TaskRow key={t.id} task={t} ctx={ctx} projects={[project]}/>)}</ul>
        <AddTask projects={[project]} projectId={project.id} day={today()} add={t=>ws.commit(s=>({...s,tasks:[...(s.tasks??[]),t]}))}/>
      </div>
      <aside className="settings-card"><ConfidencePanel targetType="project" targetId={project.id} ctx={ctx} planetId={project.planetId}/>
        <label className="form-label">{tr('My work order (a form with steps)')}<select value={project.patternFormId??''} onChange={e=>patch({patternFormId:e.target.value||undefined})}><option value="">{tr('None')}</option>{formsOf(store).filter(x=>x.blocks.some(b=>b.kind==='steps')).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="form-label">{tr('Mother planet')}<select value={project.planetId??''} onChange={e=>patch({planetId:e.target.value||undefined})}><option value="">{tr('None (Dwarf Planet)')}</option>{store.planets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </aside>
    </div>
  </section>;
}

/* ---------- Confidence ---------- */

/** Missed + Shifted share of compared items on a planet: the evidence shown beside a confidence rating. */
export function planetEvidence(store:Store,planetId?:string){
  const items=store.entries.filter(e=>!planetId||e.planetIds.includes(planetId)).flatMap(e=>e.comparison?.items??[]);
  if(!items.length)return null;
  const off=items.filter(i=>i.verdict==='missed'||i.verdict==='shifted').length;
  return {ratio:off/items.length,count:items.length};
}

export function ConfidencePanel({targetType,targetId,ctx,planetId}:{targetType:Confidence['targetType'];targetId:string;ctx:Ctx;planetId?:string}){
  const ratings=ratingsFor(ctx.store,targetId),last=ratings.at(-1);const [note,setNote]=useState('');
  const ev=planetEvidence(ctx.store,planetId),avg=planetEvidence(ctx.store);
  const high=last&&last.value>=7&&ev&&avg&&ev.ratio>avg.ratio+.1,low=last&&last.value<=4&&ev&&avg&&ev.ratio<avg.ratio-.1;
  return <div className="confidence">
    <h2>{tr('How sure are you?')}</h2>
    <div className="scale-row" role="radiogroup" aria-label={tr('Confidence')}>{Array.from({length:10},(_,i)=>i+1).map(n=><button key={n} role="radio" aria-checked={last?.value===n} className={last?.value===n?'selected':''} onClick={()=>{ctx.ws.commit(s=>rate(s,targetType,targetId,n,note));setNote('')}}>{n}</button>)}</div>
    <input className="note" aria-label={tr('Why (optional)')} placeholder={tr('Why (optional)')} value={note} onChange={e=>setNote(e.target.value)} maxLength={200}/>
    {ratings.length>0&&<Spiral ratings={ratings}/>}
    {ev&&<p className="evidence-line">{tr('Evidence: {pct}% of {n} compared items here were Missed or Shifted (your average {avg}%).',{pct:Math.round(ev.ratio*100),n:ev.count,avg:Math.round((avg?.ratio??0)*100)})}</p>}
    {high&&<p className="observation">{tr('You rate this high, and more here was missed or shifted than usual. It may be a place you think you know.')}</p>}
    {low&&<p className="observation">{tr('You rate this low, yet your comparisons here hold up better than usual.')}</p>}
    {plateau(ratings)&&<p className="observation">{tr('Your ratings have stayed flat for a while. This may be a plateau — a normal part of learning.')}</p>}
  </div>;
}

/** Each rating is one turn up a spiral: angle = order, radius = confidence. */
function Spiral({ratings}:{ratings:Confidence[]}){
  const pts=ratings.map((r,i)=>{const a=i*0.9-Math.PI/2,rad=10+r.value*7;return {x:90+Math.cos(a)*rad,y:90+Math.sin(a)*rad,r}});
  return <svg className="spiral" viewBox="0 0 180 180" role="img" aria-label={tr('Confidence history: {values}',{values:ratings.map(r=>r.value).join(', ')})}>
    {[3,6,10].map(v=><circle key={v} cx={90} cy={90} r={10+v*7} className="ring"/>)}
    <polyline points={pts.map(p=>`${p.x},${p.y}`).join(' ')} className="path"/>
    {pts.map((p,i)=><circle key={p.r.id} cx={p.x} cy={p.y} r={i===pts.length-1?5:3} className={i===pts.length-1?'dot last':'dot'}><title>{`${new Date(p.r.at).toLocaleDateString()} · ${p.r.value}${p.r.note?` · ${p.r.note}`:''}`}</title></circle>)}
  </svg>;
}
