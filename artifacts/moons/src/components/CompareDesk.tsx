import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,FileDown,Highlighter,Link2,LoaderCircle,MessagesSquare,Plus,Search,X} from 'lucide-react';
import {makeEntry,uid,type Entry,type NodeLink,type Relation,type Store} from '@/lib/model';
import {newChat,type ChatThread} from '@/lib/chat';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import SparkComposer from './SparkComposer';
import {tr} from '@/lib/i18n';
import '../styles/desk.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void};
export const DESK_MAX=3;
const title=(e:Entry)=>e.title||e.body.slice(0,40)||tr('Untitled');
const relations:(Relation|'related')[]=['related','extends','updates','contradicts'];
const relationLabel:Record<string,string>={related:tr('Related'),extends:tr('Extends'),updates:tr('Updates'),contradicts:tr('Contradicts')};
export const deskUrl=(ids:string[])=>`/station/compare?ids=${ids.slice(0,DESK_MAX).join(',')}`;

/** Up to three notes side by side, resizable, with a MOONS conversation that always sees the open notes. */
export default function CompareDesk({ctx,exportNotes}:{ctx:Ctx;exportNotes?:(ids:string[],title:string)=>void}){
  const {store,ws}=ctx;
  const [ids,setIds]=useState<string[]>(()=>(new URLSearchParams(window.location.search).get('ids')??'').split(',').filter(id=>store.entries.some(e=>e.id===id)).slice(0,DESK_MAX));
  const [widths,setWidths]=useState<number[]>([]),[picker,setPicker]=useState(false),[linking,setLinking]=useState(false);
  const row=useRef<HTMLDivElement>(null),drag=useRef<{i:number;x:number;w:number[]}|null>(null);
  const panels=ids.map(id=>store.entries.find(e=>e.id===id)).filter((e):e is Entry=>!!e);
  useEffect(()=>{setWidths(panels.map(()=>1/Math.max(1,panels.length)));window.history.replaceState(null,'',deskUrl(ids))},[ids.join(',')]);
  const open=(id:string)=>{if(ids.includes(id)||ids.length>=DESK_MAX)return;setIds([...ids,id]);setPicker(false)};
  const close=(id:string)=>setIds(ids.filter(x=>x!==id));
  function move(e:React.PointerEvent){
    const d=drag.current,box=row.current?.getBoundingClientRect();if(!d||!box)return;
    const delta=(e.clientX-d.x)/box.width,next=[...d.w];const min=.18;
    const a=Math.max(min,Math.min(d.w[d.i]!+delta,d.w[d.i]!+d.w[d.i+1]!-min));next[d.i]=a;next[d.i+1]=d.w[d.i]!+d.w[d.i+1]!-a;setWidths(next);
  }
  const links=(store.links??[]).filter(l=>ids.includes(l.from)&&ids.includes(l.to));
  return <section className="desk">
    <header className="desk-bar"><button className="text-button" onClick={()=>window.history.length>1?window.history.back():ctx.go('/notes')}><ArrowLeft size={15}/>{tr('Back')}</button>
      <h1>{tr('Side by side')}</h1><span className="desk-count">{panels.length}/{DESK_MAX}</span>
      <div className="desk-actions">{panels.length<DESK_MAX&&<button className="secondary small" onClick={()=>setPicker(!picker)}><Plus size={14}/>{tr('Add a note')}</button>}{panels.length>=2&&<button className="secondary small" onClick={()=>setLinking(!linking)}><Link2 size={14}/>{tr('Connect')}</button>}{exportNotes&&panels.length>0&&<button className="secondary small" onClick={()=>exportNotes(panels.map(p=>p.id),tr('Side by side'))}><FileDown size={14}/>{tr('Export')}</button>}</div></header>
    {picker&&<NotePicker store={store} exclude={ids} pick={open} close={()=>setPicker(false)}/>}
    {linking&&panels.length>=2&&<LinkForm panels={panels} save={l=>{if(ws.commit(s=>({...s,links:[...(s.links??[]),l]}))){setLinking(false);ctx.notify(tr('Connection saved in your words.'))}}} cancel={()=>setLinking(false)}/>}
    {links.length>0&&<ul className="desk-links">{links.map(l=><li key={l.id}><b>{title(panels.find(p=>p.id===l.from)!)}</b><span className="rel">{relationLabel[l.relation]}</span><b>{title(panels.find(p=>p.id===l.to)!)}</b>{l.reason&&<q>{l.reason}</q>}<button className="icon-button" aria-label={tr('Remove connection')} onClick={()=>ws.commit(s=>({...s,links:(s.links??[]).filter(x=>x.id!==l.id)}))}><X size={13}/></button></li>)}</ul>}
    <div className="desk-body">
      {panels.length?<div className="desk-row" ref={row} onPointerMove={move} onPointerUp={()=>{drag.current=null}} onPointerLeave={()=>{drag.current=null}}>
        {panels.map((e,i)=><div key={e.id} className="desk-cell" style={{flexBasis:`${(widths[i]??1/panels.length)*100}%`}}>
          <Panel entry={e} ctx={ctx} close={()=>close(e.id)}/>
          {i<panels.length-1&&<div className="desk-divider" role="separator" aria-orientation="vertical" aria-label={tr('Resize panels')} tabIndex={0}
            onPointerDown={ev=>{drag.current={i,x:ev.clientX,w:[...widths]};(ev.target as HTMLElement).setPointerCapture(ev.pointerId)}}
            onKeyDown={ev=>{if(ev.key!=='ArrowLeft'&&ev.key!=='ArrowRight')return;ev.preventDefault();const d=ev.key==='ArrowLeft'?-.04:.04,w=[...widths];const a=Math.max(.18,Math.min(w[i]!+d,w[i]!+w[i+1]!-.18));w[i+1]=w[i]!+w[i+1]!-a;w[i]=a;setWidths(w)}}><span/></div>}
        </div>)}
      </div>:<div className="desk-empty"><button className="primary" onClick={()=>setPicker(true)}><Plus size={15}/>{tr('Add a note')}</button></div>}
      <DeskChat ids={ids} ctx={ctx}/>
    </div>
  </section>;
}

