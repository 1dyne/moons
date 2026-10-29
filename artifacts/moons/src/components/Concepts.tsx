import {useMemo,useState,type FormEvent} from 'react';
import {ArrowLeft,BookOpen,Bot,CircleAlert,Lightbulb,Link2,Link2Off,LoaderCircle,PenLine,RefreshCw,Search,Send,Sparkle,StickyNote,Upload,X} from 'lucide-react';
import type {Entry,Store} from '@/lib/model';
import {makeEntry} from '@/lib/model';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {conceptKinds,conceptRelLabel,conceptSpans as spans,conceptsOf,kindLabel,memosOf,needsCheck,neighbours,stateLabel,unfamiliar,type Concept,type Layer,type Memo} from '@/lib/concepts';
import SparkComposer from './SparkComposer';
import ElkMap from './ElkMap';
import {tr} from '@/lib/i18n';
import {ChatsAbout,TalkButton} from './ChatNotes';
import {uncoveredNeighbours} from '@/lib/chat-notes';
import {showConcept,useLinks} from '@/lib/term-pop';
import {Examples,RelationChips,TermHead} from './Terms';
import '../styles/concepts.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void};
const states=['seen','organized','checked','explainable'] as const;
const label=(e:Entry)=>e.title||e.body.slice(0,40);

export function LayerMark({layer}:{layer:Layer}){
  const [Icon,name]=layer==='user'?[PenLine,tr('My words')]:layer==='material'?[BookOpen,tr('From a material')]:[Bot,tr('MOONS knowledge')];
  return <span className={`layer-mark ${layer}`} title={name} aria-label={name}><Icon size={13}/></span>;
}
/** The "!" on AI knowledge with no source. Pressing it confirms the item. */
export function CheckMark({confirm}:{confirm?:()=>void}){
  return <button type="button" className="check-mark" title={tr('Not from your notes or materials. Confirm it')} aria-label={tr('Confirm')} disabled={!confirm} onClick={confirm}><CircleAlert size={14}/></button>;
}
export const DwarfBadge=()=><span className="dwarf-badge" title={tr('Never explained in your own words')} aria-label={tr('Never explained in your own words')}>●</span>;

/** /concepts and /concepts/:id */
export default function Concepts({ctx,id}:{ctx:Ctx;id?:string}){
  const c=id?conceptsOf(ctx.store).find(x=>x.id===id):undefined;
  if(id&&c)return <ConceptPage ctx={ctx} c={c}/>;
  return <ConceptList ctx={ctx}/>;
}

