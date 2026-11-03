import {useMemo,useState} from 'react';
import {ArrowUpRight,Columns2,FileText,Lightbulb,MessagesSquare,Network,GitCompare,CircleHelp} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {checkList,conceptKnowledge,crossOrder,fieldSummaries,KNOWLEDGE_REVEAL,NO_FIELD,type ConceptKnowledge} from '@/lib/knowledge-v9';
import {colorOf,rootOf} from '@/lib/planets';
import {rate} from '@/lib/planner';
import {conceptsOf} from '@/lib/concepts';
import {currentEntries} from '@/lib/pages';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import MoonView from './MoonView';
import CrossSection from './CrossSection';
import Stars from '../record/Stars';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(u:string)=>void};
const STAGE=[ '',tr('Came in'),tr('Organised'),tr('Checked'),tr('Can explain')];

/** v9 5장: my moon and what my records actually show, with the way into the next study. */
export default function LearnSpace({ctx,focusEntry,focusConcept}:{ctx:Ctx;focusEntry?:string;focusConcept?:string}){
  const {store,ws,go}=ctx;
  const all=useMemo(()=>conceptKnowledge(store),[store.concepts,store.entries,store.confidence,store.planets]);
  const summaries=useMemo(()=>fieldSummaries(store,all),[all,store.entries]);
  const recentField=useMemo(()=>{const since=Date.now()-14*864e5,count=new Map<string,number>();for(const e of currentEntries(store.entries))if(Date.parse(e.createdAt)>since)for(const id of e.planetIds){const r=rootOf(id,store.planets);count.set(r,(count.get(r)??0)+1)}
    return [...count].sort((a,b)=>b[1]-a[1])[0]?.[0]??summaries[0]?.field??NO_FIELD},[store.entries,summaries]);
  const [field,setField]=useState<string|null>(()=>focusConcept?all.find(k=>k.conceptId===focusConcept)?.fields[0]??null:null);
  const f=field??recentField;
  const [selected,setSelected]=useState<string|null>(focusConcept??null),[showBack,setShowBack]=useState(false);
  // The chosen field turns to face the viewer: its region's centre goes to longitude 0.
  const mine=useMemo(()=>{const list=all.filter(k=>k.fields.includes(f));const fr=list.filter(k=>k.side==='front');const src=fr.length?fr:list;
    const c=src.length?Math.atan2(src.reduce((a,k)=>a+Math.sin(k.lon*Math.PI/180),0),src.reduce((a,k)=>a+Math.cos(k.lon*Math.PI/180),0))*180/Math.PI:0;
    return list.map(k=>({...k,lon:((k.lon-c+540)%360)-180}))},[all,f]);
  const sum=summaries.find(s=>s.field===f);
  const forming=!sum?.open;
  const progress=sum?Math.min(1,(Math.min(sum.concepts,KNOWLEDGE_REVEAL.concepts)+Math.min(sum.evidence,KNOWLEDGE_REVEAL.evidence))/(KNOWLEDGE_REVEAL.concepts+KNOWLEDGE_REVEAL.evidence)):0;
  const checks=checkList(store,f,all,summaries);
  const sel=mine.find(k=>k.conceptId===selected)??all.find(k=>k.conceptId===selected)??null;
  const front=crossOrder(mine.filter(k=>k.side==='front'),conceptsOf(store));
  const fname=(id:string)=>id===NO_FIELD?tr('Dwarf planet'):store.planets.find(p=>p.id===id)?.name??id;
  const focus=focusEntry?store.entries.find(e=>e.id===focusEntry):undefined;
  const entryTitle=(id:string)=>{const e=store.entries.find(x=>x.id===id);return e?.title||e?.body.slice(0,36)||tr('Untitled')};
  const back=mine.filter(k=>k.side==='back');
  return <section className="learn">
    <header className="learn-head"><h1>{tr('My moon')}</h1><small className="muted">{tr('Based on my records')}</small>
      <div className="learn-fields" role="group" aria-label={tr('Fields')}>{(summaries.length?summaries:[{field:NO_FIELD,concepts:0,evidence:0,understanding:null,open:false,backPages:[]}]).map(s=>{const p=store.planets.find(x=>x.id===s.field);
        return <button key={s.field} className={`field-chip ${s.field===f?'on':''}`} aria-pressed={s.field===f} onClick={()=>{setField(s.field);setSelected(null)}}>{p&&<i style={{background:colorOf(p,store.planets)}}/>}{fname(s.field)}<b>{s.open?s.understanding??'—':tr('Forming')}</b><small>{s.open?tr('evidence {n}',{n:s.evidence}):`${Math.min(s.concepts,KNOWLEDGE_REVEAL.concepts)}/${KNOWLEDGE_REVEAL.concepts} · ${Math.min(s.evidence,KNOWLEDGE_REVEAL.evidence)}/${KNOWLEDGE_REVEAL.evidence}`}</small></button>})}</div>
    </header>

    {focus&&<div className="learn-focus"><FileText size={16}/><b>{entryTitle(focus.id)}</b><span className="pe-spacer"/>
      <button className="secondary small" onClick={()=>go(`/entries/${focus.id}`)}><Network size={14}/>{tr('Structure')}</button>
      <button className="secondary small" onClick={()=>go(`/entries/${focus.id}/compare`)}><GitCompare size={14}/>{tr('Compare')}</button>
      <button className="text-button" onClick={()=>go(`/entries/${focus.id}/original`)}>{tr('Original')}<ArrowUpRight size={13}/></button></div>}

    {checks.length>0&&<div className="learn-checks" aria-label={tr('Places to look')}>{checks.map((c,i)=><button key={i} className={`check-chip ck-${c.kind}`} onClick={()=>c.conceptId?setSelected(c.conceptId):c.entryId&&go(`/entries/${c.entryId}/original`)}>
      <small>{c.kind==='gap'?tr('Felt sure, not there yet'):c.kind==='star'?tr('Know more than you think'):c.kind==='unexplained'?tr('Never explained'):c.kind==='low'?tr('Often, but low'):tr('Not checked yet')}</small>{c.label}</button>)}</div>}

    <div className="learn-top">
      <div className="moon-wrap">{forming&&<span className="forming-badge">{tr('Forming')} · {Math.round(progress*100)}%</span>}
        <MoonView list={mine} selected={selected} select={setSelected} showBack={showBack} setShowBack={setShowBack} forming={forming} progress={progress}/></div>
      <aside className="learn-panel" aria-live="polite">
        {sel?<ConceptCard k={sel} store={store} ws={ws} go={go} entryTitle={entryTitle}/>
        :showBack?<><p className="eyebrow">{tr('Back side · not checked yet')}</p><h2>{tr('{n} kept only',{n:back.length+(sum?.backPages.length??0)})}</h2>
          <ul className="learn-list">{back.map(k=><li key={k.conceptId}><button onClick={()=>setSelected(k.conceptId)}><span>{k.name}</span><small>{tr('Concept')}</small></button></li>)}
            {(sum?.backPages??[]).map(id=><li key={id}><button onClick={()=>go(`/entries/${id}/original`)}><span>{entryTitle(id)}</span><small>{tr('Record')}</small></button></li>)}</ul></>
        :mine.length?<>{(()=>{const k=mine.find(x=>x.conceptId===checks.find(c=>c.conceptId)?.conceptId)??[...mine].sort((a,b)=>b.recordCount-a.recordCount)[0]!;return <ConceptCard k={k} store={store} ws={ws} go={go} entryTitle={entryTitle} next/>})()}</>
        :<><p className="eyebrow">{fname(f)}</p><h2>{tr('Forming')}</h2><p className="muted">{`${sum?.concepts??0}/${KNOWLEDGE_REVEAL.concepts} · ${sum?.evidence??0}/${KNOWLEDGE_REVEAL.evidence}`}</p><button className="primary small" onClick={()=>go('/')}>{tr('Record')}</button></>}
      </aside>
    </div>

    <section className="learn-cut"><h2>{tr('{name} cross-section',{name:fname(f)})}</h2>{forming?<p className="muted">{tr('Forming')}</p>:<CrossSection list={front} selected={selected} select={id=>setSelected(selected===id?null:id)}/>}</section>

    <nav className="learn-tools" aria-label={tr('Study tools')}>
      <button onClick={()=>go('/station')}><CircleHelp size={18}/>{tr('Questions')}</button>
      <button onClick={()=>go('/station/compare')}><Columns2 size={18}/>{tr('Compare')}</button>
      <button onClick={()=>go('/chat')}><MessagesSquare size={18}/>{tr('Chats')}</button>
      <button onClick={()=>go('/concepts')}><Lightbulb size={18}/>{tr('Concepts')}</button>
    </nav>
  </section>;
}

