import {useState} from 'react';
import {ArrowUpRight,Check,CircleAlert,CircleHelp,ClipboardList,FileText,Lightbulb,ListChecks,LoaderCircle,Map as MapIcon,MessageCircle,MessagesSquare,Search,X} from 'lucide-react';
import type {Entry,Store} from '@/lib/model';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {chatsAbout,newChat,type ChatTag,type ChatThread,type Origin} from '@/lib/chat';
import {artifactsOf,canConfirmMap,chatNoteOf,exploreMapsOf,formFromArtifact,mapNeedsCheck,type Artifact,type ExploreMap,type MapConcept} from '@/lib/chat-notes';
import {conceptsOf,unfamiliar} from '@/lib/concepts';
import {newQuestion} from '@/lib/questions';
import {formsOf} from '@/lib/forms';
import {DwarfBadge} from './Concepts';
import {tr} from '@/lib/i18n';
import '../styles/chat-notes.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void};
const label=(e:Entry)=>e.title||e.body.slice(0,40);

/** Starts a conversation about this note, concept, question or the galaxy; the target stays on it as a tag. */
export function startChat(ws:WorkspaceApi,go:(u:string)=>void,origin:Origin,ids:string[],title?:string){
  const t=newChat(origin,ids);if(title)t.title=title.slice(0,48);
  if(ws.commit(s=>({...s,chats:[t,...(s.chats??[])],activeChatId:t.id})))go('/chat');
}
export function TalkButton({ctx,origin,ids,title}:{ctx:Ctx;origin:Origin;ids:string[];title?:string}){
  return <button className="secondary" onClick={()=>startChat(ctx.ws,ctx.go,origin,ids,title)} title={tr('Ask MOONS')}><MessageCircle size={16}/>{tr('Ask MOONS')}</button>;
}

/** Conversations tagged with this target, shown on the target's own screen. */
export function ChatsAbout({ctx,tag}:{ctx:Ctx;tag:ChatTag}){
  const list=chatsAbout(ctx.store.chats,tag);
  if(!list.length)return null;
  const open=(t:ChatThread)=>{if(ctx.ws.commit(s=>({...s,activeChatId:t.id})))ctx.go('/chat')};
  return <section className="chats-about" aria-label={tr('Conversations')}><h2><MessagesSquare size={15}/>{tr('Conversations')} <small>{list.length}</small></h2>
    <ul>{list.map(t=><li key={t.id}><button className="text-button" onClick={()=>open(t)}>{t.title}<small>{new Date(t.updatedAt).toLocaleDateString()}</small></button></li>)}</ul></section>;
}

