import {useEffect,useRef,useState,type FormEvent} from 'react';
import {LoaderCircle,Send} from 'lucide-react';
import type {Entry,Store} from '@/lib/model';
import {newChat,type ChatThread} from '@/lib/chat';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {ALL,commentKindLabel,type MoonComment,type Op} from '@/lib/structure';
import {MoonIcon} from './Framing';
import {tr} from '@/lib/i18n';

type Props={entry:Entry;store:Store;ws:WorkspaceApi;comments:MoonComment[];selected:string|null;select:(key:string|null)=>void;
  focus:(section:string)=>void;sectionName:(section:string)=>string;apply?:(c:MoonComment,op:Op)=>void;keep?:(c:MoonComment)=>void;openSource:(indices:number[])=>void};

/** Every MOONS comment on one note, in one list. The moon on a comment: once to go to that part, again to talk about it. */
export default function CommentsPanel({entry,store,ws,comments,selected,select,focus,sectionName,apply,keep,openSource}:Props){
  const [talking,setTalking]=useState<string|null>(null);
  const open=comments.filter(c=>c.status==='open'),closed=comments.filter(c=>c.status!=='open');
  const card=useRef(new Map<string,HTMLElement>());
  useEffect(()=>{if(selected)card.current.get(selected)?.scrollIntoView({behavior:'smooth',block:'nearest'})},[selected]);
  const material=entry.comparison?store.entries.find(e=>e.id===entry.comparison!.materialEntryId):undefined;
  function moon(c:MoonComment){
    if(selected!==c.key){select(c.key);setTalking(null);if(c.section)focus(c.section);return}
    setTalking(talking===c.key?null:c.key);
  }
  const item=(c:MoonComment)=><article key={c.key} ref={el=>{if(el)card.current.set(c.key,el);else card.current.delete(c.key)}} className={`mc ${c.kind} ${selected===c.key?'selected':''} ${c.status}`}>
    <div className="mc-top">
      <span className="mc-kind">{commentKindLabel[c.kind]}</span><span className="mc-where">{sectionName(c.section)}</span>
      {c.status!=='open'&&<span className="mc-state">{c.status==='applied'?tr('Applied'):tr('Left as is')}</span>}
      <button type="button" className="mc-moon" aria-pressed={talking===c.key} onClick={()=>moon(c)}><MoonIcon/>{selected!==c.key?tr('Show'):talking===c.key?tr('Close'):tr('Talk')}</button>
    </div>
    <p>{c.text}</p>
    {c.quotes.length>0&&material&&<button type="button" className="mc-quote" onClick={()=>openSource(c.quotes)}>{c.quotes.slice(0,2).map(i=>material.sentences[i]).filter(Boolean).map((t,i)=><q key={i}>{t}</q>)}</button>}
    {talking===c.key&&<CommentChat entry={entry} store={store} ws={ws} comment={c} materialId={material?.id} apply={apply} keep={keep}/>}
  </article>;
  return <aside className="comments-panel" aria-label={tr('MOONS comments')}>
    <header><h2>{tr('MOONS comments')}</h2><small>{tr('{open} open of {all}',{open:open.length,all:comments.length})}</small></header>
    {open.map(item)}
    {closed.length>0&&<details className="mc-closed"><summary>{tr('Applied or left as is ({n})',{n:closed.length})}</summary>{closed.map(item)}</details>}
  </aside>;
}

/** A conversation about one comment. It is a normal MOONS conversation pinned to this note, so it also appears in Chat. */
function CommentChat({entry,store,ws,comment,materialId,apply,keep}:{entry:Entry;store:Store;ws:WorkspaceApi;comment:MoonComment;materialId?:string;apply?:(c:MoonComment,op:Op)=>void;keep?:(c:MoonComment)=>void}){
  const thread=store.chats?.find(t=>t.origin?.kind==='node'&&t.origin.ref===entry.id&&t.origin.comment===comment.key);
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const bottom=useRef<HTMLDivElement>(null);
  useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'})},[thread?.messages.length,busy]);
  function ensure():ChatThread|null{
    if(thread)return thread;
    const t=newChat({kind:'node',ref:entry.id,comment:comment.key},[entry.id,...(materialId?[materialId]:[])]);
    t.title=`MOONS · ${(entry.title??entry.body).slice(0,30)}`;
    t.messages=[{id:crypto.randomUUID(),role:'assistant',text:comment.text,createdAt:t.createdAt,refs:[entry.id]}];
    return ws.commit(s=>({...s,chats:[t,...(s.chats??[])]}))?t:null;
  }
  async function send(e:FormEvent){
    e.preventDefault();const said=text.trim();if(!said||busy)return;
    const t=ensure();if(!t){setError(tr('This space changed elsewhere. Resolve the conflict above first.'));return}
    setBusy(true);setError('');
    try{await ws.action('chat',{chatId:t.id,text:said});setText('')}catch(err){setError(errMsg(err))}finally{setBusy(false)}
  }
  const messages=thread?.messages.slice(1)??[];
  return <div className="mc-chat">
    {messages.map(m=><div key={m.id} className={`mc-bubble ${m.role}`}>{m.text}</div>)}
    {busy&&<div className="mc-bubble assistant"><LoaderCircle className="spin" size={14}/></div>}
    {comment.status==='open'&&(apply||keep)&&<div className="mc-proposal">
      {comment.proposal&&<p>{tr('Proposal')}: {comment.proposal.label}</p>}
      <div>{comment.proposal&&apply&&<button type="button" className="primary" onClick={()=>apply(comment,comment.proposal!.op)}>{tr('Apply this')}</button>}
        {keep&&<button type="button" className="secondary" onClick={()=>keep(comment)}>{tr('Leave as is')}</button>}</div>
    </div>}
    <form onSubmit={send}><input value={text} onChange={e=>setText(e.target.value)} placeholder={tr('Tell MOONS about this part')} aria-label={tr('Reply to this comment')}/>
      <button type="submit" className="icon-button" disabled={busy||!text.trim()} aria-label={tr('Send')}><Send size={15}/></button></form>
    {error&&<p className="mc-error">{error}</p>}
    <div ref={bottom}/>
  </div>;
}

export const sectionTitle=(entry:Entry,section:string)=>section===ALL?tr('Whole note'):entry.analysis?.sections?.find(s=>s.id===section)?.headingText||tr('Untitled part');
