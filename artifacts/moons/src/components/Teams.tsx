import {useEffect,useState} from 'react';
import {ArrowLeft,Copy,Download,LoaderCircle,Plus,Share2,Undo2,Users} from 'lucide-react';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {authEnabled} from '@/lib/runtime-config';
import {tr} from '@/lib/i18n';
import VerdictBadge from './VerdictBadge';
import type {Verdict} from '@/lib/model';
import '../styles/teams.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void};
type Snapshot={body:string;sentences:string[];summary:string;items:{answer:number;verdict:string;original:number[];note:string}[]};
type Original={id:string;title:string;body:string;sentences:string[];createdAt:string;shares:{member:string;me:boolean;snapshot:Snapshot;sharedAt:string}[]};
type Team={id:string;name:string;role:string;me:string;members:{name:string;role:string;me:boolean}[];originals:Original[]};


async function api<T>(path:string,init?:RequestInit){
  const r=await fetch(`${import.meta.env.BASE_URL}api/${path}`,{credentials:'include',...init,headers:{...(init?.body?{'content-type':'application/json'}:{})}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d?.error?.message??`Request failed (${r.status})`),{status:r.status});return d as T;
}

function NeedAccount({go}:{go:(u:string)=>void}){
  return <section className="page-shell teams"><h1>{tr('Team spaces')}</h1><p>{authEnabled?tr('Sign in to create or join a team. Your own notes stay private either way.'):tr('Team spaces need sign-in, which is not set up on this server yet.')}</p>{authEnabled&&<button className="primary" onClick={()=>go('/sign-in')}>{tr('Sign in')}</button>}</section>;
}

export function TeamList({ctx}:{ctx:Ctx}){
  const [teams,setTeams]=useState<{id:string;name:string;role:string;members:number}[]|null>(null),[status,setStatus]=useState(0),[name,setName]=useState(''),[error,setError]=useState('');
  useEffect(()=>{api<{teams:typeof teams}>('teams').then(r=>setTeams(r.teams??[])).catch(e=>setStatus((e as {status?:number}).status??500))},[]);
  if(status===401||!authEnabled)return <NeedAccount go={ctx.go}/>;
  async function create(e:React.FormEvent){e.preventDefault();setError('');try{const t=await api<{id:string}>('teams',{method:'POST',body:JSON.stringify({name})});ctx.go(`/teams/${t.id}`)}catch(x){setError((x as Error).message)}}
  return <section className="page-shell teams"><div className="page-heading"><div><h1>{tr('Team spaces')}</h1></div></div>
    <div className="team-grid">{teams===null?<LoaderCircle className="spin"/>:teams.map(t=><button key={t.id} className="settings-card team-card" onClick={()=>ctx.go(`/teams/${t.id}`)}><Users size={18}/><b>{t.name}</b><small>{tr('{n} members',{n:t.members})}</small></button>)}
      <form className="settings-card team-card new" onSubmit={create}><input aria-label={tr('Team name')} placeholder={tr('New team name')} value={name} maxLength={60} onChange={e=>setName(e.target.value)}/><button className="primary small" disabled={!name.trim()}><Plus size={14}/>{tr('Create team')}</button>{error&&<p role="alert" className="field-error">{error}</p>}</form></div>
  </section>;
}

export function TeamJoin({token,ctx}:{token:string;ctx:Ctx}){
  const [error,setError]=useState('');
  useEffect(()=>{if(!authEnabled)return;api<{teamId:string}>(`teams/join/${encodeURIComponent(token)}`,{method:'POST'}).then(r=>ctx.go(`/teams/${r.teamId}`)).catch(e=>setError((e as Error).message))},[token]);
  if(!authEnabled)return <NeedAccount go={ctx.go}/>;
  return <section className="page-shell teams">{error?<><h1>{tr('Could not join')}</h1><p>{error}</p>{error.includes('Sign in')&&<button className="primary" onClick={()=>ctx.go('/sign-in')}>{tr('Sign in')}</button>}</>:<LoaderCircle className="spin"/>}</section>;
}

