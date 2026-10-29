import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {Bot,Check,Circle,CircleCheckBig,CircleEllipsis,CircleDot,CircleHelp,Columns2,FileText,History,Lightbulb,LoaderCircle,Plus,Scale,Sparkles,X} from 'lucide-react';
import type {Entry,NodeLink,Store} from '@/lib/model';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {conceptsOf,unfamiliar} from '@/lib/concepts';
import {isQuestion,materialsOf,newQuestion,newSub,questionOf,questionStatuses,remaining,statusLabel,type Decision,type Question,type QuestionEntry,type QuestionStatus,type SubQuestion} from '@/lib/questions';
import {buildFrames,fetchEvents} from '@/lib/replay';
import {deskUrl} from './CompareDesk';
import {DwarfBadge} from './Concepts';
import Modal from './Modal';
import {ChatsAbout,TalkButton} from './ChatNotes';
import {tr} from '@/lib/i18n';
import '../styles/station.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void};
const statusGlyph={open:Circle,working:CircleDot,tentative:CircleEllipsis,closed:CircleCheckBig};
const Glyph=({s,size=14}:{s:QuestionStatus;size?:number})=>{const I=statusGlyph[s];return <I size={size}/>};
const label=(e:Entry)=>e.title||e.body.slice(0,40);

export function StatusPick({value,change,small}:{value:QuestionStatus;change?:(s:QuestionStatus)=>void;small?:boolean}){
  return <span className={`q-status ${small?'small':''}`} role="group" aria-label={tr('Status')}>{questionStatuses.map(s=><button key={s} type="button" className={`${s} ${value===s?'on':''}`} aria-pressed={value===s} title={statusLabel[s]} aria-label={statusLabel[s]} disabled={!change} onClick={()=>change?.(s)}><Glyph s={s} size={small?12:14}/></button>)}</span>;
}

/** /station: question notes by status. */
export default function Station({ctx}:{ctx:Ctx}){
  const {store,go}=ctx;
  const [filter,setFilter]=useState<QuestionStatus|'all'>('all'),[creating,setCreating]=useState(false);
  const all=store.entries.filter(isQuestion) as QuestionEntry[];
  const list=all.filter(e=>filter==='all'||questionOf(e)?.status===filter);
  return <section className="page-shell station-page">
    <div className="page-heading"><div><h1>{tr('Station')}</h1></div>
      <div className="station-actions"><button className="secondary" onClick={()=>go(deskUrl([]))} title={tr('Side by side')}><Columns2 size={17}/></button><button className="primary" onClick={()=>setCreating(true)}><Plus size={18}/>{tr('New question')}</button></div></div>
    <div className="notes-toolbar"><div className="filters"><button className={filter==='all'?'selected':''} onClick={()=>setFilter('all')}>{tr('All')}<span>{all.length}</span></button>
      {questionStatuses.map(s=><button key={s} className={filter===s?'selected':''} onClick={()=>setFilter(s)}><Glyph s={s} size={13}/> {statusLabel[s]}<span>{all.filter(e=>questionOf(e)?.status===s).length}</span></button>)}</div></div>
    {list.length?<ul className="question-list">{list.map(e=>{const q=questionOf(e),r=remaining(e,store);return <li key={e.id}><button onClick={()=>go(`/entries/${e.id}`)}>
      <span className={`ql-status ${q?.status??'open'}`} title={statusLabel[q?.status??'open']}><Glyph s={q?.status??'open'} size={16}/></span>
      <span className="ql-title">{e.title}</span>
      <span className="ql-meta" title={tr('Sub-questions')}><CircleHelp size={13}/>{q?.subQuestions.filter(s=>s.layer==='user').length??0}</span>
      <span className="ql-meta remain" title={tr('Remaining')}><CircleDot size={13}/>{r.open.length+r.concepts.length}</span>
    </button></li>})}</ul>
    :<div className="empty-state"><CircleHelp size={40} strokeWidth={1}/><h2>{tr('No questions yet')}</h2></div>}
    {creating&&<NewQuestion ctx={ctx} close={()=>setCreating(false)}/>}
  </section>;
}

