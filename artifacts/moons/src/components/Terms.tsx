// v8.1 words in notes: linked words open a popover with the meaning; a concept's example sentences by author;
// a note's approved version beside its original.
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {ArrowLeft,BadgeCheck,BookOpen,Bot,CircleAlert,Columns2,FileText,Lightbulb,Link2,Link2Off,PenLine} from 'lucide-react';
import type {Entry,Store} from '@/lib/model';
import {conceptRelLabel,conceptsOf,finder,kindLabel,needsCheck,neighbours,unfamiliar,type Concept,type ConceptRel,type Revision} from '@/lib/concepts';
import {alignSentences,authorOrder,examplesOf,ownUses,wordDiff,type Author,type Example} from '@workspace/moons-sync/terms';
import {tr} from '@/lib/i18n';
import {showConcept,useLinks,usePop} from '@/lib/term-pop';
import {ConceptText,DwarfBadge} from './Concepts';
import '../styles/terms.css';

export function LinkToggle(){
  const [on,set]=useLinks();
  return <button type="button" className={`icon-button link-toggle ${on?'on':''}`} aria-pressed={on} title={tr(on?'Hide word links':'Show word links')} aria-label={tr(on?'Hide word links':'Show word links')} onClick={()=>set(!on)}>{on?<Link2 size={16}/>:<Link2Off size={16}/>}</button>;
}

/** Mounted once: the popover for whichever linked word was tapped last. */
export function ConceptPopover({store,go}:{store:Store|null;go:(url:string)=>void}){
  const p=usePop();
  useEffect(()=>{
    if(!p)return;
    const close=(e:Event)=>{if(e.type==='keydown'&&(e as KeyboardEvent).key!=='Escape')return;if(e.type==='pointerdown'&&(e.target as HTMLElement).closest('.term-pop,.concept-mark'))return;showConcept(null)};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);window.addEventListener('resize',close);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);window.removeEventListener('resize',close)};
  },[p]);
  const c=p&&store?conceptsOf(store).find(x=>x.id===p.id):undefined;
  if(!p||!c)return null;
  const narrow=window.innerWidth<640,width=Math.min(320,window.innerWidth-24);
  const below=p.rect.bottom+8+220<window.innerHeight;
  const style=narrow?undefined:{left:Math.max(12,Math.min(p.rect.left,window.innerWidth-width-12)),width,...(below?{top:p.rect.bottom+8}:{bottom:window.innerHeight-p.rect.top+8})};
  const t=c.term;
  return <div className={`term-pop ${narrow?'sheet':''}`} style={style} role="dialog" aria-label={c.name}>
    <header><b>{t?.headword||c.name}</b>{t?.pos&&<small className="term-pos">{t.pos}</small>}{unfamiliar(c)&&<DwarfBadge/>}{t&&!t.confirmed&&<CircleAlert className="term-check" size={13} aria-label={tr('Needs checking')}/>}</header>
    {t?.meaningKo?<p className="term-meaning">{t.meaningKo}</p>:c.definition[0]?<p className="term-meaning">{c.definition[0].text}</p>:<p className="term-meaning muted">{kindLabel[c.kind]}</p>}
    {(t?.collocations?.length??0)>0&&<ul className="term-colls">{t!.collocations!.slice(0,2).map(x=><li key={x}>{x}</li>)}</ul>}
    <button className="secondary" onClick={()=>{showConcept(null);if(p.open)p.open(c.id);else go(`/concepts/${c.id}`)}}><Lightbulb size={15}/>{tr('Concept page')}</button>
  </div>;
}

// ---------- who wrote it ----------
export function AuthorMark({author}:{author:Author}){
  const [Icon,name]=author==='user_approved'?[BadgeCheck,tr('My approved revision')]:author==='user'?[PenLine,tr('My original')]:author==='material'?[BookOpen,tr('From a material')]:[Bot,tr('AI material')];
  return <span className={`author-mark ${author}`} title={name} aria-label={name}><Icon size={13}/></span>;
}

/** Text with linked words (unless links are switched off). */
export function Linked({text,store,open}:{text:string;store:Store;open?:(id:string)=>void}){
  return <ConceptText text={text} concepts={conceptsOf(store)} open={open} link/>;
}

