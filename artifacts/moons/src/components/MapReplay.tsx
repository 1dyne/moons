import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Pause,Play,X} from 'lucide-react';
import type {Analysis,Edge,Entry} from '@/lib/model';
import {nodeText} from '@/lib/model';
import {relLabel} from '@/lib/structure';
import {tr} from '@/lib/i18n';

/** The order to explain a map in: the stored order (spine first, definitions before use), else reading order. */
export function replaySteps(a:Analysis):Edge[]{
  const stored=(a.order??[]).map(i=>a.edges[i]).filter((e):e is Edge=>!!e);
  if(stored.length)return [...stored,...a.edges.filter(e=>!stored.includes(e))];
  const first=(e:Edge)=>Math.min(...(a.nodes.find(n=>n.id===e.from)?.source??[]),...(a.nodes.find(n=>n.id===e.to)?.source??[]),Infinity);
  return [...a.edges].sort((x,y)=>first(x)-first(y));
}
/** The sentence a step stands on: its claim's, or where its two ends meet in the original. */
function evidence(a:Analysis,entry:Entry,e:Edge){
  const claim=a.claims?.find(c=>e.claimIds?.includes(c.id));
  if(claim)return claim.sentences;
  const from=a.nodes.find(n=>n.id===e.from)?.source??[],to=a.nodes.find(n=>n.id===e.to)?.source??[];
  const both=from.filter(i=>to.includes(i));
  return (both.length?both:[...from,...to]).slice(0,1).filter(i=>i<entry.sentences.length);
}

/** Steps through the map one line at a time, each with the original sentence it stands on (v7 6.1). */
export default function MapReplay({analysis,entry,step,setStep,close,openSource}:{analysis:Analysis;entry:Entry;step:number;setStep:(n:number)=>void;close:()=>void;openSource:(i:number[])=>void}){
  const steps=replaySteps(analysis),[playing,setPlaying]=useState(false);
  useEffect(()=>{if(!playing)return;if(step>=steps.length-1){setPlaying(false);return}const t=setTimeout(()=>setStep(step+1),2600);return()=>clearTimeout(t)},[playing,step,steps.length]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='ArrowRight')setStep(Math.min(step+1,steps.length-1));else if(e.key==='ArrowLeft')setStep(Math.max(step-1,0));else if(e.key==='Escape')close()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[step,steps.length]);
  const e=steps[step];
  if(!e)return null;
  const name=(id:string)=>{const n=analysis.nodes.find(x=>x.id===id);return n?nodeText(n):''};
  const src=evidence(analysis,entry,e);
  return <div className="map-replay" role="region" aria-label={tr('Explanation order')}>
    <div className="mr-controls">
      <button className="icon-button" aria-label={tr('Previous')} disabled={step===0} onClick={()=>setStep(step-1)}><ChevronLeft size={18}/></button>
      <button className="icon-button" aria-label={playing?tr('Pause'):tr('Play')} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={17}/>:<Play size={17}/>}</button>
      <button className="icon-button" aria-label={tr('Next')} disabled={step>=steps.length-1} onClick={()=>setStep(step+1)}><ChevronRight size={18}/></button>
      <span className="mr-count">{step+1}/{steps.length}</span>
    </div>
    <p className="mr-step"><b>{name(e.from)}</b><span className={`mr-rel ${e.role??''}`}>{e.rel?relLabel[e.rel]:e.label??'—'}</span><b>{name(e.to)}</b></p>
    {src.length>0&&<button type="button" className="mr-quote" onClick={()=>openSource(src)}>{src.map(i=><q key={i}>{entry.sentences[i]}</q>)}</button>}
    <button className="icon-button mr-close" aria-label={tr('Close')} onClick={close}><X size={17}/></button>
  </div>;
}
