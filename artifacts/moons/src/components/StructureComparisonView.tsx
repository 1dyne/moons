import {ArrowUpRight,RotateCcw} from 'lucide-react';
import type {Entry,Verdict} from '@/lib/model';
import {frameLabel,frameOf,isStale,relGlyph,relLabel,structureVerdict,textKindLabel} from '@/lib/structure';
import VerdictBadge from './VerdictBadge';
import {RelGlyph} from './Framing';
import {sectionTitle} from './CommentsPanel';
import {tr} from '@/lib/i18n';

const norm=(s:string)=>s.normalize('NFC').replace(/\s+/g,' ').trim();
/** Marks the author's signal words inside an original sentence (the server keeps them with spaces collapsed). */
function Signal({sentence,words}:{sentence:string;words:string[]}){
  const marks=words.map(norm).filter(Boolean);
  if(!marks.length)return <>{sentence}</>;
  const re=new RegExp(`(${marks.map(m=>m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')).join('|')})`,'g');
  return <>{sentence.split(re).map((part,i)=>i%2?<mark key={i}>{part}</mark>:part)}</>;
}

/** The structure layer: each part of the note against how the original builds it. The original's build comes only
 *  from signals its author left; with none there is no verdict. */
export default function StructureComparisonView({entry,original,recompare,openSource,focus}:{entry:Entry;original?:Entry;recompare:()=>void;openSource:(indices:number[])=>void;focus?:string|null}){
  const st=entry.comparison?.structure,a=entry.analysis;
  if(!st||!a)return <div className="empty-state compact"><h2>{tr('No structure comparison yet')}</h2>
    <p>{a?tr('This comparison was made before the structure layer. Compare again to see how each part is built against the original.'):tr('Structure this note first, then compare it to see how each part is built against the original.')}</p>
    {a&&<button className="primary" onClick={recompare}><RotateCcw size={15}/>{tr('Compare again')}</button>}</div>;
  const sentences=original?.sentences??[];
  const rows=st.sections.map(s=>({s,mine:frameOf(a,s.section),verdict:structureVerdict(s,frameOf(a,s.section))}));
  const count=(v:Verdict)=>v==='missed'?st.missed.length:rows.filter(r=>r.verdict===v).length;
  const unread=rows.filter(r=>!r.verdict).length;
  const text=(id:string)=>a.nodes.find(n=>n.id===id)?.text??'';
  return <div className="structure-compare">
    {isStale(st,a)&&<div className="history-notice">{tr('You restructured this note after comparing, so this reads the earlier structure.')}<button className="text-button" onClick={recompare}><RotateCcw size={14}/>{tr('Compare again')}</button></div>}
    <div className="verdict-counts">{(['kept','shifted','added','missed'] as Verdict[]).map(v=><VerdictBadge key={v} verdict={v} count={count(v)}/>)}{unread>0&&<span className="sc-unread">{tr('No signal in the original · {n}',{n:unread})}</span>}</div>
    
    {(st.textKind||a.textKind)&&<p className="sc-kind">{tr('Kind of text')}: {tr('original')} <b>{st.textKind?textKindLabel[st.textKind]:'—'}</b> · {tr('your note')} <b>{a.textKind?textKindLabel[a.textKind]:'—'}</b></p>}
    <div className="sc-table-wrap"><table className="sc-table">
      <thead><tr><th>{tr('Part')}</th><th>{tr('Your build')}</th><th>{tr('Original’s build')}</th><th>{tr('Signal in the original')}</th><th>{tr('Result')}</th></tr></thead>
      <tbody>
        {rows.map(({s,mine,verdict})=><tr key={s.section} className={focus===s.section?'focus':''}>
          <td>{sectionTitle(entry,s.section)}</td>
          <td><span className="fr-tag static">{frameLabel[mine]}</span></td>
          <td>{s.origFrame?<span className="fr-tag static">{frameLabel[s.origFrame]}</span>:<span className="muted">{s.skipped?tr('Not read'):s.original.length?tr('No signal'):tr('Not in the original')}</span>}</td>
          <td>{[...new Set(s.signals.map(g=>g.sentence))].map(i=><button key={i} className="sc-signal" onClick={()=>openSource([i])}><Signal sentence={sentences[i]??''} words={s.signals.filter(g=>g.sentence===i).map(g=>g.words)}/><ArrowUpRight size={12}/></button>)}
            {s.note&&<small className="sc-note">{s.note}</small>}</td>
          <td>{verdict?<VerdictBadge verdict={verdict} size="sm" showLabel/>:<span className="muted">—</span>}</td>
        </tr>)}
        {st.missed.map((m,i)=><tr key={`m${i}`}>
          <td className="muted">{tr('Not in your note')}</td><td className="muted">—</td>
          <td>{m.frame?<span className="fr-tag static">{frameLabel[m.frame]}</span>:<span className="muted">—</span>}</td>
          <td><button className="sc-signal" onClick={()=>openSource(m.original)}>{m.original.slice(0,2).map(n=>sentences[n]).join(' ')}<ArrowUpRight size={12}/></button>{m.note&&<small className="sc-note">{m.note}</small>}</td>
          <td><VerdictBadge verdict="missed" size="sm" showLabel/></td>
        </tr>)}
      </tbody></table></div>
    {st.relations.length>0&&<section className="sc-lines"><h3>{tr('Lines the original ties differently')}</h3>
      {st.relations.map((r,i)=>{const now=a.edges.find(e=>e.from===r.from&&e.to===r.to)?.rel;return <article key={i}>
        <p><b>{text(r.from)}</b> → <b>{text(r.to)}</b></p>
        <p className="sc-rels"><span><RelGlyph glyph={relGlyph(now)}/>{tr('yours')}: {now?relLabel[now]:tr('Not read')}</span><span><RelGlyph glyph={relGlyph(r.origRel)}/>{tr('original')}: {relLabel[r.origRel]}</span></p>
        {r.note&&<small className="sc-note">{r.note}</small>}
        <button className="text-button" onClick={()=>openSource(r.original)}>{tr('View in original')} <ArrowUpRight size={13}/></button>
      </article>})}</section>}
  </div>;
}