/** A chat note (5.5): what was talked about, what to find again, what to study; the original is the user's words only. */
export function ChatNoteView({ctx,entry}:{ctx:Ctx;entry:Entry}){
  const {store,ws,go}=ctx;const n=chatNoteOf(entry);
  const thread=store.chats?.find(c=>c.id===n?.chatId);
  const arts=artifactsOf(store).filter(a=>n?.artifacts.includes(a.id));
  const map=exploreMapsOf(store).find(m=>m.chatId===n?.chatId);
  const none=<p className="muted">{tr('None')}</p>;
  function ask(q:string){const e=newQuestion(q,{entryId:entry.id});if(ws.commit(s=>({...s,entries:[e,...s.entries]})))go(`/entries/${e.id}`)}
  return <section className="page-shell chat-note-page">
    <span className="eyebrow"><MessagesSquare size={13}/>{tr('Chat note')}</span><h1>{entry.title}</h1>
    {thread&&<button className="text-button" onClick={()=>{if(ws.commit(s=>({...s,activeChatId:thread.id})))go('/chat')}}><MessagesSquare size={14}/>{tr('Whole conversation')}<ArrowUpRight size={13}/></button>}
    {map&&<button className="text-button" onClick={()=>{if(ws.commit(s=>({...s,activeChatId:map.chatId})))go('/chat?map=1')}}><MapIcon size={14}/>{tr('Exploration map')}<ArrowUpRight size={13}/></button>}
    <div className="cn-grid">
      <section className="cn-block ai"><h2>{tr('What we talked about')}</h2>{n?.summary?<p>{n.summary}</p>:none}</section>
      <section className="cn-block"><h2><Search size={15}/>{tr('To find again')}</h2>{n?.revisit.length?<ul>{n.revisit.map((r,i)=>{const e=r.ref?store.entries.find(x=>x.id===r.ref):undefined;return <li key={i}>{r.text}{e&&<button className="text-button" onClick={()=>go(`/entries/${e.id}/original`)}><FileText size={12}/>{label(e)}</button>}</li>})}</ul>:none}</section>
      <section className="cn-block"><h2><Lightbulb size={15}/>{tr('To study')}</h2>
        {(n?.study.conceptIds.length??0)+(n?.study.questions.length??0)===0?none:<>
        <div className="cn-concepts">{n!.study.conceptIds.map(id=>{const c=conceptsOf(store).find(x=>x.id===id);return c?<button key={id} className="concept-chip" onClick={()=>go(`/concepts/${id}`)}><Lightbulb size={12}/>{c.name}{unfamiliar(c)&&<DwarfBadge/>}</button>:null})}</div>
        <ul>{n!.study.questions.map((q,i)=><li key={i}>{q}<button className="icon-button" title={tr('Open as a question')} aria-label={tr('Open as a question')} onClick={()=>ask(q)}><CircleHelp size={14}/></button></li>)}</ul></>}</section>
      <section className="cn-block"><h2><ClipboardList size={15}/>{tr('Made in this conversation')}</h2>{arts.length?<ArtifactList ctx={ctx} list={arts}/>:none}</section>
    </div>
    <section className="cn-block cn-words"><h2>{tr('My words')}</h2>{entry.sentences.map((s,i)=><p key={i}>{s}</p>)}</section>
  </section>;
}

/** Things made in conversations (Satellite → Made by me). A form draft can become one of the user's forms. */
export function ArtifactList({ctx,list}:{ctx:Ctx;list?:Artifact[]}){
  const {store,ws,notify,go}=ctx;const items=list??artifactsOf(store);
  const [open,setOpen]=useState<string|null>(null);
  function register(a:Artifact){const f=formFromArtifact(a,formsOf(store).length);
    if(ws.commit(s=>({...s,forms:[...(s.forms??[]),f],artifacts:artifactsOf(s).map(x=>x.id===a.id?{...x,formId:f.id}:x)})))notify(tr('Registered as a form.'))}
  if(!items.length)return null;
  return <ul className="artifact-list">{items.map(a=>{const I=a.type==='form'?ClipboardList:a.type==='checklist'?ListChecks:FileText;return <li key={a.id}>
    <button className="art-name" onClick={()=>setOpen(open===a.id?null:a.id)} aria-expanded={open===a.id}><I size={15}/>{a.name}</button>
    {a.type==='form'&&(a.formId?<button className="text-button" onClick={()=>go(`/forms/${a.formId}`)}><Check size={13}/>{tr('Form')}</button>:<button className="secondary small" onClick={()=>register(a)}>{tr('Register as a form')}</button>)}
    {open===a.id&&<div className="art-body">{a.fields?.length?<ol>{a.fields.map((f,i)=><li key={i}>{f.label} <small>{f.kind}</small></li>)}</ol>:null}{a.content&&<pre>{a.content}</pre>}</div>}
  </li>})}</ul>;
}