/** A question in the user's own words: the question, and why they came to ask it. */
export function NewQuestion({ctx,close,initial='',from}:{ctx:Ctx;close:()=>void;initial?:string;from?:{entryId:string;sentence:number}}){
  const [text,setText]=useState(initial),[why,setWhy]=useState('');
  function save(e:FormEvent){e.preventDefault();const t=text.trim();if(!t)return;const q=newQuestion(t,{why,...(from?{entryId:from.entryId,sentence:from.sentence}:{})});
    if(ctx.ws.commit(s=>({...s,entries:[q,...s.entries]}))){close();ctx.go(`/entries/${q.id}`)}else ctx.notify(tr('This space changed elsewhere. Resolve the conflict above first.'))}
  return <Modal title={tr('New question')} close={close}><form className="question-form" onSubmit={save}>
    <label className="form-label">{tr('Question')}<input autoFocus value={text} maxLength={200} onChange={e=>setText(e.target.value)} required/></label>
    <label className="form-label">{tr('Why I ask')}<textarea value={why} maxLength={2000} onChange={e=>setWhy(e.target.value)}/></label>
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>{tr('Cancel')}</button><button className="primary" disabled={!text.trim()}>{tr('Save')}</button></div>
  </form></Modal>;
}

/** A question note: sub-questions with their materials and decisions, the answer, and what remains (computed). */
export function QuestionView({ctx,entry}:{ctx:Ctx;entry:QuestionEntry}){
  const {store,ws,go,notify}=ctx;
  const q:Question=questionOf(entry)??{why:'',status:'open',subQuestions:[]};
  const [adding,setAdding]=useState(''),[busy,setBusy]=useState(false),[replay,setReplay]=useState(false),[answer,setAnswer]=useState(q.answer?.text??'');
  const save=(next:Question,links?:(l:NodeLink[])=>NodeLink[])=>ws.commit(s=>({...s,entries:s.entries.map(e=>e.id===entry.id?{...e,question:next} as Entry:e),...(links?{links:links(s.links??[])}:{})}));
  const setSub=(id:string,f:(s:SubQuestion)=>SubQuestion)=>save({...q,subQuestions:q.subQuestions.map(s=>s.id===id?f(s):s)});
  const r=remaining(entry,store),mats=materialsOf(entry);
  const origin=q.origin?store.entries.find(e=>e.id===q.origin!.entryId):undefined;
  function add(e:FormEvent){e.preventDefault();const t=adding.trim();if(!t)return;if(save({...q,subQuestions:[...q.subQuestions,newSub(t)]}))setAdding('')}
  async function draft(){
    setBusy(true);
    try{const res=await ws.action('question_ai',{entryId:entry.id}) as {result?:{subQuestions?:{text:string;why:string;entryIds:string[];conceptIds:string[]}[]}};
      const subs=(res?.result?.subQuestions??[]).map(s=>({...newSub(s.text,'ai',{entryIds:s.entryIds,conceptIds:s.conceptIds}),why:s.why}));
      const latest=(ws.getStore()?.entries.find(e=>e.id===entry.id) as QuestionEntry|undefined)?.question??q;
      ws.commit(s=>({...s,entries:s.entries.map(e=>e.id===entry.id?{...e,question:{...latest,subQuestions:[...latest.subQuestions,...subs]}} as Entry:e)}));
    }catch(err){notify(errMsg(err))}finally{setBusy(false)}
  }
  /** A material note also gets a line to the question in My Galaxy. */
  function addMaterial(sub:SubQuestion,kind:'entry'|'concept',id:string){
    const m=kind==='entry'?{...sub.materials,entryIds:[...new Set([...sub.materials.entryIds,id])]}:{...sub.materials,conceptIds:[...new Set([...sub.materials.conceptIds,id])]};
    save({...q,subQuestions:q.subQuestions.map(s=>s.id===sub.id?{...s,materials:m}:s)},kind==='entry'?l=>l.some(x=>x.from===entry.id&&x.to===id)?l:[...l,{id:crypto.randomUUID(),from:entry.id,to:id,relation:'related',reason:entry.title??'',createdAt:new Date().toISOString()}]:undefined);
  }
  return <section className="page-shell question-page">
    <header className="qp-head">
      <span className="eyebrow"><CircleHelp size={13}/>{tr('Question')}</span>
      <h1>{entry.title}</h1>
      <div className="qp-tools"><StatusPick value={q.status} change={s=>save({...q,status:s})}/>
        {mats.entryIds.length>0&&<button className="icon-button" title={tr('Side by side')} aria-label={tr('Side by side')} onClick={()=>go(deskUrl(mats.entryIds))}><Columns2 size={17}/></button>}
        <TalkButton ctx={ctx} origin={{kind:'question',ref:entry.id}} ids={[entry.id,...mats.entryIds].slice(0,5)} title={entry.title}/>
        <button className={`icon-button ${replay?'selected':''}`} aria-pressed={replay} title={tr('Process')} aria-label={tr('Process')} onClick={()=>setReplay(!replay)}><History size={17}/></button></div>
      {q.why&&<p className="qp-why">{q.why}</p>}
      {origin&&<button className="text-button" onClick={()=>go(`/entries/${origin.id}/original?source=${q.origin!.sentence}`)}><FileText size={13}/>{label(origin)} · “{origin.sentences[q.origin!.sentence]}”</button>}
    </header>
    {replay&&<QuestionReplay id={entry.id} close={()=>setReplay(false)}/>}
    <div className="qp-grid">
      <div>
        <ol className="sub-list">{q.subQuestions.map(s=><SubCard key={s.id} s={s} store={store} go={go} change={f=>setSub(s.id,f)} remove={()=>save({...q,subQuestions:q.subQuestions.filter(x=>x.id!==s.id)})} addMaterial={(k,id)=>addMaterial(s,k,id)}/>)}</ol>
        <form className="sub-add" onSubmit={add}><input value={adding} maxLength={200} onChange={e=>setAdding(e.target.value)} placeholder={tr('Sub-question')} aria-label={tr('Add a sub-question')}/>
          <button className="icon-button" disabled={!adding.trim()} aria-label={tr('Add')}><Plus size={16}/></button>
          <button type="button" className="secondary" disabled={busy} onClick={()=>void draft()} title={tr('MOONS drafts sub-questions')}>{busy?<LoaderCircle className="spin" size={15}/>:<Sparkles size={15}/>}</button></form>
        <ChatsAbout ctx={ctx} tag={{type:'question',id:entry.id}}/>
        <section className="qp-answer"><h2>{tr('Answer')}</h2>
          <textarea value={answer} maxLength={4000} onChange={e=>setAnswer(e.target.value)} aria-label={tr('Answer')}/>
          {answer.trim()!==(q.answer?.text??'')&&<button className="primary small" onClick={()=>save({...q,answer:{text:answer.trim(),layer:'user',at:new Date().toISOString()}})}>{tr('Save')}</button>}
        </section>
      </div>
      <aside className="qp-remaining" aria-label={tr('Remaining')}>
        <h2><CircleDot size={15}/>{tr('Remaining')} <small>{r.open.length+r.concepts.length}</small></h2>
        <ul>{r.open.map(s=><li key={s.id}><span className="ql-status open"><Glyph s="open" size={13}/></span>{s.text}</li>)}
          {r.concepts.map(c=><li key={c.id}><button className="concept-chip" onClick={()=>go(`/concepts/${c.id}`)}><Lightbulb size={12}/>{c.name}<DwarfBadge/></button></li>)}</ul>
      </aside>
    </div>
  </section>;
}

