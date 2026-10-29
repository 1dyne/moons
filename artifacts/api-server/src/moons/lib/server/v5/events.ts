import {diff,eventType,type Doc,type Op} from '@workspace/moons-sync';
import {json,type Driver} from '../db.ts';

// Append-only change log for personal workspaces. Every persisted change becomes
// rows here; the store row in personal_workspaces is the snapshot after the last row.
export const EVENT_TABLES=[
 `create table if not exists workspace_events(seq bigserial primary key,owner_id text not null,at timestamptz not null default now(),device text,type text not null,item text,payload jsonb not null)`,
 `create index if not exists workspace_events_owner on workspace_events(owner_id,seq)`,
 `create table if not exists workspace_batches(owner_id text not null,batch_id text not null,revision integer not null,created_at timestamptz default now(),primary key(owner_id,batch_id))`,
];

type Row={type:string;item:string|null;payload:unknown;at:string|null};
const itemOf=(op:Op)=>op.kind==='set'?null:op.kind==='order'?null:op.id;
const createdAt=(op:Op)=>op.kind==='upsert'&&op.base===null&&op.value&&typeof (op.value as {createdAt?:unknown}).createdAt==='string'?(op.value as {createdAt:string}).createdAt:null;

async function insert(tx:Driver,owner:string,device:string|null,rows:Row[]){
 if(!rows.length)return;
 await tx.query(`insert into workspace_events(owner_id,at,device,type,item,payload)
  select $1,coalesce(r.at,now()),$2,r.type,r.item,r.payload from jsonb_to_recordset($3::jsonb) as r(at timestamptz,type text,item text,payload jsonb)`,
  [owner,device,json(rows)]);
}

/** Log the change from `before` to `after`. The first time an owner is logged, their existing
 *  store is recorded as a baseline (items dated by their own createdAt) so replay starts complete. */
export async function logChanges(tx:Driver,owner:string,before:Doc,after:Doc,opts:{device?:string|null;conflicts?:Op[]}={}){
 const device=opts.device??null;
 const seen=(await tx.query('select 1 from workspace_events where owner_id=$1 limit 1',[owner])).rows.length>0;
 if(!seen)await insert(tx,owner,'baseline',diff({},before).map(op=>({type:eventType(op),item:itemOf(op),payload:op,at:createdAt(op)})));
 const rows:Row[]=diff(before,after).map(op=>({type:eventType(op),item:itemOf(op),payload:op,at:null}));
 // A conflicting op lost to a newer edit from another device. Keep it so nothing is lost.
 for(const op of opts.conflicts??[])rows.push({type:'conflict.kept_newer',item:itemOf(op),payload:op,at:null});
 await insert(tx,owner,device,rows);
}
