import {Pin} from 'lucide-react';
import {tr} from '@/lib/i18n';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {railSatellites} from './Rail';

/** v9 9.3: which Satellites sit on the rail, in order. */
export default function SatellitePins({store,ws}:{store:Store;ws:WorkspaceApi}){
  const all=railSatellites(store,true),on=railSatellites(store).map(s=>s.id);
  if(!all.length)return null;
  const set=(ids:string[])=>ws.commit(s=>({...s,settings:{...(s.settings!),pinnedSatellites:ids}}));
  return <section className="page-shell sat-pins"><h2>{tr('On the rail')}</h2><div className="ob-chips">{all.map(s=>{const pinned=on.includes(s.id);
    return <button key={s.id} className={`chip ${pinned?'on':''}`} aria-pressed={pinned} onClick={()=>set(pinned?on.filter(x=>x!==s.id):[...on,s.id])}><Pin size={13}/>{s.name}</button>})}</div></section>;
}