function SubCard({s,store,go,change,remove,addMaterial}:{s:SubQuestion;store:Store;go:(u:string)=>void;change:(f:(s:SubQuestion)=>SubQuestion)=>void;remove:()=>void;addMaterial:(k:'entry'|'concept',id:string)=>void}){
  const [deciding,setDeciding]=useState(false),[picking,setPicking]=useState(false);
  const ai=s.layer==='ai';
  return <li className={`sub-card ${ai?'ai':''} ${s.status}`}>
    <div className="sc-top">
      <StatusPick small value={s.status} change={ai?undefined:st=>change(x=>({...x,status:st}))}/>
      <p>{s.text}</p>
      {ai?<span className="sc-ai"><Bot size={14} aria-label={tr('MOONS draft')}/><button className="icon-button" title={tr('Adopt')} aria-label={tr('Adopt')} onClick={()=>change(x=>({...x,layer:'user'}))}><Check size={15}/></button><button className="icon-button" title={tr('Drop')} aria-label={tr('Drop')} onClick={remove}><X size={15}/></button></span>
      :<span className="sc-tools"><button className={`icon-button ${s.decision?'selected':''}`} title={tr('Decision')} aria-label={tr('Decision')} onClick={()=>setDeciding(!deciding)}><Scale size={15}/></button><button className="icon-button" title={tr('Add material')} aria-label={tr('Add material')} onClick={()=>setPicking(true)}><Plus size={15}/></button><button className="icon-button" title={tr('Delete')} aria-label={tr('Delete')} onClick={remove}><X size={15}/></button></span>}
    </div>
    {s.why&&ai&&<small className="sc-why">{s.why}</small>}
    <div className="sc-materials">
      {s.materials.entryIds.map(id=>{const e=store.entries.find(x=>x.id===id);return e?<button key={id} className="material-chip" onClick={()=>go(`/entries/${id}/original`)}><FileText size={12}/>{label(e)}</button>:null})}
      {s.materials.conceptIds.map(id=>{const c=conceptsOf(store).find(x=>x.id===id);return c?<button key={id} className="concept-chip" onClick={()=>go(`/concepts/${id}`)}><Lightbulb size={12}/>{c.name}{unfamiliar(c)&&<DwarfBadge/>}</button>:null})}
    </div>
    {s.decision&&!deciding&&<div className="sc-decision"><Scale size={13}/><b>{s.decision.chosen}</b>{s.decision.reason&&<span> — {s.decision.reason}</span>}{s.decision.rejected.map((r,i)=><small key={i}>✕ {r.option}{r.why?` — ${r.why}`:''}</small>)}</div>}
    {deciding&&<DecisionForm value={s.decision} save={d=>{change(x=>({...x,decision:d,status:d&&x.status==='open'?'tentative':x.status}));setDeciding(false)}}/>}
    {picking&&<MaterialPicker store={store} close={()=>setPicking(false)} pick={(k,id)=>{addMaterial(k,id);setPicking(false)}}/>}
  </li>;
}

