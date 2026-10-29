import {ArrowUpRight} from 'lucide-react';
import {type Comparison,type ComparisonItem,type CrossCheck,type Verdict} from '@/lib/model';
import {tr} from '@/lib/i18n';
import VerdictBadge from './VerdictBadge';
import {verdictOrder,verdictTag} from '@/lib/verdicts';
export const verdictInfo=Object.fromEntries(verdictOrder.map(v=>[v,{label:verdictTag[v].label,term:verdictTag[v].term,line:verdictTag[v].say}])) as Record<Verdict,{label:string;term:string;line:string}>;
export const clock=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
/** The server stores which answer sentence an item is about; older data stored the text itself. */
const answerText=(it:ComparisonItem,sentences:string[])=>typeof it.answer==='number'?sentences[it.answer]??'':it.answer;

export default function ComparisonView({comparison,sentences,crossChecks,openSource}:{comparison:Comparison;sentences:string[];crossChecks?:CrossCheck[];openSource:(indices:number[])=>void}){
  const order=verdictOrder;
  return <div className="comparison">
    <header><span className="eyebrow">{tr('COMPARED WITH')}</span><h2>{comparison.materialTitle}</h2><p>{comparison.summary}</p></header>
    <div className="verdict-counts">{order.map(v=><VerdictBadge key={v} verdict={v} count={comparison.items.filter(i=>i.verdict===v).length}/>)}</div>
    {crossChecks&&crossChecks.length>0&&<CrossView primary={comparison} checks={crossChecks} sentences={sentences}/>}
    {order.map(v=>{const items=comparison.items.filter(i=>i.verdict===v);return items.length?<section key={v} className={`verdict-group ${v}`}><h3><VerdictBadge verdict={v} showLabel/></h3>
      {items.map((it,i)=><article key={i}>{answerText(it,sentences)&&<blockquote>{answerText(it,sentences)}</blockquote>}<p>{it.note}</p>{it.shiftType&&<VerdictBadge verdict={v} shiftType={it.shiftType}/>}{it.original.length>0&&<button className="text-button" onClick={()=>openSource(it.original)}>{tr('View in original')} <ArrowUpRight size={13}/></button>}</article>)}</section>:null})}
    {comparison.quotes.length>0&&<section className="quote-list"><h3>{tr('Quotes from the original')}</h3>{comparison.quotes.map((q,i)=><button key={i} onClick={()=>openSource([q.index])}><time>{clock(q.time)}</time><span>{q.text}</span></button>)}</section>}
  </div>;
}

/** Each answer sentence against the primary original and every supporting one, side by side.
 *  The useful signal: the primary says "shifted" while a summary says "confirmed" — you may have followed the summary. */
function CrossView({primary,checks,sentences}:{primary:Comparison;checks:CrossCheck[];sentences:string[]}){
  const at=(items:ComparisonItem[],i:number)=>items.find(x=>x.answer===i||x.answer===sentences[i]);
  return <section className="cross-view">
    <h3>{tr('Cross-check with supporting originals')}</h3>
    
    <table><thead><tr><th>{tr('What you wrote')}</th><th>{primary.materialTitle}</th>{checks.map(c=><th key={c.materialEntryId}>{c.materialTitle}</th>)}</tr></thead>
      <tbody>{sentences.map((s,i)=>{const p=at(primary.items,i);const others=checks.map(c=>at(c.items,i));
        const followed=p&&p.verdict!=='kept'&&others.some(o=>o?.verdict==='kept');
        const held=p?.verdict==='kept'&&others.some(o=>o&&o.verdict!=='kept');
        return <tr key={i} className={followed?'flag':''}><td>{s}{followed&&<small className="cross-note">{tr('The primary original says otherwise, but a supporting one matches you. You may have followed the summary rather than what was said.')}</small>}{held&&<small className="cross-note calm">{tr('You kept what was said, even where a supporting original differs.')}</small>}</td>
          <td>{p?<VerdictBadge verdict={p.verdict} shiftType={p.shiftType} size="sm"/>:'—'}</td>
          {others.map((o,k)=><td key={k}>{o?<VerdictBadge verdict={o.verdict} shiftType={o.shiftType} size="sm"/>:'—'}</td>)}</tr>})}</tbody></table>
    {checks.map(c=>{const drifted=c.drift.items.filter(i=>i.verdict!=='kept');return drifted.length?<details key={c.materialEntryId} className="drift"><summary>{tr('Where “{title}” itself differs from the primary original ({n})',{title:c.materialTitle,n:drifted.length})}</summary>
      <p className="verdict-line">{c.drift.summary}</p>
      <ul>{drifted.map((d,k)=><li key={k}><VerdictBadge verdict={d.verdict} shiftType={d.shiftType} size="sm"/><span>{d.note}</span></li>)}</ul></details>:null})}
  </section>;
}
