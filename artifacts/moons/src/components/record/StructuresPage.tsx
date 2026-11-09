import * as Icons from 'lucide-react';
import {Star,Trash2} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {builtinStructures,builtinTools,DEFAULT_TOOLBAR,structureTool,type Structure} from '@/lib/tools';
import {removeStructure,saveStructure,usePages} from '@/lib/v9-store';
import {blockLabel} from './Blocks';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {uid} from '@/lib/model';

const iconOf=(n?:string)=>(Icons as unknown as Record<string,Icons.LucideIcon>)[n??'']??Icons.Shapes;

/** v9 4.5: my structures (blocks, pages) and what sits on the toolbar. Copy a built-in to change it. */
export default function StructuresPage({store,ws,notify}:{store:Store;ws:WorkspaceApi;notify:(m:string)=>void}){
  const {structures}=usePages();
  const bar=store.settings?.toolbar??DEFAULT_TOOLBAR;
  const setBar=(ids:string[])=>ws.commit(s=>({...s,settings:{...(s.settings!),toolbar:ids}}));
  const toggle=(id:string)=>setBar(bar.includes(id)?bar.filter(x=>x!==id):[...bar,id]);
  const Row=({s,mine}:{s:Structure;mine:boolean})=>{const I=iconOf(s.icon);return <li className="struct-row">
    <I size={18}/><div className="sr-main"><b>{s.name}</b><small>{s.blocks.map(b=>blockLabel(b.kind)).join(' · ')}</small></div>
    <button className={`icon-button tiny ${bar.includes(s.id)?'fav':''}`} aria-pressed={bar.includes(s.id)} aria-label={tr('Keep on toolbar')} onClick={()=>toggle(s.id)}><Star size={14}/></button>
    {mine?<><button className="text-button" onClick={async()=>{const n=window.prompt(tr('Structure name'),s.name)?.trim();if(n)await saveStructure({...s,name:n}).catch(e=>notify((e as Error).message))}}>{tr('Rename')}</button>
      <button className="icon-button tiny" aria-label={tr('Delete')} onClick={async()=>{if(window.confirm(tr('Delete this structure? Pages made with it stay.'))){await removeStructure(s.id);setBar(bar.filter(x=>x!==s.id))}}}><Trash2 size={13}/></button></>
    :<button className="text-button" onClick={async()=>{const copy={...structuredClone(s),id:uid(),name:`${s.name} (${tr('mine')})`,source:'manual' as const};await saveStructure(copy).catch(e=>notify((e as Error).message));notify(tr('Copied. Insert it in a page, change it, then save structure again.'))}}>{tr('Copy')}</button>}
  </li>};
  return <section className="page-shell structures">
    <h1>{tr('My structures')}</h1>
    <h2>{tr('Toolbar')}</h2>
    <ol className="bar-order">{bar.map((id,i)=>{const t=[...builtinTools(),...builtinStructures().map(structureTool),...structures.map(structureTool)].find(x=>x.id===id);if(!t)return null;const I=iconOf(t.icon);
      return <li key={id}><I size={15}/>{t.label}<button className="icon-button tiny" disabled={i===0} aria-label={tr('Move up')} onClick={()=>{const n=[...bar];[n[i-1],n[i]]=[n[i]!,n[i-1]!];setBar(n)}}>↑</button><button className="icon-button tiny" aria-label={tr('Remove')} onClick={()=>toggle(id)}>×</button></li>})}</ol>
    <h2>{tr('Mine')}</h2>
    {structures.length?<ul className="struct-list">{structures.map(s=><Row key={s.id} s={s} mine/>)}</ul>:<p className="muted">—</p>}
    <h2>{tr('Built in')}</h2>
    <ul className="struct-list">{builtinStructures().map(s=><Row key={s.id} s={s} mine={false}/>)}</ul>
    <h2>{tr('Blocks')}</h2>
    <ul className="struct-list">{builtinTools().map(t=>{const I=iconOf(t.icon);return <li key={t.id} className="struct-row"><I size={18}/><div className="sr-main"><b>{t.label}</b></div><button className={`icon-button tiny ${bar.includes(t.id)?'fav':''}`} aria-pressed={bar.includes(t.id)} aria-label={tr('Keep on toolbar')} onClick={()=>toggle(t.id)}><Star size={14}/></button></li>})}</ul>
  </section>;
}
