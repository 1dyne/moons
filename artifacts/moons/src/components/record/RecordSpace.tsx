import {useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,FolderOpen,Plus,Search} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {newPage,pageTitle,type Page} from '@/lib/pages';
import {usePages} from '@/lib/v9-store';
import {colorOf,withAncestors,planetTree} from '@/lib/planets';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {useRouter} from '@/lib/navigation';
import {Logo,Speech} from '../Brand';
import PageEditor from './PageEditor';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(u:string)=>void};
const GREETED='moons.greeted';
const greeted=()=>{try{return sessionStorage.getItem(GREETED)==='1'}catch{return true}};
const markGreeted=()=>{try{sessionStorage.setItem(GREETED,'1')}catch{/* private */}};
const when=(iso:string)=>{const d=new Date(iso),now=new Date();return d.toDateString()===now.toDateString()?d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([], {month:'short',day:'numeric'})};

/** v9 4장: the record space — recent pages on the left, an empty page in the middle. */
export default function RecordSpace({ctx,pageId,onAsk,startWith}:{ctx:Ctx;pageId?:string;onAsk:(entryId:string|undefined,title:string)=>void;startWith?:Page}){
  const {store,go}=ctx;const router=useRouter();
  const {pages,loaded}=usePages();
  const [draft,setDraft]=useState<Page>(()=>startWith??newPage());
  const [open,setOpen]=useState(()=>typeof window==='undefined'||!window.matchMedia('(max-width: 820px)').matches),[planet,setPlanet]=useState('all'),[q,setQ]=useState(''),[greet,setGreet]=useState(()=>!greeted());
  useEffect(()=>{if(!pageId&&startWith)setDraft(startWith)},[startWith]);
  // Leaving the draft for another page: coming back loads the saved copy instead of the stale draft.
  useEffect(()=>{if(pageId&&pageId!==draft.id)setDraft(newPage())},[pageId]);
  // Once the draft is saved it gets its own address without reopening the editor.
  const draftSaved=pages.some(p=>p.id===draft.id);
  useEffect(()=>{if(!pageId&&draftSaved)router.replace(`/pages/${draft.id}`)},[draftSaved]);
  const editingId=pageId&&pageId!==draft.id?pageId:undefined;
  const list=useMemo(()=>pages.filter(p=>(planet==='all'||(planet==='none'?!p.planetIds.length:withAncestors(p.planetIds,store.planets).includes(planet)))&&(!q||`${p.title??''} ${p.preview??''}`.toLowerCase().includes(q.toLowerCase()))),[pages,planet,q,store.planets]);
  const tree=planetTree(store.planets);
  const greeting=greet&&!pageId?<div className="greet" aria-hidden="true"><Speech mode="dump"/><Logo/></div>:null;
  return <div className={`record-space ${open?'with-list':''}`} onKeyDownCapture={()=>{if(greet){setGreet(false);markGreeted()}}} onPointerDownCapture={e=>{if(greet&&(e.target as HTMLElement).closest('.pe-blocks,.pe-title,.pe-toolbar')){setGreet(false);markGreeted()}}}>
    <aside className="recent" aria-label={tr('Recent pages')}>
      <div className="recent-head"><button className="primary small" onClick={()=>{const p=newPage();setDraft(p);go('/')}}><Plus size={15}/>{tr('New page')}</button><button className="icon-button" aria-label={tr('Hide list')} onClick={()=>setOpen(false)}><ChevronLeft size={16}/></button></div>
      <label className="search-field small"><Search size={14}/><input aria-label={tr('Search')} placeholder={tr('Search')} value={q} onChange={e=>setQ(e.target.value)}/></label>
      <select aria-label={tr('Mother planet')} value={planet} onChange={e=>setPlanet(e.target.value)}><option value="all">{tr('All planets')}</option>{tree.map(p=><option key={p.id} value={p.id}>{'　'.repeat(p.depth)}{p.name}</option>)}<option value="none">{tr('Dwarf planet')}</option></select>
      <ul className="recent-list">{list.map(p=><li key={p.id}><button className={(pageId??draft.id)===p.id?'on':''} onClick={()=>{go(`/pages/${p.id}`);if(window.matchMedia('(max-width: 820px)').matches)setOpen(false)}}>
        <span className="rl-title">{pageTitle(p)||tr('Untitled')}</span>
        <span className="rl-meta">{p.planetIds.slice(0,2).map(id=>{const pl=store.planets.find(x=>x.id===id);return pl?<i key={id} style={{background:colorOf(pl,store.planets)}} title={pl.name}/>:null})}{when(p.updatedAt)}</span>
      </button></li>)}{loaded&&!list.length&&<li className="muted rl-empty">—</li>}</ul>
      <div className="recent-foot"><button className="text-button" onClick={()=>go('/storage')}><FolderOpen size={14}/>{tr('Storage')}</button><button className="text-button" onClick={()=>go('/notes')}>{tr('Notes')}</button></div>
    </aside>
    {!open&&<button className="recent-open icon-button" aria-label={tr('Show recent pages')} onClick={()=>setOpen(true)}><ChevronRight size={16}/></button>}
    <section className="record-page">
      {editingId?<PageEditor key={editingId} id={editingId} ctx={ctx} onAsk={onAsk}/>:<PageEditor key={draft.id} initial={draft} ctx={ctx} onAsk={onAsk} greeting={greeting}/>}
    </section>
  </div>;
}
