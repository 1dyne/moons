import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Check,ChevronDown,ImageDown,Focus,Hand,Layers,Plus,RotateCcw,Save,SlidersHorizontal,Trash2,X,ZoomIn,ZoomOut,Network,ArrowUpRight,Spline,ArrowLeft,Columns2,Orbit as OrbitIcon} from 'lucide-react';
import {aggregatePlanetEdges,edgeLabel} from '@/lib/mother-links';
import {toggleCompare,compareEntries,COMPARE_MAX} from '@/lib/compare-tray';
import SatelliteOrbits from './SatelliteOrbits';
import SplitWorkspace from './SplitWorkspace';
import UniverseScene,{type SceneHandle} from './universe-3d/UniverseScene';
import HandControl,{toScreen} from './universe-3d/HandControl';
import './universe-3d/universe.css';
import type {GestureEvent,Point} from '@/lib/hand-gesture';
import type {UniverseSelection,Position3} from '@/lib/live-universe';
import {placedFor,toUniverseDTO} from '@/lib/personal-universe';
import {spaceName} from '@/lib/chat';
import {type Store,type Entry,uid} from '@/lib/model';
import {arrangePlanets,defaultCamera,spaceStore,DWARF_ID,captureBaseline,visibleEntries,type UniverseState,type UniverseView} from '@/lib/universe';
import {tr} from '@/lib/i18n';
import {ConceptBrief,Linked,LinkToggle,RevisionTabs,RevisionText} from './Terms';

type Props={go?:(url:string)=>void;toggleSatellites?:()=>void;store:Store;save:(state:UniverseState,views?:UniverseView[])=>boolean;create:(name:string,color:string)=>boolean;remove:(id:string)=>boolean;open:(id:string)=>void;classify:(id:string)=>void;home?:()=>void;sideBySide?:(ids:string[])=>void;exportNotes?:(ids:string[],title:string)=>void};
const title=(entry:Entry)=>entry.title||entry.body.split('\n')[0].slice(0,45)||'Untitled';
const SCALE=.18;