// ---------- a note's original, approved version and the two side by side ----------
type View='original'|'revision'|'compare';
export function RevisionTabs({entry,original,revised,initial}:{entry:Entry;original:ReactNode;revised:(rev:Revision)=>ReactNode;initial?:View}){
  const [view,setView]=useState<View>(initial??'original');
  const rev=entry.revision;
  if(!rev)return <>{original}</>;
  return <div className="revision-tabs">
    <div className="layer-switch" role="tablist" aria-label={tr('Version')}>
      {([['original',PenLine,'Original'],['revision',BadgeCheck,'Approved version'],['compare',Columns2,'Compare']] as const).map(([k,Icon,l])=><button key={k} role="tab" aria-selected={view===k} aria-pressed={view===k} onClick={()=>setView(k)}><Icon size={14}/>{tr(l)}</button>)}
    </div>
    {view==='original'?original:view==='revision'?revised(rev):<RevisionCompare original={entry.sentences} rev={rev}/>}
  </div>;
}
/** The approved version, each corrected sentence marked as approved. */
export function RevisionText({rev,store,open}:{rev:Revision;store:Store;open?:(id:string)=>void}){
  let cursor=0;const parts:ReactNode[]=[];
  rev.sentences.forEach((s,i)=>{const at=rev.text.indexOf(s,cursor);if(at<0)return;parts.push(rev.text.slice(cursor,at));
    parts.push(<span key={i} className={`sentence ${rev.by[i]==='user_approved'?'approved':''}`}><Linked text={s} store={store} open={open}/></span>);cursor=at+s.length});
  parts.push(rev.text.slice(cursor));
  return <div className="revision-text">{parts}</div>;
}
export function RevisionCompare({original,rev}:{original:string[];rev:{sentences:string[];corrections:Revision['corrections']}}){
  const rows=useMemo(()=>alignSentences(original,rev.sentences,rev.corrections),[original,rev]);
  return <ol className="revision-compare">{rows.map((r,i)=><DiffRow key={i} a={r.orig!==undefined?original[r.orig]:undefined} b={r.rev!==undefined?rev.sentences[r.rev]:undefined} reasons={r.reasons}/>)}</ol>;
}
export function DiffRow({a,b,reasons,children,off}:{a?:string;b?:string;reasons:string[];children?:ReactNode;off?:boolean}){
  const parts=a!==undefined&&b!==undefined?wordDiff(a,b):a!==undefined?[{text:a,op:'del' as const}]:[{text:b??'',op:'add' as const}];
  const same=a===b;
  return <li className={`diff-row ${same?'same':''} ${off?'off':''}`}>{children}<p>{parts.map((p,i)=>p.op==='same'?<span key={i}>{p.text}</span>:p.op==='del'?<del key={i}>{p.text}</del>:<ins key={i}>{p.text}</ins>)}</p>
    {reasons.map((r,i)=><small key={i} className="diff-reason"><Bot size={11}/>{r}</small>)}</li>;
}

// ---------- a concept's sentences ----------
const authorLabel:Record<Author,string>={user_approved:'My approved revision',user:'My original',material:'From a material',ai:'AI material'};
function Highlight({x}:{x:Example}){
  const out:ReactNode[]=[];let at=0;
  x.ranges.forEach(([s,e],i)=>{out.push(x.text.slice(at,s));out.push(<mark key={i}>{x.text.slice(s,e)}</mark>);at=e});
  out.push(x.text.slice(at));return <>{out}</>;
}
export function useExamples(store:Store,c:Concept){
  return useMemo(()=>examplesOf(store.entries as never,c,finder(conceptsOf(store))),[store.entries,store.concepts,c]);
}
export function Examples({store,c,openNote,limit}:{store:Store;c:Concept;openNote:(id:string,layer:Example['layer'],sentence:number)=>void;limit?:number}){
  const all=useExamples(store,c);
  const [who,setWho]=useState<Author|'all'>('all');
  const list=who==='all'?all:all.filter(x=>x.author===who);
  const counts=authorOrder.map(a=>[a,all.filter(x=>x.author===a).length] as const).filter(([,n])=>n>0);
  return <section className="cp-block term-examples"><h2>{tr('Example sentences')} <small>{all.length}</small>{ownUses(all)>0&&<span className="own-uses" title={tr('Used in my own sentences')}><PenLine size={12}/>{ownUses(all)}</span>}</h2>
    {counts.length>1&&<div className="example-filter" role="group" aria-label={tr('Written by')}><button aria-pressed={who==='all'} onClick={()=>setWho('all')}>{tr('All')}</button>{counts.map(([a,n])=><button key={a} aria-pressed={who===a} onClick={()=>setWho(a)} title={tr(authorLabel[a])}><AuthorMark author={a}/>{n}</button>)}</div>}
    {list.length?<ul className="example-list">{list.slice(0,limit??200).map((x,i)=>{const e=store.entries.find(n=>n.id===x.entryId);return <li key={i}>
      <AuthorMark author={x.author}/><q><Highlight x={x}/></q>
      <button className="text-button" onClick={()=>openNote(x.entryId,x.layer,x.sentence)}><FileText size={12}/>{e?.title||e?.body.slice(0,30)}<time>{new Date(x.at).toLocaleDateString()}</time></button></li>})}</ul>:<p className="muted">—</p>}
  </section>;
}