function ConceptList({ctx}:{ctx:Ctx}){
  const {store,go}=ctx,all=conceptsOf(store);
  const [q,setQ]=useState(''),[kind,setKind]=useState('all'),[state,setState]=useState('all'),[sort,setSort]=useState<'mentions'|'recent'|'name'>('mentions'),[dwarf,setDwarf]=useState(false);
  const list=useMemo(()=>{
    const k=q.trim().toLowerCase();
    return all.filter(c=>(kind==='all'||c.kind===kind)&&(state==='all'||c.state===state)&&(!dwarf||unfamiliar(c))&&(!k||[c.name,...c.aliases].some(n=>n.toLowerCase().includes(k))))
      .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='recent'?(b.updatedAt??b.createdAt).localeCompare(a.updatedAt??a.createdAt):b.mentions.length-a.mentions.length);
  },[all,q,kind,state,sort,dwarf]);
  return <section className="page-shell concepts-page">
    <div className="page-heading"><div><h1>{tr('Concepts')}</h1></div><Backfill ctx={ctx}/></div>
    <div className="notes-toolbar">
      <div className="filters">
        <button className={kind==='all'?'selected':''} onClick={()=>setKind('all')}>{tr('All')}<span>{all.length}</span></button>
        {conceptKinds.map(k=><button key={k} className={kind===k?'selected':''} onClick={()=>setKind(k)}>{kindLabel[k]}</button>)}
        <button className={dwarf?'selected':''} aria-pressed={dwarf} onClick={()=>setDwarf(!dwarf)} title={tr('Never explained in your own words')}><DwarfBadge/>{tr('Dwarf planets')}</button>
      </div>
      <label className="search-field"><Search size={17}/><input aria-label={tr('Search concepts')} value={q} onChange={e=>setQ(e.target.value)} placeholder={tr('Search concepts')}/>{q&&<button onClick={()=>setQ('')} aria-label={tr('Clear search')}><X size={14}/></button>}</label>
    </div>
    <div className="notes-subbar">
      <select aria-label={tr('State')} value={state} onChange={e=>setState(e.target.value)}><option value="all">{tr('Every state')}</option>{states.map(s=><option key={s} value={s}>{stateLabel[s]}</option>)}</select>
      <select aria-label={tr('Sort')} value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="mentions">{tr('Most mentioned')}</option><option value="recent">{tr('Recent')}</option><option value="name">{tr('Name')}</option></select>
      <span>{list.length}</span>
    </div>
    {list.length?<ul className="concept-list">{list.map(c=><li key={c.id}><button onClick={()=>go(`/concepts/${c.id}`)}>
      <span className="cl-name">{c.name}{unfamiliar(c)&&<DwarfBadge/>}</span>
      <span className="cl-kind">{kindLabel[c.kind]}</span>
      <span className={`state-pill ${c.state}`}>{stateLabel[c.state]}</span>
      <span className="cl-count" title={tr('Mentions')}>{c.mentions.length}</span>
      {(c.definition.some(needsCheck)||c.relations.some(needsCheck))&&<CircleAlert className="cl-check" size={14} aria-label={tr('Needs checking')}/>}
    </button></li>)}</ul>
    :<div className="empty-state"><Lightbulb size={40} strokeWidth={1}/><h2>{all.length?tr('No matching concepts'):tr('No concepts yet')}</h2></div>}
  </section>;
}

/** Finds concepts in notes that were never read for concepts, one note at a time. */
function Backfill({ctx}:{ctx:Ctx}){
  const todo=ctx.store.entries.filter(e=>!e.meta?.conceptsAt&&e.sentences.length>0);
  const [run,setRun]=useState<{done:number;total:number}|null>(null);
  async function go(){
    const ids=todo.map(e=>e.id);setRun({done:0,total:ids.length});let failed=0;
    for(let i=0;i<ids.length;i++){try{await ctx.ws.action('concepts',{entryId:ids[i]})}catch(e){failed++;if(failed>=3){ctx.notify(errMsg(e));break}}setRun({done:i+1,total:ids.length})}
    setRun(null);
  }
  if(!todo.length&&!run)return null;
  return <button className="secondary" disabled={!!run} onClick={()=>void go()} title={tr('Find concepts in notes not read yet')}>
    {run?<><LoaderCircle className="spin" size={16}/>{run.done}/{run.total}</>:<><RefreshCw size={16}/>{todo.length}</>}</button>;
}

