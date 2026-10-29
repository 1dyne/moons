import {useEffect,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowUpRight,BadgeCheck,Bot,Check,ChevronDown,ChevronUp,Copy,ExternalLink,FileText,Inbox as InboxIcon,KeyRound,Layers,Lightbulb,LoaderCircle,Orbit,PenLine,Plus,RefreshCw,RotateCcw,Sparkles,Trash2,X} from 'lucide-react';
import type {Store} from '@/lib/model';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {agentSettings,batchTakesRevisions,conceptUpdate,hasRevision,newSpace,spaceApi,spacesOf,suggestedPlanets,validUrl,type InboxItem,type RecordDraft,type RevisionDraft,type Space,type SpaceRecord} from '@/lib/satellite-spaces';
import {DiffRow} from './Terms';
import {tr} from '@/lib/i18n';
import '../styles/spaces.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void};
const save=(ws:WorkspaceApi,id:string,patch:Partial<Space>)=>ws.commit(s=>({...s,satellites:spacesOf(s).map(x=>x.id===id?{...x,...patch,updatedAt:new Date().toISOString()}:x)}));
const madeLabel=(s:Space)=>s.madeBy.type==='ai'?`${s.madeBy.name??'AI'}`:s.madeBy.type==='moons'?'MOONS':tr('Me');

/** The spaces the user connected (external Satellites), beside MOONS's own devices. */
export function MySpaces({ctx}:{ctx:Ctx}){
  const {store,ws,go}=ctx,list=spacesOf(store);
  const [adding,setAdding]=useState(false),[name,setName]=useState(''),[url,setUrl]=useState(''),[desc,setDesc]=useState('');
  function add(e:FormEvent){e.preventDefault();if(!name.trim()||!validUrl(url))return;const s=newSpace(name,url.trim(),{description:desc.trim().slice(0,400)});if(ws.commit(st=>({...st,satellites:[...spacesOf(st),s]}))){setAdding(false);setName('');setUrl('');setDesc('');go(`/satellite/${s.id}`)}}
  return <section className="settings-card my-spaces"><div className="project-heading"><h2><Orbit size={17}/>{tr('My spaces')}</h2><button className="secondary" onClick={()=>setAdding(!adding)} aria-expanded={adding}><Plus size={16}/>{tr('Connect a space')}</button></div>
    {adding&&<form className="space-form" onSubmit={add}><input required maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder={tr('Name')} aria-label={tr('Name')}/>
      <input required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://" aria-label={tr('Address')} aria-invalid={!!url&&!validUrl(url)}/>
      <input maxLength={400} value={desc} onChange={e=>setDesc(e.target.value)} placeholder={tr('What it is for')} aria-label={tr('What it is for')}/>
      <button className="primary" disabled={!name.trim()||!validUrl(url)}>{tr('Connect')}</button></form>}
    {list.length?<ul className="space-list">{list.map(s=><li key={s.id}><button onClick={()=>go(`/satellite/${s.id}`)}><Orbit size={18}/><span><b>{s.name}</b><small>{s.description||s.url}</small></span><em>{madeLabel(s)}</em>{s.agent.mode!=='off'&&<Bot size={14} aria-label={tr('MOONS agent on')}/>}</button></li>)}</ul>:<p className="dock-empty">—</p>}
  </section>;
}

