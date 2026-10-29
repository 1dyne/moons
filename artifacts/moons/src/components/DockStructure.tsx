import {useState} from 'react';
import {Plus,X} from 'lucide-react';
import type {ConnectedProject} from '@workspace/moons-sync/projects';
import {projectStructure} from '@/lib/dock-structure';
import type {ProjectHubApi} from '@/lib/project-client';
import type {Store} from '@/lib/model';
import ElkMap from './ElkMap';
import {tr} from '@/lib/i18n';

export default function DockStructure({p,hub,store,go}:{p:ConnectedProject;hub:ProjectHubApi;store:Store;go:(url:string)=>void}){
  const {nodes,edges,groups,open}=projectStructure(p,hub.data.connections??[],store);
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[label,setLabel]=useState('');
  const save=(links:NonNullable<ConnectedProject['links']>)=>hub.request(`/${p.id}`,{...p,links},'PUT').catch(()=>undefined);
  const name=(id:string)=>nodes.find(n=>n.id===id)?.label??id;
  function select(id:string){const url=open.get(id);if(!url)return;if(url.startsWith('/'))go(url);else window.open(url,'_blank','noopener,noreferrer')}
  return <section className="settings-card dock-structure"><h2>{tr('Project structure')}</h2>
    {nodes.length>1?<ElkMap label={tr('Project structure')} nodes={nodes} edges={edges} groups={groups} direction="RIGHT" select={select}/>:<p className="dock-empty">—</p>}
    {(p.links??[]).length>0&&<ul className="dock-links">{p.links!.map(l=><li key={l.id}><span>{name(l.from)}</span><small>{l.label||'—'}</small><span>{name(l.to)}</span><button aria-label={tr('Remove')} disabled={hub.busy} onClick={()=>void save(p.links!.filter(x=>x.id!==l.id))}><X size={13}/></button></li>)}</ul>}
    {nodes.length>2&&<form className="dock-link-form" onSubmit={e=>{e.preventDefault();if(!from||!to||from===to)return;void save([...(p.links??[]),{id:crypto.randomUUID(),from,to,label:label.trim()}]).then(r=>{if(r){setFrom('');setTo('');setLabel('')}})}}>
      <select aria-label={tr('From')} value={from} onChange={e=>setFrom(e.target.value)}><option value="">{tr('From')}</option>{nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select>
      <input aria-label={tr('Line label')} placeholder={tr('e.g. calls')} value={label} maxLength={40} onChange={e=>setLabel(e.target.value)}/>
      <select aria-label={tr('To')} value={to} onChange={e=>setTo(e.target.value)}><option value="">{tr('To')}</option>{nodes.filter(n=>n.id!==from).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select>
      <button disabled={hub.busy||!from||!to} aria-label={tr('Add line')}><Plus size={16}/></button></form>}
  </section>;
}
