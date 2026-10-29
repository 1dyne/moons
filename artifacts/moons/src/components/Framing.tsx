import {useState} from 'react';
import {relGlyph,relLabel,type Glyph} from '@/lib/structure';
import type {EdgeRelation} from '@/lib/thought';
import {tr} from '@/lib/i18n';
import '../styles/framing.css';

/** A line drawn by its shape: arrow = order, cause, solution, use · solid = kind, part · dotted = property, example · double = contrast. */
export function RelGlyph({glyph}:{glyph:Glyph}){
  return <svg className="rel-glyph" viewBox="0 0 34 14" width="30" height="12" aria-hidden>
    {glyph==='double'?<><line x1="2" y1="5" x2="32" y2="5"/><line x1="2" y1="9" x2="32" y2="9"/></>
      :glyph==='none'?<circle cx="17" cy="7" r="1.8" className="fill"/>
      :<line x1="2" y1="7" x2={glyph==='arrow'?28:32} y2="7" strokeDasharray={glyph==='dot'?'2 3':undefined}/>}
    {glyph==='arrow'&&<path d="M26 3 L32 7 L26 11" fill="none"/>}
  </svg>;
}

/** A tag that names a choice (a frame, a text kind). Pressed, it lists the options when the user may change it. */
export function ChoiceTag<T extends string>({label,value,options,labels,change,mine,empty}:{label:string;value:T|null|undefined;options:readonly T[];labels:Record<T,string>;change?:(v:T)=>void;mine?:boolean;empty?:string}){
  const [open,setOpen]=useState(false);
  const text=value?labels[value]:empty??'—';
  if(!change)return <span className="fr-tag static"><small>{label}</small>{text}</span>;
  return <span className="fr-choice">
    <button type="button" className={`fr-tag ${mine?'mine':''}`} aria-expanded={open} onClick={()=>setOpen(!open)}><small>{label}</small>{text}</button>
    {open&&<span className="fr-menu" role="group" aria-label={label}>{options.map(o=><button type="button" key={o} aria-pressed={o===value} onClick={()=>{change(o);setOpen(false)}}>{labels[o]}</button>)}</span>}
  </span>;
}

/** The relation on one line. The shape is always there; the name shows when pressed, and can be changed. */
export function RelButton({rel,mine,change}:{rel:EdgeRelation|null|undefined;mine?:boolean;change?:(r:EdgeRelation)=>void}){
  const [open,setOpen]=useState(false);
  const name=rel?relLabel[rel]:tr('Not read');
  return <span className="fr-rel">
    <button type="button" className={`fr-rel-btn ${mine?'mine':''}`} aria-expanded={open} aria-label={tr('Line: {rel}',{rel:name})} onClick={()=>setOpen(!open)}>
      <RelGlyph glyph={relGlyph(rel)}/>{open&&<span>{name}</span>}
    </button>
    {open&&change&&<span className="fr-menu" role="group" aria-label={tr('What this line means')}>
      <small>{mine?tr('Your choice'):tr('How MOONS read it')} · {tr('pick to change')}</small>
      {(Object.keys(relLabel) as EdgeRelation[]).map(r=><button type="button" key={r} aria-pressed={r===rel} onClick={()=>{change(r);setOpen(false)}}><RelGlyph glyph={relGlyph(r)}/>{relLabel[r]}</button>)}
    </span>}
  </span>;
}

/** The small moon that marks MOONS's words. */
export function MoonIcon({size=13}:{size?:number}){
  return <svg className="moon-icon" viewBox="0 0 12 12" width={size} height={size} aria-hidden><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor"/><circle cx="4.6" cy="6.3" r=".75" fill="currentColor"/><circle cx="7.4" cy="6.3" r=".75" fill="currentColor"/></svg>;
}

/** How many MOONS comments are open on a part. Pressing it goes to the first one. */
export function MoonBadge({count,open}:{count:number;open:()=>void}){
  if(!count)return null;
  return <button type="button" className="fr-moon" onClick={open} aria-label={tr('{n} MOONS comments',{n:count})}><MoonIcon size={14}/>{count}</button>;
}

export function RelKey(){
  const items:[Glyph,string][]=[['arrow',tr('Order · cause · solution · use')],['line',tr('Kind · part')],['dot',tr('Property · example')],['double',tr('Contrast')]];
  return <div className="fr-key" aria-label={tr('Line shapes')}>{items.map(([g,t])=><span key={g}><RelGlyph glyph={g}/>{t}</span>)}</div>;
}
