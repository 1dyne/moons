import {randomBytes} from 'node:crypto';
import {q,json} from '../db.ts';
import {loadWorkspace} from './workspace-store.ts';
import {WorkspaceError,type Entry,type Store} from './types.ts';

// Read-only share links. A link names notes and which parts to show; the page is built from the
// owner's current workspace on each visit, so turning a link off takes effect immediately.
export const SHARE_TABLES=[
 `create table if not exists share_links(token text primary key,owner_id text not null,title text not null,entry_ids jsonb not null,include jsonb not null,created_at timestamptz default now(),revoked_at timestamptz)`,
 `create index if not exists share_links_owner on share_links(owner_id)`,
];
export const SHARE_PARTS=['original','quotes','comparison','emotions','history','confidence','links','memos'] as const;
type Part=typeof SHARE_PARTS[number];
type Row={token:string;title:string;entry_ids:string[];include:Part[];created_at:string;revoked_at:string|null};

export async function createShare(owner:string,input:{title?:unknown;entryIds?:unknown;include?:unknown}){
 const store=(await loadWorkspace(owner)).store;
 const ids=Array.isArray(input.entryIds)?input.entryIds.filter((x):x is string=>typeof x==='string'&&store.entries.some(e=>e.id===x)).slice(0,100):[];
 if(!ids.length)throw new WorkspaceError(400,'Choose at least one of your notes to share.');
 const include=Array.isArray(input.include)?input.include.filter((x):x is Part=>SHARE_PARTS.includes(x as Part)):['original'];
 const title=typeof input.title==='string'&&input.title.trim()?input.title.trim().slice(0,120):'MOONS';
 if((await q<{n:number}>('select count(*)::int n from share_links where owner_id=$1 and revoked_at is null',[owner]))[0]!.n>=200)throw new WorkspaceError(429,'Too many active share links. Turn some off first.');
 const token=randomBytes(18).toString('base64url');
 await q('insert into share_links(token,owner_id,title,entry_ids,include) values($1,$2,$3,$4::jsonb,$5::jsonb)',[token,owner,title,json(ids),json(include)]);
 return {token,title,entryIds:ids,include};
}
export async function listShares(owner:string){
 return (await q<Row>('select token,title,entry_ids,include,created_at::text,revoked_at::text from share_links where owner_id=$1 order by created_at desc limit 200',[owner]))
  .map(r=>({token:r.token,title:r.title,entryIds:r.entry_ids,include:r.include,createdAt:r.created_at,active:!r.revoked_at}));
}
export async function revokeShare(owner:string,token:string){
 const rows=await q('update share_links set revoked_at=now() where owner_id=$1 and token=$2 and revoked_at is null returning token',[owner,token]);
 if(!rows.length)throw new WorkspaceError(404,'Share link not found.');
}

/** Public view: only the chosen notes and parts. Never the owner id, other notes, chats or settings. */
export async function readShare(token:string){
 if(!/^[A-Za-z0-9_-]{20,40}$/.test(token))throw new WorkspaceError(404,'This link is not available.');
 const row=(await q<Row&{owner_id:string}>('select token,owner_id,title,entry_ids,include,created_at::text,revoked_at::text from share_links where token=$1',[token]))[0];
 if(!row||row.revoked_at)throw new WorkspaceError(404,'This link is not available.');
 const store=(await loadWorkspace(row.owner_id)).store,inc=new Set(row.include);
 const shared=new Set(row.entry_ids);
 const notes=row.entry_ids.map(id=>store.entries.find(e=>e.id===id)).filter((e):e is Entry=>!!e).map(e=>shareNote(store,e,inc,shared));
 return {title:row.title,createdAt:row.created_at,notes};
}
function shareNote(store:Store,e:Entry,inc:Set<Part>,shared:Set<string>){
 const nodes=e.analysis?.nodes??[];
 const children=store.entries.filter(x=>x.parentEntryId===e.id);
 const confidence=((store.confidence as {targetId:string;value:number;at:string}[]|undefined)??[]).filter(c=>c.targetId===e.id);
 const links=((store.links as {from:string;to:string;relation:string;reason:string}[]|undefined)??[]).filter(l=>(l.from===e.id&&shared.has(l.to))||(l.to===e.id&&shared.has(l.from)));
 return {
  id:e.id,title:e.title??e.body.slice(0,60),createdAt:e.createdAt,
  ...(inc.has('original')?{body:e.body}:{}),
  ...(inc.has('quotes')&&e.comparison?{quotes:e.comparison.quotes,materialTitle:e.comparison.materialTitle}:{}),
  ...(inc.has('comparison')&&e.comparison?{comparison:{summary:e.comparison.summary,items:e.comparison.items.map(i=>({verdict:i.verdict,note:i.note,shiftType:i.shiftType??null,answer:i.answer}))},sentences:e.sentences}:{}),
  ...(inc.has('emotions')?{emotions:nodes.flatMap(n=>(n.emotions??[]).map(x=>({word:x.word,family:x.family,intensity:x.intensity})))}:{}),
  ...(inc.has('history')?{updates:children.filter(c=>c.relation==='updates').map(c=>({body:c.body,createdAt:c.createdAt}))}:{}),
  ...(inc.has('memos')?{memos:children.filter(c=>c.meta?.memo).map(c=>({body:c.body,createdAt:c.createdAt}))}:{}),
  ...(inc.has('confidence')?{confidence:confidence.map(c=>({value:c.value,at:c.at}))}:{}),
  ...(inc.has('links')?{links:links.map(l=>({to:l.from===e.id?l.to:l.from,relation:l.relation,reason:l.reason}))}:{}),
 };
}

/** The owner's change log, oldest first, for in-app replay. */
export async function readEvents(owner:string,after:number,limit:number){
 const rows=await q<{seq:string;at:string;type:string;payload:unknown}>('select seq::text,at::text,type,payload from workspace_events where owner_id=$1 and seq>$2 order by seq limit $3',[owner,after,limit]);
 return {events:rows.map(r=>({seq:Number(r.seq),at:r.at,type:r.type,op:r.payload})),next:rows.length===limit?Number(rows.at(-1)!.seq):null};
}