const stateLabel={known:tr('Can explain'),heard:tr('Heard of'),new:tr('New to me')} as const;
/** 4.7.1: setting the scope of study with MOONS — aim, a quick self-check, then a map by unit to confirm. */
export function ExploreMapPanel({ctx,chat,close}:{ctx:Ctx;chat:ChatThread;close:()=>void}){
  const {store,ws,notify}=ctx;
  const saved=exploreMapsOf(store).filter(m=>m.chatId===chat.id).at(-1);
  const [goal,setGoal]=useState(saved?.goal??''),[target,setTarget]=useState(saved?.target??''),[busy,setBusy]=useState(false);
  const [diag,setDiag]=useState<{name:string;state:'known'|'heard'|'new'}[]|null>(null);
  const thin=conceptsOf(store).length<10||store.entries.length<5;
  const save=(m:ExploreMap)=>ws.commit(s=>({...s,exploreMaps:[...exploreMapsOf(s).filter(x=>x.id!==m.id),m]}));
  async function run<T>(payload:Record<string,unknown>){setBusy(true);try{return ((await ws.action('explore_map',{chatId:chat.id,goal,target,...payload})) as {result?:T}).result}catch(e){notify(errMsg(e));return undefined}finally{setBusy(false)}}
  async function diagnose(){const r=await run<{concepts:string[]}>({phase:'diagnose'});if(r)setDiag(r.concepts.map(name=>({name,state:'new'})))}
  async function draft(){const r=await run<{units:ExploreMap['units']}>({phase:'draft',diagnosis:diag??[]});if(r)save({id:saved&&!saved.confirmedAt?saved.id:crypto.randomUUID(),chatId:chat.id,goal,target,units:r.units,createdAt:new Date().toISOString()})}
  const setConcept=(m:ExploreMap,u:number,c:number,patch:Partial<MapConcept>)=>save({...m,units:m.units.map((x,i)=>i!==u?x:{...x,concepts:x.concepts.map((y,j)=>j!==c?y:{...y,...patch})})});
  return <aside className="explore-panel" aria-label={tr('Exploration map')}>
    <header><h2><MapIcon size={16}/>{tr('Exploration map')}{thin&&<CircleAlert size={15} className="thin" aria-label={tr('Few notes and concepts yet')}/>}</h2><button className="icon-button" aria-label={tr('Close')} onClick={close}><X size={16}/></button></header>
    <div className="ep-aim"><input value={goal} onChange={e=>setGoal(e.target.value)} placeholder={tr('Field to explore')} aria-label={tr('Field to explore')} maxLength={200}/>
      <input value={target} onChange={e=>setTarget(e.target.value)} placeholder={tr('Target level')} aria-label={tr('Target level')} maxLength={200}/></div>
    {!diag&&!saved&&<button className="secondary" disabled={!goal.trim()||busy} onClick={()=>void diagnose()}>{busy?<LoaderCircle className="spin" size={15}/>:<ListChecks size={15}/>}{tr('Check what I know')}</button>}
    {diag&&<ul className="ep-diag">{diag.map((d,i)=><li key={d.name}><span>{d.name}</span><span className="ep-states" role="group" aria-label={d.name}>{(['known','heard','new'] as const).map(st=><button key={st} className={d.state===st?'on':''} aria-pressed={d.state===st} onClick={()=>setDiag(diag.map((x,j)=>j===i?{...x,state:st}:x))}>{stateLabel[st]}</button>)}</span></li>)}</ul>}
    {(diag||saved)&&!saved?.confirmedAt&&<button className="secondary" disabled={!goal.trim()||busy} onClick={()=>void draft()}>{busy?<LoaderCircle className="spin" size={15}/>:<MapIcon size={15}/>}{saved?tr('Draft again'):tr('Draft the map')}</button>}
    {saved&&<div className="ep-map">{saved.units.map((u,ui)=><section key={ui}><h3>{u.name}</h3><ul>{u.concepts.map((c,ci)=><li key={ci} className={`ep-c ${c.state} ${c.layer}`}>
      <span className={`ep-dot ${c.state}`} title={stateLabel[c.state]}/>{c.conceptId?<button className="text-button" onClick={()=>ctx.go(`/concepts/${c.conceptId}`)}>{c.name}</button>:<span>{c.name}</span>}
      {mapNeedsCheck(c)&&!saved.confirmedAt&&<button className="check-mark" title={tr('Not from your notes or materials. Confirm it')} aria-label={tr('Confirm')} onClick={()=>setConcept(saved,ui,ci,{confirmed:true})}><CircleAlert size={14}/></button>}
    </li>)}</ul></section>)}
      {saved.confirmedAt?<p className="ep-confirmed"><Check size={14}/>{tr('Base map')}</p>:<button className="primary" disabled={!canConfirmMap(saved)} onClick={()=>save({...saved,confirmedAt:new Date().toISOString()})}><Check size={15}/>{tr('Confirm the map')}</button>}
    </div>}
  </aside>;
}
