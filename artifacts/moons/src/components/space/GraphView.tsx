import {useEffect,useMemo,useRef,useState} from 'react';
import {Maximize,ZoomIn,ZoomOut,ArrowUpRight,X} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {buildGraph,DWARF,WORLD,type GEdge} from '@/lib/space-graph';
import {boardLinksForGraph} from '@/lib/space-views';
import type {Store} from '@/lib/model';

const FIT={x:WORLD.w/2,y:WORLD.h/2,s:.52};
type Pop={kind:'entry'|'planet'|'sat'|'concept';id:string}|null;

/** v9 7.1 우주 보기: flat circles and thin lines (no stars, no gloss). Zoom: planets → child planets and dots → cards, concept cards and Satellites.
 *  Near a planet, `들어가기` keeps only that planet's world. Hover lights up what is connected. */
export default function GraphView({store,go,focus,openSat,toBoard}:{store:Store;go:(u:string)=>void;focus?:string;openSat:(id:string)=>void;toBoard:(entryId:string)=>void}){
  const g=useMemo(()=>buildGraph(store,boardLinksForGraph(store)),[store.entries,store.planets,store.concepts,store.links,store.satellites,(store as {spaceViews?:unknown}).spaceViews]);
  const vp=useRef<HTMLDivElement>(null),[size,setSize]=useState({w:900,h:640});
  const fitCam=(w=900,h=640)=>{const ps=g.planets.filter(p=>p.depth===0);if(!ps.length)return FIT;const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);const x0=Math.min(...xs)-120,x1=Math.max(...xs)+120,y0=Math.min(...ys)-120,y1=Math.max(...ys)+160;
    return {x:(x0+x1)/2,y:(y0+y1)/2,s:Math.max(.35,Math.min(1.1,Math.min(w/(x1-x0),h/(y1-y0))))}};
  const start=focus&&g.pos.get(focus)?{...g.pos.get(focus)!,s:1.7}:fitCam(Math.max(600,window.innerWidth-120),Math.max(480,window.innerHeight-70));
  const [cam,setCam]=useState(start),[drag,setDrag]=useState(false),[hover,setHover]=useState<string|null>(null),[entered,setEntered]=useState<string|null>(null),[pop,setPop]=useState<Pop>(focus?{kind:'entry',id:focus}:null),[flip,setFlip]=useState<Set<string>>(new Set()),[subOff,setSubOff]=useState<Set<string>>(new Set());
  const pan=useRef<{x:number;y:number;cx:number;cy:number;moved:boolean}|null>(null),camRef=useRef(cam);camRef.current=cam;
  useEffect(()=>{const el=vp.current;if(!el)return;const ro=new ResizeObserver(()=>{const r=el.getBoundingClientRect();setSize({w:r.width,h:r.height})});ro.observe(el);
    const wheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0016),e.clientX-r.left,e.clientY-r.top)};el.addEventListener('wheel',wheel,{passive:false});return()=>{ro.disconnect();el.removeEventListener('wheel',wheel)}},[]);
  function zoomAt(f:number,px:number,py:number){const c=camRef.current,{w,h}=sizeRef.current;const wx=c.x+(px-w/2)/c.s,wy=c.y+(py-h/2)/c.s,ns=Math.max(.3,Math.min(3.4,c.s*f));setCam({s:ns,x:wx-(px-w/2)/ns,y:wy-(py-h/2)/ns})}
  const sizeRef=useRef(size);sizeRef.current=size;
  const fit0=useRef(start.s).current,T2=Math.max(.95,fit0*1.6),T3=Math.max(1.45,fit0*2.6);const lvl2=cam.s>=T2||!!entered,lvl3=cam.s>=T3||!!entered;
  // Hover: the node, its planet chain and its neighbours stay bright.
  const lit=useMemo(()=>{if(!hover)return null;const s=new Set([hover]);for(const e of g.edges)if(e.a===hover)s.add(e.b);else if(e.b===hover)s.add(e.a);const p=g.planets.find(x=>x.id===hover);if(p)for(const x of g.planets)if(x.root===p.root&&(p.depth===0||x.id===p.parent))s.add(x.id);return s},[hover,g]);
  const inWorld=(root:string)=>!entered||root===entered;
  const op=(id:string,root:string)=>!inWorld(root)?.1:lit&&!lit.has(id)?.2:1;
  let near:typeof g.planets[number]|undefined;
  if(!entered&&lvl2){let best=1e9;for(const p of g.planets)if(p.depth===0){const d=Math.hypot(p.x-cam.x,p.y-cam.y);if(d<best&&d<300){best=d;near=p}}}
  const ent=g.planets.find(p=>p.id===entered);
  const subs=g.planets.filter(p=>p.parent===entered);
  const hiddenBy=(planet?:string)=>{if(!planet||!entered)return false;let p=g.planets.find(x=>x.id===planet);while(p&&p.parent){if(subOff.has(p.id))return true;p=g.planets.find(x=>x.id===p!.parent)}return false};
  const line=(e:GEdge,i:number)=>{const A=g.pos.get(e.a),B=g.pos.get(e.b);if(!A||!B)return null;const len=Math.hypot(B.x-A.x,B.y-A.y),ang=Math.atan2(B.y-A.y,B.x-A.x)*180/Math.PI;
    const ra=g.planets.find(p=>p.id===e.a)?.root??g.entries.find(x=>x.id===e.a)?.root??'',rb=g.planets.find(p=>p.id===e.b)?.root??g.entries.find(x=>x.id===e.b)?.root??'';
    const vis=e.kind==='planet'||e.kind==='link'||lvl2;const hot=hover&&(e.a===hover||e.b===hover);
    const o=!vis?0:(!inWorld(ra)&&!inWorld(rb))?.06:lit&&!hot?.15:1;
    return <i key={i} className={`g-edge ${e.kind} ${hot?'hot':''}`} style={{left:A.x,top:A.y,width:len,transform:`rotate(${ang}deg)`,opacity:o,borderTopWidth:e.kind==='planet'?.6+Math.min(4,e.weight)*.4:e.kind==='link'?1.4:.6}}/>};
  const popEntry=pop?.kind==='entry'?g.entries.find(x=>x.id===pop.id):undefined;
  return <div className="graph-wrap">
    <div ref={vp} className={`graph-vp ${drag?'dragging':''}`} onPointerDown={e=>{if((e.target as HTMLElement).closest('button,a'))return;pan.current={x:e.clientX,y:e.clientY,cx:cam.x,cy:cam.y,moved:false}}}
      onPointerMove={e=>{const p=pan.current;if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(!p.moved&&Math.hypot(dx,dy)<4)return;p.moved=true;setDrag(true);setCam(c=>({...c,x:p.cx-dx/c.s,y:p.cy-dy/c.s}))}}
      onPointerUp={()=>{pan.current=null;setDrag(false)}} onPointerLeave={()=>{pan.current=null;setDrag(false)}}>
      <div className="g-world" style={{width:WORLD.w,height:WORLD.h,transform:`translate(${size.w/2-cam.x*cam.s}px,${size.h/2-cam.y*cam.s}px) scale(${cam.s})`,transition:drag?'none':undefined}}>
        {g.edges.map(line)}
        {g.edges.filter(e=>e.kind==='link'&&e.label&&lvl3).map((e,i)=>{const A=g.pos.get(e.a)!,B=g.pos.get(e.b)!;return <span key={'l'+i} className="g-elabel" style={{left:(A.x+B.x)/2,top:(A.y+B.y)/2}}>{e.label}</span>})}
        {g.planets.map(p=>{const show=p.depth===0||(lvl2&&inWorld(p.root)&&!hiddenBy(p.id)&&!(entered&&subOff.has(p.id)));const inside=entered===p.id;
          return <div key={p.id} className="g-planet-wrap" style={{left:p.x-p.r,top:p.y-p.r,width:p.r*2,height:p.r*2,opacity:show?(inside?.14:op(p.id,p.root)):0,pointerEvents:show&&!inside?'auto':'none'}}>
            <button className="g-planet" style={{background:p.color}} aria-label={p.name} onMouseEnter={()=>setHover(p.id)} onMouseLeave={()=>setHover(null)} onClick={()=>{setCam({x:p.x,y:p.y,s:Math.max(cam.s,p.depth?T3+.05:T2+.05)});setPop(null)}}/>
            <span className="g-label" style={{top:p.r*2+3,fontSize:(p.depth?11:13)/cam.s}}>{p.name}{!lvl2&&p.depth===0?` ${p.count}`:''}</span></div>})}
        {g.entries.map(e=>{const show=lvl2&&inWorld(e.root)&&!hiddenBy(e.planet);const card=lvl3;
          return <button key={e.id} className={`g-entry ${card?'card':'dot'} ${pop?.id===e.id?'sel':''}`} style={{left:card?e.x-36:e.x-3.5,top:card?e.y-9:e.y-3.5,background:card?'#fff':e.color,borderColor:e.color,opacity:show?op(e.id,e.root):0,pointerEvents:show?'auto':'none'}}
            onMouseEnter={()=>setHover(e.id)} onMouseLeave={()=>setHover(null)} onClick={()=>setPop({kind:'entry',id:e.id})} aria-label={e.title}>{card&&<span>{e.title}</span>}</button>})}
        {g.concepts.map(c=>{const show=lvl3&&inWorld(c.root);const f=flip.has(c.id);
          return <button key={c.id} className={`g-concept ${f?'flipped':''}`} style={{left:c.x-30,top:c.y-11,opacity:show?(lit&&!lit.has('c:'+c.id)?.25:1):0,pointerEvents:show?'auto':'none'}} onClick={()=>setFlip(s=>{const n=new Set(s);if(n.has(c.id))n.delete(c.id);else n.add(c.id);return n})} aria-label={c.name}>
            <span className="gc-in"><span className="gc-f">{c.name}</span><span className="gc-b">{c.definition??'—'}</span></span></button>})}
        {g.sats.map(s=>{const show=lvl2&&inWorld(s.root||entered||'');return <button key={s.id} className="g-sat" style={{left:s.x,top:s.y,opacity:show?1:0,pointerEvents:show?'auto':'none'}} onClick={()=>setPop({kind:'sat',id:s.id})}><b>{s.name.slice(0,1).toUpperCase()}</b>{s.name}<ArrowUpRight size={8}/></button>})}
      </div>
      <div className="g-top">
        {ent&&<div className="g-crumb"><button className="seg" onClick={()=>{setEntered(null);setSubOff(new Set());setCam({x:ent.x,y:ent.y,s:1})}}>← {tr('All fields')}</button><b>{ent.name}</b>
          {subs.map(sp=><button key={sp.id} className={`chip small ${subOff.has(sp.id)?'':'on'}`} aria-pressed={!subOff.has(sp.id)} onClick={()=>setSubOff(s=>{const n=new Set(s);if(n.has(sp.id))n.delete(sp.id);else n.add(sp.id);return n})}>{sp.name}</button>)}</div>}
        {near&&<button className="primary g-enter" onClick={()=>{setEntered(near!.id);setCam({x:near!.x,y:near!.y,s:Math.max(1.9,T3+.1)});setPop(null)}}>{tr('Go into {name}',{name:near.name})}</button>}
      </div>
      {popEntry&&<div className="g-pop"><button className="icon-button tiny g-x" aria-label={tr('Close')} onClick={()=>setPop(null)}><X size={13}/></button><b>{popEntry.title||tr('Untitled')}</b>
        <small>{popEntry.planet?store.planets.find(p=>p.id===popEntry.planet)?.name:tr('Dwarf planet')}</small>
        <div className="actions"><button className="primary small" onClick={()=>go(`/entries/${popEntry.id}/original`)}>{tr('Open')}</button><button className="secondary small" onClick={()=>go(`/learn?focus=${popEntry.id}`)}>{tr('Learn')}</button><button className="secondary small" onClick={()=>toBoard(popEntry.id)}>{tr('To board')}</button></div></div>}
      {pop?.kind==='sat'&&(()=>{const s=g.sats.find(x=>x.id===pop.id);return s?<div className="g-pop"><button className="icon-button tiny g-x" aria-label={tr('Close')} onClick={()=>setPop(null)}><X size={13}/></button><b>{s.name}</b><small>{s.url}</small><div className="actions"><button className="primary small" onClick={()=>openSat(s.id)}>{tr('Open')}</button>{s.url&&<a className="secondary small btn-link" href={s.url} target="_blank" rel="noreferrer noopener">{tr('New tab')}</a>}</div></div>:null})()}
      <div className="g-tools"><button className="icon-button" aria-label={tr('Zoom out')} onClick={()=>zoomAt(1/1.45,size.w/2,size.h/2)}><ZoomOut size={17}/></button><button className="icon-button" aria-label={tr('Zoom in')} onClick={()=>zoomAt(1.45,size.w/2,size.h/2)}><ZoomIn size={17}/></button><button className="icon-button" aria-label={tr('Show all')} onClick={()=>{setCam(fitCam(size.w,size.h));setEntered(null);setPop(null)}}><Maximize size={16}/></button></div>
      {!g.planets.length&&!g.entries.length&&<div className="g-empty">{tr('Nothing here yet.')}</div>}
      {g.entries.some(e=>e.root===DWARF)&&!lvl2&&<span className="g-dwarf" style={{left:size.w/2+(110-cam.x)*cam.s-20,top:size.h/2+(WORLD.h-90-cam.y)*cam.s+14}}>{tr('Dwarf planet')}</span>}
    </div>
  </div>;
}
