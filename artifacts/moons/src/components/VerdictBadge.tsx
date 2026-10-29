import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {Verdict} from '@/lib/model';
import {shiftTag,verdictTag} from '@/lib/verdicts';
import {MoonCharacter as Moon} from './Brand';
import {tr} from '@/lib/i18n';
import '../styles/verdicts.css';

/** A comparison tag as a coloured symbol. Pressing it opens MOONS's explanation and what to look for. */
export default function VerdictBadge({verdict,shiftType,count,size='md',showLabel=false}:{verdict:Verdict;shiftType?:string|null;count?:number;size?:'sm'|'md';showLabel?:boolean}){
  const [open,setOpen]=useState(false),box=useRef<HTMLSpanElement>(null);
  const t=verdictTag[verdict],shift=shiftType?shiftTag[shiftType]:undefined;
  useEffect(()=>{if(!open)return;const close=(e:MouseEvent|KeyboardEvent)=>{if(e instanceof KeyboardEvent?e.key==='Escape':!box.current?.contains(e.target as Node))setOpen(false)};
    document.addEventListener('mousedown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',close)}},[open]);
  return <span className="vb-wrap" ref={box}>
    <button type="button" className={`vb ${verdict} ${size}`} aria-expanded={open} aria-label={`${t.label}${shift?` · ${shift.label}`:''}${count!==undefined?` ${count}`:''}`} onClick={()=>setOpen(!open)}>
      <span className="sym" aria-hidden>{t.symbol}</span>{showLabel&&<span className="lbl">{t.label}</span>}{count!==undefined&&<b>{count}</b>}{shift&&<span className="sub">{shift.label}</span>}
    </button>
    {open&&<span className={`vb-pop ${verdict}`} role="dialog" aria-label={t.label}>
      <span className="vb-head"><span className={`vb ${verdict} sm`} aria-hidden><span className="sym">{t.symbol}</span></span><b>{t.label}</b><small>{t.term}</small><button type="button" className="icon-button" aria-label={tr('Close')} onClick={()=>setOpen(false)}><X size={13}/></button></span>
      <span className="vb-voice"><Moon/><span>{t.say}{shift&&<><br/><b>{shift.label}</b> — {shift.say}</>}</span></span>
      {!shift&&<span className="vb-look"><b>{tr('What to look for')}</b>{t.look}</span>}
    </span>}
  </span>;
}
