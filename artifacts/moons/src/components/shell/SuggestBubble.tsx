import {useState} from 'react';
import {X} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {dismiss,publishSuggestions,useSuggestions} from '@/lib/suggest';

/** v9 8장: a small bubble beside the floating moon when it has something to suggest. Never blocks writing. */
export default function SuggestBubble(){
  const {list,apply}=useSuggestions();const [open,setOpen]=useState(false);
  const s=list[0];if(!s)return null;
  const drop=()=>{dismiss(s.key);publishSuggestions({list:list.slice(1),apply});setOpen(false)};
  return <div className={`suggest ${open?'open':''}`} role="status">
    {!open?<button className="suggest-dot" onClick={()=>setOpen(true)} aria-label={tr('MOONS suggestion')}>{s.title}</button>
    :<div className="suggest-card"><div className="suggest-head"><b>{tr('MOONS suggestion')}</b><button className="icon-button tiny" aria-label={tr('Close')} onClick={()=>setOpen(false)}><X size={13}/></button></div>
      <p>{s.title}</p>{s.detail&&<small>{s.detail}</small>}
      <div className="suggest-actions"><button className="primary small" onClick={()=>{apply?.(s);setOpen(false)}}>{s.kind==='link'?tr('Connect'):tr('Apply')}</button><button className="text-button" onClick={drop}>{tr('Leave it')}</button></div></div>}
  </div>;
}