export function TeamPage({id,ctx}:{id:string;ctx:Ctx}){
  const [team,setTeam]=useState<Team|null>(null),[error,setError]=useState(''),[invite,setInvite]=useState(''),[adding,setAdding]=useState(false),[title,setTitle]=useState(''),[text,setText]=useState('');
  const load=()=>api<Team>(`teams/${id}`).then(setTeam).catch(e=>setError((e as Error).message));
  useEffect(()=>{void load()},[id]);
  if(error)return <section className="page-shell teams"><p role="alert">{error}</p><button className="text-button" onClick={()=>ctx.go('/teams')}><ArrowLeft size={15}/>{tr('Team spaces')}</button></section>;
  if(!team)return <section className="page-shell teams"><LoaderCircle className="spin"/></section>;
  async function makeInvite(){const r=await api<{token:string}>(`teams/${id}/invites`,{method:'POST'});const url=`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/,'')}/teams/join/${r.token}`;setInvite(url);try{await navigator.clipboard.writeText(url)}catch{/* shown on screen */}}
  async function addOriginal(e:React.FormEvent){e.preventDefault();await api(`teams/${id}/originals`,{method:'POST',body:JSON.stringify({title,text})});setTitle('');setText('');setAdding(false);void load()}
  async function take(o:Original){try{const r=await ctx.ws.upload(async()=>api(`teams/${id}/originals/${o.id}/take`,{method:'POST'}));ctx.notify(tr('Copied into your space. Write what you understood, then compare it with this original.'));const entryId=(r as unknown as {result:{entryId:string}}).result.entryId;ctx.go(`/entries/${entryId}/original`)}catch(e){ctx.notify((e as Error).message)}}
  return <section className="page-shell teams team-page">
    <div className="page-heading"><div><button className="text-button" onClick={()=>ctx.go('/teams')}><ArrowLeft size={15}/>{tr('Team spaces')}</button><h1>{team.name}</h1><p className="members">{team.members.map((m,i)=><span key={i} className={m.me?'me':''}>{m.name||tr('Member')}</span>)}</p></div>
      <div className="settings-actions"><button className="secondary" onClick={()=>void makeInvite()}><Copy size={14}/>{tr('Invite link')}</button><button className="primary" onClick={()=>setAdding(!adding)}><Plus size={14}/>{tr('Add an original')}</button></div></div>
    {invite&&<p className="invite-line">{tr('One-use link, valid 14 days (copied):')} <code>{invite}</code></p>}
    {adding&&<form className="settings-card add-original" onSubmit={addOriginal}><input aria-label={tr('Title')} placeholder={tr('Title, e.g. Kickoff meeting notes')} value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/><textarea rows={6} aria-label={tr('Original text')} placeholder={tr('Paste the meeting notes, document or transcript everyone should read')} value={text} onChange={e=>setText(e.target.value)}/><div className="settings-actions"><button type="button" className="secondary small" onClick={()=>setAdding(false)}>{tr('Cancel')}</button><button className="primary small" disabled={!text.trim()}>{tr('Add')}</button></div></form>}
    {team.originals.length===0&&!adding&&<p className="empty-note">{tr('No originals yet. Add the text everyone should understand the same way.')}</p>}
    {team.originals.map(o=><TeamOriginal key={o.id} o={o} teamId={id} ctx={ctx} take={()=>void take(o)} reload={()=>void load()}/>)}
  </section>;
}

function TeamOriginal({o,teamId,ctx,take,reload}:{o:Original;teamId:string;ctx:Ctx;take:()=>void;reload:()=>void}){
  const mine=o.shares.find(s=>s.me);
  // My notes compared against my copy of this original are the ones I can share.
  const copies=new Set(ctx.store.entries.filter(e=>e.meta?.teamOriginalId===o.id).map(e=>e.id));
  const answers=ctx.store.entries.filter(e=>e.comparison&&copies.has(e.comparison.materialEntryId));
  const [pick,setPick]=useState(answers[0]?.id??'');
  async function share(){try{await api(`teams/${teamId}/shares`,{method:'POST',body:JSON.stringify({entryId:pick})});ctx.notify(tr('Shared with the team.'));reload()}catch(e){ctx.notify((e as Error).message)}}
  async function unshare(){await api(`teams/${teamId}/shares/${o.id}`,{method:'DELETE'});reload()}
  const added=o.shares.flatMap(s=>s.snapshot.items.filter(i=>i.verdict==='added').map(i=>({member:s.member,text:s.snapshot.sentences[i.answer]??'',note:i.note})));
  return <article className="settings-card team-original">
    <header><h2>{o.title}</h2><small>{tr('{n} shared',{n:o.shares.length})}</small></header>
    <div className="team-actions">{copies.size?null:<button className="secondary small" onClick={take}><Download size={14}/>{tr('Copy into my space')}</button>}
      {mine?<button className="text-button" onClick={()=>void unshare()}><Undo2 size={14}/>{tr('Stop sharing mine')}</button>
      :answers.length>0&&<><select aria-label={tr('My note to share')} value={pick} onChange={e=>setPick(e.target.value)}>{answers.map(a=><option key={a.id} value={a.id}>{a.title||a.body.slice(0,40)}</option>)}</select><button className="primary small" onClick={()=>void share()}><Share2 size={14}/>{tr('Share with team')}</button></>}
      {copies.size>0&&!answers.length&&!mine&&<small className="muted">{tr('Write your understanding and compare it with your copy to share it.')}</small>}</div>
    <ol className="team-compare">{o.sentences.map((s,i)=>{const marks=o.shares.map(sh=>({member:sh.member,item:sh.snapshot.items.find(it=>it.original.includes(i))}));
      return <li key={i}><p>{s}</p><div className="marks">{marks.map((m,k)=><span key={k} className="mark-row" title={m.item?.note??''}>{m.item?<VerdictBadge verdict={m.item.verdict as Verdict} shiftType={(m.item as {shiftType?:string|null}).shiftType} size="sm"/>:<span className="mark none">—</span>}<span>{m.member}</span></span>)}</div></li>})}</ol>
    {added.length>0&&<div className="team-added"><h3>{tr('Added by members (not in the original)')}</h3><ul>{added.map((a,k)=><li key={k}><b>{a.member}</b> {a.text}</li>)}</ul></div>}
  </article>;
}
