import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type DragEvent} from 'react';
import * as Icons from 'lucide-react';
import {ArrowUpRight,Bold,ChevronDown,GripVertical,Highlighter,Link as LinkIcon,MoreHorizontal,Paperclip,Plus,Shapes,Star as StarIcon,Trash2} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {newBlock,newPage,pagesApi,pageTitle,snapshotEntries,type Block,type BlockValues,type Mark,type Page} from '@/lib/pages';
import {toggleMark} from '@/lib/richtext';
import {builtinStructures,builtinTools,DEFAULT_TOOLBAR,shapeOf,structureTool,type Tool} from '@/lib/tools';
import {getV9,saveStructure,upsertPage,dropPage,usePages} from '@/lib/v9-store';
import {colorOf,withAncestors} from '@/lib/planets';
import {rate,ratingsFor} from '@/lib/planner';
import {uid,type Store} from '@/lib/model';
import {dismiss,publishSuggestions,suggestFor,toErrorNote} from '@/lib/suggest';
import type {WorkspaceApi} from '@/lib/workspace-client';
import type {RichHandle} from './RichText';
import Stars from './Stars';
import PlanetPicker from './PlanetPicker';
import {CanvasBlock,CardBlock,ChatBlock,ChecklistBlock,ClozeBlock,DeleteButton,FieldsBlock,FileBlock,GalleryBlock,LinkBlock,ListEditor,LogBlock,QCardsBlock,Recorder,StatusBlock,TableBlock,TextBlock,TimelineBlock,blockLabel,pickFile,uploadToBlock} from './Blocks';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(u:string)=>void};
const IDLE_SNAPSHOT=30*60*1000;
const iconOf=(name:string)=>(Icons as unknown as Record<string,Icons.LucideIcon>)[name]??Shapes;

export function useTools(store:Store){
  const {structures}=usePages();
  const all=useMemo(()=>[...builtinTools(),...builtinStructures().map(structureTool),...structures.filter(s=>s.level!=='view').map(structureTool)],[structures]);
  const ids=(store.settings?.toolbar??DEFAULT_TOOLBAR);
  return {all,bar:ids.map(id=>all.find(t=>t.id===id)).filter((t):t is Tool=>!!t),ids};
}

