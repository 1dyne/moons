import {apply,type Op} from '@workspace/moons-sync';
import {q} from '../db.ts';
import {loadWorkspace,persistWorkspace,validateStore} from './workspace-store.ts';
import {WorkspaceError,type Store} from './types.ts';

export type DeviceChanges={baseRevision:number;batchId:string;device:string|null;ops:Op[]};
const OP_KINDS=new Set(['upsert','remove','order','set']);

export function parseOps(body:unknown):DeviceChanges{
 const b=body as {baseRevision?:unknown;batchId?:unknown;device?:unknown;ops?:unknown};
 if(!Number.isInteger(b?.baseRevision)||typeof b.batchId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(b.batchId)||!Array.isArray(b.ops)||b.ops.length>5000)throw new WorkspaceError(400,'Invalid workspace changes.');
 for(const op of b.ops as Op[]){
  if(!op||!OP_KINDS.has(op.kind))throw new WorkspaceError(400,'Invalid workspace change.');
  if(op.kind==='set'?typeof op.field!=='string'||op.field==='version':typeof op.col!=='string')throw new WorkspaceError(400,'Invalid workspace change.');
  if((op.kind==='upsert'||op.kind==='remove')&&(typeof op.id!=='string'||(op.kind==='upsert'&&(op.value as {id?:unknown})?.id!==op.id)))throw new WorkspaceError(400,'Invalid workspace change.');
 }
 return {baseRevision:b.baseRevision as number,batchId:b.batchId,device:typeof b.device==='string'?b.device.slice(0,64):null,ops:b.ops as Op[]};
}

/** Per-item changes from a device. Edits to different items merge onto the latest store; an op whose
 *  item changed elsewhere since the device's copy loses to the newer value and is kept in the event
 *  log. A repeated batchId returns the current state without applying it again. Call inside locked(). */
export type DeviceReply={guestId:string;revision:number;store:Store;conflicts:number;merged?:boolean;replayed?:boolean};
export async function applyDeviceChanges(owner:string,input:DeviceChanges):Promise<DeviceReply>{
 const current=await loadWorkspace(owner);
 if((await q('select 1 from workspace_batches where owner_id=$1 and batch_id=$2',[owner,input.batchId])).length)return {guestId:owner,...current,conflicts:0,replayed:true};
 const merged=apply(current.store as Record<string,unknown>,input.ops);
 const store=validateStore(merged.store as Store,current.store);
 const saved=await persistWorkspace(owner,current.revision,store,{device:input.device,conflicts:merged.conflicts});
 await q('insert into workspace_batches(owner_id,batch_id,revision) values($1,$2,$3) on conflict do nothing',[owner,input.batchId,saved.revision]);
 return {...saved,conflicts:merged.conflicts.length,merged:current.revision!==input.baseRevision};
}
