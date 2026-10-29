import {transaction,json,type Driver} from '../db.ts';
import {initialWorkspace,validateStore} from './workspace-store.ts';
import {WorkspaceError,type Store} from './types.ts';

export function mergeClaim(target:Store,incoming:Store,sourceOwner:string):Store {
 const merged=structuredClone(target);
 const existing=new Map(target.entries.map(e=>[e.id,e]));
 for(const entry of incoming.entries){
  const old=existing.get(entry.id);
  if(old&&JSON.stringify(old)!==JSON.stringify(entry))throw new WorkspaceError(409,'A note ID conflicts. Originals are preserved; export both spaces before merging.');
 }
 const remap=new Map<string,string>();
 for(const p of incoming.planets){
  const old=merged.planets.find(x=>x.id===p.id);
  if(!old)merged.planets.push(structuredClone(p));
  else if(old.name!==p.name||old.color!==p.color){
   const id=`claimed-${sourceOwner}-${p.id}`;remap.set(p.id,id);
   if(!merged.planets.some(x=>x.id===id))merged.planets.push({...p,id});
  }
 }
 const additions=incoming.entries.filter(e=>!existing.has(e.id)).map(e=>{
  const copy=structuredClone(e);copy.planetIds=copy.planetIds.map(id=>remap.get(id)??id);
  if(copy.analysis)copy.analysis.suggestedPlanets=copy.analysis.suggestedPlanets.map(id=>remap.get(id)??id);
  return copy;
 });
 merged.entries=[...merged.entries,...additions];
 const combine=<T extends {id:string}>(a:T[]=[],b:T[]=[])=>{
  for(const item of b){const prior=a.find(v=>v.id===item.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(item))throw new WorkspaceError(409,'A record ID conflicts. Nothing has been overwritten.')}
  return [...a,...b.filter(v=>!a.some(x=>x.id===v.id))];
 };
 merged.chats=combine(merged.chats,incoming.chats);
 merged.notifications=combine(merged.notifications,incoming.notifications);
 merged.satellites=combine(merged.satellites as {id:string}[]|undefined,incoming.satellites as {id:string}[]|undefined);
 return validateStore(merged,target);
}
export async function claimWorkspace(user:string,email:string,source:string) {
 return transaction(async driver=>{
  const query=async<T=Record<string,unknown>>(sql:string,params:unknown[]=[])=> (await driver.query(sql,params)).rows as T[];
  await query('insert into users(id,email) values($1,$2) on conflict(id) do update set email=excluded.email',[user,email]);
  // Lock the account first, serializing claims across processes and devices.
  await query('select id from users where id=$1 for update',[user]);
  const g=(await query<{user_id:string|null}>('select user_id from guests where id=$1 for update',[source]))[0];
  if(!g||g.user_id&&g.user_id!==user)throw new WorkspaceError(403,'This guest does not belong to this account.');
  let target=(await query<{owner_id:string}>('select owner_id from user_workspaces where user_id=$1',[user]))[0]?.owner_id;
  if(target&&g.user_id===user&&(await query('select source_owner from claimed_workspace_snapshots where user_id=$1 and source_owner=$2',[user,source])).length){
   const row=(await query<{store:Store}>('select store from personal_workspaces where owner_id=$1',[target]))[0];
   return {ownerId:target,claimed:true,entries:row?.store.entries.length??0};
  }
  const snapshot=async(owner:string)=>{
   await query('insert into personal_workspaces(owner_id,store) values($1,$2::jsonb) on conflict do nothing',[owner,json(initialWorkspace())]);
   return (await query<{store:Store;revision:number}>('select store,revision from personal_workspaces where owner_id=$1 for update',[owner]))[0]!;
  };
  if(!target){target=source;await query('insert into user_workspaces(user_id,owner_id) values($1,$2)',[user,target])}
  // Deterministic row-lock order for multi-guest claims.
  const owners=[...new Set([source,target])].sort();
  const states=new Map<string,{store:Store;revision:number}>();
  for(const id of owners)states.set(id,await snapshot(id));
  const incoming=states.get(source)!,current=states.get(target)!;
  await query('insert into claimed_workspace_snapshots(user_id,source_owner,store) values($1,$2,$3::jsonb) on conflict do nothing',[user,source,json(incoming.store)]);
  const merged=source===target?current.store:mergeClaim(current.store,incoming.store,source);
  await query('update guests set user_id=$1 where id=$2',[user,source]);
  await query('update personal_workspaces set store=$2::jsonb,revision=revision+1,updated_at=now() where owner_id=$1',[target,json(merged)]);
  // Revoke in-flight anonymous saves without deleting any source data.
  if(source!==target)await query('update personal_workspaces set revision=revision+1 where owner_id=$1',[source]);
  await query('update notifications set owner_id=$1 where owner_id=$2',[target,source]);
  if(source!==target){
   const clashes=await query('select 1 from connected_projects a join connected_projects b on a.id=b.id where a.owner_id=$1 and b.owner_id=$2',[source,target]);
   if(clashes.length)throw new WorkspaceError(409,'A project ID conflicts. Nothing has been overwritten.');
   for(const table of ['connected_projects','project_proposals','project_jobs','project_events','project_connections','satellite_tokens','satellite_records','inbox_items','oauth_tokens','oauth_codes'])await query(`update ${table} set owner_id=$1 where owner_id=$2`,[target,source]);
   await query("update project_jobs set state='queued',lease=null,attempts=0,available_at=now() where owner_id=$1 and state='running'",[target]);
   const incomingSats=(incoming.store.settings as {satellites?:string[]}|undefined)?.satellites;
   if(incomingSats?.includes('projects')){
    const settings=merged.settings as {satellites?:string[]}|undefined;
    merged.settings={...merged.settings,satellites:[...new Set([...(settings?.satellites??[]),'projects'])]} as Store['settings'];
    await query('update personal_workspaces set store=$2::jsonb where owner_id=$1',[target,json(merged)]);
   }
  }
  return {ownerId:target,claimed:true,entries:merged.entries.length};
 });
}
export async function ownsRecording(owner:string,path:string) {
 const storedOwner=/(?:^|[/:])moons\/([a-f0-9-]{36})\//.exec(path)?.[1];
 if(!storedOwner)return false;
 if(storedOwner===owner)return true;
 const {q}=await import('../db.ts');
 return !!(await q(`select a.id from guests a join guests b on a.user_id=b.user_id where a.id=$1 and b.id=$2 and a.user_id is not null`,[owner,storedOwner])).length;
}
