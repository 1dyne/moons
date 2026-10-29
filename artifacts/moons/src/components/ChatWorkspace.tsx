import {useEffect,useMemo,useRef,useState,type DragEvent,type KeyboardEvent} from 'react';
import {ArrowUpRight,Check,Columns2,FileText,MessageSquare,PanelLeft,PanelRight,Pin,Plus,Search,Tag,UserRoundCog,X,AlertCircle,BookmarkPlus,LoaderCircle,Map as MapIcon,NotebookPen} from 'lucide-react';
import {makeEntry,defaultSettings,type Entry,type Planet,type Store} from '@/lib/model';
import {newChat,tagsFor,isUserSubstring,type ChatMessage,type ChatThread,type DraftNode,type TagProposal} from '@/lib/chat';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {MoonCharacter} from './Brand';
import {ExploreMapPanel} from './ChatNotes';
import {conceptsOf} from '@/lib/concepts';
import SplitWorkspace from './SplitWorkspace';
import SparkComposer,{type ComposerHandle} from './SparkComposer';
import {tr} from '@/lib/i18n';

type Props={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;openEntry:(id:string)=>void;openNotice:(id:string)=>void;go:(url:string)=>void};
const nodeTitle=(node:Entry)=>node.title||node.body.split('\n')[0].slice(0,70)||'Untitled';
const MIME='application/x-moons-entry';

