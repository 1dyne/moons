import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {tr} from '@/lib/i18n';
export default function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const prev=document.activeElement as HTMLElement;const dialog=ref.current;dialog?.querySelector<HTMLElement>('input,button:not(.icon-button),select,textarea')?.focus();
    const handler=(e:KeyboardEvent)=>{const dialogs=document.querySelectorAll('[aria-modal="true"]');if(dialogs[dialogs.length-1]!==dialog)return;if(e.key==='Escape')close();
      if(e.key==='Tab'){const items=dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,select,[tabindex="0"]');if(!items?.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
    document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);prev?.focus()}},[close]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}><header><h2>{title}</h2><button className="icon-button" onClick={close} aria-label={tr('Close')}><X size={20}/></button></header>{children}</div></div>;
}
