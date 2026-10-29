import {randomBytes} from 'node:crypto';
import {q,json,newId} from '../db.ts';
import {WorkspaceError,type Entry,type Store} from './types.ts';

// Team spaces (spec 9.2): the team shares originals; each member writes their own understanding
// privately and only what they press "Share with team" on becomes visible to the team.
export const TEAM_TABLES=[
 `create table if not exists teams(id text primary key,name text not null,created_by text not null,created_at timestamptz default now())`,
 `create table if not exists team_members(team_id text not null,user_id text not null,display_name text not null,role text not null default 'member',joined_at timestamptz default now(),primary key(team_id,user_id))`,
 `create table if not exists team_invites(token text primary key,team_id text not null,created_by text not null,created_at timestamptz default now(),used_by text,used_at timestamptz)`,
 `create table if not exists team_originals(id text primary key,team_id text not null,added_by text not null,title text not null,body text not null,sentences jsonb not null,created_at timestamptz default now())`,
 `create table if not exists team_shares(id text primary key,team_id text not null,original_id text not null,user_id text not null,entry_id text not null,snapshot jsonb not null,created_at timestamptz default now(),unique(team_id,original_id,user_id))`,
];

async function member(teamId:string,user:string){
 const row=(await q<{role:string}>('select role from team_members where team_id=$1 and user_id=$2',[teamId,user]))[0];
 if(!row)throw new WorkspaceError(403,'You are not a member of this team.');
 return row.role;
}
const name=(s:unknown,max:number)=>typeof s==='string'&&s.trim()?s.trim().slice(0,max):'';

export async function createTeam(user:string,displayName:string,input:{name?:unknown}){
 const n=name(input.name,60);if(!n)throw new WorkspaceError(400,'Name the team.');
 const id=newId();
 await q('insert into teams(id,name,created_by) values($1,$2,$3)',[id,n,user]);
 await q(`insert into team_members(team_id,user_id,display_name,role) values($1,$2,$3,'owner')`,[id,user,displayName]);
 return {id,name:n};
}
export async function myTeams(user:string){
 return q<{id:string;name:string;role:string;members:number}>(`select t.id,t.name,m.role,(select count(*)::int from team_members x where x.team_id=t.id) members
  from teams t join team_members m on m.team_id=t.id where m.user_id=$1 order by t.created_at desc`,[user]);
}
/** One-use invite link. Anyone signed in with the link can join once; the owner shares it themselves. */
export async function invite(user:string,teamId:string){
 await member(teamId,user);
 const token=randomBytes(18).toString('base64url');
 await q('insert into team_invites(token,team_id,created_by) values($1,$2,$3)',[token,teamId,user]);
 return {token};
}
export async function join(user:string,displayName:string,token:string){
 const row=(await q<{team_id:string}>(`update team_invites set used_by=$2,used_at=now() where token=$1 and used_at is null and created_at>now()-interval '14 days' returning team_id`,[token,user]))[0];
 if(!row)throw new WorkspaceError(404,'This invite link is used or expired. Ask for a new one.');
 await q(`insert into team_members(team_id,user_id,display_name) values($1,$2,$3) on conflict do nothing`,[row.team_id,user,displayName]);
 return {teamId:row.team_id};
}

export async function addOriginal(user:string,teamId:string,input:{title?:unknown;text?:unknown}){
 await member(teamId,user);
 const text=typeof input.text==='string'?input.text.trim().slice(0,100000):'';
 if(!text)throw new WorkspaceError(400,'Paste the original text.');
 const sentences=text.match(/[^\n.!?。！？]+(?:[.!?。！？]+|$)/gu)?.map(s=>s.trim()).filter(Boolean)??[text];
 const id=newId(),title=name(input.title,120)||text.slice(0,40);
 await q('insert into team_originals(id,team_id,added_by,title,body,sentences) values($1,$2,$3,$4,$5,$6::jsonb)',[id,teamId,user,title,text,json(sentences)]);
 return {id,title};
}

