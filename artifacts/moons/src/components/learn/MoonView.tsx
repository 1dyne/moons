import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {tr} from '@/lib/i18n';
import type {ConceptKnowledge} from '@/lib/knowledge-v9';

const AMP=[0,.012,.026,.043,.066];
const dirOf=(lat:number,lon:number):[number,number,number]=>{const a=lat*Math.PI/180,o=lon*Math.PI/180;return [Math.cos(a)*Math.sin(o),Math.sin(a),Math.cos(a)*Math.cos(o)]};
const noise=(x:number,y:number,z:number)=>Math.sin(x*7+z*3)*.4+Math.sin(y*9+x*4)*.3+Math.sin(z*12-y*5)*.2+Math.sin((x+y+z)*19)*.1;

/** v9 5.4: the moon. Ground height = stage, width = records, crater = felt sure but not there yet, fog = no evidence yet.
 *  `forming` keeps the surface smooth and small; words still land where they will stay. */
export default function MoonView({list,selected,select,showBack,setShowBack,forming,progress}:{list:ConceptKnowledge[];selected:string|null;select:(id:string|null)=>void;showBack:boolean;setShowBack:(b:boolean)=>void;forming:boolean;progress:number}){
  const stage=useRef<HTMLDivElement>(null),[failed,setFailed]=useState(false);
  const api=useRef<{setTarget:(back:boolean)=>void;update:(list:ConceptKnowledge[],forming:boolean,progress:number)=>void;tags:()=>void}|null>(null);
  const tagRefs=useRef(new Map<string,HTMLButtonElement>());
  useEffect(()=>{
    const el=stage.current;if(!el)return;
    let ren:THREE.WebGLRenderer;try{ren=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{setFailed(true);return}
    ren.setPixelRatio(Math.min(window.devicePixelRatio,2));el.prepend(ren.domElement);
    const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(36,1,.1,20);cam.position.z=3.6;
    scene.add(new THREE.AmbientLight(0xffffff,1.25));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(-2.4,1.5,3);scene.add(sun);
    const geo=new THREE.SphereGeometry(1,150,100);const pos=geo.attributes.position!;const base:number[][]=[];for(let i=0;i<pos.count;i++)base.push([pos.getX(i),pos.getY(i),pos.getZ(i)]);
    geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(pos.count*3),3));
    const moon=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0}));scene.add(moon);
    let data:ConceptKnowledge[]=[],form=true,prog=0,spin=Math.PI*.04,target=spin,tilt=.08,drag:{x:number;y:number;s:number;t:number}|null=null,dirty=true,frame=0;
    const cur=new Map<string,number>();
    function paint(){const col=geo.attributes.color!;const dirs=data.map(c=>({c,d:dirOf(c.lat,c.lon),a:form?0:cur.get(c.conceptId)??AMP[c.stage]!}));
      for(let i=0;i<base.length;i++){const v=base[i]!;let h=noise(v[0]!,v[1]!,v[2]!)*.006,c2=0,fog=0;
        for(const {c,d,a} of dirs){const dot=v[0]!*d[0]+v[1]!*d[1]+v[2]!*d[2],t=1-dot;const w=.0055+Math.min(.008,c.recordCount*.0012);
          h+=a*Math.exp(-t/w);if(!form&&c.terrain==='crater'){h-=.045*Math.exp(-t/.0028);c2=Math.max(c2,Math.exp(-((t-.0085)**2)/.000005))}
          if(c.side==='back')fog=Math.max(fog,Math.exp(-t/.02))}
        const r=1+h;pos.setXYZ(i,v[0]!*r,v[1]!*r,v[2]!*r);
        const e=Math.min(1,Math.max(0,(h+.018)/.085));let R=.48+.5*e,G=.6+.38*e,B=.84+.15*e;
        if(fog>0){const f=Math.min(.7,fog);R=R*(1-f)+.62*f;G=G*(1-f)+.66*f;B=B*(1-f)+.76*f}
        if(c2>0){R=R*(1-c2)+.86*c2;G=G*(1-c2)+.52*c2;B=B*(1-c2)+.14*c2}
        col.setXYZ(i,R,G,B)}
      pos.needsUpdate=true;col.needsUpdate=true;geo.computeVertexNormals();dirty=true}
    function animate(to:Map<string,number>){const from=new Map(cur),t0=performance.now();const step=(t:number)=>{const k=Math.min(1,(t-t0)/900),e=1-(1-k)**3;for(const [id,v] of to)cur.set(id,(from.get(id)??0)+(v-(from.get(id)??0))*e);paint();if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
    function size(){const b=el!.getBoundingClientRect();if(!b.width)return;ren.setSize(b.width,b.height,false);cam.aspect=b.width/b.height;cam.position.z=b.width/b.height<1.15?4.6:3.7;cam.updateProjectionMatrix();dirty=true}
    function placeTags(){const box=el!.getBoundingClientRect();moon.updateMatrixWorld();cam.updateMatrixWorld();const sc=moon.scale.x;
      for(const c of data){const t=tagRefs.current.get(c.conceptId);if(!t)continue;const d=dirOf(c.lat,c.lon);const v=new THREE.Vector3(d[0]*1.15,d[1]*1.15,d[2]*1.15).applyMatrix4(moon.matrixWorld);const front=v.z>.25*sc;const p=v.clone().project(cam);
        t.style.visibility=front?'visible':'hidden';if(front)t.style.transform=`translate(${Math.max(2,Math.min(box.width-t.offsetWidth-2,(p.x*.5+.5)*box.width-t.offsetWidth/2))}px,${(-p.y*.5+.5)*box.height-11}px)`}}
    const loop=()=>{const d=target-spin;if(!drag&&Math.abs(d)>.001){spin+=d*.09;dirty=true}const s=form?.55+.45*prog:1;if(Math.abs(moon.scale.x-s)>.002){moon.scale.setScalar(moon.scale.x+(s-moon.scale.x)*.08);dirty=true}
      if(dirty){moon.rotation.set(tilt,spin,0);ren.render(scene,cam);placeTags();dirty=false}frame=requestAnimationFrame(loop)};
    const ro=new ResizeObserver(size);ro.observe(el);size();
    const down=(e:PointerEvent)=>{if((e.target as HTMLElement).closest('button'))return;drag={x:e.clientX,y:e.clientY,s:spin,t:tilt};el.setPointerCapture(e.pointerId)};
    const move=(e:PointerEvent)=>{if(!drag)return;spin=drag.s+(e.clientX-drag.x)*.008;tilt=Math.max(-.7,Math.min(.7,drag.t+(e.clientY-drag.y)*.005));dirty=true};
    const up=()=>{if(!drag)return;drag=null;const turn=((spin%(2*Math.PI))+2*Math.PI)%(2*Math.PI),back=turn>Math.PI/2&&turn<3*Math.PI/2;target=back?Math.floor(spin/(2*Math.PI))*2*Math.PI+Math.PI:Math.round(spin/(2*Math.PI))*2*Math.PI+Math.PI*.04;setShowBack(back)};
    el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
    api.current={setTarget:b=>{target=b?Math.PI:Math.PI*.04;dirty=true},update:(l,f,p)=>{data=l;form=f;prog=p;const to=new Map(l.map(c=>[c.conceptId,AMP[c.stage]!]));if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){for(const [k,v] of to)cur.set(k,v);paint()}else animate(to)},tags:()=>{dirty=true}};
    loop();
    return()=>{cancelAnimationFrame(frame);ro.disconnect();el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);ren.dispose();geo.dispose();ren.domElement.remove();api.current=null};
  },[]);
  useEffect(()=>{api.current?.update(list,forming,progress)},[list,forming,progress]);
  useEffect(()=>{api.current?.setTarget(showBack)},[showBack]);
  useEffect(()=>{api.current?.tags()},[selected]);
  if(failed)return <div className="moon-fallback"><p>{tr('This device cannot draw the 3D moon. The cross-section and lists below still work.')}</p></div>;
  return <div className="moon-stage" ref={stage} aria-label={tr('My moon. Drag to turn it.')}>
    {list.map(c=><button key={c.conceptId} ref={el=>{if(el)tagRefs.current.set(c.conceptId,el);else tagRefs.current.delete(c.conceptId)}} className={`moon-tag ${c.terrain==='crater'?'gap':c.star?'more':''} ${c.side==='back'?'back':''}`} aria-pressed={selected===c.conceptId} onClick={e=>{e.stopPropagation();select(selected===c.conceptId?null:c.conceptId)}}>{c.name}</button>)}
    <div className="moon-side"><button className="secondary small" onClick={()=>setShowBack(!showBack)}>{showBack?tr('Front'):tr('Back side')}</button></div>
  </div>;
}
