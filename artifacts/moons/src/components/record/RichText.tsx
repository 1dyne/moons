import {useLayoutEffect,useRef,type ClipboardEvent,type KeyboardEvent} from 'react';
import {domToMarks,marksToHtml} from '@/lib/richtext';
import type {Mark} from '@/lib/pages';

export type RichHandle={focus:(at?:'start'|'end'|number)=>void;selection:()=>{start:number;end:number}|null;el:()=>HTMLElement|null};

function offsetIn(root:Node,node:Node,offset:number){const r=document.createRange();r.selectNodeContents(root);try{r.setEnd(node,offset)}catch{return 0}const f=r.cloneContents();const d=document.createElement('div');d.appendChild(f);return domToMarks(d,true).text.length}
function placeCaret(root:HTMLElement,pos:number){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let left=pos,n:Node|null;
  while((n=walker.nextNode())){const len=n.nodeValue?.length??0;if(left<=len){const s=window.getSelection();const r=document.createRange();r.setStart(n,left);r.collapse(true);s?.removeAllRanges();s?.addRange(r);return}left-=len}
  const s=window.getSelection();const r=document.createRange();r.selectNodeContents(root);r.collapse(false);s?.removeAllRanges();s?.addRange(r);
}

/** A contentEditable line of the user's words: text + highlight/bold/link ranges, nothing else. */
export default function RichText({text,marks,onChange,onEnter,onBackspaceEmpty,onPasteLong,onSelect,placeholder,className,handle,label,onFocus}:{text:string;marks?:Mark[];onChange:(text:string,marks:Mark[])=>void;onEnter?:(before:{text:string;marks:Mark[]},after:{text:string;marks:Mark[]})=>void;onBackspaceEmpty?:()=>void;onPasteLong?:(text:string)=>void;onSelect?:(r:{start:number;end:number}|null,rect:DOMRect|null)=>void;placeholder?:string;className?:string;handle?:(h:RichHandle)=>void;label:string;onFocus?:()=>void}){
  const el=useRef<HTMLDivElement>(null),last=useRef<string>('\u0000');
  const key=JSON.stringify([text,marks??[]]);
  useLayoutEffect(()=>{if(!el.current||last.current===key)return;el.current.innerHTML=marksToHtml(text,marks);last.current=key},[key]);
  const sel=()=>{const s=window.getSelection(),root=el.current;if(!s||!root||!s.rangeCount)return null;const r=s.getRangeAt(0);if(!root.contains(r.startContainer)||!root.contains(r.endContainer))return null;return {start:offsetIn(root,r.startContainer,r.startOffset),end:offsetIn(root,r.endContainer,r.endOffset)}};
  useLayoutEffect(()=>{handle?.({focus:at=>{const root=el.current;if(!root)return;root.focus();placeCaret(root,at==='start'?0:at==='end'||at===undefined?Number.MAX_SAFE_INTEGER:at)},selection:sel,el:()=>el.current})});
  function emit(){const root=el.current;if(!root)return;const v=domToMarks(root);last.current=JSON.stringify([v.text,v.marks]);onChange(v.text,v.marks)}
  function key_(e:KeyboardEvent<HTMLDivElement>){
    if(e.nativeEvent.isComposing||e.keyCode===229)return;
    if(e.key==='Enter'&&!e.shiftKey&&onEnter){e.preventDefault();const root=el.current!;const r=sel();const v=domToMarks(root);const at=r?.end??v.text.length;
      onEnter({text:v.text.slice(0,at),marks:(v.marks).filter(m=>m.start<at).map(m=>({...m,end:Math.min(m.end,at)}))},{text:v.text.slice(at),marks:v.marks.filter(m=>m.end>at).map(m=>({...m,start:Math.max(0,m.start-at),end:m.end-at}))});return}
    if(e.key==='Enter'&&e.shiftKey){e.preventDefault();document.execCommand('insertLineBreak');emit();return}
    if(e.key==='Backspace'&&onBackspaceEmpty&&!(el.current?.textContent??'').length){e.preventDefault();onBackspaceEmpty()}
  }
  function paste(e:ClipboardEvent<HTMLDivElement>){
    const t=e.clipboardData.getData('text/plain');e.preventDefault();
    if(onPasteLong&&(t.length>=200||t.split('\n').filter(x=>x.trim()).length>=4)){onPasteLong(t);return}
    document.execCommand('insertText',false,t);emit();
  }
  return <div ref={el} className={`rt ${className??''}`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} data-placeholder={placeholder}
    onInput={emit} onKeyDown={key_} onPaste={paste} onFocus={onFocus}
    onMouseUp={()=>{const r=sel();onSelect?.(r&&r.end>r.start?r:null,r&&r.end>r.start?window.getSelection()!.getRangeAt(0).getBoundingClientRect():null)}}
    onKeyUp={e=>{if(e.shiftKey){const r=sel();onSelect?.(r&&r.end>r.start?r:null,r&&r.end>r.start?window.getSelection()!.getRangeAt(0).getBoundingClientRect():null)}}}/>;
}