/** One Satellite: open it, see what it sent, decide how it reaches MOONS. */
export function SpacePage({ctx,id}:{ctx:Ctx;id:string}){
  const {store,ws,notify,go}=ctx,s=spacesOf(store).find(x=>x.id===id);
  const [tab,setTab]=useState<'open'|'records'|'settings'>('records'),[records,setRecords]=useState<SpaceRecord[]|null>(null),[pending,setPending]=useState(0),[connected,setConnected]=useState(false),[token,setToken]=useState(''),[busy,setBusy]=useState(false);
  async function load(){try{const [r,st]=await Promise.all([spaceApi.records(id),spaceApi.status()]);setRecords(r.records);setPending(st.intake[id]?.pending??0);setConnected(!!st.intake[id]?.connected)}catch(e){notify(errMsg(e))}}
  useEffect(()=>{void load();
    // The agent runs when the user opens the space, if they allowed it (v8 3.3).
    if(s?.agent.mode==='on_open')void spaceApi.digest(id,'open').then(r=>{if(r.ran)notify(tr('MOONS drafted a note from new records. See the inbox.'))}).catch(()=>undefined);
  },[id]);
  if(!s)return <section className="page-shell"><p>{tr('Not found.')}</p></section>;
  async function run(){setBusy(true);try{const r=await spaceApi.digest(id,'manual');notify(r.ran?tr('MOONS drafted a note from new records. See the inbox.'):tr('Nothing new to draft.'));await load()}catch(e){notify(errMsg(e))}finally{setBusy(false)}}
  async function rotate(revoke=false){try{const r=await spaceApi.token(id,revoke);setToken(r.token??'');setConnected(!revoke)}catch(e){notify(errMsg(e))}}
  const embed=s.embed==='auto'&&s.url;
  const suggested=suggestedPlanets(store,id).filter(p=>!s.planetIds.includes(p));
  return <section className="page-shell space-page">
    <div className="dock-breadcrumb"><button onClick={()=>go('/satellite')}><ArrowLeft size={14}/>Satellite</button></div>
    <header className="space-head"><Orbit size={30}/><div><h1>{s.name}</h1><p>{s.description}</p><small>{madeLabel(s)}{s.url&&<> · {new URL(s.url).host}</>}</small></div>
      {s.url&&<a className="primary" href={s.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={16}/>{tr('Open')}</a>}</header>
    <nav className="dock-tabs" role="tablist">{([['records','Records'],...(embed?[['open','In MOONS']]:[]),['settings','Settings']] as const).map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k as typeof tab)}>{tr(l)}{k==='records'&&pending>0&&<b>{pending}</b>}</button>)}</nav>
    {tab==='open'&&s.url&&<div className="space-frame"><iframe title={s.name} src={s.url} sandbox="allow-scripts allow-forms allow-same-origin allow-popups" referrerPolicy="no-referrer"/><a className="text-button" href={s.url} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={14}/>{tr('Open in a new tab')}</a></div>}
    {tab==='records'&&<>
      {s.agent.mode!=='off'&&<div className="space-agent"><Bot size={16}/><span>{tr('{n} records not drafted yet',{n:pending})}</span><button className="secondary" disabled={busy||!pending} onClick={()=>void run()}>{busy?<LoaderCircle className="spin" size={15}/>:<Sparkles size={15}/>}{tr('Draft now')}</button><button className="text-button" onClick={()=>go('/inbox')}><InboxIcon size={14}/>{tr('Inbox')}</button></div>}
      {records===null?<p role="status"><LoaderCircle className="spin" size={16}/></p>:records.length?<ul className="record-list">{records.map(r=><RecordCard key={r.id} r={r} id={id} notify={notify} reload={load}/>)}</ul>:<p className="dock-empty">{connected?'—':<button className="text-button" onClick={()=>setTab('settings')}><KeyRound size={13}/>{tr('Create token')}</button>}</p>}
    </>}
    {tab==='settings'&&<div className="space-settings">
      <section className="settings-card"><h2>{tr('In My Space')}</h2>
        <label className="space-toggle"><input type="checkbox" checked={s.show} onChange={e=>save(ws,id,{show:e.target.checked})}/>{tr('Show in My Space')}</label>
        <div className="space-planets">{store.planets.map(p=><button key={p.id} type="button" aria-pressed={s.planetIds.includes(p.id)} className={s.planetIds.includes(p.id)?'selected':''} onClick={()=>save(ws,id,{planetIds:s.planetIds.includes(p.id)?s.planetIds.filter(x=>x!==p.id):[...s.planetIds,p.id]})}><i style={{background:p.color}}/>{p.name}</button>)}</div>
        {suggested.length>0&&<p className="space-suggest">{tr('Notes from here landed in')} {suggested.map(pid=><button key={pid} className="text-button" onClick={()=>save(ws,id,{planetIds:[...s.planetIds,pid]})}><Plus size={12}/>{store.planets.find(p=>p.id===pid)?.name}</button>)}</p>}
      </section>
      <section className="settings-card"><h2>{tr('Into MOONS')}</h2>
        <div className="space-modes" role="radiogroup" aria-label={tr('MOONS agent')}>{([['off','Button only'],['on_open','Agent when I open'],['manual','Agent on request']] as const).map(([m,l])=><label key={m} className={s.agent.mode===m?'on':''}><input type="radio" name="agent" checked={s.agent.mode===m} onChange={()=>save(ws,id,{agent:{...s.agent,mode:m}})}/><b>{tr(l)}</b></label>)}</div>
      </section>
      <section className="settings-card"><h2><KeyRound size={15}/>{tr('Record token')}</h2>
        <p className="space-state">{connected?tr('Connected'):tr('Not connected')}</p>
        <div className="project-actions"><button className="secondary" onClick={()=>void rotate()}>{connected?tr('Rotate token'):tr('Create token')}</button>{connected&&<button className="text-button" onClick={()=>void rotate(true)}>{tr('Disconnect')}</button>}</div>
        {token&&<div className="project-token"><label>{tr('Shown once')}<input readOnly value={token} onFocus={e=>e.target.select()}/></label><button className="icon-button" aria-label={tr('Copy')} onClick={()=>void navigator.clipboard?.writeText(token)}><Copy size={15}/></button><button className="icon-button" aria-label={tr('Close')} onClick={()=>setToken('')}><X size={15}/></button></div>}
        <code className="space-endpoint">POST {new URL(`${import.meta.env.BASE_URL}api/satellite-records`,window.location.origin).href}</code>
      </section>
      <section className="settings-card"><h2>{tr('Space')}</h2>
        <label className="space-toggle"><input type="checkbox" checked={s.embed==='auto'} onChange={e=>save(ws,id,{embed:e.target.checked?'auto':'tab'})}/>{tr('Try to show it inside MOONS')}</label>
        <button className="text-button danger-text" onClick={()=>{if(ws.commit(st=>({...st,satellites:spacesOf(st).filter(x=>x.id!==id)}))){void spaceApi.token(id,true).catch(()=>undefined);go('/satellite')}}}><Trash2 size={14}/>{tr('Remove this space')}</button>
      </section>
    </div>}
  </section>;
}

