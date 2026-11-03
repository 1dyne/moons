import {useEffect,useRef,useState} from 'react';
import {Image as ImageIcon,Plus,StickyNote,Spline,X} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {uid,type Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {currentEntries} from '@/lib/pages';
import {putView,type BoardItem,type SpaceViewDef} from '@/lib/space-views';
import {assetUrl,storageApi,type Asset} from '@/lib/storage-client';
import {colorOf} from '@/lib/planets';
import {pickFile} from '../record/Blocks';

const W=1200,H=760;
const tilt=(id:string)=>((id.charCodeAt(0)*37+id.charCodeAt(id.length-1))%7-3)*.6;

/** v9 7.1 보드: pull in pages, concepts and stored files, pin them and run thread between them.
 *  A line is for the whole Space by default; `이 보드` keeps it on this board only. The board points at the originals, it never copies them. */
export default function BoardView({view,store,ws,notify,go}:{view:SpaceViewDef;store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(u:string)=>void}){
  const board=view.board??{style:'pin',items:[],links:[]};
  const save=(b:typeof board)=>ws.commit(s=>putView(s,{...view,board:b}));
  const [q,setQ]=useState(''),[connect,setConnect]=useState(false),[first,setFirst]=useState<string|null>(null),[ask,setAsk]=useState<{from:string;to:string}|null>(null),[label,setLabel]=useState(''),[scope,setScope]=useState<'all'|'board'>('all'),[assets,setAssets]=useState<Asset[]>([]);
  const [local,setLocal]=useState(board.items);useEffect(()=>setLocal(board.items),[view.id,board.items.length]);
  const drag=useRef<{id:string;sx:number;sy:number;ox:number;oy:number}|null>(null);
  useEffect(()=>{storageApi.list().then(d=>setAssets(d.assets),()=>undefined)},[]);
  const entries=currentEntries(store.entries),concepts=store.concepts??[];
  const onBoard=new Set(local.map(i=>i.ref?`${i.ref.type}:${i.ref.id}`:''));
  const lib=[...entries.map(e=>({type:'entry' as const,id:e.id,name:e.title||e.body.slice(0,40),from:e.planetIds.map(id=>store.planets.find(p=>p.id===id)?.name).filter(Boolean).join(' · ')||tr('Dwarf planet'),color:(()=>{const p=store.planets.find(x=>x.id===e.planetIds[0]);return p?colorOf(p,store.planets):'#9a9b90'})()})),
    ...concepts.map(c=>({type:'concept' as const,id:c.id,name:c.name,from:tr('Concept'),color:'#9b7be0'})),
    ...assets.map(a=>({type:'asset' as const,id:a.id,name:a.name,from:tr('Storage'),color:'#9a9b90'}))].filter(x=>!onBoard.has(`${x.type}:${x.id}`)&&(!q||x.name.toLowerCase().includes(q.toLowerCase()))).slice(0,60);
  const add=(it:Omit<BoardItem,'id'|'x'|'y'|'w'>&{w?:number})=>{const k=local.length;const n:BoardItem={id:uid(),x:60+(k*53)%(W-300),y:60+(k*41)%(H-200),w:it.w??180,...it};const items=[...local,n];setLocal(items);save({...board,items})};
  const label_=(it:BoardItem)=>{if(it.kind!=='ref'||!it.ref)return it.text??'';const r=it.ref;return r.type==='entry'?(store.entries.find(e=>e.id===r.id)?.title||store.entries.find(e=>e.id===r.id)?.body.slice(0,60)||'?'):r.type==='concept'?concepts.find(c=>c.id===r.id)?.name??'?':assets.find(a=>a.id===r.id)?.name??'?'};
  const byId=new Map(local.map(i=>[i.id,i]));
  const pin=board.style==='pin';
  function click(id:string){if(!connect)return;if(!first){setFirst(id);return}if(first!==id){setAsk({from:first,to:id});setLabel('');setScope('all')}setFirst(null)}
  function makeLink(){if(!ask)return;const l={id:uid(),...ask,label:label.trim(),scope};save({...board,items:local,links:[...board.links,l]});
    // A line for the whole Space between two notes is also a note link (v6 7장), with the user's words as the reason.
    const a=byId.get(ask.from)?.ref,b=byId.get(ask.to)?.ref;
    if(scope==='all'&&a?.type==='entry'&&b?.type==='entry')ws.commit(s=>({...s,links:[...(s.links??[]),{id:uid(),from:a.id,to:b.id,relation:'related',reason:label.trim(),createdAt:new Date().toISOString()}]}));
    setAsk(null)}
  return <div className="board">
    <aside className="board-lib"><input className="board-q" aria-label={tr('Search')} placeholder={tr('Search')} value={q} onChange={e=>setQ(e.target.value)}/>
      <ul>{lib.map(x=><li key={x.type+x.id}><button onClick={()=>add({kind:'ref',ref:{type:x.type,id:x.id}})}><i style={{background:x.color}}/><span><b>{x.name}</b><small>{x.from}</small></span><Plus size={14}/></button></li>)}</ul></aside>
    <div className="board-main">
      <div className="board-bar">
        <div className="segs" role="group" aria-label={tr('Board style')}>{(['pin','mood'] as const).map(s=><button key={s} className={`seg ${board.style===s?'on':''}`} onClick={()=>save({...board,items:local,style:s})}>{s==='pin'?tr('Pinboard'):tr('Moodboard')}</button>)}</div>
        <button className={`secondary small ${connect?'on':''}`} aria-pressed={connect} onClick={()=>{setConnect(!connect);setFirst(null)}}><Spline size={14}/>{tr('Thread')}</button>
        <button className="secondary small" onClick={()=>add({kind:'sticky',text:''})}><StickyNote size={14}/>{tr('Sticky note')}</button>
        <button className="secondary small" onClick={async()=>{const f=await pickFile('image/*');if(!f)return;try{const {id}=await storageApi.upload(f);add({kind:'image',assetId:id,w:200})}catch(e){notify((e as Error).message)}}}><ImageIcon size={14}/>{tr('Image')}</button>
      </div>
      <div className="board-scroll"><div className={`board-surface ${pin?'pin':'mood'}`} style={{width:W,height:H}}>
        {board.links.map(l=>{const a=byId.get(l.from),b=byId.get(l.to);if(!a||!b)return null;const x1=a.x+a.w/2,y1=a.y+10,x2=b.x+b.w/2,y2=b.y+10,len=Math.hypot(x2-x1,y2-y1),ang=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
          return <div key={l.id}><i className={`b-thread ${l.scope}`} style={{left:x1,top:y1,width:len,transform:`rotate(${ang}deg)`}}/>
            <button className={`b-tlabel ${l.scope}`} style={{left:(x1+x2)/2,top:(y1+y2)/2}} title={tr('Switch: whole Space / this board')} onClick={()=>save({...board,items:local,links:board.links.map(x=>x.id===l.id?{...x,scope:x.scope==='all'?'board':'all'}:x)})}>{l.label||'·'}{l.scope==='board'?` · ${tr('this board')}`:''}</button></div>})}
        {local.map(it=>{const entry=it.ref?.type==='entry'?store.entries.find(e=>e.id===it.ref!.id):undefined;const planet=entry?store.planets.find(p=>p.id===entry.planetIds[0]):undefined;
          const bg=it.kind==='sticky'?'#ffe98f':it.kind==='image'?'#fff':it.ref?.type==='concept'?'#ded6fa':planet?colorOf(planet,store.planets)+'55':'#f3f1ea';
          return <div key={it.id} className={`b-item ${first===it.id?'sel':''} ${it.kind}`} style={{left:it.x,top:it.y,width:it.w,background:bg,transform:`rotate(${drag.current?.id===it.id?0:tilt(it.id)}deg)`}} onClick={()=>click(it.id)}>
            <div className="b-handle" onPointerDown={e=>{drag.current={id:it.id,sx:e.clientX,sy:e.clientY,ox:it.x,oy:it.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}}
              onPointerMove={e=>{const d=drag.current;if(!d||d.id!==it.id)return;setLocal(ls=>ls.map(x=>x.id===it.id?{...x,x:Math.max(0,Math.min(W-x.w,d.ox+e.clientX-d.sx)),y:Math.max(0,Math.min(H-40,d.oy+e.clientY-d.sy))}:x))}}
              onPointerUp={()=>{if(drag.current){drag.current=null;setLocal(ls=>{save({...board,items:ls});return ls})}}}><i className={pin?'pinhead':'tape'}/></div>
            {it.kind==='sticky'?<textarea aria-label={tr('Sticky note')} value={it.text??''} onChange={e=>setLocal(ls=>ls.map(x=>x.id===it.id?{...x,text:e.target.value}:x))} onBlur={()=>save({...board,items:local})}/>
            :it.kind==='image'&&it.assetId?<img src={assetUrl(it.assetId)} alt=""/>
            :<button className="b-body" onDoubleClick={()=>it.ref?.type==='entry'?go(`/entries/${it.ref.id}/original`):it.ref?.type==='concept'?go(`/concepts/${it.ref.id}`):undefined}><small>{it.ref?.type==='concept'?tr('Concept'):it.ref?.type==='asset'?tr('Storage'):planet?.name??tr('Dwarf planet')}</small>{label_(it)}</button>}
            <button className="icon-button tiny b-del" aria-label={tr('Remove from board')} onClick={e=>{e.stopPropagation();const items=local.filter(x=>x.id!==it.id);setLocal(items);save({...board,items,links:board.links.filter(l=>l.from!==it.id&&l.to!==it.id)})}}><X size={11}/></button>
          </div>})}
        {!local.length&&<div className="board-empty"><Plus size={22}/></div>}
      </div></div>
    </div>
    {ask&&<div className="onboard"><div className="onboard-card small"><b>{label_(byId.get(ask.from)!)} → {label_(byId.get(ask.to)!)}</b>
      <div className="ob-chips">{[tr('Situation'),tr('Reason'),tr('Counterexample'),tr('Fix'),tr('Same habit')].map(x=><button key={x} className={`chip ${label===x?'on':''}`} onClick={()=>setLabel(x)}>{x}</button>)}</div>
      <input aria-label={tr('Line name')} placeholder={tr('Line name')} value={label} onChange={e=>setLabel(e.target.value)} className="board-q"/>
      <div className="segs" role="group" aria-label={tr('Where it shows')}>{(['all','board'] as const).map(s=><button key={s} className={`seg ${scope===s?'on':''}`} onClick={()=>setScope(s)}>{s==='all'?tr('Whole Space'):tr('This board')}</button>)}</div>
      <div className="ob-actions"><span className="pe-spacer"/><button className="text-button" onClick={()=>setAsk(null)}>{tr('Cancel')}</button><button className="primary small" onClick={makeLink}>{tr('Connect')}</button></div></div></div>}
  </div>;
}
