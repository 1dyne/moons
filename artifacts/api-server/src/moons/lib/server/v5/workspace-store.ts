import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Request,Response} from 'express';
import {q,json,newId,transaction} from '../db.ts';
import {EVENT_TABLES,logChanges} from './events.ts';
import {SHARE_TABLES} from './shares.ts';
import {AI_TABLES} from './ai-access.ts';
import {IMPOSTOR_TABLES} from './impostor.ts';
import {TEAM_TABLES} from './teams.ts';
import {PROJECT_TABLES} from '../projects/schema.ts';
import {SATELLITE_TABLES} from '../satellites/store.ts';
import {OAUTH_TABLES} from '../mcp/oauth.ts';
import {enqueueProjectSparks} from '../projects/queue.ts';
import {validateNotation} from './notation.ts';
import type {Op} from '@workspace/moons-sync';
import {verifyEntryQuotes,migrateVerdict} from './analysis.ts';
import {WorkspaceError,type Entry,type Store} from './types.ts';
import {splitSentences} from '../../thought.ts';
import {accountId} from './identity.ts';

// Guest cookies are signed with this. Without a fixed value every restart creates new guest spaces.
const sessionSecret=process.env.SESSION_SECRET||randomBytes(32).toString('hex');
if(!process.env.SESSION_SECRET&&process.env.NODE_ENV==='production')console.warn('SESSION_SECRET is not set: guest spaces will not survive a restart.');
let initialized:Promise<void>|undefined;
export function initV5() {
 return initialized??=(async()=>{
  const statements=[
   `create table if not exists users(id text primary key,email text unique,name text,created_at timestamptz default now())`,
   `create table if not exists guests(id text primary key,user_id text references users(id),created_at timestamptz default now())`,
   `create table if not exists personal_workspaces(owner_id text primary key references guests(id),store jsonb not null,revision integer not null default 0,updated_at timestamptz default now())`,
   `create table if not exists personal_vectors(owner_id text not null,entry_id text not null,body_hash text not null,embedding jsonb not null,primary key(owner_id,entry_id))`,
   `create table if not exists intent_checks(entry_id text not null,target_type text not null,target_id text not null,owner_id text not null,verdict text not null,comment text not null default '',primary key(entry_id,target_type,target_id,owner_id))`,
   `create table if not exists event_scans(entry_id text primary key,owner_id text not null,demo boolean not null default false,revealed boolean not null default false,display_nodes jsonb,emotions jsonb)`,
   `create table if not exists spies(id text primary key,entry_id text not null,node_id text not null,kind text not null,near_node text,text text not null,check_verdict text,reveal_verdict text,reveal_comment text,revealed_at timestamptz,created_at timestamptz default now())`,
   `create table if not exists workspace_imports(owner_id text not null,content_hash text not null,created_at timestamptz default now(),primary key(owner_id,content_hash))`,
   `create table if not exists notifications(id text primary key,owner_id text not null,kind text not null,headline text not null,evidence jsonb not null default '[]',status text not null default 'new',created_at timestamptz default now())`,
    `create table if not exists user_workspaces(user_id text primary key references users(id),owner_id text unique not null references guests(id))`,
    `create table if not exists claimed_workspace_snapshots(user_id text not null references users(id),source_owner text not null references guests(id),store jsonb not null,created_at timestamptz default now(),primary key(user_id,source_owner))`,
    `create table if not exists demo_guests(owner_id text primary key references guests(id),space_id text unique not null references spaces(id))`,
    `create table if not exists demo_access_tokens(token_hash text primary key,owner_id text not null references demo_guests(owner_id),expires_at timestamptz not null)`,
    `create table if not exists daily_runs(day text primary key,state text not null,started_at timestamptz not null default now(),completed_at timestamptz,result jsonb)`,
   `alter table comparisons add column if not exists shift_type text`,
   `update comparisons set items=coalesce((select jsonb_agg(item||jsonb_build_object('verdict',case item->>'verdict' when 'same' then 'kept' when 'different' then 'shifted' when 'own' then 'added' else item->>'verdict' end)) from jsonb_array_elements(items) item),'[]'::jsonb) where items::text ~ '"(same|different|own)"'`,
  ];
  for(const sql of [...statements,...EVENT_TABLES,...SHARE_TABLES,...AI_TABLES,...IMPOSTOR_TABLES,...TEAM_TABLES,...PROJECT_TABLES,...SATELLITE_TABLES,...OAUTH_TABLES])await q(sql);
 })().catch(e=>{initialized=undefined;throw e});
}
function sign(id:string){return createHmac('sha256',sessionSecret).update(id).digest('hex')}
export function cookieIdentity(header:string|undefined,name='moons_guest') {
 const encoded=header?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1);
 if(!encoded)return null;
 const [id,signature]=encoded.split('.');
 if(!id||!/^[a-f0-9-]{36}$/.test(id)||!signature||!/^[a-f0-9]{64}$/.test(signature))return null;
 return timingSafeEqual(Buffer.from(sign(id)),Buffer.from(signature))?id:null;
}
export function issueGuestCookie(req:Request,res:Response,id:string) {
 const secure=req.secure||req.get('x-forwarded-proto')?.split(',')[0]==='https';
 res.append('Set-Cookie',`moons_guest=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure?'; Secure':''}`);
}
export async function guest(req:Request,res:Response) {
 await initV5();
  const user=accountId(req);
  if(user){
   const owned=await q<{owner_id:string}>('select owner_id from user_workspaces where user_id=$1',[user]);
   if(owned[0])return owned[0].owner_id;
  }
 let id=cookieIdentity(req.headers.cookie);
  if(id&&!(await q('select id from guests where id=$1 and (user_id is null or user_id=$2)',[id,user])).length)id=null;
 if(!id){
  id=newId();await q('insert into guests(id) values($1)',[id]);
   issueGuestCookie(req,res,id);
 }
 return id;
}
export function initialWorkspace():Store {
 return {version:1,entries:[],planets:[
  {id:'p-learning',name:'Learning',color:'#adc5ef',position:{x:29,y:39},entryCount:0,openSignalRatio:0},
  {id:'p-creative',name:'Creative',color:'#d3c6ec',position:{x:71,y:61},entryCount:0,openSignalRatio:0},
  {id:'p-everyday',name:'Everyday',color:'#c9dccb',position:{x:55,y:24},entryCount:0,openSignalRatio:0}
 ],tiles:[
  {id:'dump',name:'Dump',icon:'Flame',adapters:['dump'],fields:[],position:0},
  {id:'book',name:'Book',icon:'BookOpen',adapters:['dump'],fields:['title','author','date'],position:1},
  {id:'article',name:'Article',icon:'Newspaper',adapters:['url','dump'],fields:['title','url'],position:2},
  {id:'audio',name:'Audio / Video',icon:'AudioLines',adapters:['audio'],fields:['title'],position:3}
 ],chats:[],notifications:[],settings:{profileContext:true,notificationKinds:{breaking_news:true,bias_watch:true,source_ready:true}}};
}
export async function loadWorkspace(owner:string) {
 await q(`insert into personal_workspaces(owner_id,store) values($1,$2::jsonb) on conflict do nothing`,[owner,json(initialWorkspace())]);
 return (await q<{store:Store;revision:number}>('select store,revision from personal_workspaces where owner_id=$1',[owner]))[0]!;
}
// Notes saved before line-aware splitting lost lines that had no closing punctuation. The body was never
// touched, so a plain note may re-split from it. Notes whose sentence numbers are referenced elsewhere
// (a comparison, cross-checks, media anchors) keep their old split.
export const canResplit=(e:Entry)=>e.kind==='dump'&&!e.comparison&&!e.crossChecks?.length&&!e.anchors?.length;
export const isResplit=(e:Entry)=>JSON.stringify(e.sentences)===JSON.stringify(splitSentences(e.body));
export function validateStore(input:unknown,previous?:Store,planted?:Set<string>):Store {
 const s=input as Store;
 if(!s||s.version!==1||!Array.isArray(s.entries)||s.entries.length>2000||!Array.isArray(s.planets)||s.planets.length>150||JSON.stringify(s).length>5_000_000)throw new WorkspaceError(400,'Invalid or oversized workspace backup.');
 const ids=new Set<string>();
 for(const entry of s.entries){
  if(!entry||typeof entry.id!=='string'||ids.has(entry.id)||typeof entry.body!=='string'||entry.body.length>100000||!Array.isArray(entry.sentences)||!entry.sentences.every(t=>typeof t==='string'&&entry.body.includes(t))||!Array.isArray(entry.planetIds)||entry.planetIds.some(id=>typeof id!=='string'))throw new WorkspaceError(400,'Invalid entry or original sentences.');
  ids.add(entry.id);
  if(entry.projectIds!==undefined&&(!Array.isArray(entry.projectIds)||entry.projectIds.length>20||entry.projectIds.some(id=>typeof id!=='string'||id.length>80)))throw new WorkspaceError(400,'Invalid project tags.');
  const old=previous?.entries.find(v=>v.id===entry.id);
  if(old&&(old.body!==entry.body||(JSON.stringify(old.sentences)!==JSON.stringify(entry.sentences)&&!(canResplit(old)&&isResplit(entry)))))throw new WorkspaceError(400,'Original text is locked. Save a separate update instead.');
  if(old&&old.meta?.objectPath!==entry.meta?.objectPath)throw new WorkspaceError(400,'Original recording references are locked.');
  // v8.1: the approved version, once made in the inbox, stays as approved (like the original).
  const rev=(e:unknown)=>JSON.stringify((e as {revision?:unknown}|undefined)?.revision??null);
  if(old&&rev(old)!=='null'&&rev(old)!==rev(entry))throw new WorkspaceError(400,'The approved version is locked.');
  const before=new Map((old?.analysis?.nodes??[]).map(n=>[n.id,n.text]));
  try{verifyEntryQuotes(entry,n=>planted?.has(n.id)===true||before.get(n.id)===n.text)}catch(e){throw new WorkspaceError(400,(e as Error).message)}
  if(entry.comparison)for(const item of entry.comparison.items??[])item.verdict=migrateVerdict(item.verdict) as typeof item.verdict;
 }
 const planetIds=new Set<string>();
 for(const p of s.planets){
  if(!p||typeof p.id!=='string'||planetIds.has(p.id)||typeof p.name!=='string'||p.name.length>100||!/^#[0-9a-f]{6}$/i.test(p.color)||!Number.isFinite(p.position?.x)||!Number.isFinite(p.position?.y))throw new WorkspaceError(400,'Invalid planet.');
  planetIds.add(p.id);
 }
 if(s.chats&&(!Array.isArray(s.chats)||s.chats.length>1000||s.chats.some(c=>!c||typeof c.id!=='string'||typeof c.title!=='string'||!Array.isArray(c.messages)||!Array.isArray(c.contextIds)||c.contextIds.some(id=>!ids.has(id))||c.messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||typeof m.id!=='string'))))throw new WorkspaceError(400,'Invalid conversations or pinned references.');
 const links=(s as {links?:unknown}).links;
 if(links!==undefined&&(!Array.isArray(links)||links.length>5000||links.some(l=>!l||typeof l.id!=='string'||typeof l.from!=='string'||typeof l.to!=='string'||!['related','extends','updates','contradicts'].includes(l.relation)||typeof l.reason!=='string'||l.reason.length>300)))throw new WorkspaceError(400,'Invalid connections.');
 if(!validateNotation((s as {notation?:unknown}).notation))throw new WorkspaceError(400,'Invalid notation.');
 const forms=(s as {forms?:unknown}).forms;
 if(forms!==undefined&&(!Array.isArray(forms)||forms.length>100||forms.some(f=>!f||typeof f.id!=='string'||typeof f.name!=='string'||f.name.length>60||!Array.isArray(f.blocks)||f.blocks.length>50||f.blocks.some((b:{id?:unknown;kind?:unknown;label?:unknown})=>!b||typeof b.id!=='string'||typeof b.kind!=='string'||typeof b.label!=='string'))))throw new WorkspaceError(400,'Invalid forms.');
 return {...s,planets:s.planets.map(p=>({...p,entryCount:s.entries.filter(e=>e.planetIds.includes(p.id)).reduce((sum,e)=>sum+(e.analysis?.nodes.filter(n=>!n.empty).length??1),0)}))};
}
export async function persistWorkspace(owner:string,revision:number,store:Store,opts:{device?:string|null;conflicts?:Op[]}={}) {
 return transaction(async tx=>{
  const current=(await tx.query('select store,revision from personal_workspaces where owner_id=$1 for update',[owner])).rows[0] as {store:Store;revision:number}|undefined;
  if(!current||current.revision!==revision)throw new WorkspaceError(409,'This space changed in another tab. Your unsaved changes are protected; reload before retrying.');
  const rows=(await tx.query(`with saved as (
  update personal_workspaces set store=$3::jsonb,revision=revision+1,updated_at=now() where owner_id=$1 and revision=$2 returning revision
  ), records as (select * from jsonb_to_recordset(coalesce($3::jsonb->'notifications','[]')) as n(id text,kind text,headline text,evidence jsonb,status text,"createdAt" timestamptz)),
  written as (insert into notifications(id,owner_id,kind,headline,evidence,status,created_at)
  select records.id,$1,kind,headline,evidence,status,"createdAt" from records where exists(select 1 from saved)
  on conflict(id) do update set status=excluded.status where notifications.owner_id=$1 returning id)
  select revision from saved`,[owner,revision,json(store)])).rows as {revision:number}[];
  if(!rows.length)throw new WorkspaceError(409,'This space changed in another tab. Your unsaved changes are protected; reload before retrying.');
  await logChanges(tx,owner,current.store,store,opts);
  await enqueueProjectSparks(tx,owner,current.store,store);
  return {guestId:owner,revision:rows[0]!.revision,store};
 });
}
const locks=new Map<string,Promise<unknown>>();
export async function locked<T>(owner:string,work:()=>Promise<T>):Promise<T> {
 const before=locks.get(owner)??Promise.resolve();
 const running=before.catch(()=>{}).then(work);
 locks.set(owner,running);
 try{return await running}finally{if(locks.get(owner)===running)locks.delete(owner)}
}