function ConceptPage({ctx,c}:{ctx:Ctx;c:Concept}){
  const {store,ws,go,notify}=ctx,all=conceptsOf(store);
  const [explaining,setExplaining]=useState(false);
  const near=neighbours(c,all),uncovered=uncoveredNeighbours(store,c.id,c.name);
  const save=(next:Concept)=>ws.commit(s=>({...s,concepts:conceptsOf(s).map(x=>x.id===c.id?{...next,updatedAt:new Date().toISOString()}:x)}));
  const confirmDef=(i:number)=>save({...c,definition:c.definition.map((d,j)=>j===i?{...d,confirmed:true}:d)});
  const confirmRel=(i:number)=>save({...c,relations:c.relations.map((r,j)=>j===i?{...r,confirmed:true}:r)});
  const dropRel=(i:number)=>save({...c,relations:c.relations.filter((_,j)=>j!==i)});
  const byEntry=new Map<string,Concept['mentions']>();
  for(const m of c.mentions)byEntry.set(m.entryId,[...(byEntry.get(m.entryId)??[]),m]);
  function explain(text:string){
    const entry=makeEntry(text,{title:c.name,meta:{explains:c.id}});
    if(!ws.commit(s=>({...s,entries:[entry,...s.entries]}))){notify(tr('This space changed elsewhere. Resolve the conflict above first.'));return false}
    setExplaining(false);void ws.action('concepts',{entryId:entry.id}).catch(()=>undefined);
    notify(tr('Saved to Nodes.'));return true;
  }
  const mapNodes=[{id:c.id,label:c.name,className:'center'},...near.map((n,i)=>({id:n.other?.id??`name-${i}`,label:n.other?.name??n.name,className:n.r.layer==='ai'?'ai':n.r.layer,badge:needsCheck(n.r)?'!':undefined}))]
    .filter((n,i,a)=>a.findIndex(x=>x.id===n.id)===i);
  const mapEdges=near.map((n,i)=>{const other=n.other?.id??`name-${i}`;return {id:`e${i}`,from:n.dir==='out'?c.id:other,to:n.dir==='out'?other:c.id,label:conceptRelLabel[n.rel]}});
  return <section className="page-shell concept-page">
    <div className="entry-top"><button className="text-button" onClick={()=>go('/concepts')}><ArrowLeft size={16}/>{tr('Concepts')}</button></div>
    <header className="cp-head">
      <h1>{c.name}{unfamiliar(c)&&<DwarfBadge/>}</h1>
      <span className="cl-kind">{kindLabel[c.kind]}</span>
      <span className={`state-pill ${c.state}`}>{stateLabel[c.state]}</span>
      {c.aliases.length>0&&<small className="cp-aliases">{c.aliases.join(' · ')}</small>}
      {c.kind==='term'&&<button className={`icon-button link-toggle ${c.autoLink!==false?'on':''}`} aria-pressed={c.autoLink!==false} title={tr(c.autoLink!==false?'Linked in notes':'Not linked in notes')} aria-label={tr(c.autoLink!==false?'Linked in notes':'Not linked in notes')} onClick={()=>save({...c,autoLink:c.autoLink===false})}>{c.autoLink!==false?<Link2 size={16}/>:<Link2Off size={16}/>}</button>}
      <span className="cp-actions"><TalkButton ctx={ctx} origin={{kind:'concept',ref:c.id}} ids={[...new Set(c.mentions.map(m=>m.entryId))].slice(0,4)} title={c.name}/><button className={unfamiliar(c)?'primary':'secondary'} onClick={()=>setExplaining(!explaining)} aria-pressed={explaining}><Sparkle size={16}/>{tr('Explain it')}</button></span>
    </header>
    {explaining&&<div className="cp-explain"><SparkComposer draftKey={`moons.explain.${c.id}`} label={tr('Explain {name} in your own words',{name:c.name})} onSubmit={explain}/></div>}
    {c.term&&<TermHead c={c} confirm={()=>save({...c,term:{...c.term!,confirmed:true}})}/>}
    {c.kind==='term'&&<RelationChips store={store} c={c} open={nid=>go(`/concepts/${nid}`)}/>}
    <div className="cp-grid">
      <div>
        {c.kind==='term'&&<Examples store={store} c={c} openNote={(eid,layer,i)=>go(`/entries/${eid}/original?${layer==='revision'?'version=revision':`source=${i}`}`)}/>}
{(c.kind!=='term'||c.definition.length>0)&&        <section className="cp-block"><h2>{tr('Definition')}</h2>
          {c.definition.length?c.definition.map((d,i)=><p key={i} className={`cp-def ${d.layer}`}><LayerMark layer={d.layer}/>{d.text}{needsCheck(d)&&<CheckMark confirm={()=>confirmDef(i)}/>}{d.ref&&<button className="text-button" onClick={()=>go(`/entries/${d.ref!.entryId}/original?source=${d.ref!.sentence}`)}>↗</button>}</p>)
          :<p className="muted">—</p>}
        </section>}
        <section className="cp-block"><h2>{tr('Related concepts')}</h2>
          {near.length&&c.kind!=='term'?<ElkMap label={tr('Concepts next to {name}',{name:c.name})} nodes={mapNodes} edges={mapEdges} select={nid=>{if(nid!==c.id&&all.some(x=>x.id===nid))go(`/concepts/${nid}`)}}/>:c.kind==='term'?null:<p className="muted">—</p>}
          <ul className="cp-rels">{c.relations.map((r,i)=><li key={i}><LayerMark layer={r.layer}/><span className="rel">{conceptRelLabel[r.rel]}</span>
            {r.to&&all.some(x=>x.id===r.to)?<button className="text-button" onClick={()=>go(`/concepts/${r.to}`)}>{r.toName}</button>:<span>{r.toName}</span>}
            {needsCheck(r)&&<CheckMark confirm={()=>confirmRel(i)}/>}
            {r.layer==='ai'&&<button className="icon-button" aria-label={tr('Remove')} title={tr('Remove')} onClick={()=>dropRel(i)}><X size={13}/></button>}{r.why&&<small>{r.why}</small>}</li>)}</ul>
        </section>
      </div>
      <div>
{c.kind!=='term'&&        <section className="cp-block"><h2>{tr('Where it appears')} <small>{c.mentions.length}</small></h2>
          <ul className="cp-mentions">{[...byEntry].map(([eid,ms])=>{const e=store.entries.find(x=>x.id===eid);if(!e)return null;return <li key={eid}>
            <button className="text-button" onClick={()=>go(`/entries/${eid}/original?source=${ms.map(m=>m.sentence).join(',')}`)}>{e.kind==='media'?<BookOpen size={13}/>:<PenLine size={13}/>}{label(e)}</button>
            {ms.slice(0,2).map((m,i)=><q key={i} className={m.explains?'explains':''}>{e.sentences[m.sentence]}</q>)}</li>})}</ul>
        </section>}
        {uncovered.length>0&&<section className="cp-block"><h2>{tr('Not covered yet')} <small>{uncovered.length}</small></h2><div className="cp-uncovered">{uncovered.map((u,i)=>u.conceptId?<button key={i} className="concept-chip" onClick={()=>go(`/concepts/${u.conceptId}`)}>{u.name}</button>:<span key={i} className="concept-chip static">{u.name}</span>)}</div></section>}
        <Memos ctx={ctx} target={{type:'concept',id:c.id}}/>
        <ChatsAbout ctx={ctx} tag={{type:'concept',id:c.id}}/>
      </div>
    </div>
  </section>;
}