function DecisionForm({value,save}:{value?:Decision;save:(d:Decision|undefined)=>void}){
  const [chosen,setChosen]=useState(value?.chosen??''),[reason,setReason]=useState(value?.reason??''),[rejected,setRejected]=useState(value?.rejected??[]);
  return <form className="decision-form" onSubmit={e=>{e.preventDefault();save(chosen.trim()?{chosen:chosen.trim(),reason:reason.trim(),rejected:rejected.filter(r=>r.option.trim()),by:'user'}:undefined)}}>
    <input value={chosen} onChange={e=>setChosen(e.target.value)} placeholder={tr('Chosen')} aria-label={tr('Chosen')} maxLength={200}/>
    <input value={reason} onChange={e=>setReason(e.target.value)} placeholder={tr('Reason')} aria-label={tr('Reason')} maxLength={400}/>
    {rejected.map((r,i)=><div key={i} className="df-row"><span>✕</span><input value={r.option} placeholder={tr('Dropped')} aria-label={tr('Dropped')} onChange={e=>setRejected(rejected.map((x,j)=>j===i?{...x,option:e.target.value}:x))}/><input value={r.why} placeholder={tr('Why')} aria-label={tr('Why')} onChange={e=>setRejected(rejected.map((x,j)=>j===i?{...x,why:e.target.value}:x))}/></div>)}
    <div className="df-actions"><button type="button" className="text-button" onClick={()=>setRejected([...rejected,{option:'',why:''}])}><Plus size={13}/>✕</button><button className="primary small">{tr('Save')}</button></div>
  </form>;
}

