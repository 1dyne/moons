import {useState} from 'react';
import {ArrowUpRight,CircleHelp,Eye,EyeOff,Lightbulb,MoveRight} from 'lucide-react';
import type {Entry,Store} from '@/lib/model';
import {conceptsOf,unfamiliar} from '@/lib/concepts';
import {tr} from '@/lib/i18n';
import {DwarfBadge} from './Concepts';
import '../styles/next.css';

const kindIcon={missed:'○',shifted:'≈',gap:'⤳',concept:'●'} as const;

/** v7 6.3: the two maps lined up by concept, then a card for each thing to look into next. */
export default function NextCards({entry,store,go,openQuestion,openSource}:{entry:Entry;store:Store;go:(url:string)=>void;openQuestion:(text:string,concepts:string[],card:string)=>void;openSource:(i:number[])=>void}){
  const cmp=entry.comparison;if(!cmp)return null;
  const all=conceptsOf(store),name=(id:string)=>all.find(c=>c.id===id);
  const chip=(id:string)=>{const c=name(id);return c?<button key={id} className="concept-chip" onClick={()=>go(`/concepts/${id}`)}><Lightbulb size={12}/>{c.name}{unfamiliar(c)&&<DwarfBadge/>}</button>:null};
  const cards=cmp.next??[];
  const original=store.entries.find(e=>e.id===cmp.materialEntryId);
  return <section className="next-explore" aria-label={tr('Next to explore')}>
    {cmp.concepts&&<div className="concept-align">
      <div><span className="ca-label" title={tr('In both')}>{tr('In both')} <b>{cmp.concepts.shared.length}</b></span><div>{cmp.concepts.shared.map(chip)}</div></div>
      <div className="missed"><span className="ca-label" title={tr('Only in the original')}>{tr('Only in the original')} <b>{cmp.concepts.missed.length}</b></span><div>{cmp.concepts.missed.map(chip)}</div></div>
      <div className="added"><span className="ca-label" title={tr('Only in my note')}>{tr('Only in my note')} <b>{cmp.concepts.added.length}</b></span><div>{cmp.concepts.added.map(chip)}</div></div>
    </div>}
    {cards.length>0&&<><h2><MoveRight size={16}/>{tr('Next to explore')}</h2>
    <ul className="next-cards">{cards.map((c,i)=><li key={i} className={`next-card ${c.target.kind}`}>
      <span className="nc-kind" title={tr(c.target.kind)}>{kindIcon[c.target.kind]}</span>
      <p>{c.question}</p>
      <div className="nc-concepts">{c.concepts.map(chip)}</div>
      {c.why.length>0&&original&&<button type="button" className="nc-why" onClick={()=>openSource(c.why)}>{c.why.slice(0,2).map(n=><q key={n}>{original.sentences[n]}</q>)}<ArrowUpRight size={12}/></button>}
      <button className="secondary small" onClick={()=>openQuestion(c.question,c.concepts,`${c.target.kind}:${c.target.ref}`)}><CircleHelp size={14}/>{tr('Open as a question')}</button>
    </li>)}</ul></>}
  </section>;
}

/** The relations the user drew from this node, in their own words; MOONS's reading of each stays hidden until asked. */
export function MyClaims({entry,nodeId}:{entry:Entry;nodeId:string}){
  const [show,setShow]=useState(false);
  const claims=(entry.analysis?.dump?.claims??[]).filter(c=>c.subjNode===nodeId||c.objNode===nodeId);
  if(!claims.length)return null;
  const assessed=claims.some(c=>c.assessment);
  return <div className="panel-block"><h3>{tr('What I connected')}{assessed&&<button className="icon-button" aria-pressed={show} title={show?tr('Hide MOONS’s reading'):tr('Show MOONS’s reading')} aria-label={show?tr('Hide MOONS’s reading'):tr('Show MOONS’s reading')} onClick={()=>setShow(!show)}>{show?<EyeOff size={14}/>:<Eye size={14}/>}</button>}</h3>
    <ul className="my-claims">{claims.map(c=><li key={c.id}><span>{c.subj}</span><span className="asserted">{c.asserted??'—'}</span><span>{c.obj}</span>
      {show&&c.assessment&&<small className={c.assessment.verdict}>{verdictLabel[c.assessment.verdict]} · {c.assessment.why}</small>}</li>)}</ul></div>;
}
const verdictLabel={holds:tr('Holds'),questionable:tr('Questionable'),unsupported:tr('No support in the note')};
