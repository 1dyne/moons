import {Fragment,useEffect,useState} from 'react';
import {AlignLeft,ListTree,Network,Table2} from 'lucide-react';
import type {Analysis,Edge,GNode,Section,SectionForm} from '@/lib/model';
import type {EdgeRelation,Frame} from '@/lib/thought';
import {frames,frameLabel,relLabel,soloLabel} from '@/lib/structure';
import ElkMap from './ElkMap';
import {ChoiceTag,MoonBadge,RelButton} from './Framing';
import {RenameInput} from './NodeRename';
import {nodeText} from '@/lib/model';
import type {Concept} from '@/lib/concepts';
import {ConceptText} from './Concepts';
import {tr} from '@/lib/i18n';
import '../styles/outline.css';

/** An outline note drawn the way the user grouped it: their headings (or an empty slot), then each part
 *  as a diagram, a table or the lines as written. Blanks and unsure parts are shown, never filled in. */
/** Structuring v2 on the outline: each part's frame and SOLO level, each line's relation, and where MOONS left comments. */
export type Framing={rename?:(nodeId:string,text:string)=>void;setFrame?:(sectionId:string,frame:Frame)=>void;setRel?:(edge:Edge,rel:EdgeRelation)=>void;comments?:Map<string,number>;openComments?:(sectionId:string)=>void;focus?:string|null;concepts?:Concept[];highlight?:Set<string>};
export function OutlineView({analysis,active,select,setForm,framing={}}:{analysis:Analysis;active:string|null;select:(id:string)=>void;setForm?:(sectionId:string,form:SectionForm)=>void;framing?:Framing}){
  const [editing,setEditing]=useState<string|null>(null);
  useEffect(()=>{if(framing.focus)document.getElementById(`ol-${framing.focus}`)?.scrollIntoView({behavior:'smooth',block:'center'})},[framing.focus]);
  const byId=new Map(analysis.nodes.map(n=>[n.id,n]));
  const sections=analysis.sections??[];
  const placed=new Set(sections.flatMap(s=>[...s.nodeIds,...(s.table?.rows.flatMap(r=>[r.item,...r.cells]).filter((x):x is string=>!!x)??[])]));
  const outside=analysis.nodes.filter(n=>!placed.has(n.id));
  const card=(id:string|null,key?:string)=>{
    const n=id?byId.get(id):undefined;
    if(!n)return <span key={key} className="ol-blank">{tr('Not written yet')}</span>;
    const open=analysis.signals.filter(s=>s.nodeId===n.id&&s.state==='open');
    const unsure=!!n.hesitant||!!n.fog||open.some(s=>s.kind!=='misunderstanding');
    const rename=!n.empty?framing.rename:undefined;
    if(editing===n.id&&rename)return <span key={key??n.id} className="ol-node editing"><RenameInput value={nodeText(n)} save={t=>{rename(n.id,t);setEditing(null)}} cancel={()=>setEditing(null)}/></span>;
    return <button key={key??n.id} className={`ol-node ${n.empty?'empty':''} ${unsure?'unsure':''} ${open.some(s=>s.kind==='misunderstanding')?'check':''} ${active===n.id||framing.highlight?.has(n.id)?'chosen':''}`} onClick={()=>rename&&active===n.id?setEditing(n.id):select(n.id)}
      onDoubleClick={rename&&(()=>setEditing(n.id))} onKeyDown={rename&&(e=>{if(e.key==='F2'){e.preventDefault();setEditing(n.id)}})} title={rename?tr('Click again to fix the wording'):undefined}>
      {n.empty?<span className="ol-blank-text">{n.role||tr('Not written yet')}</span>:framing.concepts?.length?<ConceptText text={nodeText(n)} concepts={framing.concepts}/>:nodeText(n)}
      {senseOf(analysis,nodeText(n))&&<small className="ol-sense" title={senseOf(analysis,nodeText(n))}>@</small>}{n.edited&&<small className="ol-edited" title={tr('Original: {text}',{text:n.text})}>{tr('Fixed')}</small>}
      {unsure&&!n.empty&&<small>{tr('Unsure')}</small>}
    </button>;
  };
  return <div className="outline">
    {sections.map(s=><section key={s.id} id={`ol-${s.id}`} className={`ol-section ${framing.focus===s.id?'focus':''}`}>
      <header>
        {s.headingText?<h3>{s.headingText}</h3>:<h3 className="ol-no-title">{tr('No title here — you didn’t name this part.')}</h3>}
        <div className="ol-framing">
          <ChoiceTag<Frame> label={tr('Built as')} value={s.frame} options={frames} labels={frameLabel} mine={s.frameBy==='user'} change={framing.setFrame&&(f=>framing.setFrame!(s.id,f))}/>
          {s.solo&&<span className="fr-tag static"><small>{tr('Understanding')}</small>{soloLabel[s.solo]}</span>}
          <MoonBadge count={framing.comments?.get(s.id)??0} open={()=>framing.openComments?.(s.id)}/>
        </div>
        {setForm&&<div className="ol-forms" role="group" aria-label={tr('How to draw this part')}>
          {([['diagram',Network,tr('Diagram')],['tree',ListTree,tr('Tree')],['table',Table2,tr('Table')],['lines',AlignLeft,tr('Lines')]] as const).filter(([f])=>f!=='tree'||laidOut(s)).map(([f,Icon,label])=>
            <button key={f} className={s.form===f?'selected':''} disabled={f==='table'&&!s.table} aria-pressed={s.form===f} title={label} aria-label={label} onClick={()=>setForm(s.id,f)}><Icon size={14}/></button>)}
        </div>}
      </header>
      {s.form==='table'&&s.table?<TableForm s={s} card={card}/>:s.form==='diagram'&&laidOut(s)?<SectionMap s={s} analysis={analysis} active={active} select={select} highlight={framing.highlight}/>:s.form==='diagram'||s.form==='tree'?<Tree s={s} analysis={analysis} card={card} setRel={framing.setRel}/>:<div className="ol-lines">{s.nodeIds.map(id=>card(id))}</div>}
    </section>)}
    {outside.length>0&&<section className="ol-section"><header><h3 className="ol-no-title">{tr('Outside the sections')}</h3></header><div className="ol-lines">{outside.map(n=>card(n.id))}</div></section>}
  </div>;
}