/** v9 4.1–4.4: an empty page you write in straight away; tools put a block where the cursor is. */
export default function PageEditor({id,ctx,initial,onAsk,greeting}:{id?:string;ctx:Ctx;initial?:Page;onAsk?:(entryId:string|undefined,title:string)=>void;greeting?:React.ReactNode}){
  const {store,ws,notify,go}=ctx;
  const [page,setPage]=useState<Page|null>(()=>initial??(id?null:newPage()));
  const [focusIdx,setFocusIdx]=useState(0),[sel,setSel]=useState<{block:string;start:number;end:number;rect:DOMRect}|null>(null);
  const [more,setMore]=useState(false),[planets,setPlanets]=useState(false),[drag,setDrag]=useState<number|null>(null),[saving,setSaving]=useState<'idle'|'saving'|'error'>('idle'),[naming,setNaming]=useState<string|null>(null);
  const handles=useRef(new Map<string,RichHandle>()),dirty=useRef(false),pageRef=useRef(page),saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null),idleTimer=useRef<ReturnType<typeof setTimeout>|null>(null),saving_=useRef<Promise<void>|null>(null);
  pageRef.current=page;
  const tools=useTools(store);

  useEffect(()=>{if(!id||initial)return;let live=true;pagesApi.get(id).then(p=>{if(live)setPage(p)},()=>{if(live){notify(tr('Page not found.'));go('/')}});return()=>{live=false}},[id]);

  const persist=useCallback(async()=>{const p=pageRef.current;if(!p||!dirty.current)return;dirty.current=false;setSaving('saving');
    try{const saved=await pagesApi.save(p);if(pageRef.current?.id===saved.id){pageRef.current={...pageRef.current,revision:saved.revision};setPage(cur=>cur&&cur.id===saved.id?{...cur,revision:saved.revision,updatedAt:saved.updatedAt}:cur)}upsertPage({...saved,blocks:p.blocks});setSaving('idle')}
    catch(e){const err=e as {status?:number;body?:{page?:Page}};if(err.status===409&&err.body?.page){setPage(err.body.page);notify(tr('This page changed on another device. Showing the latest.'))}else{dirty.current=true;setSaving('error')}}},[]);
  const flush=useCallback(async()=>{if(saveTimer.current){clearTimeout(saveTimer.current);saveTimer.current=null}await (saving_.current=persist())},[persist]);

  /** v9 10.1: when leaving (or after 30 idle minutes) the words become a locked snapshot for analysis. */
  const snapshot=useCallback(async()=>{const p=pageRef.current;if(!p)return undefined;const s=ws.getStore();if(!s)return p.latestEntryId;
    const snap=snapshotEntries(p,s);if(!snap){await flush();return p.latestEntryId}
    if(!ws.commit(st=>({...st,entries:[...snap.entries,...st.entries]})))return p.latestEntryId;
    const next={...p,latestEntryId:snap.latestId,snapshotHash:snap.hash};pageRef.current=next;setPage(next);dirty.current=true;await flush();return snap.latestId},[flush,ws]);

  function change(next:Page){next={...next,updatedAt:new Date().toISOString()};setPage(next);pageRef.current=next;dirty.current=true;
    if(saveTimer.current)clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>void persist(),1500);
    if(idleTimer.current)clearTimeout(idleTimer.current);idleTimer.current=setTimeout(()=>void snapRef.current(),IDLE_SNAPSHOT)}
  // v9 8장: suggestions for this page, shown by the floating moon when the user turned them on.
  const changeRef=useRef<(p:Page)=>void>(()=>undefined);
  useEffect(()=>{if(!page||store.settings?.moonsSuggest===false){publishSuggestions({list:[]});return}
    const t=setTimeout(()=>publishSuggestions({list:suggestFor(page,store),apply:sg=>{const cur=pageRef.current;if(!cur)return;dismiss(sg.key);
      if(sg.kind==='format')changeRef.current({...cur,blocks:toErrorNote(cur)});
      else if(sg.kind==='planet'&&sg.planetId)changeRef.current({...cur,planetIds:[...cur.planetIds,sg.planetId]});
      else if(sg.kind==='link'&&sg.entryId){const target=sg.entryId;void snapRef.current().then(eid=>{if(!eid)return;ws.commit(st=>({...st,links:[...(st.links??[]),{id:uid(),from:eid,to:target,relation:'related',reason:'',createdAt:new Date().toISOString()}]}));notify(tr('Connected.'))})}
      publishSuggestions({list:suggestFor(pageRef.current!,ws.getStore()??store)})}}),1200);
    return()=>clearTimeout(t)},[page?.blocks,page?.planetIds,store.concepts,store.settings?.moonsSuggest]);
  useEffect(()=>()=>publishSuggestions({list:[]}),[]);
  const snapRef=useRef(snapshot);snapRef.current=snapshot;
  const pendingFocus=useRef<{id:string;at?:'start'|'end'|number}|null>(null);
  useLayoutEffect(()=>{const f=pendingFocus.current;if(!f)return;const h=handles.current.get(f.id);if(h){pendingFocus.current=null;h.focus(f.at)}});
  useEffect(()=>{const hide=()=>{if(document.visibilityState==='hidden')void snapRef.current()};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',hide);
    return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',hide);if(idleTimer.current)clearTimeout(idleTimer.current);void snapRef.current()}},[]);

  changeRef.current=change;
  if(!page)return <div className="loading-page"><Icons.LoaderCircle className="spin"/>{tr('Opening…')}</div>;
  const blocks=page.blocks;
  const setBlocks=(b:Block[])=>change({...page,blocks:b});
  const setValue=(i:number)=>(v:unknown)=>setBlocks(blocks.map((x,j)=>j===i?{...x,value:v}:x) as Block[]);
  const focusBlock=(bid:string,at?:'start'|'end'|number)=>{pendingFocus.current={id:bid,at};const h=handles.current.get(bid);if(h&&document.contains(h.el())){pendingFocus.current=null;h.focus(at)}};
  function insert(newOnes:Block[],at=Math.min(blocks.length,focusIdx+1)){
    const cur=blocks[focusIdx];let list=[...blocks];
    // An empty text block where the cursor is gets replaced instead of pushed down.
    if(cur&&cur.kind==='text'&&!(cur.value as BlockValues['text']).text.trim()&&at===focusIdx+1){list.splice(focusIdx,1);at=focusIdx}
    list.splice(at,0,...newOnes);if(!list.length||list.at(-1)!.kind!=='text')list.push(newBlock('text'));setBlocks(list);setFocusIdx(at);
    const first=newOnes[0];if(first&&(first.kind==='text'||first.kind==='heading'))focusBlock(first.id,'start');
  }
  async function useTool(t:Tool){setMore(false);
    if(t.id==='file'){const f=await pickFile();if(!f)return;const v=await uploadToBlock(f,notify);if(v)insert([newBlock('file',v,'source')]);return}
    insert(t.make());
  }
  async function dropFiles(files:FileList|File[]){for(const f of Array.from(files)){const v=await uploadToBlock(f,notify);if(v)insert([newBlock('file',v,'source')],blocks.length)}}
  function applyMark(type:Mark['type']){if(!sel)return;const i=blocks.findIndex(b=>b.id===sel.block);const b=blocks[i];if(!b)return;const v=b.value as BlockValues['text'];
    let href:string|undefined;if(type==='link'){href=window.prompt(tr('Link address'),'https://')?.trim();if(!href)return}
    setValue(i)({...v,marks:toggleMark(v.marks??[],sel.start,sel.end,type,href)});setSel(null)}
  function toggleFavorite(t:Tool){const cur=tools.ids;const next=cur.includes(t.id)?cur.filter(x=>x!==t.id):[...cur,t.id];ws.commit(s=>({...s,settings:{...(s.settings!),toolbar:next}}))}
  async function saveAsStructure(){const name=naming?.trim();if(!name)return;
    const s={id:uid(),name,level:'page' as const,blocks:shapeOf(blocks),source:'manual' as const,icon:'Shapes',favorite:false,position:getV9().structures.length};
    try{await saveStructure(s);ws.commit(st=>({...st,settings:{...(st.settings!),toolbar:[...(st.settings?.toolbar??DEFAULT_TOOLBAR),s.id]}}));notify(tr('Saved as my structure. It is on the toolbar now.'));setNaming(null)}catch(e){notify((e as Error).message)}}
  const myRating=ratingsFor(store,page.id).at(-1)?.value??page.confidence;
  const chosen=withAncestors(page.planetIds,store.planets);

  return <div className="page-editor" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();void dropFiles(e.dataTransfer.files)}}}>
    <div className="pe-toolbar" role="toolbar" aria-label={tr('Insert')}>
      {tools.bar.map(t=>{const I=iconOf(t.icon);return <button key={t.id} className="pe-tool" onClick={()=>void useTool(t)} title={t.label}><I size={17} strokeWidth={1.7}/><span>{t.label}</span></button>})}
      <div className="pe-more"><button className="pe-tool" aria-expanded={more} onClick={()=>setMore(!more)}><MoreHorizontal size={17}/><span>{tr('More')}</span></button>
        {more&&<div className="pe-more-pop" role="menu">{[[tr('Blocks'),tools.all.filter(t=>!t.structure)],[tr('Structures'),tools.all.filter(t=>t.structure)]].map(([label,list])=><div key={label as string}><small>{label as string}</small>
          {(list as Tool[]).map(t=>{const I=iconOf(t.icon);const fav=tools.ids.includes(t.id);return <div className="pm-row" key={t.id}><button role="menuitem" onClick={()=>void useTool(t)}><I size={15}/>{t.label}</button><button className={`icon-button tiny ${fav?'fav':''}`} aria-pressed={fav} aria-label={tr('Keep on toolbar')} title={tr('Keep on toolbar')} onClick={()=>toggleFavorite(t)}><StarIcon size={13}/></button></div>})}</div>)}</div>}
      </div>
      <span className="pe-spacer"/>
      <span className={`pe-save ${saving}`} role="status">{saving==='saving'?tr('Saving…'):saving==='error'?tr('Not saved'):''}</span>
    </div>

    {greeting}
    <input className="pe-title" aria-label={tr('Title')} placeholder={tr('Title')} value={page.title??''} onChange={e=>change({...page,title:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();const b=blocks[0];if(b)focusBlock(b.id,'start')}}}/>

    <div className="pe-blocks">{blocks.map((b,i)=>{
      const common={block:b as never,set:setValue(i) as never,notify};
      const body=b.kind==='text'||b.kind==='heading'?<TextBlock block={b as Block<'text'>} heading={b.kind==='heading'?(b.value as BlockValues['heading']).level:undefined} set={setValue(i) as (v:{text:string;marks?:Mark[]})=>void} handle={h=>handles.current.set(b.id,h)} onFocus={()=>setFocusIdx(i)}
          onEnter={(before,after)=>{const nb=newBlock('text',{text:after.text,marks:after.marks});const list=[...blocks];list[i]={...b,value:{...b.value,text:before.text,marks:before.marks}} as Block;
            // "# " at the start of a line makes it a heading (v9 4.2).
            if(b.kind==='text'&&/^#{1,2}\s/.test(before.text))list[i]={...b,kind:'heading',value:{text:before.text.replace(/^#{1,2}\s/,''),level:before.text.startsWith('##')?2:1}} as Block;
            list.splice(i+1,0,nb);setBlocks(list);setFocusIdx(i+1);focusBlock(nb.id,'start')}}
          onBackspaceEmpty={()=>{if(blocks.length<=1){if(b.kind==='heading')setBlocks([newBlock('text')]);return}const prev=blocks[i-1];setBlocks(blocks.filter((_,j)=>j!==i));if(prev){setFocusIdx(i-1);focusBlock(prev.id,'end')}}}
          onPasteLong={t=>insert([newBlock('text',{text:t},'source')],i+1)}
          onSelect={(r,rect)=>setSel(r&&rect?{block:b.id,...r,rect}:null)}/>
        :b.kind==='fields'?<FieldsBlock {...common}/>:b.kind==='status'?<StatusBlock {...common}/>:b.kind==='log'?<LogBlock {...common}/>:b.kind==='table'?<TableBlock {...common}/>
        :b.kind==='checklist'?<ChecklistBlock {...common}/>:b.kind==='steps'?<ListEditor label={tr('Step')} items={(b.value as BlockValues['steps']).items} set={items=>setValue(i)({items})} placeholder={tr('Step')} add={tr('Step')}/>
        :b.kind==='timeline'?<TimelineBlock {...common}/>:b.kind==='card'?<CardBlock {...common}/>:b.kind==='cloze'?<ClozeBlock {...common}/>:b.kind==='qcards'?<QCardsBlock {...common}/>
        :b.kind==='chat'?<ChatBlock {...common} onAsk={onAsk?()=>void snapshot().then(eid=>onAsk(eid,pageTitle(page))):undefined}/>:b.kind==='file'?<FileBlock {...common}/>:b.kind==='link'?<LinkBlock {...common}/>
        :b.kind==='canvas'?<CanvasBlock {...common}/>:b.kind==='gallery'?<GalleryBlock {...common}/>:<p className="muted">{b.kind}</p>;
      const simple=b.kind==='text'||b.kind==='heading';
      return <div key={b.id} className={`pe-block k-${b.kind} by-${b.by} ${drag===i?'dragging':''}`} onFocusCapture={()=>setFocusIdx(i)}
        onDragOver={(e:DragEvent)=>{if(drag!==null){e.preventDefault()}}} onDrop={(e:DragEvent)=>{if(drag===null)return;e.preventDefault();const list=[...blocks];const [m]=list.splice(drag,1);list.splice(i,0,m!);setBlocks(list);setDrag(null)}}>
        <div className="pe-gutter"><button className="pe-grip" draggable onDragStart={e=>{setDrag(i);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>setDrag(null)} aria-label={tr('Move block')} title={tr('Drag to move')}><GripVertical size={14}/></button></div>
        <div className="pe-body">{!simple&&<span className="pe-kind">{blockLabel(b.kind)}</span>}{body}</div>
        <div className="pe-side">
          {b.by!=='ai'&&<button className={`by-chip ${b.by}`} onClick={()=>setBlocks(blocks.map((x,j)=>j===i?{...x,by:x.by==='user'?'source':'user'}:x) as Block[])} title={tr('Switch between my words and source')}>{b.by==='source'?tr('Source'):tr('Mine')}</button>}
          {b.by==='ai'&&<span className="by-chip ai">AI</span>}
          {(blocks.length>1||!simple)&&<DeleteButton onClick={()=>setBlocks(blocks.length>1?blocks.filter((_,j)=>j!==i):[newBlock('text')])}/>}
        </div>
      </div>})}
    </div>

    <div className="pe-composer">
      <Recorder notify={notify} onDone={f=>void uploadToBlock(f,notify).then(v=>{if(v)insert([newBlock('file',v,'source')],blocks.length)})}/>
      <button className="icon-button" aria-label={tr('Attach file')} title={tr('Attach file')} onClick={()=>void pickFile().then(f=>f&&dropFiles([f]))}><Paperclip size={18}/></button>
      <button className="icon-button" aria-label={tr('Add link')} title={tr('Add link')} onClick={()=>insert([newBlock('link',{},'source')],blocks.length)}><LinkIcon size={18}/></button>
      <button className="icon-button" aria-label={tr('Add block')} title={tr('Add block')} onClick={()=>insert([newBlock('text')],blocks.length)}><Plus size={18}/></button>
    </div>

    <footer className="pe-meta">
      <div className="pe-planets"><button className="pe-planet-btn" onClick={()=>setPlanets(true)}>{chosen.length?chosen.map(pid=>{const p=store.planets.find(x=>x.id===pid);return p?<span key={pid} className={`planet-chip ${page.planetIds.includes(pid)?'':'auto'}`}><i style={{background:colorOf(p,store.planets)}}/>{p.name}</span>:null}):<span className="planet-chip dwarf">{tr('Dwarf planet')}</span>}<ChevronDown size={14}/></button></div>
      <Stars value={myRating} onChange={v=>{ws.commit(s=>rate(s,'page',page.id,v));change({...page,confidence:v})}}/>
      <span className="pe-spacer"/>
      {naming===null?<button className="text-button" onClick={()=>setNaming(page.title?.trim()||'')}>{tr('Save structure')}</button>
        :<form className="pe-name" onSubmit={e=>{e.preventDefault();void saveAsStructure()}}><input autoFocus aria-label={tr('Structure name')} placeholder={tr('Structure name')} value={naming} onChange={e=>setNaming(e.target.value)} maxLength={60}/><button className="primary small">{tr('Save')}</button><button type="button" className="text-button" onClick={()=>setNaming(null)}>{tr('Cancel')}</button></form>}
      <button className="text-button" onClick={()=>void snapshot().then(eid=>go(eid?`/learn?focus=${eid}`:'/learn'))}><ArrowUpRight size={14}/>{tr('Learn')}</button>
      {page.revision&&<button className="icon-button" aria-label={tr('Delete page')} title={tr('Delete page')} onClick={async()=>{if(!window.confirm(tr('Delete this page? Snapshots already analysed stay.')))return;await pagesApi.remove(page.id).catch(()=>undefined);dropPage(page.id);go('/')}}><Trash2 size={16}/></button>}
    </footer>

    {sel&&<div className="sel-menu" style={{left:Math.max(8,sel.rect.left+sel.rect.width/2-70),top:Math.max(8,sel.rect.top-46)}} onMouseDown={e=>e.preventDefault()}>
      <button aria-label={tr('Highlight')} title={tr('Highlight')} onClick={()=>applyMark('hl')}><Highlighter size={15}/></button>
      <button aria-label={tr('Bold')} title={tr('Bold')} onClick={()=>applyMark('b')}><Bold size={15}/></button>
      <button aria-label={tr('Link')} title={tr('Link')} onClick={()=>applyMark('link')}><LinkIcon size={15}/></button>
    </div>}
    {planets&&<PlanetPicker store={store} ws={ws} value={page.planetIds} close={()=>setPlanets(false)} save={ids=>{change({...page,planetIds:ids});setPlanets(false)}}/>}
  </div>;
}
