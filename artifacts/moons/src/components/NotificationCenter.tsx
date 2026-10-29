import {useState} from 'react';
import {Bell,Check,Columns2,MessageCircle,X} from 'lucide-react';
import {type Notice} from '@/lib/model';
import {tr} from '@/lib/i18n';
const kindLabel:Record<string,string>={project_review:tr('Project update'),breaking_news:tr('BREAKING'),bias_watch:tr('Heads up'),spy_reveal:tr('There was a spy'),source_ready:tr('Ready'),adjustment:tr('Adjustment')};
// Evidence ids may be entries, projects or tasks; the host resolves each to a label and a place to open.
export type Evidence={label:string;open:()=>void};
type Common={resolve:(id:string)=>Evidence|null;talk:(n:Notice)=>void;dismiss:(n:Notice)=>void;apply?:(n:Notice)=>void;canApply?:(n:Notice)=>boolean;applyLabel?:(n:Notice)=>string;sideBySide?:(n:Notice)=>void;canSideBySide?:(n:Notice)=>boolean};
function EvidenceList({n,resolve,after}:{n:Notice;resolve:Common['resolve'];after?:()=>void}){
  const items=n.evidence.map(id=>({id,ev:resolve(id)})).filter((x):x is {id:string;ev:Evidence}=>!!x.ev);
  return items.length?<div className="notice-evidence"><small>{tr('Evidence')}</small>{items.map(({id,ev})=><button key={id} onClick={()=>{after?.();ev.open()}}>{ev.label}</button>)}</div>:null;
}
function Actions({n,c,close}:{n:Notice;c:Common;close?:()=>void}){
  return <div className="notice-actions">{c.sideBySide&&c.canSideBySide?.(n)&&<button className="secondary small" onClick={()=>{close?.();c.sideBySide!(n)}}><Columns2 size={14}/>{tr('Side by side')}</button>}{c.apply&&c.canApply?.(n)&&<button className="secondary small" onClick={()=>{close?.();c.apply!(n)}}><Check size={14}/>{c.applyLabel?.(n)??tr('Apply')}</button>}<button className="primary small" onClick={()=>{close?.();c.talk(n)}}><MessageCircle size={14}/>{tr('Talk with MOONS')}</button><button className="text-button" onClick={()=>c.dismiss(n)}>{tr('Dismiss')}</button></div>;
}
export function NotificationBell({notices,markSeen,...c}:{notices:Notice[];markSeen:(ids:string[])=>void}&Common){
  const [open,setOpen]=useState(false);
  const live=notices.filter(n=>n.status!=='dismissed'),fresh=live.filter(n=>n.status==='new');
  function toggle(){const next=!open;setOpen(next);if(next&&fresh.length)markSeen(fresh.map(n=>n.id))}
  return <div className="bell-wrap"><button className="bell" aria-label={fresh.length?tr('Notifications, {n} new',{n:fresh.length}):tr('Notifications')} aria-expanded={open} onClick={toggle}><Bell size={17}/>{fresh.length>0&&<b>{fresh.length}</b>}</button>
    {open&&<div className="notice-pop" role="dialog" aria-label={tr('Notifications')}><header><strong>{tr('Notifications')}</strong><button aria-label={tr('Close notifications')} onClick={()=>setOpen(false)}><X size={15}/></button></header>
      {live.length?live.map(n=><article key={n.id} className={`notice ${n.kind}`}><span className="notice-kind">{kindLabel[n.kind]??n.kind}</span><p>{tr(n.headline)}</p><EvidenceList n={n} resolve={c.resolve} after={()=>setOpen(false)}/><Actions n={n} c={c} close={()=>setOpen(false)}/></article>):<div className="notice-empty"><Check size={22} strokeWidth={1.2}/><p>{tr('Nothing to flag.')}</p></div>}
    </div>}</div>;
}
export function NotificationBanner({notices,...c}:{notices:Notice[]}&Common){
  const top=notices.find(n=>n.status==='new');if(!top)return null;
  return <aside className={`notice-banner ${top.kind}`} role="status" aria-label={tr('Notification')}><span className="notice-kind">{kindLabel[top.kind]??top.kind}</span><div><p>{tr(top.headline)}</p><EvidenceList n={top} resolve={c.resolve}/></div><Actions n={top} c={c}/></aside>;
}