function TableForm({s,card}:{s:Section;card:(id:string|null,key?:string)=>React.ReactNode}){
  return <div className="ol-table-wrap"><table className="ol-table"><thead><tr><th/>{s.table!.columns.map((c,i)=><th key={i}>{c}</th>)}</tr></thead>
    <tbody>{s.table!.rows.map((r,i)=><tr key={i}><th>{card(r.item,`i${i}`)}</th>{r.cells.map((c,j)=><td key={j}>{card(c,`c${i}-${j}`)}</td>)}</tr>)}</tbody></table></div>;
}

/** Parent → child edges inside the section, drawn as an indented tree. Each link shows its relation by shape
 *  (changeable), and the user's own mark (e.g. "<->") beside it. */
function Tree({s,analysis,card,setRel}:{s:Section;analysis:Analysis;card:(id:string|null,key?:string)=>React.ReactNode;setRel?:(edge:Edge,rel:EdgeRelation)=>void}){
  const inside=new Set(s.nodeIds);
  const edges=analysis.edges.filter(e=>inside.has(e.from)&&inside.has(e.to));
  const hasParent=new Set(edges.map(e=>e.to));
  const seen=new Set<string>();
  const branch=(id:string,edge?:Edge):React.ReactNode=>{
    if(seen.has(id))return null;seen.add(id);
    const kids=edges.filter(e=>e.from===id);
    return <li key={id}>{edge&&<span className="ol-link"><RelButton rel={edge.rel} mine={edge.relBy==='user'} change={setRel&&(r=>setRel(edge,r))}/>{edge.label&&<span className="ol-rel">{edge.label}</span>}</span>}{card(id)}{kids.length>0&&<ul>{kids.map(e=><Fragment key={e.to}>{branch(e.to,e)}</Fragment>)}</ul>}</li>;
  };
  const roots=s.nodeIds.filter(id=>!hasParent.has(id));
  return <ul className="ol-tree">{roots.map(id=>branch(id))}{s.nodeIds.filter(id=>!seen.has(id)).map(id=>branch(id))}</ul>;
}