function RecordCard({r,id,notify,reload}:{r:SpaceRecord;id:string;notify:(m:string)=>void;reload:()=>Promise<void>}){
  const [text,setText]=useState('');
  return <li className="record-card"><header><b>{r.title||r.kind}</b><time>{new Date(r.at).toLocaleString()}</time>{r.drafted&&<span className="record-drafted" title={tr('Drafted')}><Check size={13}/></span>}</header>
    {r.summary&&<p>{r.summary}</p>}
    {r.items.length>0&&<ul className="record-items">{r.items.slice(0,40).map((i,k)=><li key={k} className={/^fixed$|고침/i.test(i.result??'')?'fixed':/wrong|^x$|오답|틀/i.test(i.result??'')?'wrong':''}><span>{i.label}</span>{i.result&&<small>{i.result}</small>}{i.answer&&<small>→ {i.answer}</small>}</li>)}</ul>}
    {r.userText.length>0&&<blockquote>{r.userText.map((t,k)=><p key={k}>{t}</p>)}</blockquote>}
    {r.feedback?.map((f,k)=><p key={k} className="record-feedback"><Bot size={13}/>{f.by==='claude'?'Claude':tr('Me')} · {f.text}</p>)}
    {r.link&&<a className="text-button" href={r.link} target="_blank" rel="noreferrer noopener"><ArrowUpRight size={13}/>{tr('Open')}</a>}
    <form className="record-note" onSubmit={e=>{e.preventDefault();if(!text.trim())return;void spaceApi.feedback(id,r.id,text).then(()=>{setText('');return reload()},err=>notify(errMsg(err)))}}><input value={text} onChange={e=>setText(e.target.value)} placeholder={tr('Memo')} aria-label={tr('Memo')} maxLength={4000}/></form>
  </li>;
}