/** Short memos attached to a note, a concept or a question. A memo can be raised into a spark. */
export function Memos({ctx,target,compact}:{ctx:Ctx;target:Memo['target'];compact?:boolean}){
  const {store,ws,notify}=ctx;
  const mine=memosOf(store).filter(m=>m.target.type===target.type&&m.target.id===target.id);
  const children=target.type==='entry'?store.entries.filter(e=>e.parentEntryId===target.id):[];
  const [text,setText]=useState('');
  function add(e:FormEvent){e.preventDefault();const t=text.trim();if(!t)return;const m:Memo={id:crypto.randomUUID(),target,text:t,createdAt:new Date().toISOString()};if(ws.commit(s=>({...s,memos:[...memosOf(s),m]})))setText('')}
  function raise(m:Memo){
    const parent=target.type==='entry'?target.id:undefined;
    const title=target.type==='concept'?conceptsOf(store).find(c=>c.id===target.id)?.name:undefined;
    const entry=makeEntry(m.text,{...(parent?{parentEntryId:parent,relation:'extends' as const}:{}),...(title?{title,meta:{explains:target.id}}:{})});
    if(ws.commit(s=>({...s,entries:[entry,...s.entries],memos:memosOf(s).filter(x=>x.id!==m.id)})))notify(tr('Saved to Nodes.'));
  }
  const remove=(m:Memo)=>ws.commit(s=>({...s,memos:memosOf(s).filter(x=>x.id!==m.id)}));
  return <section className={`cp-block memos ${compact?'compact':''}`} aria-label={tr('Memos')}><h2><StickyNote size={15}/>{tr('Memos')} {mine.length>0&&<small>{mine.length}</small>}</h2>
    <ul>{mine.map(m=><li key={m.id}><p>{m.text}</p><div><button className="icon-button" title={tr('Raise to a spark')} aria-label={tr('Raise to a spark')} onClick={()=>raise(m)}><Upload size={14}/></button><button className="icon-button" title={tr('Delete')} aria-label={tr('Delete')} onClick={()=>remove(m)}><X size={14}/></button></div></li>)}
      {children.map(e=><li key={e.id} className="memo-child"><button className="text-button" onClick={()=>ctx.go(`/entries/${e.id}/original`)}><PenLine size={13}/>{label(e)}</button></li>)}</ul>
    <form onSubmit={add}><input value={text} maxLength={2000} onChange={e=>setText(e.target.value)} aria-label={tr('New memo')} placeholder={tr('Memo')}/><button className="icon-button" disabled={!text.trim()} aria-label={tr('Add memo')}><Send size={14}/></button></form>
  </section>;
}

