import {useCallback,useEffect,useRef,useState} from 'react';
import {getWorkspace,workspaceAction,type Workspace,type WorkspaceActionInputKind} from '@workspace/api-client-react';
import {apply as applyOps,diff,rebase,type Doc} from '@workspace/moons-sync';
import {initialStore,parseStore,withStats,type Store} from './model';
import {tr} from './i18n.ts';

export type Reply=Workspace;
export type SyncState='idle'|'saving'|'error';
type Updater=(s:Store)=>Store;

export function errMsg(e:unknown){
  const x=e as {data?:{error?:{message?:string}|string;message?:string};message?:string};
  const d=x?.data;
  return tr((typeof d?.error==='string'?d.error:d?.error?.message)??d?.message??x?.message??'Something went wrong. Please try again.');
}
const statusOf=(e:unknown)=>(e as {status?:number})?.status;

// One id per browser, recorded with each change so the log shows which device made it.
function deviceId(){
  try{let id=localStorage.getItem('moons.device');if(!id){id=crypto.randomUUID();localStorage.setItem('moons.device',id)}return id}catch{return null}
}
type OpsReply=Workspace&{conflicts:number;merged?:boolean;replayed?:boolean};
async function sendOps(body:{baseRevision:number;batchId:string;device:string|null;ops:unknown[]}):Promise<OpsReply>{
  const res=await fetch(`${import.meta.env.BASE_URL}api/workspace/ops`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Object.assign(new Error(data?.error?.message??`Request failed (${res.status})`),{status:res.status,data});
  return data as OpsReply;
}
const asDoc=(s:Store)=>s as unknown as Doc;

export function normalizeStore(raw:unknown):Store{
  try{return parseStore(JSON.stringify(raw))}catch{return withStats(initialStore())}
}

/** Server-backed workspace with one serial request queue. Failed changes stay dirty and are retried; a 409 freezes writes and protects the local copy. */
export function useWorkspace(){
  const [store,setStore]=useState<Store|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [loadError,setLoadError]=useState('');
  const [sync,setSync]=useState<SyncState>('idle');
  const [syncError,setSyncError]=useState('');
  const [conflict,setConflict]=useState(false);
  const [busy,setBusy]=useState(0);
  const [notice,setNotice]=useState('');
  const storeRef=useRef<Store|null>(null),baseRef=useRef<Store|null>(null),rawRef=useRef<Doc>({}),batch=useRef<{version:number;id:string}|null>(null),rev=useRef(0),dirty=useRef(false),version=useRef(0),queue=useRef<Promise<unknown>>(Promise.resolve()),conflictRef=useRef(false),inflight=useRef<Updater[]|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const enqueue=useCallback(<T,>(job:()=>Promise<T>):Promise<T>=>{const run=queue.current.then(job);queue.current=run.catch(()=>undefined);return run},[]);
  const apply=useCallback((next:Store)=>{storeRef.current=next;setStore(next)},[]);
  const markConflict=useCallback(()=>{conflictRef.current=true;setConflict(true);setSync('error')},[]);

  /** Send the difference between the last server copy and the current copy. The server merges it
   *  onto its latest store; edits made while the request was in flight are re-applied on top. */
  const flushJob=useCallback(async()=>{
    if(!dirty.current||conflictRef.current||!storeRef.current||!baseRef.current)return;
    const v=version.current,snap=storeRef.current,ops=rebase(diff(asDoc(baseRef.current),asDoc(snap)),rawRef.current);
    if(!ops.length){if(version.current===v)dirty.current=false;setSync('idle');return}
    if(batch.current?.version!==v)batch.current={version:v,id:crypto.randomUUID().replace(/-/g,'')};
    setSync('saving');
    try{
      const res=await sendOps({baseRevision:rev.current,batchId:batch.current.id,device:deviceId(),ops});
      rev.current=res.revision;
      rawRef.current=res.store as unknown as Doc;const server=normalizeStore(res.store);baseRef.current=server;
      const pending=version.current===v?[]:diff(asDoc(snap),asDoc(storeRef.current!));
      apply(pending.length?withStats(applyOps(asDoc(server),pending).store as unknown as Store):server);
      dirty.current=pending.length>0;
      if(res.conflicts)setNotice(tr('Some items were also changed on another device. The newer version was kept, and your edit is saved in the history.'));
      setSync(dirty.current?'saving':'idle');setSyncError('');
    }catch(e){
      if(statusOf(e)===409){markConflict();return}
      setSync('error');setSyncError(errMsg(e));throw e;
    }
  },[apply,markConflict]);

  const schedule=useCallback((delay=350)=>{
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>{enqueue(flushJob).then(()=>{if(dirty.current&&!conflictRef.current)schedule(350)},()=>{if(!conflictRef.current)schedule(5000)})},delay);
  },[enqueue,flushJob]);

  const commit=useCallback((updater:Updater)=>{
    if(!storeRef.current||conflictRef.current)return false;
    apply(withStats(updater(storeRef.current)));version.current++;dirty.current=true;inflight.current?.push(updater);schedule();return true;
  },[apply,schedule]);

  /** Flush pending edits, then run an authoritative server operation whose reply replaces the whole store. */
  const authoritative=useCallback((op:(revision:number)=>Promise<Reply>)=>{
    if(conflictRef.current)return Promise.reject(new Error(tr('This space changed elsewhere. Resolve the conflict first.')));
    setBusy(n=>n+1);
    return enqueue(async()=>{
      await flushJob();
      if(conflictRef.current)throw new Error(tr('This space changed elsewhere. Resolve the conflict first.'));
      inflight.current=[];setSync('saving');
      try{
        const res=await op(rev.current);rev.current=res.revision;
        rawRef.current=res.store as unknown as Doc;let next=normalizeStore(res.store);baseRef.current=next;const replay=inflight.current;
        for(const u of replay)next=withStats(u(next));
        dirty.current=replay.length>0;if(replay.length)version.current++;
        apply(next);if(replay.length)schedule();
        setSync(replay.length?'saving':'idle');setSyncError('');return res;
      }catch(e){
        if(statusOf(e)===409)markConflict();else setSync(dirty.current?'error':'idle');
        throw e;
      }finally{inflight.current=null}
    }).finally(()=>setBusy(n=>n-1));
  },[apply,enqueue,flushJob,markConflict,schedule]);

  const action=useCallback((kind:WorkspaceActionInputKind,payload:Record<string,unknown>)=>authoritative(revision=>workspaceAction({revision,kind,payload})),[authoritative]);
  const upload=authoritative;

  /** Queued, authoritative refresh. Failures are surfaced, never swallowed. */
  const refreshNotifications=useCallback(()=>action('refresh_notifications',{}).then(()=>true,e=>{if(statusOf(e)!==409){setSyncError(errMsg(e));setSync('error')}return false}),[action]);
  const load=useCallback(async()=>{
    setStatus('loading');setLoadError('');
    try{
      const res=await getWorkspace();rev.current=res.revision;dirty.current=false;conflictRef.current=false;setConflict(false);rawRef.current=res.store as unknown as Doc;const loaded=normalizeStore(res.store);baseRef.current=loaded;apply(loaded);setStatus('ready');setSync('idle');
      void refreshNotifications();
    }catch(e){setLoadError(errMsg(e));setStatus('error')}
  },[apply,refreshNotifications]);
  useEffect(()=>{void load();return()=>{if(timer.current)clearTimeout(timer.current)}},[load]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty.current||conflictRef.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[]);

  /** Discard the local copy and take the server's latest. */
  const reload=useCallback(()=>enqueue(async()=>{const res=await getWorkspace();rev.current=res.revision;dirty.current=false;conflictRef.current=false;setConflict(false);rawRef.current=res.store as unknown as Doc;const loaded=normalizeStore(res.store);baseRef.current=loaded;apply(loaded);setSync('idle')}),[apply,enqueue]);
  /** Explicit user choice: keep my copy and write it over the server's latest. */
  const overwrite=useCallback(()=>enqueue(async()=>{const res=await getWorkspace();rev.current=res.revision;conflictRef.current=false;setConflict(false);dirty.current=true;version.current++;await flushJob()}),[enqueue,flushJob]);
  const clearNotice=useCallback(()=>setNotice(''),[]);
  const retry=useCallback(()=>{if(dirty.current)enqueue(flushJob).catch(()=>undefined);else void refreshNotifications()},[enqueue,flushJob,refreshNotifications]);
  const getStore=useCallback(()=>storeRef.current,[]);
  return {store,status,loadError,sync,syncError,conflict,busy,notice,clearNotice,commit,action,upload,load,refreshNotifications,reload,overwrite,retry,getStore};
}
export type WorkspaceApi=ReturnType<typeof useWorkspace>;
