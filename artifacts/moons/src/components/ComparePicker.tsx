import {useState} from 'react';
import {ArrowRight,FileText,LoaderCircle} from 'lucide-react';
import type {Entry,Store} from '@/lib/model';
import Modal from './Modal';
import {tr} from '@/lib/i18n';

const label=(e:Entry)=>e.title||e.body.slice(0,40)||tr('Untitled');

/** Choose the primary original (what was actually said) and up to two supporting ones (summaries, other minutes). */
export default function ComparePicker({store,entry,busy,compare,close}:{store:Store;entry:Entry;busy:boolean;compare:(primary:string,extra:string[])=>void;close:()=>void}){
  const originals=store.entries.filter(e=>e.kind==='media'&&e.id!==entry.id);
  const [primary,setPrimary]=useState(entry.comparison?.materialEntryId??originals[0]?.id??''),[extra,setExtra]=useState<string[]>(entry.crossChecks?.map(c=>c.materialEntryId)??[]);
  const toggle=(id:string)=>setExtra(x=>x.includes(id)?x.filter(y=>y!==id):x.length<2?[...x,id]:x);
  return <Modal title={tr('Compare with an original')} close={close}><div className="compare-picker">
    {!originals.length?<p className="muted">{tr('No originals yet.')}</p>:<>
      <span className="label">{tr('Primary original — what was actually said (transcript, recording)')}</span>
      <div className="planet-options">{originals.map(e=><label key={e.id} className={`pick ${primary===e.id?'on':''}`}><input type="radio" name="primary" checked={primary===e.id} onChange={()=>{setPrimary(e.id);setExtra(x=>x.filter(y=>y!==e.id))}}/><FileText size={15}/>{label(e)}</label>)}</div>
      {originals.length>1&&<><span className="label">{tr('Supporting originals (optional, up to 2) — an AI summary, someone else’s minutes')}</span>
        <div className="planet-options">{originals.filter(e=>e.id!==primary).map(e=><label key={e.id} className={`pick ${extra.includes(e.id)?'on':''}`}><input type="checkbox" checked={extra.includes(e.id)} disabled={!extra.includes(e.id)&&extra.length>=2} onChange={()=>toggle(e.id)}/><FileText size={15}/>{label(e)}</label>)}</div>
        </>}
      <div className="modal-actions"><button className="secondary" onClick={close}>{tr('Cancel')}</button><button className="primary" disabled={busy||!primary} onClick={()=>compare(primary,extra)}>{busy?<LoaderCircle className="spin" size={15}/>:<ArrowRight size={15}/>}{busy?tr('Comparing…'):tr('Compare')}</button></div>
    </>}
  </div></Modal>;
}
