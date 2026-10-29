import {useEffect,useRef,useState,type ReactNode} from 'react';
import {tr} from '@/lib/i18n';

export default function SplitWorkspace({children,panel,storageKey}:{children:ReactNode;panel:ReactNode;storageKey:string}){
  const container=useRef<HTMLDivElement>(null),[size,setSize]=useState(350),[narrow,setNarrow]=useState(false);
  const drag=useRef<{start:number;size:number}|null>(null);
  useEffect(()=>{try{const saved=Number(localStorage.getItem(storageKey));if(saved>=240&&saved<=800)setSize(saved)}catch{}},[storageKey]);
  useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(()=>setNarrow(element.clientWidth<720));observer.observe(element);return()=>observer.disconnect()},[]);
  function clamp(value:number){const bounds=container.current?.getBoundingClientRect();return Math.max(narrow?180:260,Math.min(value,(narrow?bounds?.height:bounds?.width)!*(narrow?.7:.6)||600))}
  function save(value:number){try{localStorage.setItem(storageKey,String(value))}catch{}}
  return <div ref={container} className={`split-workspace ${panel?'has-panel':''} ${narrow?'split-vertical':''}`} style={{'--split-size':`${size}px`} as React.CSSProperties}>
    <div className="split-primary">{children}</div>
    {panel&&<><div className="split-divider" role="separator" aria-label={tr('Resize side panel')} aria-orientation={narrow?'horizontal':'vertical'} aria-valuemin={narrow?180:260} aria-valuemax={Math.round((narrow?container.current?.clientHeight:container.current?.clientWidth)??1000)*.6} aria-valuenow={Math.round(size)} tabIndex={0}
      onPointerDown={e=>{drag.current={start:narrow?e.clientY:e.clientX,size};e.currentTarget.setPointerCapture(e.pointerId)}}
      onPointerMove={e=>{if(drag.current)setSize(clamp(drag.current.size+drag.current.start-(narrow?e.clientY:e.clientX)))}}
      onPointerUp={e=>{drag.current=null;save(size);e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}}
      onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const next=clamp(size+(['ArrowLeft','ArrowUp'].includes(e.key)?24:-24));setSize(next);save(next)}}}><span/></div><aside className="split-secondary">{panel}</aside></>}
  </div>;
}
