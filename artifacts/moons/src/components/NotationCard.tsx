import {useState} from 'react';
import {Check,Plus,Sparkles,Trash2} from 'lucide-react';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {formsOf} from '@/lib/forms';
import {examples,newNotation,notationRoles,roleInfo,type Notation} from '@/lib/notation';
import Modal from './Modal';
import {tr} from '@/lib/i18n';

type Scope='all'|`planet:${string}`|`form:${string}`;
const scopeOf=(n:Notation):Scope=>n.scope?.planetIds?.[0]?`planet:${n.scope.planetIds[0]}`:n.scope?.formIds?.[0]?`form:${n.scope.formIds[0]}`:'all';
const withScope=(n:Notation,s:Scope):Notation=>{const {scope:_,...rest}=n;return s==='all'?rest:s.startsWith('planet:')?{...rest,scope:{planetIds:[s.slice(7)]}}:{...rest,scope:{formIds:[s.slice(5)]}}};

/** Settings: my symbols. Each row can be edited, re-scoped or removed at any time. */
export function NotationCard({store,ws,notify}:{store:Store;ws:WorkspaceApi;notify:(m:string)=>void}){
  const list=store.notation??[];
  const save=(next:Notation[])=>ws.commit(s=>({...s,notation:next}));
  const patch=(id:string,p:(n:Notation)=>Notation)=>save(list.map(n=>n.id===id?p(n):n));
  function addExamples(){const have=new Set(list.map(n=>n.symbol));const add=examples().filter(n=>!have.has(n.symbol));if(save([...list,...add]))notify(add.length?tr('Added {n} example symbols. Edit them to fit you.',{n:add.length}):tr('The examples are already in your list.'))}
  return <section className="settings-card notation-card"><h2>{tr('My symbols')}</h2>
    
    {list.length>0&&<div className="notation-rows">{list.map(n=><NotationRow key={n.id} n={n} store={store} change={p=>patch(n.id,p)} remove={()=>save(list.filter(x=>x.id!==n.id))}/>)}</div>}
    <div className="settings-actions"><button className="secondary small" onClick={()=>save([...list,newNotation()])}><Plus size={14}/>{tr('Add a symbol')}</button><button className="text-button" onClick={addExamples}><Sparkles size={14}/>{tr('Add 6 examples')}</button></div>
  </section>;
}

function NotationRow({n,store,change,remove}:{n:Notation;store:Store;change:(p:(n:Notation)=>Notation)=>void;remove:()=>void}){
  return <div className="notation-row">
    <input className="sym" aria-label={tr('Symbol')} placeholder="[ctrl+F]" value={n.symbol} maxLength={40} onChange={e=>change(x=>({...x,symbol:e.target.value}))}/>
    <input className="meaning" aria-label={tr('Meaning')} placeholder={tr('What it means to you')} value={n.meaning} maxLength={300} onChange={e=>change(x=>({...x,meaning:e.target.value}))}/>
    <select aria-label={tr('What MOONS should do')} value={n.role} title={roleInfo[n.role].hint} onChange={e=>change(x=>({...x,role:e.target.value as Notation['role']}))}>{notationRoles.map(r=><option key={r} value={r}>{roleInfo[r].label}</option>)}</select>
    <select aria-label={tr('Where it applies')} value={scopeOf(n)} onChange={e=>change(x=>withScope(x,e.target.value as Scope))}>
      <option value="all">{tr('Everywhere')}</option>
      <optgroup label={tr('Mother planet')}>{store.planets.map(p=><option key={p.id} value={`planet:${p.id}`}>{p.name}</option>)}</optgroup>
      {formsOf(store).length>0&&<optgroup label={tr('Form')}>{formsOf(store).map(f=><option key={f.id} value={`form:${f.id}`}>{f.name}</option>)}</optgroup>}
    </select>
    <button className="icon-button" aria-label={tr('Delete {name}',{name:n.symbol||tr('symbol')})} onClick={remove}><Trash2 size={14}/></button>
  </div>;
}

/** After a dump with a legend line, offer the new symbols. Nothing is added until the user saves. */
export function LegendSuggest({found,save,close}:{found:Notation[];save:(n:Notation[])=>void;close:()=>void}){
  const [rows,setRows]=useState(found),[keep,setKeep]=useState<Set<string>>(new Set(found.map(f=>f.id)));
  const toggle=(id:string)=>setKeep(k=>{const n=new Set(k);if(n.has(id))n.delete(id);else n.add(id);return n});
  return <Modal title={tr('Add these to my symbols?')} close={close}><div className="legend-suggest">
    
    {rows.map(r=><div key={r.id} className={`notation-row ${keep.has(r.id)?'':'off'}`}>
      <input type="checkbox" aria-label={tr('Keep')} checked={keep.has(r.id)} onChange={()=>toggle(r.id)}/>
      <input className="sym" aria-label={tr('Symbol')} value={r.symbol} onChange={e=>setRows(x=>x.map(y=>y.id===r.id?{...y,symbol:e.target.value}:y))}/>
      <input className="meaning" aria-label={tr('Meaning')} value={r.meaning} onChange={e=>setRows(x=>x.map(y=>y.id===r.id?{...y,meaning:e.target.value}:y))}/>
      <select aria-label={tr('What MOONS should do')} value={r.role} onChange={e=>setRows(x=>x.map(y=>y.id===r.id?{...y,role:e.target.value as Notation['role']}:y))}>{notationRoles.map(o=><option key={o} value={o}>{roleInfo[o].label}</option>)}</select>
    </div>)}
    <div className="modal-actions"><button className="secondary" onClick={close}>{tr('Not now')}</button><button className="primary" disabled={!keep.size} onClick={()=>save(rows.filter(r=>keep.has(r.id)&&r.symbol.trim()))}><Check size={15}/>{tr('Save to my symbols')}</button></div>
  </div></Modal>;
}