/** Copy a team original into the member's own space as a locked original (material). */
export async function takeOriginal(user:string,teamId:string,originalId:string,store:Store){
 await member(teamId,user);
 const o=(await q<{id:string;title:string;body:string;sentences:string[]}>('select id,title,body,sentences from team_originals where id=$1 and team_id=$2',[originalId,teamId]))[0];
 if(!o)throw new WorkspaceError(404,'Original not found.');
 const existing=store.entries.find(e=>e.meta?.teamOriginalId===o.id);
 if(existing)return {entryId:existing.id};
 const entry:Entry={id:newId(),kind:'media',mediaType:'custom',title:o.title,body:o.body,sentences:o.sentences,planetIds:[],createdAt:new Date().toISOString(),locked:true,status:'saved',
  anchors:o.sentences.map(()=>({kind:'none'})),meta:{source:'Team original',teamId,teamOriginalId:o.id}};
 store.entries.unshift(entry);
 return {entryId:entry.id};
}

/** Share my answer about a team original: a snapshot of my words and my comparison against it. */
export async function shareAnswer(user:string,teamId:string,entryId:unknown,store:Store){
 await member(teamId,user);
 const entry=store.entries.find(e=>e.id===entryId);
 const material=entry?.comparison?store.entries.find(e=>e.id===entry.comparison!.materialEntryId):undefined;
 const originalId=material?.meta?.teamOriginalId;
 if(!entry||!entry.comparison||typeof originalId!=='string')throw new WorkspaceError(400,'Compare your note with the team original first.');
 if(!(await q('select 1 from team_originals where id=$1 and team_id=$2',[originalId,teamId])).length)throw new WorkspaceError(400,'That original belongs to another team.');
 const snapshot={body:entry.body,sentences:entry.sentences,summary:entry.comparison.summary,items:entry.comparison.items.map(i=>({answer:i.answer,verdict:i.verdict,original:i.original,note:i.note,shiftType:i.shiftType??null}))};
 const id=newId();
 await q(`insert into team_shares(id,team_id,original_id,user_id,entry_id,snapshot) values($1,$2,$3,$4,$5,$6::jsonb)
  on conflict(team_id,original_id,user_id) do update set entry_id=excluded.entry_id,snapshot=excluded.snapshot,created_at=now()`,[id,teamId,originalId,user,entry.id,json(snapshot)]);
 return {originalId};
}
export async function unshare(user:string,teamId:string,originalId:string){
 await member(teamId,user);
 await q('delete from team_shares where team_id=$1 and original_id=$2 and user_id=$3',[teamId,originalId,user]);
}

/** What a member sees: names, originals, and only the shared snapshots. Never anyone's workspace. */
export async function teamView(user:string,teamId:string){
 const role=await member(teamId,user);
 const team=(await q<{id:string;name:string}>('select id,name from teams where id=$1',[teamId]))[0]!;
 const members=await q<{user_id:string;display_name:string;role:string}>('select user_id,display_name,role from team_members where team_id=$1 order by joined_at',[teamId]);
 const originals=await q<{id:string;title:string;body:string;sentences:string[];created_at:string}>('select id,title,body,sentences,created_at::text from team_originals where team_id=$1 order by created_at desc',[teamId]);
 const shares=await q<{original_id:string;user_id:string;snapshot:unknown;created_at:string}>('select original_id,user_id,snapshot,created_at::text from team_shares where team_id=$1',[teamId]);
 const label=new Map(members.map((m,i)=>[m.user_id,m.display_name||`Member ${i+1}`]));
 return {id:team.id,name:team.name,role,me:label.get(user)??'',
  members:members.map(m=>({name:label.get(m.user_id),role:m.role,me:m.user_id===user})),
  originals:originals.map(o=>({id:o.id,title:o.title,body:o.body,sentences:o.sentences,createdAt:o.created_at,
   shares:shares.filter(s=>s.original_id===o.id).map(s=>({member:label.get(s.user_id),me:s.user_id===user,snapshot:s.snapshot,sharedAt:s.created_at}))}))};
}
