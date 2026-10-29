import {useRef} from 'react';
import {tr} from '@/lib/i18n';

/** Edits a node's wording in place, like renaming a file: Enter or leaving the field saves, Esc cancels. */
export function RenameInput({value,save,cancel}:{value:string;save:(text:string)=>void;cancel:()=>void}){
  const done=useRef(false);
  const finish=(text:string|null)=>{if(done.current)return;done.current=true;if(text===null)cancel();else save(text)};
  return <input className="node-rename" autoFocus defaultValue={value} aria-label={tr('Node wording')} maxLength={500}
    onFocus={e=>e.currentTarget.select()} onClick={e=>e.stopPropagation()}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();finish(e.currentTarget.value)}else if(e.key==='Escape'){e.preventDefault();finish(null)}}}
    onBlur={e=>finish(e.currentTarget.value)}/>;
}
