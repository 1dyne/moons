import type {ConnectedProject,ProjectHub} from '@workspace/moons-sync/projects';
import {costsOf,rollup,type Money} from '@/lib/dock-structure';
import {tr} from '@/lib/i18n';

const money=(m:Money)=>`${m.unit==='USD'?'$':''}${m.value.toLocaleString(undefined,{maximumFractionDigits:4})}${m.unit==='USD'?'':` ${m.unit}`}`;
const usd=(v:number|null|undefined)=>v===null||v===undefined?'—':`$${v.toFixed(4)}`;

/** Every project's usage and cost in one table; a row opens that project's own costs. */
export default function DockCosts({hub,open}:{hub:ProjectHub;open:(projectId:string)=>void}){
  const rows=hub.projects.map(p=>({p,r:rollup(p,hub)}));
  const attributed=(hub.aiByProject??[]).reduce((n,x)=>n+(x.cost??0),0);
  const total=costsOf(hub.events);
  return <section className="settings-card dock-costs"><h2>{tr('By project · 30 days')}</h2>
    <div className="dock-cost-wrap"><table className="dock-cost-table"><thead><tr><th>{tr('Project')}</th><th>{tr('MOONS AI')}</th><th>{tr('App costs')}</th><th>{tr('Usage')}</th><th>{tr('Errors')}</th><th>{tr('Last deployment')}</th></tr></thead>
      <tbody>{rows.map(({p,r})=><tr key={p.id} onClick={()=>open(p.id)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')open(p.id)}}>
        <th scope="row">{p.name}{r.attention>0&&<span className="late" title={tr('Needs attention')}> ●</span>}</th>
        <td>{usd(r.ai?.cost)}{r.ai?<small> · {r.ai.calls}</small>:null}</td>
        <td>{r.costs.length?r.costs.map((m,i)=><div key={i}>{money(m)} <small>{tr(m.basis==='estimated'?'Estimated':'Reported')}</small></div>):'—'}</td>
        <td>{r.usage.length?r.usage.slice(0,3).map((u,i)=><div key={i}><small>{u.name}</small> {u.value.toLocaleString(undefined,{maximumFractionDigits:2})} {u.unit}</div>):'—'}</td>
        <td className={r.errors?'late':''}>{r.errors||'—'}</td>
        <td>{r.lastDeploy?new Date(r.lastDeploy).toLocaleDateString():'—'}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">{tr('Total')}</th><td>{usd(hub.aiUsage.cost)}{attributed>0&&<small> · {tr('{n} for projects',{n:usd(attributed)})}</small>}</td><td>{total.length?total.map((m,i)=><div key={i}>{money(m)} <small>{tr(m.basis==='estimated'?'Estimated':'Reported')}</small></div>):'—'}</td><td/><td/><td/></tr></tfoot>
    </table></div>
  </section>;
}
/** One project's MOONS AI spend, shown above its own measurements. */
export function ProjectAiCost({p,hub}:{p:ConnectedProject;hub:ProjectHub}){
  const ai=hub.aiByProject?.find(x=>x.projectId===p.id);
  return <section className="settings-card"><h2>{tr('MOONS AI · this project · 30 days')}</h2><strong>{usd(ai?.cost)}</strong><span> · {tr('Estimated')} · {ai?.calls??0} {tr('Calls')}{ai?.unknown?` · ${ai.unknown} ${tr('Unpriced calls')}`:''}</span></section>;
}