function Panel({entry,ctx,close}:{entry:Entry;ctx:Ctx;close:()=>void}){
  const {store,ws}=ctx;const highlights=new Set((entry.meta?.highlights as number[]|undefined)??[]);
  const memos=store.entries.filter(e=>e.parentEntryId===entry.id&&e.meta?.memo);
  const [memo,setMemo]=useState('');
  // Highlights and memos never touch the original words: highlights are sentence indexes, memos are new notes.
  const toggle=(i:number)=>ws.commit(s=>({...s,entries:s.entries.map(e=>e.id!==entry.id?e:{...e,meta:{...e.meta,highlights:highlights.has(i)?[...highlights].filter(x=>x!==i):[...highlights,i].sort((a,b)=>a-b)}})}));
  function addMemo(){const text=memo.trim();if(!text)return;const m=makeEntry(text,{parentEntryId:entry.id,relation:'extends',planetIds:entry.planetIds,meta:{memo:true}});if(ws.commit(s=>({...s,entries:[m,...s.entries]})))setMemo('')}
  return <article className="desk-panel">
    <header><div><h2>{title(entry)}</h2><time>{new Date(entry.createdAt).toLocaleDateString()}</time></div><button className="icon-button" aria-label={tr('Close panel')} onClick={close}><X size={15}/></button></header>
    <div className="desk-text">{entry.sentences.length?entry.sentences.map((s,i)=><span key={i} className={highlights.has(i)?'hl':''} onClick={()=>toggle(i)} title={tr('Click to highlight')}>{s} </span>):<p className="muted">{tr('No body text')}</p>}</div>
    <p className="desk-hint"><Highlighter size={12}/>{tr('Click a sentence to highlight it. The original stays as written.')}</p>
    {memos.length>0&&<ul className="memos">{memos.map(m=><li key={m.id}>{m.body}</li>)}</ul>}
    <div className="memo-box"><textarea rows={2} aria-label={tr('Add a memo')} placeholder={tr('Add a memo in your own words')} value={memo} onChange={e=>setMemo(e.target.value)}/><button className="secondary small" disabled={!memo.trim()} onClick={addMemo}>{tr('Add memo')}</button></div>
    <button className="text-button" onClick={()=>ctx.go(`/entries/${entry.id}/original`)}>{tr('Open original')}</button>
  </article>;
}

