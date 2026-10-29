import {useEffect,useRef,useState} from 'react';
import {Download,MessageSquareWarning,Settings as SettingsIcon,UserRound} from 'lucide-react';
import {tr} from '@/lib/i18n';

/** Settings, backup and feedback live behind the account button rather than in the tabs. */
export default function AccountMenu({go,download,feedback,active}:{go:(url:string)=>void;download:()=>void;feedback:()=>void;active:boolean}){
  const [open,setOpen]=useState(false),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;const close=(e:MouseEvent|KeyboardEvent)=>{if(e instanceof KeyboardEvent?e.key==='Escape':!box.current?.contains(e.target as Node))setOpen(false)};
    document.addEventListener('mousedown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',close)}},[open]);
  const item=(label:string,Icon:typeof Download,act:()=>void)=><button role="menuitem" onClick={()=>{setOpen(false);act()}}><Icon size={15}/>{label}</button>;
  return <div className="account-menu" ref={box}>
    <button className={`icon-button account-button ${active?'active':''}`} aria-haspopup="menu" aria-expanded={open} aria-label={tr('Account')} onClick={()=>setOpen(!open)}><UserRound size={19}/></button>
    {open&&<div className="account-pop" role="menu">{item(tr('Settings'),SettingsIcon,()=>go('/settings'))}{item(tr('Download backup'),Download,download)}{item(tr('Send feedback'),MessageSquareWarning,feedback)}</div>}
  </div>;
}