const kindLabel:Record<string,string>={record_note:'Record',note:'Note',concept:'Concept',memo:'Memo',question:'Question',session:'Conversation'};
/** Everything waiting to enter MOONS: drafts from Satellites and proposals from a connected AI. Nothing enters before approval. */
export function Inbox({ctx}:{ctx:Ctx}){
  const {store,notify,go}=ctx;
  const [items,setItems]=useState<InboxItem[]|null>(null),[status,setStatus]=useState('open');
  async function load(){try{setItems((await spaceApi.inbox(status)).items)}catch(e){notify(errMsg(e))}}
  useEffect(()=>{void load()},[status]);
  useEffect(()=>{
    // Opening the inbox is also "opening" each Satellite whose agent runs on open.
    const due=spacesOf(store).filter(s=>s.agent.mode==='on_open');
    void Promise.all(due.map(s=>spaceApi.digest(s.id,'open').catch(()=>({ran:false})))).then(r=>{if(r.some(x=>x.ran))void load()});
  },[]);
  const [busy,setBusy]=useState('');
  async function decideBatch(batch:string,action:'approve'|'dismiss',ids:string[]){setBusy(batch);try{
    let n=0;
    if(action==='approve')await ctx.ws.upload(async()=>{const r=await spaceApi.decideBatch(batch,action,ids);n=r.result.count;return r as never});
    else await spaceApi.decideBatch(batch,action,ids);
    await load();if(n)notify(tr('{n} added to MOONS.',{n}))}catch(e){notify(errMsg(e))}finally{setBusy('')}}
  async function decide(it:InboxItem,action:'approve'|'dismiss',data?:unknown){try{
    // Approval goes through the upload path: local edits are sent first, then the saved space comes back.
    let entryId:string|undefined;
    if(action==='approve')await ctx.ws.upload(async()=>{const r=await spaceApi.decide(it.id,action,data);entryId=r.result.entryId;return r as never});
    else await spaceApi.decide(it.id,action);
    await load();if(entryId)notify(tr('Added to your notes.'))}catch(e){notify(errMsg(e))}}
  return <section className="page-shell inbox-page">
    <div className="page-heading"><div><h1><InboxIcon size={24}/>{tr('Inbox')}</h1></div><div className="project-actions"><select value={status} onChange={e=>setStatus(e.target.value)} aria-label={tr('Status')}><option value="open">{tr('Waiting')}</option><option value="applied">{tr('Added')}</option><option value="dismissed">{tr('Dismissed')}</option><option value="all">{tr('All')}</option></select><button className="icon-button" aria-label={tr('Refresh')} onClick={()=>void load()}><RefreshCw size={16}/></button></div></div>
    {items===null?<p role="status"><LoaderCircle className="spin" size={16}/></p>:items.length?<ul className="inbox-list">{groups(items).map(g=>g.batch
      ?<BatchCard key={g.batch.id} batch={g.batch} items={g.items} store={store} busy={busy===g.batch.id} decideAll={(a,ids)=>void decideBatch(g.batch!.id,a,ids)} card={it=><InboxCard key={it.id} it={it} store={store} decide={(a,d)=>void decide(it,a,d)} open={id=>go(`/entries/${id}`)}/>}/>
      :<InboxCard key={g.items[0].id} it={g.items[0]} store={store} decide={(a,d)=>void decide(g.items[0],a,d)} open={id=>go(`/entries/${id}`)}/>)}</ul>:<div className="empty-state"><InboxIcon size={40} strokeWidth={1}/><h2>{tr('Nothing waiting')}</h2></div>}
  </section>;
}