/** Frames with an order or a direction are laid out by ELK; a list stays an indented group (v7 6.1 E). */
const laidOut=(s:Section)=>!!s.frame&&s.frame!=='list'&&s.frame!=='compare';
const nodeClass=(analysis:Analysis,id:string)=>{const n=analysis.nodes.find(x=>x.id===id);const open=analysis.signals.filter(x=>x.nodeId===id&&x.state==='open');
  return `${n?.empty?'empty':''} ${n?.hesitant||n?.fog||open.some(x=>x.kind!=='misunderstanding')?'unsure':''} ${open.some(x=>x.kind==='misunderstanding')?'check':''}`};
function SectionMap({s,analysis,active,select,highlight}:{s:Section;analysis:Analysis;active:string|null;select:(id:string)=>void;highlight?:Set<string>}){
  const inside=new Set(s.nodeIds);
  const nodes=s.nodeIds.flatMap(id=>{const n=analysis.nodes.find(x=>x.id===id);return n?[{id,label:n.empty?(n.role||tr('Not written yet')):nodeText(n),className:`${nodeClass(analysis,id)} ${highlight?.has(id)?'center':''}`}]:[]});
  const edges=[...analysis.edges.flatMap((e,i)=>inside.has(e.from)&&inside.has(e.to)?[{id:`e${i}`,from:e.from,to:e.to,label:e.rel?relLabel[e.rel]:e.label,className:e.role??''}]:[]),
    ...gapEdges(analysis).filter(e=>inside.has(e.from)&&inside.has(e.to))];
  return <ElkMap label={s.headingText||tr('Map')} nodes={nodes} edges={edges} direction={s.frame==='claim'?'DOWN':'RIGHT'} select={select} selected={active}/>;
}
/** Every section at once: sections as groups, lines across them drawn as cross lines. */
export function WholeMap({analysis,active,select,highlight}:{analysis:Analysis;active:string|null;select:(id:string)=>void;highlight?:Set<string>}){
  const sections=analysis.sections??[];
  const nodes=analysis.nodes.map(n=>({id:n.id,label:n.empty?(n.role||tr('Not written yet')):nodeText(n),className:`${nodeClass(analysis,n.id)} ${highlight?.has(n.id)?'center':''}`}));
  const secOf=(id:string)=>sections.find(s=>s.nodeIds.includes(id))?.id;
  const edges=[...analysis.edges.map((e,i)=>({id:`e${i}`,from:e.from,to:e.to,label:e.rel?relLabel[e.rel]:e.label,className:secOf(e.from)!==secOf(e.to)?'cross':e.role??''})),...gapEdges(analysis)];
  const groups=sections.filter(s=>s.nodeIds.length).map(s=>({id:`g-${s.id}`,label:s.headingText||(s.frame?frameLabel[s.frame]:''),nodes:s.nodeIds}));
  return <ElkMap label={tr('Whole map')} nodes={nodes} edges={edges} groups={groups} select={select} selected={active}/>;
}

/** The user's leaps (v7 6.2), drawn as dotted lines where the step between two ideas is missing. */
const gapEdges=(a:Analysis)=>(a.dump?.gaps??[]).flatMap((g,i)=>g.fromNode&&g.toNode&&g.fromNode!==g.toNode?[{id:`gap${i}`,from:g.fromNode,to:g.toNode,label:tr('gap'),className:'gap'}]:[]);
/** A word this note uses in two senses: "term: sense1 · sense2" when the node holds it. */
function senseOf(a:Analysis,text:string){const t=text.toLowerCase();const hit=(a.dump?.senses??[]).filter(s=>t.includes(s.term.toLowerCase()));return hit.length?hit.map(s=>`${s.term}: ${s.senses.map(x=>x.label).join(' · ')}`).join('\n'):''}