function MaterialPicker({store,close,pick}:{store:Store;close:()=>void;pick:(k:'entry'|'concept',id:string)=>void}){
  const [q,setQ]=useState('');const k=q.trim().toLowerCase();
  const notes=useMemo(()=>store.entries.filter(e=>e.kind!=='question'&&(!k||`${e.title??''} ${e.body}`.toLowerCase().includes(k))).slice(0,30),[store.entries,k]);
  const concepts=conceptsOf(store).filter(c=>!k||[c.name,...c.aliases].some(n=>n.toLowerCase().includes(k))).slice(0,30);
  return <Modal title={tr('Add material')} close={close}><input autoFocus className="picker-search" value={q} onChange={e=>setQ(e.target.value)} placeholder={tr('Search')} aria-label={tr('Search')}/>
    <div className="picker-cols"><ul>{notes.map(e=><li key={e.id}><button onClick={()=>pick('entry',e.id)}><FileText size={13}/>{label(e)}</button></li>)}</ul>
      <ul>{concepts.map(c=><li key={c.id}><button onClick={()=>pick('concept',c.id)}><Lightbulb size={13}/>{c.name}</button></li>)}</ul></div></Modal>;
}

/** The question's process, replayed from the change log: each change to this note, in order. */
function QuestionReplay({id,close}:{id:string;close:()=>void}){
  const [frames,setFrames]=useState<{at:string;q?:Question;title?:string}[]|null>(null),[i,setI]=useState(0),[error,setError]=useState('');
  useEffect(()=>{fetchEvents().then(ev=>{const out:{at:string;q?:Question;title?:string}[]=[];let last='';
    for(const f of buildFrames(ev)){const e=f.store.entries.find(x=>x.id===id) as QuestionEntry|undefined;if(!e)continue;const sig=JSON.stringify(e.question);if(sig!==last){last=sig;out.push({at:f.at,q:e.question,title:e.title})}}
    setFrames(out);setI(Math.max(0,out.length-1))},e=>setError(errMsg(e)))},[id]);
  if(error)return <p className="field-error">{error}</p>;
  if(!frames)return <div className="q-replay"><LoaderCircle className="spin" size={16}/></div>;
  const f=frames[i];
  return <div className="q-replay"><div className="qr-bar"><input type="range" min={0} max={Math.max(0,frames.length-1)} value={i} onChange={e=>setI(Number(e.target.value))} aria-label={tr('Process')}/><span>{i+1}/{frames.length}</span><time>{f?new Date(f.at).toLocaleString():''}</time><button className="icon-button" aria-label={tr('Close')} onClick={close}><X size={15}/></button></div>
    {f?.q&&<ul className="qr-subs"><li><StatusPick small value={f.q.status}/> <b>{f.title}</b></li>{f.q.subQuestions.map(s=><li key={s.id} className={s.layer}><StatusPick small value={s.status}/> {s.text}{s.decision&&<small> · {s.decision.chosen}</small>}</li>)}{f.q.answer&&<li className="qr-answer">{f.q.answer.text}</li>}</ul>}
  </div>;
}