function ConceptCard({k,store,ws,go,entryTitle,next}:{k:ConceptKnowledge;store:Store;ws:WorkspaceApi;go:(u:string)=>void;entryTitle:(id:string)=>string;next?:boolean}){
  const why=k.terrain==='crater'?tr('You felt sure, but the records show a lower stage.'):k.star?tr('The records show more than you felt.'):k.unexplained?tr('Not yet explained in your own words.'):k.side==='back'?tr('No comparison, attempt or explanation yet.'):'';
  return <><p className="eyebrow">{next?tr('Next place to look'):tr('Chosen concept')}</p><h2>{k.name}</h2>{why&&<p>{why}</p>}
    <dl className="facts"><div><dt>{tr('Actual stage')}</dt><dd>{STAGE[k.stage]}</dd></div><div><dt>{tr('Felt')}</dt><dd>{k.confidence?`${k.confidence.value}/10${k.confidence.by==='page'?' · '+tr('page'):''}`:'—'}</dd></div><div><dt>{tr('Records')}</dt><dd>{k.recordCount}</dd></div></dl>
    <Stars value={k.confidence?.by==='concept'?k.confidence.value:undefined} onChange={v=>ws.commit(s=>rate(s,'concept',k.conceptId,v))} size={18}/>
    <ul className="learn-list">{k.entryIds.slice(0,4).map(id=><li key={id}><button onClick={()=>go(`/entries/${id}/original`)}><span>{entryTitle(id)}</span><small>{k.evidence.filter(e=>e.entryId===id).map(e=>e.kind==='compare'?tr('Compare'):e.kind==='attempt'?tr('Attempt'):tr('Explained')).join(' · ')||tr('Record')}</small></button></li>)}</ul>
    <p className="ask">{k.unexplained?tr('Explain {name} in your own words?',{name:k.name}):tr('Where else would {name} apply?',{name:k.name})}</p>
    <div className="actions"><button className="primary small" onClick={()=>go(`/?title=${encodeURIComponent(k.name)}`)}>{tr('Explain')}</button><button className="secondary small" onClick={()=>go(`/concepts/${k.conceptId}`)}>{tr('Concept')}</button>{k.entryIds[0]&&<button className="secondary small" onClick={()=>go(`/entries/${k.entryIds[0]}`)}>{tr('Structure')}</button>}</div></>;
}