export default function UniverseWorkspace(props:Props){
  const {create,remove,open,classify}=props;
  const store=useMemo(()=>spaceStore(props.store),[props.store]);
  const [state,setState]=useState<UniverseState>(()=>store.universe?{...store.universe,planetIds:store.universe.positions[DWARF_ID]?store.universe.planetIds:[...store.universe.planetIds,DWARF_ID]}:{planetIds:store.planets.map(p=>p.id),positions:arrangePlanets(store.planets,store.entries),camera:{...defaultCamera}});
  const [panel,setPanel]=useState<'keywords'|'views'|'nodes'|null>('keywords'),[selected,setSelected]=useState<string|null>(null),[name,setName]=useState<string|null>(null),[notice,setNotice]=useState('');
  const [creating,setCreating]=useState(false),[createName,setCreateName]=useState(''),[createColor,setCreateColor]=useState('#adc5ef'),[pendingDelete,setPendingDelete]=useState<string|null>(null);
  const [selectedPlanet,setSelectedPlanet]=useState<string|null>(null),[brief,setBrief]=useState<string|null>(null);
  useEffect(()=>setBrief(null),[selected,selectedPlanet,panel]);
  const area=useRef<HTMLDivElement>(null),stateRef=useRef(state),propsRef=useRef(props),timer=useRef<ReturnType<typeof setTimeout>|null>(null),noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [hands,setHands]=useState(false),[showLinks,setShowLinks]=useState(true),[flat,setFlat]=useState(false),[reduced,setReduced]=useState(false);
  const scene=useRef<SceneHandle>(null),camTimer=useRef<ReturnType<typeof setTimeout>|null>(null),grabbed=useRef<string|null>(null),hovered=useRef<HTMLElement|null>(null);
  const [cmp,setCmp]=useState<string[]>([]),[sideBySide,setSideBySide]=useState(false);
  const cmpRef=useRef({sideBySide,dialog:false});cmpRef.current={sideBySide,dialog:name!==null||pendingDelete!==null};
  const fresh=useMemo(()=>new Set<string>(),[]);
  propsRef.current={...props,store};
  useEffect(()=>{
    if(name===null)return;
    const before=document.activeElement as HTMLElement;
    const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')setName(null);if(event.key==='Tab'){
      const elements=document.querySelectorAll<HTMLElement>('.cosmos-save input,.cosmos-save button:not(:disabled)');
      if(!elements?.length)return;const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }};
    document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);before?.focus()};
  },[name===null]);
  // B1: Escape returns home unless a dialog, side-by-side view, or text field owns the key.
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented)return;
      if(cmpRef.current.sideBySide){setSideBySide(false);return}
      const t=event.target as HTMLElement|null;
      if(cmpRef.current.dialog||t?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')||document.querySelector('[role="dialog"]'))return;
      propsRef.current.home?.();
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[]);
  const priorIds=useRef(store.planets.map(p=>p.id));
  const layoutKey=store.entries.map(e=>`${e.id}:${e.planetIds.join(',')}`).join(';');
  useEffect(()=>{
    const current=stateRef.current;
    if(current.layoutKey===layoutKey||current.manual||current.activeViewId)return;
    const visible=propsRef.current.store.planets.filter(p=>current.planetIds.includes(p.id));
    update({...current,layoutKey,positions:{...current.positions,...arrangePlanets(visible,propsRef.current.store.entries)}});
  },[layoutKey]);
  function message(text:string){setNotice(text);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),2800)}
  function persist(next:UniverseState,views?:UniverseView[]){if(timer.current)clearTimeout(timer.current);timer.current=null;return propsRef.current.save(next,views)}
  function update(next:UniverseState){stateRef.current=next;setState(next);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=null;propsRef.current.save(stateRef.current)},350)}
  useEffect(()=>{const flush=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;propsRef.current.save(stateRef.current)}};window.addEventListener('pagehide',flush);return()=>window.removeEventListener('pagehide',flush)},[]);
  useEffect(()=>()=>{if(timer.current){clearTimeout(timer.current);propsRef.current.save(stateRef.current)}if(noticeTimer.current)clearTimeout(noticeTimer.current)},[]);
  useEffect(()=>{
    const ids=store.planets.map(p=>p.id),added=ids.filter(id=>!priorIds.current.includes(id));
    priorIds.current=ids;
    const current=stateRef.current,valid=current.planetIds.filter(id=>ids.includes(id));
    const missing=ids.filter(id=>!current.positions[id]);
    if(added.length||valid.length!==current.planetIds.length||missing.length){
      const auto=arrangePlanets(store.planets,store.entries),positions={...current.positions};
      for(const id of missing)positions[id]=auto[id];
      update({...current,planetIds:[...new Set([...valid,...added])],positions});
    }
  },[store.planets]);
  useEffect(()=>{const q=window.matchMedia('(prefers-reduced-motion: reduce)');setReduced(q.matches);const f=()=>setReduced(q.matches);q.addEventListener('change',f);return()=>q.removeEventListener('change',f)},[]);
  useEffect(()=>()=>{if(camTimer.current)clearTimeout(camTimer.current);hovered.current?.classList.remove('uv-hand-hover')},[]);
  function snapCamera(){const pose=scene.current?.getCamera();if(pose){stateRef.current={...stateRef.current,camera3D:pose};}return pose}
  function scheduleSnap(){if(camTimer.current)clearTimeout(camTimer.current);camTimer.current=setTimeout(()=>{camTimer.current=null;const pose=scene.current?.getCamera();if(pose)update({...stateRef.current,camera3D:pose})},1200)}
  const planets=store.planets.filter(p=>state.planetIds.includes(p.id));
  const placed=useMemo(()=>placedFor(state.planetIds,state),[state.positions,state.positions3D,state.planetIds]);
  const dto=useMemo(()=>toUniverseDTO(store,state,store.profile?.username??'guest'),[store,state.planetIds,state.positions]);
  const entries=useMemo(()=>visibleEntries(store.entries,state.planetIds),[store.entries,state.planetIds]);
  const preview=store.entries.find(e=>e.id===selected),active=(store.views??[]).find(v=>v.id===state.activeViewId),camera=state.camera;
  const dirty=active?JSON.stringify([active.planetIds,active.positions,active.positions3D,active.baseline?.id])!==JSON.stringify([state.planetIds,state.positions,state.positions3D,state.baseline?.id]):false;
  const sceneSelection:UniverseSelection=selected?{kind:'thought',id:selected}:selectedPlanet?{kind:'planet',id:selectedPlanet}:null;
  const onSelect=useCallback((next:UniverseSelection,compare?:boolean)=>{if(next?.kind==='thought'&&compare){const id=next.id;setCmp(c=>{const r=toggleCompare(c,id);if(r.full)message(`Compare holds up to ${COMPARE_MAX} pages`);return r.ids});return}if(!next){setSelected(null);setSelectedPlanet(null);return}if(next.kind==='thought'){setSelected(next.id);setPanel('nodes')}else{setSelectedPlanet(next.id);setSelected(null);setPanel('nodes')}},[]);
  function onPlace(id:string,pt:Position3){const c=stateRef.current;update({...c,manual:true,positions:{...c.positions,[id]:{x:pt[0]/SCALE,y:-pt[1]/SCALE}},positions3D:{...(c.positions3D??{}),[id]:pt}})}
  function resetPlanets(){const c=stateRef.current,vis=propsRef.current.store.planets.filter(p=>c.planetIds.includes(p.id));update({...c,manual:false,positions3D:undefined,positions:{...c.positions,...arrangePlanets(vis,propsRef.current.store.entries)}});message(tr('Planets arranged by similarity'))}
  async function captureView(){
    const viewName=active?.name??spaceName(store.profile),day=new Date().toLocaleDateString();
    const blob=await scene.current?.capture(`${viewName} · ${day}`);
    if(!blob){message(tr('Could not capture this view.'));return}
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`moons-${viewName.replace(/[^\p{L}\p{N}_-]+/gu,'-')}-${new Date().toISOString().slice(0,10)}.png`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function resetCamera(){setSelected(null);setSelectedPlanet(null);scene.current?.reset();update({...stateRef.current,camera3D:undefined})}
  // Hand control: what the fingertip is on, then pinch to click or carry a planet.
  const under=useCallback((p:Point)=>{const at=toScreen(p),stage=area.current?.getBoundingClientRect();const element=stage?document.elementFromPoint(stage.left+at.x*stage.width,stage.top+at.y*stage.height)?.closest<HTMLElement>('a, button')??null:null;return{at,stage,element,near:element?null:scene.current?.nearest(at.x,at.y,64)??null}},[]);
  const probe=useCallback((p:Point)=>{const {element,near,stage}=under(p);if(hovered.current!==element){hovered.current?.classList.remove('uv-hand-hover');element?.classList.add('uv-hand-hover');hovered.current=element}if(element&&stage){const r=element.getBoundingClientRect();return{x:(r.left+r.width/2-stage.left)/stage.width,y:(r.top+r.height/2-stage.top)/stage.height}}return near?{x:near.x,y:near.y}:null},[under]);
  const gesture=useCallback((events:GestureEvent[])=>{for(const event of events){
    if(event.type==='pinchStart'){const {element,at}=under(event);grabbed.current=element?.dataset.planet??(()=>{const near=scene.current?.nearest(at.x,at.y,72,true);return near?.selection?.kind==='planet'?near.selection.id:null})()}
    else if(event.type==='select'||event.type==='doubleTap'){const {element,near}=under(event);if(element)element.click();else if(near?.selection)onSelect(near.selection);else onSelect(null)}
    else if(event.type==='orbit'){if(grabbed.current){const at=toScreen(event);scene.current?.movePlanet(grabbed.current,at.x,at.y)}else scene.current?.rotate(event.dx*4.2,event.dy*3)}
    else if(event.type==='pinchEnd'){grabbed.current=null;scheduleSnap()}
    else if(event.type==='spread')scene.current?.spread(.12+event.value*1.13);
    else if(event.type==='lost'){if(event.role!=='pointer')scene.current?.spread(1);if(event.role!=='spread'){hovered.current?.classList.remove('uv-hand-hover');hovered.current=null;grabbed.current=null}}
  }},[under,onSelect]);
  function focusPlanet(id:string){setSelectedPlanet(id);setSelected(null);setPanel('nodes')}
  function showNode(id:string){setSelected(id);setPanel('nodes')}
  function baseline(){const saved=captureBaseline(stateRef.current.planetIds,stateRef.current.positions);const next={...stateRef.current,baseline:saved,manual:true};update(next);persist(next);message(tr('Relationship baseline saved'))}
  function saveView(){if(name===null||!name.trim())return;snapCamera();const id=uid(),view={...stateRef.current,id,name:name.trim(),activeViewId:id};const next={...stateRef.current,activeViewId:id};if(persist(next,[...(store.views??[]),view])){stateRef.current=next;setState(next);setName(null);message(tr('View saved'))}}
  function switchView(view:UniverseView){const next={planetIds:view.planetIds.filter(id=>store.planets.some(p=>p.id===id)||id===DWARF_ID),positions:view.positions,positions3D:view.positions3D,camera3D:view.camera3D,camera:view.camera,activeViewId:view.id,manual:view.manual,baseline:view.baseline};update(next);persist(next);setPanel(null);setSelected(null);setSelectedPlanet(null);if(view.camera3D)scene.current?.setCamera(view.camera3D);else scene.current?.reset()}
  const edges=useMemo(()=>aggregatePlanetEdges(dto.thoughts,dto.links),[dto]);
  const cmpEntries=compareEntries(cmp,store.entries);
  function toggleCmp(id:string){const r=toggleCompare(cmp,id);if(r.full)message(`Compare holds up to ${COMPARE_MAX} pages`);setCmp(r.ids)}
  const listed=selectedPlanet?store.entries.filter(e=>e.planetIds.includes(selectedPlanet)):entries;
  const selectedParent=store.planets.find(p=>p.id===selectedPlanet);
  const sidePanel=panel?<div className="space-inspector">
    <header className="inspector-tabs"><div>{[['keywords',tr('Planets')],['nodes',tr('Pages')],['views',tr('Views')]].map(([id,label])=><button key={id} aria-pressed={panel===id} onClick={()=>{setPanel(id as 'keywords'|'nodes'|'views');setSelected(null)}}>{label}</button>)}</div><button aria-label={tr('Close side panel')} onClick={()=>{setPanel(null);setSelected(null)}}><X size={18}/></button></header>
    <div className="inspector-content">
    {panel==='keywords'?<><h2>{tr('Mother planets')}</h2><div className="cosmos-panel-actions"><button onClick={()=>update({...stateRef.current,planetIds:store.planets.map(p=>p.id)})}>{tr('Select all')}</button><button onClick={()=>update({...stateRef.current,planetIds:[]})}>{tr('Clear')}</button></div><div className="cosmos-keywords">{store.planets.map(p=><div key={p.id}><label><input type="checkbox" checked={state.planetIds.includes(p.id)} onChange={e=>update({...stateRef.current,planetIds:e.target.checked?[...stateRef.current.planetIds,p.id]:stateRef.current.planetIds.filter(id=>id!==p.id)})}/><i style={{background:p.color}}/><span>{p.name}</span><small>{p.entryCount}</small></label>{p.id!==DWARF_ID&&<button aria-label={tr('Delete {name}',{name:p.name})} onClick={()=>setPendingDelete(p.id)}><Trash2 size={14}/></button>}</div>)}</div>{pendingDelete&&<div className="inline-planet-form"><p>Remove {store.planets.find(p=>p.id===pendingDelete)?.name}? Nodes will be kept.</p><div className="inline-actions"><button onClick={()=>setPendingDelete(null)}>{tr('Cancel')}</button><button onClick={()=>{if(remove(pendingDelete))setPendingDelete(null)}}>{tr('Remove mother planet')}</button></div></div>}{creating?<form className="inline-planet-form" onSubmit={e=>{e.preventDefault();if(createName.trim()&&!store.planets.some(p=>p.name.toLowerCase()===createName.trim().toLowerCase())&&create(createName.trim(),createColor)){setCreating(false);setCreateName('')}}}><label>{tr('Mother planet name')}<input aria-label={tr('New Mother planet name')} autoFocus value={createName} onChange={e=>setCreateName(e.target.value)} maxLength={20} required/></label><div className="inline-colors">{['#adc5ef','#d3c6ec','#c9dccb','#e9c7b4','#eddcaa'].map(color=><button key={color} type="button" aria-label={tr('Choose {color}',{color})} aria-pressed={createColor===color} style={{background:color}} onClick={()=>setCreateColor(color)}>{createColor===color&&<Check size={14}/>}</button>)}</div>{store.planets.some(p=>p.name.toLowerCase()===createName.trim().toLowerCase())&&<p className="field-error">{tr('This name is already in use.')}</p>}<div className="inline-actions"><button type="button" onClick={()=>setCreating(false)}>{tr('Cancel')}</button><button disabled={!createName.trim()||store.planets.some(p=>p.name.toLowerCase()===createName.trim().toLowerCase())}>{tr('Create')}</button></div></form>:<button className="cosmos-add" onClick={()=>setCreating(true)}><Plus size={16}/>{tr('Create mother planet')}</button>}<section aria-label={tr('Mother planet connections')}><h3>{tr('Connections')}</h3>{edges.length?<ul className="planet-edge-list">{edges.map(e=><li key={e.a+e.b} title={edgeLabel(e,id=>store.planets.find(p=>p.id===id)?.name??id)} aria-label={edgeLabel(e,id=>store.planets.find(p=>p.id===id)?.name??id)}>{store.planets.find(p=>p.id===e.a)?.name} — {store.planets.find(p=>p.id===e.b)?.name}: {e.shared} shared + {e.links} links = {e.weight}</li>)}</ul>:<p className="inspector-empty">{tr('No shared nodes or links between planets yet.')}</p>}</section><section className="baseline-card"><h3>{tr('Relationship baseline')}</h3><button onClick={baseline} disabled={planets.filter(p=>p.id!==DWARF_ID).length<2}><Save size={15}/>{state.baseline?tr('Update baseline'):tr('Capture baseline')}</button>{state.baseline&&<><time>Saved {new Date(state.baseline.createdAt).toLocaleString('en-US')}</time><small>{state.baseline.distances.length} distances · AI suggestions not connected</small></>}</section></>
    :panel==='views'?<><h2>{tr('Saved views')}</h2>{(store.views??[]).map(v=><div className="cosmos-saved" key={v.id}><button onClick={()=>switchView(v)}><span>{v.name}{active?.id===v.id&&<Check size={13}/>}</span><small>{v.planetIds.map(id=>store.planets.find(p=>p.id===id)?.name).filter(Boolean).join(' · ')}</small></button><button aria-label={tr('Delete view {name}',{name:v.name})} onClick={()=>{const next={...stateRef.current,activeViewId:stateRef.current.activeViewId===v.id?undefined:stateRef.current.activeViewId};if(persist(next,store.views?.filter(s=>s.id!==v.id))){setState(next);stateRef.current=next}}}><Trash2 size={14}/></button></div>)}{!store.views?.length&&<p className="inspector-empty">{tr('No saved views yet.')}</p>}{active&&<button className="cosmos-add" disabled={!dirty} onClick={()=>{snapCamera();if(persist(stateRef.current,store.views?.map(v=>v.id===active.id?{...v,...stateRef.current}:v)))message(tr('View updated'))}}><Save size={15}/>{tr('Update current view')}</button>}<button className="cosmos-add" onClick={()=>setName('')}><Plus size={16}/>{tr('Save as a new view')}</button></>
    :brief?<ConceptBrief store={store} id={brief} back={()=>setBrief(null)} open={setBrief} openNote={id=>{setBrief(null);showNode(id)}} go={props.go??(()=>undefined)}/>
    :preview?<article className="node-reading"><button className="text-button" onClick={()=>setSelected(null)}>← {selectedParent?.name??tr('Pages')}</button><h2>{title(preview)}</h2><time>{new Date(preview.createdAt).toLocaleDateString('en-US')}</time><div className="reading-tools">{(store.concepts?.length??0)>0&&<LinkToggle/>}</div><RevisionTabs key={preview.id} entry={preview} original={<p>{preview.body?<Linked text={preview.body} store={store} open={setBrief}/>:tr('No body text')}</p>} revised={rev=><RevisionText rev={rev} store={store} open={setBrief}/>}/><div className="cosmos-preview-tags">{preview.planetIds.map(id=><span key={id}>{store.planets.find(p=>p.id===id)?.name}</span>)}</div><footer><button onClick={()=>classify(preview.id)}>{tr('Classify')}</button><button onClick={()=>open(preview.id)}>{tr('Open original')} <ArrowUpRight size={15}/></button></footer></article>
    :<><div className="page-list-title"><h2>{selectedParent?.name??tr('Pages')}</h2><span>{listed.length}</span>{props.exportNotes&&listed.length>0&&<button className="text-button" onClick={()=>props.exportNotes!(listed.map(e=>e.id),selectedParent?.name??(active?.name??spaceName(store.profile)))}><ImageDown size={13}/>{tr('Export')}</button>}</div>{selectedPlanet&&<button className="text-button" onClick={()=>setSelectedPlanet(null)}>{tr('All visible pages')}</button>}<div className="planet-pages">{listed.map(e=><div className="page-row" key={e.id}><button onClick={()=>showNode(e.id)}><strong>{title(e)}</strong><p>{e.body.slice(0,130)}</p><time>{new Date(e.createdAt).toLocaleDateString('en-US')}</time></button><button className="cmp" aria-pressed={cmp.includes(e.id)} aria-label={`${cmp.includes(e.id)?tr('Remove from'):tr('Add to')} compare: ${title(e)}`} onClick={()=>toggleCmp(e.id)}>{cmp.includes(e.id)?'Comparing':'Compare'}</button></div>)}</div>{!listed.length&&<p className="inspector-empty">{tr('No pages in this mother planet yet.')}</p>}</>}
    </div></div>:null;
  return <section className="space-page" aria-label={spaceName(store.profile)}><SplitWorkspace storageKey="moons.space.panel.width" panel={sidePanel}><div className="cosmos-shell">
    <div className="cosmos-toolbar">
      {props.home&&<button className="cosmos-back" data-testid="button-back-home" onClick={props.home}><ArrowLeft size={16}/>{tr('Home')}</button>}
      <button onClick={()=>setPanel(panel==='views'?null:'views')} aria-expanded={panel==='views'} className="cosmos-view-button"><Layers size={16}/><span>{active?.name??spaceName(store.profile)}{dirty?tr(' · edited'):''}</span><ChevronDown size={14}/></button>
      <div className="cosmos-tools">{props.toggleSatellites&&(store.satellites?.length??0)>0&&<button title={tr('Satellites')} aria-label={tr('Satellites')} aria-pressed={store.settings?.showSatellites!==false} onClick={props.toggleSatellites}><OrbitIcon size={18}/></button>}<button title={tr('Choose mother planets')} aria-label={tr('Choose mother planets')} aria-expanded={panel==='keywords'} onClick={()=>setPanel(panel==='keywords'?null:'keywords')}><SlidersHorizontal size={18}/></button><button title={tr('Arrange by shared notes and text overlap (AI not connected)')} aria-label={tr('Arrange by similarity')} onClick={()=>{resetPlanets()}}><Network size={18}/></button><button onClick={()=>setName('')} aria-label={tr('Save as a new view')} title={tr('Save as a new view')}><Save size={17}/></button>{!flat&&<button onClick={()=>void captureView()} aria-label={tr('Save as a transparent image')} title={tr('Save as a transparent image')}><ImageDown size={17}/></button>}</div>
    </div>
    <div className="cosmos-canvas lv-immersive cosmos uv-personal" ref={area} data-testid="universe-stage" onPointerUp={scheduleSnap} onWheel={scheduleSnap} onKeyUp={scheduleSnap}>
      <UniverseScene ref={scene} data={dto} fresh={fresh} selection={sceneSelection} showLinks={showLinks} paused={false} reducedMotion={reduced} placed={placed} initialCamera={state.camera3D}
        onPlace={onPlace} onPlaceCommit={scheduleSnap} onResetPlanets={resetPlanets} onSelect={onSelect} onAvailability={ok=>setFlat(!ok)}/>
      {cmp.length>0&&<div className="compare-tray" role="region" aria-label={tr('Compare tray')} data-testid="compare-tray"><span>Compare {cmp.length}/{COMPARE_MAX}</span>{cmpEntries.map(e=><span className="chip" key={e.id}><b>{title(e)}</b><button aria-label={tr('Remove {name} from compare',{name:title(e)})} onClick={()=>toggleCmp(e.id)}><X size={13}/></button></span>)}<button onClick={()=>setCmp([])}>{tr('Clear')}</button><button className="open" disabled={cmp.length<2} data-testid="button-open-side-by-side" onClick={()=>props.sideBySide?props.sideBySide(cmp):setSideBySide(true)}><Columns2 size={14}/>{tr('Open side by side')}</button></div>}
      {props.go&&<SatelliteOrbits store={store} host={area} go={props.go}/>}
      {!flat&&<HandControl active={hands} onEvents={gesture} probe={probe} onClose={()=>setHands(false)}/>}
      {!entries.length&&<div className="cosmos-no-notes">{state.planetIds.length?tr('No notes in these mother planets yet.'):tr('Choose mother planets to display.')}<button onClick={()=>state.planetIds.length?open(''):setPanel('keywords')}>{state.planetIds.length?tr('Classify notes'):tr('Choose mother planets')}</button></div>}
    </div>
    <div className="cosmos-bottom"><span>{tr('{planets} planets · {notes} notes',{planets:planets.length,notes:entries.length})}</span><span className="cosmos-gesture">{flat?tr('Flat 2D fallback (no WebGL)'):tr('Drag to rotate · scroll to zoom')}</span><div>
      <button aria-label={tr('Zoom out')} data-testid="button-zoom-out" disabled={flat} onClick={()=>{scene.current?.zoom(1.2);scheduleSnap()}}><ZoomOut size={17}/></button>
      <button aria-label={tr('Zoom in')} data-testid="button-zoom-in" disabled={flat} onClick={()=>{scene.current?.zoom(.82);scheduleSnap()}}><ZoomIn size={17}/></button>
      <button aria-label={tr('Reset camera')} title={tr('Reset camera')} data-testid="button-reset-camera" disabled={flat} onClick={resetCamera}><Focus size={17}/></button>
      <button aria-label={tr('Rearrange planets')} title={tr('Rearrange planets by similarity')} data-testid="button-reset-planets" onClick={resetPlanets}><RotateCcw size={17}/></button>
      <button aria-label={tr('Show all links')} title={tr('Show all links between notes')} aria-pressed={showLinks} data-testid="button-toggle-links" onClick={()=>setShowLinks(v=>!v)}><Spline size={17}/></button>
      <button aria-label={tr('Hand control (camera)')} title={tr('Hand control (camera, optional)')} aria-pressed={hands} disabled={flat} data-testid="button-hand-control" onClick={()=>setHands(v=>!v)}><Hand size={17}/></button>
    </div></div>
    </div></SplitWorkspace>
    {name!==null&&<div className="cosmos-save-backdrop" onKeyDown={e=>{if(e.key==='Escape')setName(null)}}><form className="cosmos-save" role="dialog" aria-modal="true" aria-label={tr('Save view')} onSubmit={e=>{e.preventDefault();saveView()}}><label htmlFor="view-name">{tr('View name')}</label><input id="view-name" autoFocus value={name} onChange={e=>setName(e.target.value)} maxLength={50} required/><div><button type="button" onClick={()=>setName(null)}>{tr('Cancel')}</button><button type="submit" disabled={!name.trim()}>{tr('Save')}</button></div></form></div>}
    {sideBySide&&cmpEntries.length>=2&&<div className="side-by-side-backdrop" onClick={e=>{if(e.target===e.currentTarget)setSideBySide(false)}}><div className="side-by-side" role="dialog" aria-modal="true" aria-label={tr('Pages side by side')}><header><strong>{tr('Side by side')}</strong><button aria-label={tr('Close side by side')} onClick={()=>setSideBySide(false)}><X size={18}/></button></header><div className="cols" style={{'--n':cmpEntries.length} as React.CSSProperties}>{cmpEntries.map(e=><article key={e.id}><h2>{title(e)}</h2><time>{new Date(e.createdAt).toLocaleDateString('en-US')}</time><p>{e.body}</p><button className="text-button" onClick={()=>open(e.id)}>{tr('Open original')}</button></article>)}</div></div></div>}
    {notice&&<div className="cosmos-notice" role="status">{notice}</div>}
  </section>;
}