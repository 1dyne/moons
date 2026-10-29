import {useEffect,useRef,useState} from 'react';
import {Orbit} from 'lucide-react';
import type {Store} from '@/lib/model';
import {spacesOf,spacesShown,type Space} from '@/lib/satellite-spaces';
import {tr} from '@/lib/i18n';
import '../styles/spaces.css';

type Spot={s:Space;x:number;y:number;zone:boolean};
/** Satellites in My Space (v8 5): each circles beside the first of its topics on screen; the rest gather in the Satellite zone.
 *  Placed over the scene from where the topic labels are drawn, so it works for the 3D and the flat map alike. */
export default function SatelliteOrbits({store,host,go}:{store:Store;host:React.RefObject<HTMLElement|null>;go:(u:string)=>void}){
  const list=spacesShown(store)?spacesOf(store).filter(s=>s.show):[];
  const [spots,setSpots]=useState<Spot[]>([]),[open,setOpen]=useState<string|null>(null),frame=useRef(0);
  useEffect(()=>{
    if(!list.length){setSpots([]);return}
    let last='';
    const tick=()=>{
      const box=host.current;if(box){
        const r=box.getBoundingClientRect(),count=new Map<string,number>();let zone=0;
        const next=list.map(s=>{
          const label=s.planetIds.map(id=>box.querySelector<Element>(`[data-planet="${CSS.escape(id)}"]`)).find(Boolean);
          if(label){const b=label.getBoundingClientRect(),k=(count.get(s.planetIds[0]!)??0);count.set(s.planetIds[0]!,k+1);
            const a=-Math.PI/4+k*0.9,rad=Math.max(b.width,b.height)/2+26;
            return {s,x:b.left+b.width/2-r.left+Math.cos(a)*rad,y:b.top+b.height/2-r.top+Math.sin(a)*rad,zone:false}}
          return {s,x:22+(zone%3)*48,y:r.height-70-Math.floor(zone++/3)*44,zone:true};
        });
        const sig=next.map(p=>`${p.s.id}:${Math.round(p.x)}:${Math.round(p.y)}`).join('|');
        if(sig!==last){last=sig;setSpots(next)}
      }
      frame.current=requestAnimationFrame(tick);
    };
    frame.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame.current);
  },[list.map(s=>`${s.id}:${s.planetIds.join(',')}`).join(';'),host]);
  if(!spots.length)return null;
  const zoned=spots.some(p=>p.zone),sel=spots.find(p=>p.s.id===open)?.s;
  return <div className="satellite-orbits" aria-label={tr('Satellites')}>
    {zoned&&<span className="sat-zone-label">{tr('Satellites')}</span>}
    {spots.map(p=><button key={p.s.id} className={`sat-dot ${p.zone?'zone':''} ${open===p.s.id?'on':''}`} style={{left:p.x,top:p.y}} title={p.s.name} aria-label={p.s.name} onClick={()=>setOpen(open===p.s.id?null:p.s.id)}><Orbit size={14}/><span>{p.s.name}</span></button>)}
    {sel&&<div className="sat-pop" style={{left:Math.min(spots.find(p=>p.s.id===sel.id)!.x+18,(host.current?.clientWidth??400)-240),top:spots.find(p=>p.s.id===sel.id)!.y+14}}>
      <b>{sel.name}</b>{sel.description&&<p>{sel.description}</p>}
      <div><button className="text-button" onClick={()=>go(`/satellite/${sel.id}`)}>{tr('Records')}</button>{sel.url&&<a className="text-button" href={sel.url} target="_blank" rel="noreferrer noopener">{tr('Open')}</a>}</div></div>}
  </div>;
}