/** Drawer opened from an underlined concept in a note. */
export function ConceptPanel({ctx,id,close}:{ctx:Ctx;id:string;close:()=>void}){
  const c=conceptsOf(ctx.store).find(x=>x.id===id);
  if(!c)return null;
  return <aside className="concept-drawer" aria-label={c.name}>
    <header><h2>{c.name}{unfamiliar(c)&&<DwarfBadge/>}</h2><button className="icon-button" onClick={close} aria-label={tr('Close')}><X size={18}/></button></header>
    <div className="cd-meta"><span className="cl-kind">{kindLabel[c.kind]}</span><span className={`state-pill ${c.state}`}>{stateLabel[c.state]}</span></div>
    {c.definition.slice(0,2).map((d,i)=><p key={i} className="cp-def"><LayerMark layer={d.layer}/>{d.text}{needsCheck(d)&&<CheckMark/>}</p>)}
    <ul className="cp-rels">{c.relations.slice(0,6).map((r,i)=><li key={i}><LayerMark layer={r.layer}/><span className="rel">{conceptRelLabel[r.rel]}</span>{r.toName}{needsCheck(r)&&<CheckMark/>}</li>)}</ul>
    <button className="primary" onClick={()=>{close();ctx.go(`/concepts/${c.id}`)}}><Lightbulb size={16}/>{tr('Open concept')}</button>
  </aside>;
}

/** Wraps concept names (and a term's forms and phrases) in buttons that open the word popover. Plain text while links are off. */
export function ConceptText({text,concepts,open,link}:{text:string;concepts:Concept[];open?:(id:string)=>void;link?:boolean}){
  const [on]=useLinks();
  const parts=useMemo(()=>on?spans(text,concepts):[{text}],[text,concepts,on]);
  return <>{parts.map((p,i)=>!p.concept?<span key={i}>{p.text}</span>
    :open||link?<button key={i} type="button" className={`concept-mark ${unfamiliar(p.concept)?'dwarf':''}`} onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();showConcept({id:p.concept!.id,rect:{left:r.left,top:r.top,bottom:r.bottom,width:r.width},open})}}>{p.text}</button>
    :<span key={i} className={`concept-mark ${unfamiliar(p.concept)?'dwarf':''}`}>{p.text}</span>)}</>;
}
/** Concepts found in one node, as chips that open the drawer. */
export function NodeConcepts({entryId,nodeId,text,concepts,open}:{entryId:string;nodeId:string;text:string;concepts:Concept[];open:(id:string)=>void}){
  const named=new Set(spans(text,concepts).flatMap(p=>p.concept?[p.concept.id]:[]));
  const here=concepts.filter(c=>named.has(c.id)||c.mentions.some(m=>m.entryId===entryId&&m.nodeId===nodeId));
  if(!here.length)return null;
  return <div className="node-concepts">{here.map(c=><button key={c.id} type="button" className="concept-chip" onClick={()=>open(c.id)}><Lightbulb size={12}/>{c.name}{unfamiliar(c)&&<DwarfBadge/>}</button>)}</div>;
}
