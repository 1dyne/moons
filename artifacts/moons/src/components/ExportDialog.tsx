import {useEffect,useState} from 'react';
import {Copy,FileDown,FileText,Link2,LoaderCircle,X} from 'lucide-react';
import type {Store} from '@/lib/model';
import {defaultParts,downloadMarkdown,partLabel,parts,printUrl,type Part} from '@/lib/export';
import Modal from './Modal';
import {tr} from '@/lib/i18n';

type Share={token:string;title:string;entryIds:string[];include:Part[];createdAt:string;active:boolean};
const api=async<T,>(path:string,init?:RequestInit)=>{const r=await fetch(`${import.meta.env.BASE_URL}api/${path}`,{credentials:'include',...init,headers:{...(init?.body?{'content-type':'application/json'}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message??`Request failed (${r.status})`);return d as T};
const shareUrl=(token:string)=>`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/,'')}/s/${token}`;

/** Export one or more notes: printable PDF, Markdown (zip for several), or a read-only link. */
export default function ExportDialog({store,ids,title,close}:{store:Store;ids:string[];title:string;close:()=>void}){
  const [include,setInclude]=useState<Set<Part>>(new Set(defaultParts)),[busy,setBusy]=useState(''),[error,setError]=useState(''),[shares,setShares]=useState<Share[]>([]),[copied,setCopied]=useState('');
  useEffect(()=>{api<{shares:Share[]}>('shares').then(r=>setShares(r.shares.filter(s=>s.active&&s.entryIds.some(id=>ids.includes(id))))).catch(()=>undefined)},[ids.join(',')]);
  const toggle=(p:Part)=>setInclude(s=>{const n=new Set(s);if(n.has(p))n.delete(p);else n.add(p);return n});
  async function md(){setBusy('md');setError('');try{await downloadMarkdown(store,ids,include,title)}catch(e){setError((e as Error).message)}finally{setBusy('')}}
  function pdf(){window.open(printUrl(ids,include,title),'_blank','noopener')}
  async function share(){setBusy('share');setError('');try{const s=await api<Share>('shares',{method:'POST',body:JSON.stringify({title,entryIds:ids,include:[...include]})});setShares(x=>[{...s,createdAt:new Date().toISOString(),active:true},...x]);await copy(s.token)}catch(e){setError((e as Error).message)}finally{setBusy('')}}
  async function revoke(token:string){try{await api(`shares/${token}`,{method:'DELETE'});setShares(x=>x.filter(s=>s.token!==token))}catch(e){setError((e as Error).message)}}
  async function copy(token:string){try{await navigator.clipboard.writeText(shareUrl(token));setCopied(token)}catch{setCopied('')}}
  return <Modal title={ids.length>1?tr('Export {n} notes',{n:ids.length}):tr('Export this note')} close={close}><div className="export-dialog">
    <span className="label">{tr('Include')}</span>
    <div className="chip-row">{parts.map(p=><button key={p} type="button" className={include.has(p)?'selected':''} aria-pressed={include.has(p)} onClick={()=>toggle(p)}>{partLabel[p]}</button>)}</div>
    <div className="export-actions">
      <button className="secondary" onClick={pdf}><FileDown size={16}/>{tr('PDF (print view)')}</button>
      <button className="secondary" disabled={busy==='md'} onClick={()=>void md()}>{busy==='md'?<LoaderCircle className="spin" size={16}/>:<FileText size={16}/>}{ids.length>1?tr('Markdown (.zip)'):tr('Markdown (.md)')}</button>
      <button className="primary" disabled={busy==='share'} onClick={()=>void share()}>{busy==='share'?<LoaderCircle className="spin" size={16}/>:<Link2 size={16}/>}{tr('Create a read-only link')}</button>
    </div>
    
    {error&&<p role="alert" className="field-error">{error}</p>}
    {shares.length>0&&<div className="share-list"><span className="label">{tr('Active links for these notes')}</span>{shares.map(s=><div key={s.token} className="share-row"><code>{shareUrl(s.token).replace(/^https?:\/\//,'')}</code><button className="icon-button" aria-label={tr('Copy link')} onClick={()=>void copy(s.token)}><Copy size={14}/></button>{copied===s.token&&<small>{tr('Copied')}</small>}<button className="text-button" onClick={()=>void revoke(s.token)}><X size={13}/>{tr('Turn off')}</button></div>)}</div>}
  </div></Modal>;
}
