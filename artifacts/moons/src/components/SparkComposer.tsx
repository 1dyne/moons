import {useEffect,useRef,useState,type KeyboardEvent,type MutableRefObject} from 'react';
import {ArrowUp,LoaderCircle} from 'lucide-react';
import {tr} from '@/lib/i18n';
export type ComposerHandle={set:(value:string)=>void;focus:()=>void};
type Props={draftKey:string;onSubmit:(text:string)=>Promise<boolean>|boolean;label:string;placeholder?:string;maxLength?:number;disabled?:boolean;className?:string;hint?:string;handle?:MutableRefObject<ComposerHandle|null>;onText?:(value:string,caret:number)=>void;intercept?:(e:KeyboardEvent<HTMLTextAreaElement>,value:string)=>boolean;sendLabel?:string};
const read=(key:string)=>{try{return localStorage.getItem(key)??''}catch{return''}};
/** Shared Spark input: Enter sends, Shift+Enter breaks a line, IME composition is protected, draft lives in this browser only. */
export default function SparkComposer({draftKey,onSubmit,label,placeholder,maxLength=20000,disabled,className='composer',hint=tr('Enter to save · Shift+Enter for a new line'),handle,onText,intercept,sendLabel=tr('Save spark')}:Props){
  const [value,setValue]=useState(()=>read(draftKey)),[sending,setSending]=useState(false);
  const composing=useRef(false),area=useRef<HTMLTextAreaElement>(null),keyRef=useRef(draftKey);
  useEffect(()=>{keyRef.current=draftKey;setValue(read(draftKey))},[draftKey]);
  function persist(v:string){setValue(v);try{if(v)localStorage.setItem(keyRef.current,v);else localStorage.removeItem(keyRef.current)}catch{/* draft only */}}
  useEffect(()=>{if(handle)handle.current={set:persist,focus:()=>area.current?.focus()};return()=>{if(handle)handle.current=null}});
  async function submit(){const text=value.trim();if(!text||sending||disabled)return;setSending(true);let ok=false;try{ok=await onSubmit(text)}finally{setSending(false)}if(ok){persist('');area.current?.focus()}}
  function key(e:KeyboardEvent<HTMLTextAreaElement>){
    if(intercept?.(e,value))return;
    if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!composing.current&&e.keyCode!==229){e.preventDefault();void submit()}
  }
  return <div className={className}>
    <textarea ref={area} aria-label={label} placeholder={placeholder} value={value} maxLength={maxLength} disabled={disabled}
      onChange={e=>{persist(e.target.value);onText?.(e.target.value,e.target.selectionStart)}}
      onSelect={e=>onText?.(e.currentTarget.value,e.currentTarget.selectionStart)}
      onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={key}/>
    <button type="button" className="send-circle" disabled={!value.trim()||sending||disabled} onClick={()=>void submit()} aria-label={sendLabel} title={hint}>{sending?<LoaderCircle className="spin" size={22}/>:<ArrowUp size={23}/>}</button>
  </div>;
}
