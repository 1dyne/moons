import {useEffect,useRef,useState} from 'react';
import {Anchor,ArrowUpRight,Check,Download,Package,Search,X} from 'lucide-react';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {DEVICE_CATALOG,installedDevices,installDevice,uninstallDevice,toggleSatellite,type SatelliteId} from '@/lib/satellites';
import {ImpostorCard} from './Impostor';
import {tr} from '@/lib/i18n';
import '../styles/satellite-market.css';

export default function Satellite({store,ws,go,artifacts}:{store:Store;ws:WorkspaceApi;go:(url:string)=>void;artifacts?:React.ReactNode}) {
  const [tab,setTab]=useState('discover'),[search,setSearch]=useState(''),[detail,setDetail]=useState<SatelliteId|null>(null);
  const installs=installedDevices(store),selected=DEVICE_CATALOG.find(d=>d.id===detail);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();},[selected]);
  const list=DEVICE_CATALOG.filter(d=>(tab!=='installed'||installs[d.id])&&`${d.name} ${tr(d.name)} ${tr(d.description)}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="page-shell satellite-market">
    <header className="market-hero"><span className="market-eyebrow">MOONS / SATELLITE</span><h1>{tr('A space for your tools')}</h1><p>{tr('Discover devices, add what you need, and make this space your own.')}</p></header>
    <div className="market-toolbar"><div className="dock-tabs" role="tablist" aria-label="Satellite">{[['discover','Discover'],['installed','My devices']].map(([id,name])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id!)}>{tr(name!)}</button>)}</div><label className="market-search"><Search size={16}/><input aria-label={tr('Find a device')} placeholder={tr('Find a device')} value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <div className="device-grid">{list.map(d=>{const install=installs[d.id];return <article className={`device-card ${d.id==='projects'?'featured':''}`} key={d.id}><div className="device-icon">{d.id==='projects'?<Anchor size={28}/>:<Package size={25}/>}</div><div className="device-meta"><span>{d.publisher} · {tr(d.category)}</span><small>v{d.version}</small></div><h2>{tr(d.name)}</h2><p>{tr(d.description)}</p><div className="device-footer"><button className="text-button" onClick={()=>setDetail(d.id)}>{tr('Device details')}</button>{install?<><span className="device-installed"><Check size={13}/>{tr(install.enabled?'Installed':'Paused')}</span>{install.enabled&&d.route!=='/satellite'&&<button className="primary small" onClick={()=>go(d.route)}>{tr('Open')}<ArrowUpRight size={14}/></button>}</>:<button className="primary small" onClick={()=>setDetail(d.id)}><Download size={14}/>{tr('Install')}</button>}</div></article>})}</div>
    {!list.length&&<p className="dock-empty">{tr('No devices here yet.')}</p>}
    {selected&&<dialog ref={dialog} onCancel={()=>setDetail(null)} aria-label={tr('Device details')} className="device-dialog"><button className="device-close" aria-label={tr('Close')} onClick={()=>setDetail(null)}><X/></button><span className="market-eyebrow">{selected.publisher} · v{selected.version}</span><h2>{tr(selected.name)}</h2><p>{tr(selected.description)}</p><h3>{tr('This device can')}</h3><ul>{selected.permissions.map(p=><li key={p}>{tr(p)}</li>)}</ul><p className="device-note">{tr('Service connections are optional and configured separately. Removing a device keeps your notes, schedules and project history.')}</p><div className="project-actions">{!installs[selected.id]||installs[selected.id]?.version!==selected.version?<button className="primary" onClick={()=>{ws.commit(s=>installDevice(s,selected.id));setDetail(null);}}>{tr(installs[selected.id]?'Update device':'Install device')}</button>:<button className="primary" onClick={()=>{ws.commit(s=>toggleSatellite(s,selected.id,!installs[selected.id]!.enabled));setDetail(null);}}>{tr(installs[selected.id]?.enabled?'Pause device':'Resume device')}</button>}{installs[selected.id]&&<button onClick={()=>{ws.commit(s=>uninstallDevice(s,selected.id));setDetail(null);}}>{tr('Remove device')}</button>}</div></dialog>}
    {tab==='installed'&&installs.impostor?.enabled&&<ImpostorCard store={store} ws={ws}/>}
    {tab==='installed'&&artifacts&&<section className="settings-card"><h2>{tr('Made by me')}</h2>{artifacts}</section>}
  </section>;
}