export default function ChatWorkspace({store,ws,notify,openEntry,openNotice,go}:Props){
  const threads=store.chats??[],active=threads.find(t=>t.id===store.activeChatId)??threads[0];
  const settings=store.settings??defaultSettings();
  const [history,setHistory]=useState(true),[panel,setPanel]=useState(false),[picker,setPicker]=useState(false),[compare,setCompare]=useState(false),[compareIds,setCompareIds]=useState<[string,string]>(['','']),[readId,setReadId]=useState(''),[query,setQuery]=useState(''),[rename,setRename]=useState(false),[title,setTitle]=useState('');
  const [pendingText,setPendingText]=useState<string|null>(null),[error,setError]=useState(''),[at,setAt]=useState<string|null>(null),[atIndex,setAtIndex]=useState(0),[dropping,setDropping]=useState(false);
  const [listQuery,setListQuery]=useState(''),[listTag,setListTag]=useState('all'),[listTopic,setListTopic]=useState('all'),[mapOpen,setMapOpen]=useState(()=>new URLSearchParams(window.location.search).has('map')),[tidying,setTidying]=useState(false);
  const atValue=useRef(''),bottom=useRef<HTMLDivElement>(null),handle=useRef<ComposerHandle|null>(null);
  useEffect(()=>{if(window.matchMedia('(max-width:700px)').matches)setHistory(false)},[]);
  useEffect(()=>{setReadId(active?.contextIds[0]??'');setRename(false);setCompare(false);setCompareIds(['','']);setQuery('');setError('');setAt(null)},[active?.id]);
  useEffect(()=>{bottom.current?.scrollIntoView({block:'end'})},[active?.messages.length,pendingText]);
  const selected=(active?.contextIds??[]).flatMap(id=>{const e=store.entries.find(x=>x.id===id);return e?[e]:[]});
  const reading=selected.find(e=>e.id===readId)??selected[0];
  const origin=active?.origin,originEntry=origin?.kind==='node'?store.entries.find(e=>e.id===origin.ref):undefined,originNotice=origin&&(origin.kind==='notification'||origin.kind==='warning')?store.notifications?.find(n=>n.id===origin.ref):undefined;
  const matches=useMemo(()=>at===null?[]:store.entries.filter(e=>!active?.contextIds.includes(e.id)&&`${e.title??''} ${e.body}`.toLowerCase().includes(at.toLowerCase())).slice(0,6),[at,store.entries,active?.contextIds]);

  function patchThread(id:string,fn:(t:ChatThread)=>ChatThread){return ws.commit(s=>({...s,chats:(s.chats??[]).map(t=>t.id===id?fn(t):t)}))}
  function create(){const t=newChat();if(ws.commit(s=>({...s,chats:[t,...(s.chats??[])],activeChatId:t.id}))){setHistory(false);handle.current?.focus()}}
  function ensure():ChatThread|null{if(active)return active;const t=newChat();return ws.commit(s=>({...s,chats:[t,...(s.chats??[])],activeChatId:t.id}))?t:null}
  function pin(id:string,open=true){const t=ensure();if(!t||t.contextIds.includes(id))return;if(patchThread(t.id,x=>({...x,contextIds:[...x.contextIds,id]}))&&open){setReadId(id);setPanel(true)}}
  function unpin(id:string){if(active)patchThread(active.id,t=>({...t,contextIds:t.contextIds.filter(x=>x!==id)}))}
  async function send(text:string):Promise<boolean>{
    const t=ensure();if(!t)return false;setError('');setPendingText(text);
    if(!t.messages.length&&t.title==='New chat')patchThread(t.id,x=>({...x,title:text.slice(0,48)}));
    try{await ws.action('chat',{chatId:t.id,text});return true}
    catch(e){setError(errMsg(e));return false}finally{setPendingText(null)}
  }
  async function tidy(){if(!active)return;setTidying(true);try{const r=await ws.action('chat_note',{chatId:active.id}) as {result?:{entryId?:string}};if(r?.result?.entryId)go(`/entries/${r.result.entryId}`)}catch(e){notify(errMsg(e))}finally{setTidying(false)}}
  function chooseAt(e:Entry,value:string){pin(e.id,false);const next=value.replace(/(^|\s)@[^\s@]*$/,'$1').trimEnd();handle.current?.set(next?next+' ':'');setAt(null);handle.current?.focus()}
  function intercept(e:KeyboardEvent<HTMLTextAreaElement>,value:string){
    if(at===null||!matches.length)return false;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setAtIndex(i=>(i+(e.key==='ArrowDown'?1:matches.length-1))%matches.length);return true}
    if((e.key==='Enter'||e.key==='Tab')&&!e.nativeEvent.isComposing){e.preventDefault();chooseAt(matches[Math.min(atIndex,matches.length-1)],value);return true}
    if(e.key==='Escape'){setAt(null);return true}return false;
  }
  function onText(value:string,caret:number){atValue.current=value;const m=value.slice(0,caret).match(/(?:^|\s)@([^\s@]*)$/);setAt(m?m[1]:null);setAtIndex(0)}
  const dragOk=(e:DragEvent)=>Array.from(e.dataTransfer.types).includes(MIME)||Array.from(e.dataTransfer.types).includes('text/plain');
  function drop(e:DragEvent){e.preventDefault();setDropping(false);const id=e.dataTransfer.getData(MIME)||e.dataTransfer.getData('text/plain');if(store.entries.some(x=>x.id===id)){pin(id);notify(tr('Pinned to this chat.'))}}

  function saveUserText(message:ChatMessage){
    if(!active)return;const sel=window.getSelection()?.toString().trim()??'';const text=sel&&message.text.includes(sel)?sel:message.text;
    const entry=makeEntry(text,{planetIds:[]});
    if(ws.commit(s=>({...s,entries:[entry,...s.entries],chats:(s.chats??[]).map(t=>t.id===active.id?{...t,messages:t.messages.map(m=>m.id===message.id?{...m,savedEntryId:entry.id}:m)}:t)})))notify(sel?tr('Saved your selection as a node.'):tr('Saved as node.'));
  }
  async function saveMaterial(message:ChatMessage){
    if(!active)return;const before=new Set(store.entries.map(e=>e.id));
    try{await ws.action('material',{adapter:'ai_chat',title:`MOONS · ${active.title}`.slice(0,120),text:message.text});
      const fresh=ws.getStore()?.entries.find(e=>!before.has(e.id));if(fresh)patchThread(active.id,t=>({...t,messages:t.messages.map(m=>m.id===message.id?{...m,materialSavedEntryId:fresh.id}:m)}));notify(tr('Saved as material. It is not one of your nodes.'))}
    catch(e){notify(errMsg(e))}
  }
  function saveDraft(message:ChatMessage,draft:DraftNode){
    if(!active)return;const parent=draft.originRef??(active.origin?.kind==='node'?active.origin.ref:undefined);
    const entry=makeEntry(draft.text,{planetIds:draft.planetIds,...(parent&&store.entries.some(e=>e.id===parent)?{parentEntryId:parent,relation:draft.relation}:{})});
    if(ws.commit(s=>({...s,entries:[entry,...s.entries],chats:(s.chats??[]).map(t=>t.id===active.id?{...t,messages:t.messages.map(m=>m.id===message.id?{...m,draftNode:undefined,savedEntryId:entry.id}:m)}:t)})))notify(tr('Saved as a node in your own words.'));
  }
  const dismissDraft=(m:ChatMessage)=>active&&patchThread(active.id,t=>({...t,messages:t.messages.map(x=>x.id===m.id?{...x,draftNode:undefined}:x)}));
  function applyTag(m:ChatMessage,p:TagProposal){
    if(!active)return;
    ws.commit(s=>{const exists=s.planets.some(x=>x.id===p.planetId);const planetId=exists?p.planetId:p.planetId||crypto.randomUUID();
      const planets:Planet[]=exists?s.planets.map(x=>x.id===planetId?{...x,name:p.name}:x):[...s.planets,{id:planetId,name:p.name,color:'#adc5ef',position:{x:20+Math.random()*60,y:25+Math.random()*50},entryCount:0,openSignalRatio:0}];
      return {...s,planets,entries:s.entries.map(e=>p.evidence.includes(e.id)&&!e.planetIds.includes(planetId)?{...e,planetIds:[...e.planetIds,planetId]}:e),chats:(s.chats??[]).map(t=>t.id===active.id?{...t,messages:t.messages.map(x=>x.id===m.id?{...x,tagProposal:undefined}:x)}:t)}});
    notify(`Tagged with ${p.name}.`);
  }
  const dismissTag=(m:ChatMessage)=>active&&patchThread(active.id,t=>({...t,messages:t.messages.map(x=>x.id===m.id?{...x,tagProposal:undefined}:x)}));

  function card(entry:Entry){return <article className="chat-reference" key={entry.id}><header><h2>{nodeTitle(entry)}</h2><button aria-label={tr('Remove {name} from context',{name:nodeTitle(entry)})} onClick={()=>unpin(entry.id)}><X size={15}/></button></header><time>{new Date(entry.createdAt).toLocaleDateString('en-US')}</time><p>{entry.body||tr('No body text')}</p><button className="text-button" onClick={()=>openEntry(entry.id)}>{tr('Open node')} <ArrowUpRight size={14}/></button></article>}
  const referencePanel=panel?<div className="reference-panel"><header className="reference-toolbar"><strong>{tr('Nodes')}</strong><button aria-label={tr('Add nodes to chat')} title={tr('Add nodes')} onClick={()=>setPicker(!picker)}><Plus size={18}/></button><button aria-label={tr('Compare nodes')} title={tr('Compare nodes')} aria-pressed={compare} disabled={selected.length<2} onClick={()=>{setCompare(!compare);setCompareIds([selected[0]?.id??'',selected[1]?.id??''])}}><Columns2 size={18}/></button><button aria-label={tr('Close reference panel')} onClick={()=>setPanel(false)}><X size={18}/></button></header>
    {(picker||!selected.length)&&<div className="reference-picker"><label><Search size={15}/><input aria-label={tr('Search nodes for chat')} placeholder={tr('Search nodes')} value={query} onChange={e=>setQuery(e.target.value)}/></label><div>{store.entries.filter(e=>`${e.title??''} ${e.body}`.toLowerCase().includes(query.toLowerCase())).map(e=>{const on=active?.contextIds.includes(e.id);return <button key={e.id} draggable onDragStart={ev=>ev.dataTransfer.setData(MIME,e.id)} onClick={()=>on?unpin(e.id):pin(e.id)} aria-pressed={!!on}><FileText size={15}/><span>{nodeTitle(e)}</span>{on?<Check size={15}/>:<Plus size={15}/>}</button>})}</div>{!store.entries.length&&<p>{tr('No notes yet.')}</p>}{selected.length>0&&<button className="text-button" onClick={()=>setPicker(false)}>{tr('Done')}</button>}</div>}
    {selected.length>0&&<><div className="reference-tabs">{selected.map(e=><button key={e.id} aria-pressed={reading?.id===e.id} onClick={()=>{setReadId(e.id);setCompare(false)}}>{nodeTitle(e)}</button>)}</div>{compare?<><div className="compare-selectors">{[0,1].map(i=><select key={i} aria-label={i===0?tr('First comparison node'):tr('Second comparison node')} value={compareIds[i]} onChange={e=>setCompareIds(prev=>i===0?[e.target.value,prev[1]]:[prev[0],e.target.value])}>{selected.map(e=><option key={e.id} value={e.id}>{nodeTitle(e)}</option>)}</select>)}</div><div className="node-compare">{compareIds.map(id=>selected.find(e=>e.id===id)).filter((e):e is Entry=>!!e).map((e,i)=><div key={i}>{card(e)}</div>)}</div></>:reading&&card(reading)}</>}
  </div>:null;
  const originChip=originEntry?<button className="origin-chip" onClick={()=>openEntry(originEntry.id)}>From: {nodeTitle(originEntry)}<ArrowUpRight size={11}/></button>:originNotice?<button className="origin-chip" onClick={()=>openNotice(originNotice.id)}>From: {originNotice.kind==='breaking_news'?tr('Breaking News · '):''}{originNotice.headline.slice(0,50)}<ArrowUpRight size={11}/></button>:origin&&origin.kind!=='free'?<span className="origin-chip static">From: {origin.kind}</span>:null;

  return <section className="chat-workspace" aria-label={tr('MOONS conversations')}><SplitWorkspace storageKey="moons.chat.panel.width" panel={referencePanel}>
    <div className={`chat-primary ${history?'history-open':''}`}>
      {history&&<aside className="conversation-list"><header><strong>{tr('Conversations')}</strong><button onClick={()=>setHistory(false)} aria-label={tr('Close conversations')}><X size={16}/></button></header><button className="new-conversation" onClick={create}><Plus size={17}/>{tr('New chat')}</button><div className="chat-filters"><input value={listQuery} onChange={e=>setListQuery(e.target.value)} placeholder={tr('Search')} aria-label={tr('Search conversations')}/><select value={listTag} onChange={e=>setListTag(e.target.value)} aria-label={tr('Started from')}><option value="all">{tr('All')}</option>{(['entry','concept','question','galaxy','free'] as const).map(k=><option key={k} value={k}>{tagLabel[k]}</option>)}</select>{store.planets.length>0&&<select value={listTopic} onChange={e=>setListTopic(e.target.value)} aria-label={tr('Topic')}><option value="all">{tr('All topics')}</option>{store.planets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div><div>{[...threads].filter(t=>listMatch(t,store,listQuery,listTag,listTopic)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(t=><button key={t.id} className={active?.id===t.id?'active':''} onClick={()=>{if(ws.commit(s=>({...s,activeChatId:t.id})))setHistory(false)}}><MessageSquare size={15}/><span>{t.title}{(t.tags??tagsFor(t.origin??{kind:'free'})).map((g,i)=><small key={i} className="list-origin">{tagLabel[g.type]}</small>)}</span></button>)}</div>{!threads.length&&<p>{tr('No conversations yet.')}</p>}</aside>}
      <div className={`conversation-main ${dropping?'dropping':''}`} onDragOver={e=>{if(dragOk(e)){e.preventDefault();setDropping(true)}}} onDragLeave={e=>{if(e.currentTarget===e.target)setDropping(false)}} onDrop={drop}>
       <header className="conversation-toolbar"><button onClick={()=>setHistory(!history)} aria-label={tr('Show conversations')} aria-expanded={history}><PanelLeft size={19}/></button><MoonCharacter/><div className="conversation-title">{rename?<form onSubmit={e=>{e.preventDefault();if(active&&title.trim()&&patchThread(active.id,t=>({...t,title:title.trim()})))setRename(false)}}><input aria-label={tr('Conversation title')} autoFocus value={title} onChange={e=>setTitle(e.target.value)} maxLength={80}/><button aria-label={tr('Save conversation title')}><Check size={16}/></button></form>:<button title={tr('Rename conversation')} onClick={()=>{if(active){setTitle(active.title);setRename(true)}}}>{active?.title??'MOONS'}</button>}{originChip??<small>{settings.profileContext?tr('Profile context on'):tr('Profile context off')}</small>}</div><button onClick={()=>setMapOpen(!mapOpen)} aria-pressed={mapOpen} aria-label={tr('Exploration map')} title={tr('Exploration map')} disabled={!active}><MapIcon size={18}/></button><button onClick={()=>void tidy()} aria-label={tr('Tidy into a note')} title={tr('Tidy into a note')} disabled={!active?.messages.some(m=>m.role==='user')||tidying}>{tidying?<LoaderCircle className="spin" size={18}/>:<NotebookPen size={18}/>}</button>{active?.noteId&&store.entries.some(e=>e.id===active.noteId)&&<button onClick={()=>go(`/entries/${active.noteId}`)} aria-label={tr('Chat note')} title={tr('Chat note')}><FileText size={18}/></button>}<button onClick={create} aria-label={tr('New chat')} title={tr('New chat')}><Plus size={19}/></button><button onClick={()=>setPanel(!panel)} aria-label={tr('Open nodes panel')} aria-expanded={panel}><PanelRight size={19}/></button></header>
       {mapOpen&&active&&<ExploreMapPanel ctx={{store,ws,notify,go}} chat={active} close={()=>setMapOpen(false)}/>}
       <div className="conversation-messages">{!active?.messages.length&&!pendingText?<div className="conversation-empty"><MoonCharacter large/><h1>{tr('What’s on your mind?')}</h1></div>:<>{active?.messages.map(message=><article key={message.id} className={`conversation-message ${message.role}`}><small>{message.role==='user'?'You':'MOONS'}</small><p>{message.text}</p>
         {message.role==='assistant'&&(message.refs?.length??0)>0&&<div className="looked-at"><small>{tr('MOONS looked at')}</small>{message.refs!.map(id=>{const e=store.entries.find(x=>x.id===id);if(!e)return null;const on=active.contextIds.includes(id);return <span key={id}><button onClick={()=>openEntry(id)}>{nodeTitle(e)}</button><button aria-label={on?`Unpin ${nodeTitle(e)}`:`Pin ${nodeTitle(e)}`} aria-pressed={on} className={on?'pinned':''} onClick={()=>on?unpin(id):pin(id)}><Pin size={11}/></button></span>})}</div>}
         {message.draftNode&&<DraftCard message={message} draft={message.draftNode} thread={active} store={store} save={d=>saveDraft(message,d)} dismiss={()=>dismissDraft(message)}/>}
         {message.tagProposal&&<TagCard proposal={message.tagProposal} store={store} apply={()=>applyTag(message,message.tagProposal!)} dismiss={()=>dismissTag(message)}/>}
         {message.role==='user'&&<button className="msg-action" disabled={!!message.savedEntryId} onClick={()=>saveUserText(message)} title={tr('Select part of the message first to save only that part')}>{message.savedEntryId?<Check size={13}/>:<Plus size={13}/>} {message.savedEntryId?tr('Saved as node'):tr('Save as node')}</button>}
         {message.role==='assistant'&&(message.materialSavedEntryId?<button className="msg-action" onClick={()=>openEntry(message.materialSavedEntryId!)}><Check size={13}/>{tr('Saved as material · open')}</button>:<button className="msg-action" onClick={()=>void saveMaterial(message)}><BookmarkPlus size={13}/>{tr('Save as material')}</button>)}
       </article>)}
       {pendingText&&<><article className="conversation-message user pending"><small>{tr('You')}</small><p>{pendingText}</p></article><article className="conversation-message assistant"><small>MOONS</small><div className="thinking" aria-label={tr('MOONS is thinking')}><i/><i/><i/></div></article></>}</>}
       <div ref={bottom}/></div>
       <div className="conversation-foot">
        {error&&<p className="chat-error" role="alert"><AlertCircle size={14}/>{error} Your message is still in the box — send it again.</p>}
        {selected.length>0&&<div className="pinned-row" aria-label={tr('Pinned nodes')}><Pin size={12}/>{selected.map(e=><span key={e.id} className="pin-chip"><button onClick={()=>{setReadId(e.id);setPanel(true)}}>{nodeTitle(e)}</button><button aria-label={tr('Remove {name} from context',{name:nodeTitle(e)})} onClick={()=>unpin(e.id)}><X size={11}/></button></span>)}</div>}
        <div className="conversation-composer">
          {at!==null&&<div className="at-picker" role="listbox" aria-label={tr('Pin a node')}>{matches.length?matches.map((e,i)=><button key={e.id} role="option" aria-selected={i===atIndex} className={i===atIndex?'on':''} onMouseDown={ev=>{ev.preventDefault();chooseAt(e,atValue.current)}}><FileText size={14}/>{nodeTitle(e)}</button>):<p>{tr('No matching nodes.')}</p>}</div>}
          <SparkComposer draftKey={`moons.draft.chat.${active?.id??'new'}`} label={tr('Message MOONS')} placeholder={tr('Message MOONS — type @ to pin a node')} maxLength={12000} className="chat-input" handle={handle} onText={onText} intercept={intercept} onSubmit={send} disabled={pendingText!==null} sendLabel="Send message" hint={tr('Enter to send · Shift+Enter for a new line')}/>
          <small>{tr('Conversations are saved to your space.')}{settings.profileContext?'':' '+tr('Profile context is off.')} <UserRoundCog size={10}/></small>
        </div>
       </div>
      </div>
    </div>
  </SplitWorkspace></section>;
}

function DraftCard({message,draft,thread,store,save,dismiss}:{message:ChatMessage;draft:DraftNode;thread:ChatThread;store:Store;save:(d:DraftNode)=>void;dismiss:()=>void}){
  const [d,setD]=useState(draft);const valid=isUserSubstring(thread,d.text);const parent=d.originRef??(thread.origin?.kind==='node'?thread.origin.ref:undefined);const parentEntry=store.entries.find(e=>e.id===parent);
  return <div className="draft-card" key={message.id}><span className="eyebrow">{tr('MAKE IT A NODE?')}</span><textarea aria-label={tr('Node text')} value={d.text} onChange={e=>setD({...d,text:e.target.value})}/>{!valid&&<small className="field-error">{tr('A node can only hold words you wrote in this chat. Edit it back to your own words.')}</small>}
    <div className="chip-row">{store.planets.map(p=><button key={p.id} className={d.planetIds.includes(p.id)?'selected':''} aria-pressed={d.planetIds.includes(p.id)} onClick={()=>setD({...d,planetIds:d.planetIds.includes(p.id)?d.planetIds.filter(x=>x!==p.id):[...d.planetIds,p.id]})}><i style={{background:p.color}}/>{p.name}</button>)}</div>
    {parentEntry&&<label className="relation">Relation to “{nodeTitle(parentEntry)}”<select value={d.relation} onChange={e=>setD({...d,relation:e.target.value as DraftNode['relation']})}><option value="updates">{tr('Updates')}</option><option value="contradicts">{tr('Contradicts')}</option><option value="extends">{tr('Extends')}</option></select></label>}
    <div className="draft-actions"><button className="primary small" disabled={!valid} onClick={()=>save(d)}>{tr('Save')}<Check size={14}/></button><button className="text-button" onClick={dismiss}>{tr('Dismiss')}</button></div></div>;
}
function TagCard({proposal,store,apply,dismiss}:{proposal:TagProposal;store:Store;apply:()=>void;dismiss:()=>void}){
  const ev=proposal.evidence.map(id=>store.entries.find(e=>e.id===id)).filter((e):e is Entry=>!!e);
  const existing=store.planets.find(p=>p.id===proposal.planetId);const current=existing?[existing.name]:[...new Set(ev.flatMap(e=>e.planetIds))].map(id=>store.planets.find(p=>p.id===id)?.name).filter(Boolean);
  return <div className="draft-card tag-card"><span className="eyebrow"><Tag size={11}/> {tr('TAG SUGGESTION')}</span><p className="retag">{current.length?current.join(', '):tr('Dwarf Planet')} <ArrowUpRight size={12}/> <b>{proposal.name}</b></p><ul>{ev.map(e=><li key={e.id}>{nodeTitle(e)}</li>)}</ul><div className="draft-actions"><button className="primary small" onClick={apply}>{tr('Apply')}<Check size={14}/></button><button className="text-button" onClick={dismiss}>{tr('Dismiss')}</button></div></div>;
}

const tagLabel={entry:tr('Note'),concept:tr('Concept'),question:tr('Question'),galaxy:tr('My Galaxy'),free:tr('Free')} as const;
/** The conversation list filtered by what it started from, by topic (its notes' topics) and by words. */
function listMatch(t:ChatThread,store:Store,q:string,tag:string,topic:string){
  const tags=t.tags??tagsFor(t.origin??{kind:'free'});
  if(tag!=='all'&&!(tag==='free'?!tags.length:tags.some(g=>g.type===tag)))return false;
  if(topic!=='all'){const ids=[...t.contextIds,...tags.filter(g=>g.type==='entry'||g.type==='question').map(g=>g.id!)];if(!ids.some(id=>store.entries.find(e=>e.id===id)?.planetIds.includes(topic)))return false}
  const k=q.trim().toLowerCase();if(!k)return true;
  const names=tags.map(g=>g.type==='concept'?conceptsOf(store).find(c=>c.id===g.id)?.name:store.entries.find(e=>e.id===g.id)?.title).filter(Boolean).join(' ');
  return `${t.title} ${names} ${t.messages.map(m=>m.text).join(' ')}`.toLowerCase().includes(k);
}
