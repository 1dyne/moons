import {useState} from 'react';
import {Check,Plus} from 'lucide-react';
import Modal from '../Modal';
import {tr} from '@/lib/i18n';
import {colorOf,planetTree,withAncestors} from '@/lib/planets';
import {uid,type Planet,type Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';

const COLORS=['#5b86f0','#b8c94a','#f07c4b','#e8558c','#4fb884','#9b7be0','#e0b44f','#5bb8c9'];

/** v9 4.8: choosing a child includes its parents (shown as "자동"); only the chosen ones are stored. */
export default function PlanetPicker({store,ws,value,save,close}:{store:Store;ws:WorkspaceApi;value:string[];save:(ids:string[])=>void;close:()=>void}){
  const [ids,setIds]=useState(value),[adding,setAdding]=useState<{parent?:string}|null>(null),[name,setName]=useState('');
  const all=withAncestors(ids,store.planets);
  const tree=planetTree(store.planets);
  function create(){const n=name.trim();if(!n)return;const parent=adding?.parent?store.planets.find(p=>p.id===adding.parent):undefined;
    const p:Planet={id:uid(),name:n,color:parent?colorOf(parent,store.planets):COLORS[store.planets.length%COLORS.length]!,position:{x:20+Math.random()*60,y:25+Math.random()*50},entryCount:0,openSignalRatio:0,...(parent?{parentId:parent.id}:{})};
    if(ws.commit(s=>({...s,planets:[...s.planets,p]}))){setIds([...ids,p.id]);setAdding(null);setName('')}}
  return <Modal title={tr('Mother planets')} close={close}>
    <div className="planet-tree">{tree.map(p=>{const on=ids.includes(p.id),auto=!on&&all.includes(p.id);
      return <div key={p.id} className="pt-row" style={{paddingLeft:8+p.depth*22}}>
        <button className={`pt-pick ${on?'on':''} ${auto?'auto':''}`} aria-pressed={on} onClick={()=>setIds(on?ids.filter(x=>x!==p.id):[...ids,p.id])}><i style={{background:colorOf(p,store.planets)}}/>{p.name}{auto&&<small>{tr('Auto')}</small>}{on&&<Check size={15}/>}</button>
        <button className="icon-button tiny" aria-label={tr('Add a child planet')} title={tr('Add a child planet')} onClick={()=>{setAdding({parent:p.id});setName('')}}><Plus size={13}/></button>
      </div>})}</div>
    {adding?<form className="pt-new" onSubmit={e=>{e.preventDefault();create()}}><input autoFocus aria-label={tr('Planet name')} placeholder={adding.parent?tr('Child of {name}',{name:store.planets.find(p=>p.id===adding.parent)?.name??''}):tr('Planet name')} value={name} onChange={e=>setName(e.target.value)} maxLength={40}/><button className="primary small">{tr('Add')}</button><button type="button" className="text-button" onClick={()=>setAdding(null)}>{tr('Cancel')}</button></form>
      :<button className="text-button" onClick={()=>setAdding({})}><Plus size={14}/>{tr('New planet')}</button>}
    <div className="modal-actions"><span className="muted">{ids.length?tr('{n} chosen',{n:ids.length}):tr('Dwarf planet')}</span><button className="primary" onClick={()=>save(ids)}>{tr('Save')}<Check size={16}/></button></div>
  </Modal>;
}