function NotePicker({store,exclude,pick,close}:{store:Store;exclude:string[];pick:(id:string)=>void;close:()=>void}){
  const [q,setQ]=useState('');
  const list=useMemo(()=>store.entries.filter(e=>!exclude.includes(e.id)&&`${e.title??''} ${e.body}`.toLowerCase().includes(q.toLowerCase())).slice(0,12),[store.entries,exclude,q]);
  return <div className="note-picker"><div className="picker-search"><Search size={14}/><input autoFocus aria-label={tr('Search nodes')} placeholder={tr('Search nodes')} value={q} onChange={e=>setQ(e.target.value)}/><button className="icon-button" aria-label={tr('Close')} onClick={close}><X size={14}/></button></div>
    <ul>{list.map(e=><li key={e.id}><button onClick={()=>pick(e.id)}><b>{title(e)}</b><small>{e.body.slice(0,80)}</small></button></li>)}{!list.length&&<li className="muted">{tr('No matching nodes.')}</li>}</ul></div>;
}

function LinkForm({panels,save,cancel}:{panels:Entry[];save:(l:NodeLink)=>void;cancel:()=>void}){
  const [from,setFrom]=useState(panels[0]!.id),[to,setTo]=useState(panels[1]!.id),[relation,setRelation]=useState<NodeLink['relation']>('related'),[reason,setReason]=useState('');
  return <form className="link-form" onSubmit={e=>{e.preventDefault();if(from===to)return;save({id:uid(),from,to,relation,reason:reason.trim(),createdAt:new Date().toISOString()})}}>
    <select aria-label={tr('From')} value={from} onChange={e=>setFrom(e.target.value)}>{panels.map(p=><option key={p.id} value={p.id}>{title(p)}</option>)}</select>
    <select aria-label={tr('Relation')} value={relation} onChange={e=>setRelation(e.target.value as NodeLink['relation'])}>{relations.map(r=><option key={r} value={r}>{relationLabel[r]}</option>)}</select>
    <select aria-label={tr('To')} value={to} onChange={e=>setTo(e.target.value)}>{panels.map(p=><option key={p.id} value={p.id}>{title(p)}</option>)}</select>
    <input aria-label={tr('Why, in your own words')} placeholder={tr('Why, in your own words (optional)')} value={reason} maxLength={200} onChange={e=>setReason(e.target.value)}/>
    <button className="primary small" disabled={from===to}>{tr('Connect')}</button><button type="button" className="text-button" onClick={cancel}>{tr('Cancel')}</button></form>;
}

/** The desk's own conversation. Its pinned notes are exactly the open panels. */
function DeskChat({ids,ctx}:{ids:string[];ctx:Ctx}){
  const {store,ws}=ctx;const [error,setError]=useState(''),[pending,setPending]=useState<string|null>(null);
  const thread=(store.chats??[]).find(t=>t.desk==='main');
  const end=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(thread&&thread.contextIds.join(',')!==ids.join(','))ws.commit(s=>({...s,chats:(s.chats??[]).map(t=>t.id===thread.id?{...t,contextIds:[...ids]}:t)}))},[ids.join(','),thread?.id]);
  useEffect(()=>{end.current?.scrollIntoView({block:'end'})},[thread?.messages.length,pending]);
  function ensure():ChatThread|null{
    if(thread)return thread;
    const t:ChatThread={...newChat({kind:'free'},ids),title:tr('Side by side'),desk:'main'};
    return ws.commit(s=>({...s,chats:[t,...(s.chats??[])]}))?t:null;
  }
  async function send(text:string){
    const t=ensure();if(!t)return false;setError('');setPending(text);
    try{await ws.action('chat',{chatId:t.id,text});return true}catch(e){setError(errMsg(e));return false}finally{setPending(null)}
  }
  const names=(refs?:string[])=>(refs??[]).map(id=>store.entries.find(e=>e.id===id)).filter((e):e is Entry=>!!e);
  return <aside className="desk-chat"><header><MessagesSquare size={15}/><b>MOONS</b><small>{tr('Sees the {n} open notes',{n:ids.length})}</small></header>
    <div className="desk-messages">
      {thread?.messages.map(m=><div key={m.id} className={`msg ${m.role}`}><p>{m.text}</p>{m.role==='assistant'&&names(m.refs).length>0&&<div className="refs"><small>{tr('MOONS looked at')}</small>{names(m.refs).map(e=><span key={e.id}>{title(e)}</span>)}</div>}</div>)}
      {pending&&<><div className="msg user"><p>{pending}</p></div><div className="msg assistant"><LoaderCircle className="spin" size={14}/></div></>}
      <div ref={end}/></div>
    {error&&<p role="alert" className="field-error">{error}</p>}
    <SparkComposer draftKey="moons.desk.chat" label={tr('Message MOONS')} onSubmit={send} disabled={!ids.length} hint={tr('Enter to send · Shift+Enter for a new line')} sendLabel={tr('Send')}/>
  </aside>;
}
