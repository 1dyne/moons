import {useEffect,useState} from 'react';
import {Printer} from 'lucide-react';
import type {Entry,Store} from '@/lib/model';
import {noteSections,parts,type Part} from '@/lib/export';
import {tr} from '@/lib/i18n';
import '../styles/print.css';

type Section=ReturnType<typeof noteSections>;
const day=(iso:string)=>new Date(iso).toLocaleDateString();

/** A printable document: one note per page; a cover and contents for several. "Save as PDF" makes the file. */
export default function PrintView({store}:{store:Store}){
  const q=new URLSearchParams(window.location.search);
  const ids=(q.get('ids')??'').split(',').filter(Boolean);
  const include=new Set((q.get('inc')??'').split(',').filter((p):p is Part=>(parts as readonly string[]).includes(p)));
  const title=q.get('title')||'MOONS';
  const notes=ids.map(id=>store.entries.find(e=>e.id===id)).filter((e):e is Entry=>!!e);
  const scope=new Set(notes.map(n=>n.id));
  const sections=notes.map(n=>noteSections(store,n,include,scope));
  const [printed,setPrinted]=useState(false);
  useEffect(()=>{if(printed||!notes.length)return;const t=setTimeout(()=>{setPrinted(true);window.print()},700);return()=>clearTimeout(t)},[notes.length]);
  return <div className="print-doc">
    <div className="print-toolbar no-print"><span>{tr('Print view')}</span><button className="primary small" onClick={()=>window.print()}><Printer size={14}/>{tr('Save as PDF')}</button></div>
    {sections.length>1&&<section className="print-page cover"><h1>{title}</h1><p>{day(new Date().toISOString())} · {tr('{n} notes',{n:sections.length})}</p>
      <ol className="toc">{sections.map((s,i)=><li key={i}><span>{s.title}</span><small>{day(s.created)}</small></li>)}</ol></section>}
    {sections.map((s,i)=><Note key={i} s={s}/>)}
    {!sections.length&&<p className="no-print">{tr('Nothing to print.')}</p>}
  </div>;
}

export function Note({s}:{s:Section}){
  return <section className="print-page note">
    <header><h1>{s.title}</h1><p>{day(s.created)}{s.planets.length?` · ${s.planets.join(', ')}`:''}</p></header>
    {s.body&&<div className="body">{s.body.split('\n').map((l,i)=><p key={i}>{l}</p>)}</div>}
    {s.quotes&&s.quotes.items.length>0&&<><h2>{tr('Quotes from the original')} <small>— {s.quotes.from}</small></h2>{s.quotes.items.map((q,i)=><blockquote key={i}>{q.text}</blockquote>)}</>}
    {s.comparison&&<><h2>{tr('Comparison')}</h2><p>{s.comparison.summary}</p><ul className="cmp">{s.comparison.items.map((i,k)=><li key={k}><b>{i.verdict}</b>{i.answer&&<q>{i.answer}</q>}<span>{i.note}</span></li>)}</ul></>}
    {s.emotions.length>0&&<><h2>{tr('Emotions MOONS heard')}</h2><p>{s.emotions.map(e=>`${e.word} (${e.intensity})`).join(' · ')}</p></>}
    {s.history.length>0&&<><h2>{tr('What I knew first → what I corrected')}</h2><ul>{s.history.map((h,k)=><li key={k}><small>{day(h.at)}</small> {h.body}</li>)}</ul></>}
    {s.memos.length>0&&<><h2>{tr('Memos')}</h2><ul>{s.memos.map((m,k)=><li key={k}>{m.body}</li>)}</ul></>}
    {s.confidence.length>0&&<><h2>{tr('Confidence history')}</h2><p>{s.confidence.map(c=>`${day(c.at)} ${c.value}/10`).join(' → ')}</p></>}
    {s.links.length>0&&<><h2>{tr('Connections')}</h2><ul>{s.links.map((l,k)=><li key={k}><b>{l.relation}</b> {l.title}{l.reason&&<> — {l.reason}</>}</li>)}</ul></>}
  </section>;
}