const relGroups:ConceptRel[]=['contrasts','similar','related','kind_of','part_of','implements'];
/** Related concepts as chips by relation (antonyms, synonyms, easily confused). */
export function RelationChips({store,c,open}:{store:Store;c:Concept;open:(id:string)=>void}){
  const near=neighbours(c,conceptsOf(store));
  if(!near.length)return null;
  return <section className="cp-block term-rels">{relGroups.map(rel=>{const here=near.filter(n=>n.rel===rel);if(!here.length)return null;return <div key={rel} className="rel-group"><small>{conceptRelLabel[rel]}</small>
    {here.map((n,i)=>n.other?<button key={i} className="concept-chip" title={n.r.why} onClick={()=>open(n.other!.id)}>{n.other.name}{needsCheck(n.r)&&<CircleAlert size={11}/>}</button>:<span key={i} className="concept-chip static" title={n.r.why}>{n.name}</span>)}
    {here.some(n=>n.r.why)&&<p className="rel-why">{here.map(n=>n.r.why).filter(Boolean).join(' / ')}</p>}</div>})}</section>;
}

/** The term header: headword, part of speech, meaning, collocations, forms, pitfall. */
export function TermHead({c,confirm}:{c:Concept;confirm?:()=>void}){
  const t=c.term;if(!t)return null;
  return <section className="term-head">
    <div className="term-line"><b>{t.headword||c.name}</b>{t.pos&&<span className="term-pos">{t.pos}</span>}{t.meaningKo&&<span className="term-meaning">{t.meaningKo}</span>}
      <span className="layer-mark ai" title={tr('MOONS knowledge')}><Bot size={13}/></span>{!t.confirmed&&<button type="button" className="check-mark" title={tr('Not from your notes or materials. Confirm it')} aria-label={tr('Confirm')} disabled={!confirm} onClick={confirm}><CircleAlert size={14}/></button>}</div>
    {(t.collocations?.length??0)>0&&<ul className="term-colls">{t.collocations!.map(x=><li key={x}>{x}</li>)}</ul>}
    {(t.forms?.length??0)>0&&<p className="term-forms">{t.forms!.join(' · ')}</p>}
    {t.pitfall&&<p className="term-pitfall"><CircleAlert size={13}/>{t.pitfall}</p>}
  </section>;
}

/** A concept inside a side panel (My Space): the same header, sentences and relations, without leaving. */
export function ConceptBrief({store,id,back,open,openNote,go}:{store:Store;id:string;back:()=>void;open:(id:string)=>void;openNote:(id:string)=>void;go:(url:string)=>void}){
  const c=conceptsOf(store).find(x=>x.id===id);
  if(!c)return <button className="text-button" onClick={back}><ArrowLeft size={14}/></button>;
  return <article className="concept-brief">
    <button className="text-button" onClick={back}><ArrowLeft size={14}/>{tr('Back')}</button>
    <h2>{c.name}{unfamiliar(c)&&<DwarfBadge/>}</h2>
    {c.term?<TermHead c={c}/>:c.definition[0]&&<p className="cp-def">{c.definition[0].text}</p>}
    <Examples store={store} c={c} openNote={nid=>openNote(nid)} limit={40}/>
    <RelationChips store={store} c={c} open={open}/>
    <footer><button className="text-button" onClick={()=>go(`/concepts/${c.id}`)}><Lightbulb size={14}/>{tr('Concept page')}</button></footer>
  </article>;
}