/** Inbox items in order, those sent together kept as one group. */
function groups(items:InboxItem[]){
  const out:{batch?:{id:string;title:string};items:InboxItem[]}[]=[];
  for(const it of items){const g=it.batch&&out.find(x=>x.batch?.id===it.batch!.id);if(g)g.items.push(it);else out.push({batch:it.batch,items:[it]})}
  return out;
}
/** One study day as one card: counts, approve all / dismiss all, the rest one by one. Notes with a corrected version are checked on their own. */
function BatchCard({batch,items,store,busy,decideAll,card}:{batch:{id:string;title:string};items:InboxItem[];store:Store;busy:boolean;decideAll:(a:'approve'|'dismiss',ids:string[])=>void;card:(it:InboxItem)=>React.ReactNode}){
  const [open,setOpen]=useState(false);
  const waiting=items.filter(it=>it.status==='open');
  const concepts=waiting.filter(it=>it.kind==='concept'),updates=concepts.filter(it=>conceptUpdate(store,it.data)),notes=waiting.filter(it=>it.kind!=='concept');
  const separate=batchTakesRevisions(store)?[]:waiting.filter(hasRevision);
  const all=waiting.filter(it=>!separate.includes(it));
  return <li className={`inbox-card batch ${waiting.length?'open':'applied'}`}>
    <header><span className="inbox-kind"><Layers size={13}/>{tr('Batch')}</span><span className="inbox-src"><Bot size={13}/>{items[0].source.name??'Claude'}</span><time>{new Date(items.at(-1)!.createdAt).toLocaleString()}</time></header>
    <h3>{batch.title||tr('Batch')}</h3>
    <div className="batch-counts">
      <span title={tr('New concepts')}><Lightbulb size={14}/><Plus size={11}/>{concepts.length-updates.length}</span>
      <span title={tr('Concept updates')}><Lightbulb size={14}/><RotateCcw size={11}/>{updates.length}</span>
      <span title={tr('Notes')}><FileText size={14}/>{notes.length}</span>
      {separate.length>0&&<span title={tr('Corrected notes, checked one by one')}><BadgeCheck size={14}/>{separate.length}</span>}
    </div>
    {waiting.length>0?<footer><button className="primary" disabled={busy||!all.length} onClick={()=>decideAll('approve',all.map(x=>x.id))}>{busy?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}{tr('Approve all')} {all.length}</button>
      <button className="text-button" disabled={busy} onClick={()=>decideAll('dismiss',waiting.map(x=>x.id))}>{tr('Dismiss all')}</button>
      <button className="icon-button" aria-expanded={open} aria-label={tr(open?'Fold':'Unfold')} title={tr(open?'Fold':'Unfold')} onClick={()=>setOpen(!open)}>{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button></footer>
    :<footer><small>{tr('Added')}</small><button className="icon-button" aria-expanded={open} aria-label={tr(open?'Fold':'Unfold')} onClick={()=>setOpen(!open)}>{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button></footer>}
    {separate.length>0&&<ul className="inbox-list batch-separate">{separate.map(card)}</ul>}
    {open&&<ul className="inbox-list batch-items">{items.filter(it=>!separate.includes(it)).map(card)}</ul>}
  </li>;
}

const fieldLabel:Record<string,string>={pos:'Part of speech',meaningKo:'Meaning',pitfall:'Pitfall',headword:'Headword',forms:'Forms',collocations:'Collocations',definition:'Definition',autoLink:'Linked in notes',contrasts:'Contrasts with',similar:'Similar to',related:'Related to',kind_of:'Kind of',part_of:'Part of',implements:'Implements'};
function ConceptProposal({d,store}:{d:Record<string,unknown>;store:Store}){
  const up=conceptUpdate(store,d);
  const list=(v:unknown)=>Array.isArray(v)?(v as string[]):[];
  if(up)return <div className="concept-update"><span className="update-badge"><RotateCcw size={12}/>{tr('Update')} · {up.concept.name}</span>
    {up.changes.length?<ul>{up.changes.map((c,i)=><li key={i}><small>{tr(fieldLabel[c.field]??c.field)}</small>{c.from&&<del>{c.from}</del>}<ins>{c.to}</ins></li>)}</ul>:<small className="muted">{tr('No change')}</small>}</div>;
  return <div className="concept-new">
    {(d.pos||d.meaningKo)?<p className="term-line">{d.pos?<span className="term-pos">{String(d.pos)}</span>:null}{d.meaningKo?<span className="term-meaning">{String(d.meaningKo)}</span>:null}</p>:null}
    {d.definition?<p>{String(d.definition)}</p>:null}
    {list(d.collocations).length>0&&<p className="term-colls-inline">{list(d.collocations).join(' · ')}</p>}
    {list(d.forms).length>0&&<p className="term-forms">{list(d.forms).join(' · ')}</p>}
    {d.pitfall?<p className="term-pitfall">{String(d.pitfall)}</p>:null}
    {Array.isArray(d.relations)&&(d.relations as {to:string;rel:string;note?:string}[]).map((r,i)=><small key={i}>{tr(fieldLabel[r.rel]??r.rel)} → {r.to}{r.note?` · ${r.note}`:''}</small>)}
  </div>;
}
/** The user's original beside the corrected version, sentence by sentence: take the correction or keep my sentence. */
function RevisionChoice({rev,choices,setChoices,readonly}:{rev:RevisionDraft;choices:string[];setChoices:(c:string[])=>void;readonly:boolean}){
  const def=(r:RevisionDraft['rows'][number])=>r.rev!==undefined?'rev':'none';
  const pick=(i:number)=>choices[i]??def(rev.rows[i]);
  const flip=(i:number)=>{const r=rev.rows[i];const next=[...rev.rows.map((x,k)=>choices[k]??def(x))];next[i]=r.orig!==undefined&&r.rev!==undefined?(pick(i)==='rev'?'orig':'rev'):r.rev!==undefined?(pick(i)==='rev'?'none':'rev'):(pick(i)==='orig'?'none':'orig');setChoices(next)};
  return <div className="inbox-part revision"><small><BadgeCheck size={12}/>{tr('Corrected version')}</small><ol className="revision-compare">{rev.rows.map((r,i)=>{
    const a=r.orig!==undefined?rev.orig[r.orig]:undefined,b=r.rev!==undefined?rev.rev[r.rev]:undefined,same=a===b,p=pick(i);
    return <DiffRow key={i} a={a} b={b} reasons={r.reasons} off={p==='none'}>{!same&&<button type="button" disabled={readonly} className={`row-pick ${p}`} aria-pressed={p==='rev'} title={tr(p==='rev'?'Correction taken':p==='orig'?'My sentence kept':'Left out')} aria-label={tr(p==='rev'?'Correction taken':p==='orig'?'My sentence kept':'Left out')} onClick={()=>flip(i)}>{p==='rev'?<BadgeCheck size={15}/>:p==='orig'?<PenLine size={15}/>:<X size={15}/>}</button>}</DiffRow>})}</ol></div>;
}

function InboxCard({it,store,decide,open}:{it:InboxItem;store:Store;decide:(a:'approve'|'dismiss',data?:unknown)=>void;open:(id:string)=>void}){
  const d=it.data as Record<string,unknown>;
  const draft=it.kind==='record_note'?d as unknown as RecordDraft:null;
  const [title,setTitle]=useState(String(d.title??d.name??'')),[skipUser,setSkipUser]=useState<number[]>([]),[skipAct,setSkipAct]=useState<number[]>([]);
  const rev=it.kind==='note'?d.revision as RevisionDraft|undefined:undefined,[choices,setChoices]=useState<string[]>([]);
  const toggle=(list:number[],set:(v:number[])=>void,i:number)=>set(list.includes(i)?list.filter(x=>x!==i):[...list,i]);
  const approve=()=>decide('approve',draft?{title,userText:draft.userText.filter((_,i)=>!skipUser.includes(i)),activity:draft.activity.filter((_,i)=>!skipAct.includes(i))}:it.kind==='concept'?{name:title}:rev?{title,choices:rev.rows.map((r,i)=>choices[i]??(r.rev!==undefined?'rev':'none'))}:{title});
  const src=it.source.type==='claude'?(it.source.name??'Claude'):(spacesOf(store).find(s=>s.id===it.source.id)?.name??it.source.name??'Satellite');
  return <li className={`inbox-card ${it.status}`}>
    <header><span className="inbox-kind">{tr(kindLabel[it.kind]??it.kind)}</span><span className="inbox-src">{it.source.type==='claude'?<Bot size={13}/>:<Orbit size={13}/>}{src}</span><time>{new Date(it.createdAt).toLocaleString()}</time></header>
    {it.status==='open'&&(it.kind==='record_note'||it.kind==='note'||it.kind==='question'||it.kind==='session'||it.kind==='concept')?<input className="inbox-title" value={title} onChange={e=>setTitle(e.target.value)} aria-label={tr('Title')}/>:<h3>{title||tr(kindLabel[it.kind]??it.kind)}</h3>}
    {draft&&<>
      {draft.userText.length>0&&<div className="inbox-part user"><small>{tr('My words')}</small>{draft.userText.map((t,i)=><label key={i} className={skipUser.includes(i)?'off':''}><input type="checkbox" disabled={it.status!=='open'} checked={!skipUser.includes(i)} onChange={()=>toggle(skipUser,setSkipUser,i)}/>{t}</label>)}</div>}
      {draft.activity.length>0&&<div className="inbox-part activity"><small>{tr('Activity record')}</small>{draft.activity.slice(0,60).map((t,i)=><label key={i} className={skipAct.includes(i)?'off':''}><input type="checkbox" disabled={it.status!=='open'} checked={!skipAct.includes(i)} onChange={()=>toggle(skipAct,setSkipAct,i)}/>{t}</label>)}</div>}
      {draft.moons&&<div className="inbox-part ai"><small><Bot size={12}/>{tr('MOONS reading')}</small><p>{draft.moons.summary}</p>{draft.moons.patterns.map((p,i)=><p key={i}>· {p}</p>)}</div>}
      {draft.concepts.length>0&&<div className="inbox-concepts">{draft.concepts.map(c=><span key={c} className={`concept-chip static ${draft.missed.includes(c)?'missed':''}`}>{c}</span>)}</div>}
    </>}
    {!draft&&<div className="inbox-part">{it.kind==='concept'?<ConceptProposal d={d} store={store}/>
      :it.kind==='session'?<><p>{String(d.summary??'')}</p>{Array.isArray(d.userUtterances)&&<blockquote>{(d.userUtterances as string[]).map((t,i)=><p key={i}>{t}</p>)}</blockquote>}</>
      :it.kind==='question'?<><p>{String(d.why??'')}</p>{Array.isArray(d.subQuestions)&&<ul>{(d.subQuestions as string[]).map((t,i)=><li key={i}>{t}</li>)}</ul>}</>
      :<p className="inbox-text">{String(d.text??'')}</p>}
      {it.kind==='note'&&<small className="inbox-words">{d.words==='user'?tr('Your words, relayed by Claude'):tr('AI material, not your words')}</small>}</div>}
    {rev&&<RevisionChoice rev={rev} choices={choices} setChoices={setChoices} readonly={it.status!=='open'}/>}
    <footer>{it.status==='open'?<><button className="primary" onClick={approve}><Check size={15}/>{tr('Add to MOONS')}</button><button className="text-button" onClick={()=>decide('dismiss')}>{tr('Dismiss')}</button></>
      :it.entryId?<button className="text-button" onClick={()=>open(it.entryId!)}><ArrowUpRight size={13}/>{tr('Open note')}</button>:<small>{tr(it.status==='applied'?'Added':'Dismissed')}</small>}</footer>
  </li>;
}

/** The consent page an AI connector sends the person to (v8 4.1). */
export function ConnectPage({id,notify}:{id:string;notify:(m:string)=>void}){
  const [req,setReq]=useState<{clientName:string;redirectHost:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{spaceApi.request(id).then(setReq,e=>setError(errMsg(e)))},[id]);
  async function answer(approve:boolean){setBusy(true);try{const r=await spaceApi.answer(id,approve);window.location.href=r.redirect}catch(e){notify(errMsg(e));setError(errMsg(e))}finally{setBusy(false)}}
  return <section className="page-shell connect-page"><div className="connect-card">
    <Orbit size={36}/>{error?<><h1>{tr('Connection request')}</h1><p className="field-error">{error}</p></>:!req?<LoaderCircle className="spin"/>:<>
      <h1>{tr('Connect {name} to MOONS?',{name:req.clientName})}</h1>
      <ul className="connect-can"><li>{tr('Read your notes, concepts, questions and Satellite records')}</li><li>{tr('Add AI material and register Satellites')}</li><li>{tr('Propose notes, concepts and memos — they wait in your inbox until you approve')}</li></ul>
      <small>{tr('Returns to')} {req.redirectHost}</small>
      <div className="project-actions"><button className="secondary" disabled={busy} onClick={()=>void answer(false)}>{tr('Decline')}</button><button className="primary" disabled={busy} onClick={()=>void answer(true)}>{busy?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}{tr('Connect')}</button></div></>}
  </div></section>;
}

/** Settings: the MOONS agent's limits and this month's use, and the AIs connected to this space. */
export function SpacesSettings({store,ws,notify}:{store:Store;ws:WorkspaceApi;notify:(m:string)=>void}){
  const a=agentSettings(store);
  const [usage,setUsage]=useState<{calls:number;cost:number|null}|null>(null),[clients,setClients]=useState<{clientId:string;name:string;lastUsedAt:string|null}[]>([]),[endpoint,setEndpoint]=useState('');
  async function load(){try{const [st,c]=await Promise.all([spaceApi.status(),spaceApi.clients()]);setUsage(st.agent);setClients(c.clients);setEndpoint(c.endpoint)}catch(e){notify(errMsg(e))}}
  useEffect(()=>{void load()},[]);
  const patch=(p:Partial<typeof a>)=>ws.commit(s=>({...s,settings:{...s.settings!,satelliteAgent:{...a,...p}} as typeof s.settings}));
  return <>
    <section className="settings-card"><h2><Bot size={16}/>{tr('Satellite agent')}</h2>
      <label className="form-label">{tr('Run at most once every (hours)')}<input type="number" min={0} max={168} value={a.minHours} onChange={e=>patch({minHours:Number(e.target.value)})}/></label>
      <label className="form-label">{tr('Records read per run')}<input type="number" min={1} max={200} value={a.maxRecords} onChange={e=>patch({maxRecords:Number(e.target.value)})}/></label>
      <label className="space-toggle"><input type="checkbox" checked={batchTakesRevisions(store)} onChange={e=>ws.commit(s=>({...s,settings:{...s.settings!,batchTakesRevisions:e.target.checked} as typeof s.settings}))}/>{tr('Approve all includes corrected notes')}</label>
      <p className="space-state">{tr('This month')}: {usage?`${usage.calls} · ${usage.cost===null?'—':`$${usage.cost.toFixed(4)}`}`:'…'}</p>
    </section>
    <section className="settings-card"><h2>{tr('Connected AI')}</h2>
      <code className="space-endpoint">{endpoint}</code>
      {clients.length?<ul className="space-clients">{clients.map(c=><li key={c.clientId}><b>{c.name}</b><small>{c.lastUsedAt?new Date(c.lastUsedAt).toLocaleString():'—'}</small><button className="text-button" onClick={()=>void spaceApi.disconnect(c.clientId).then(load,e=>notify(errMsg(e)))}>{tr('Disconnect')}</button></li>)}</ul>:<p className="dock-empty">—</p>}
    </section>
  </>;
}

/** Header: how many things wait in the inbox. */
export function InboxButton({go,active}:{go:(u:string)=>void;active:boolean}){
  const [n,setN]=useState(0);
  useEffect(()=>{let live=true;const tick=()=>spaceApi.status().then(s=>{if(live)setN(s.inbox)},()=>undefined);void tick();const t=setInterval(tick,60000);return()=>{live=false;clearInterval(t)}},[active]);
  return <button className={`icon-button inbox-button ${active?'active':''}`} aria-label={tr('Inbox')} title={tr('Inbox')} onClick={()=>go('/inbox')}><InboxIcon size={19}/>{n>0&&<b>{n}</b>}</button>;
}
