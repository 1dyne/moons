import type {Entry, Planet,Store} from './model.ts';
import {tr} from './i18n.ts';

export type Point = {x:number;y:number};
export type Camera = Point & {zoom:number};
export type SpatialBaseline={id:string;createdAt:string;planetIds:string[];positions:Record<string,Point>;distances:{a:string;b:string;distance:number;relative:number}[]};
export type Vec3=[number,number,number];
export type Camera3D={position:Vec3;target:Vec3};
export type UniverseState = {planetIds:string[];positions:Record<string,Point>;camera:Camera;positions3D?:Record<string,Vec3>;camera3D?:Camera3D;activeViewId?:string;manual?:boolean;layoutKey?:string;baseline?:SpatialBaseline};
export type UniverseView = UniverseState & {id:string;name:string};
export const defaultCamera:Camera = {x:0,y:0,zoom:1};
export const DWARF_ID='__dwarf_planet__';
export function spaceStore(store:Store):Store{
  const validIds=new Set(store.planets.map(p=>p.id));
  const entries=store.entries.map(e=>{const ids=e.planetIds.filter(id=>validIds.has(id));return {...e,planetIds:ids.length?ids:[DWARF_ID]}});
  return {...store,entries,planets:[...store.planets.filter(p=>p.id!==DWARF_ID),{id:DWARF_ID,name:tr('Dwarf Planet'),color:'#d5dae4',position:{x:50,y:70},entryCount:entries.filter(e=>e.planetIds.includes(DWARF_ID)).length,openSignalRatio:0}]};
}
export function captureBaseline(planetIds:string[],positions:Record<string,Point>):SpatialBaseline{
  const ids=planetIds.filter(id=>id!==DWARF_ID&&positions[id]);
  const snapshot=Object.fromEntries(ids.map(id=>[id,{...positions[id]}]));
  const pairs=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>({a,b,distance:Math.hypot(snapshot[a].x-snapshot[b].x,snapshot[a].y-snapshot[b].y)})));
  const max=Math.max(1,...pairs.map(p=>p.distance));
  return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),planetIds:ids,positions:snapshot,distances:pairs.map(p=>({...p,relative:p.distance/max}))};
}
export function isBaseline(value:unknown):value is SpatialBaseline{
  const b=value as SpatialBaseline;return !!b&&typeof b.id==='string'&&typeof b.createdAt==='string'&&Array.isArray(b.planetIds)&&!!b.positions&&Object.values(b.positions).every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y))&&Array.isArray(b.distances)&&b.distances.every(d=>typeof d.a==='string'&&typeof d.b==='string'&&Number.isFinite(d.distance)&&Number.isFinite(d.relative));
}
export const planetRadius = (count:number) => Math.sqrt(28 ** 2 + Math.max(0,count) * 180);
export function tokens(text:string):Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[]);
}
export function overlap(a:Set<string>,b:Set<string>):number {
  if(!a.size||!b.size)return 0;
  let common=0; for(const word of a)if(b.has(word))common++;
  return common/(a.size+b.size-common);
}
export function planetSimilarities(planets:Planet[],entries:Entry[]) {
  const groups=planets.map(p=>entries.filter(e=>e.planetIds.includes(p.id)));
  const words=groups.map(g=>tokens(g.map(e=>`${e.title??''} ${e.body}`).join(' ')));
  return planets.flatMap((a,i)=>planets.slice(i+1).map((b,j)=>{
    const bi=i+j+1,shared=groups[i].filter(e=>e.planetIds.includes(b.id)).length;
    const union=groups[i].length+groups[bi].length-shared;
    return {a:a.id,b:b.id,similarity:Math.max(union?shared/union:0,overlap(words[i],words[bi]))};
  }));
}
// Deterministic, bounded layout. This adapter uses local text overlap until a semantic API exists.
export function arrangePlanets(planets:Planet[],entries:Entry[]):Record<string,Point> {
  if(!planets.length)return {};
  if(planets.length===1)return {[planets[0].id]:{x:0,y:0}};
  const radius=Math.max(170,planets.length*34);
  const positions=Object.fromEntries(planets.map((p,i)=>[p.id,{x:Math.cos(i*2*Math.PI/planets.length-Math.PI/2)*radius,y:Math.sin(i*2*Math.PI/planets.length-Math.PI/2)*radius}]));
  const pairs=planetSimilarities(planets,entries),sizes=Object.fromEntries(planets.map(p=>[p.id,planetRadius(entries.filter(e=>e.planetIds.includes(p.id)).length)]));
  for(let step=0;step<240;step++){
    const forces=Object.fromEntries(planets.map(p=>[p.id,{x:0,y:0}]));
    for(const pair of pairs){
      const a=positions[pair.a],b=positions[pair.b],dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
      const target=sizes[pair.a]+sizes[pair.b]+145+(1-pair.similarity)*230;
      const f=(d-target)*.018;
      forces[pair.a].x+=dx/d*f;forces[pair.a].y+=dy/d*f;
      forces[pair.b].x-=dx/d*f;forces[pair.b].y-=dy/d*f;
    }
    for(const p of planets){positions[p.id].x+=forces[p.id].x;positions[p.id].y+=forces[p.id].y;}
  }
  return positions;
}
export function visibleEntries(entries:Entry[],planetIds:string[]) {
  const selected=new Set(planetIds);
  return entries.filter(e=>e.planetIds.some(id=>selected.has(id)));
}
export function notePositions(entries:Entry[],planets:Planet[],positions:Record<string,Point>) {
  const result:Record<string,Point>={},groups=new Map<string,Entry[]>();
  for(const entry of entries){const key=entry.planetIds.filter(id=>positions[id]).sort().join('|');if(!key)continue;groups.set(key,[...(groups.get(key)??[]),entry]);}
  for(const [key,notes] of groups){
    const ids=key.split('|'),center=ids.reduce((c,id)=>({x:c.x+positions[id].x/ids.length,y:c.y+positions[id].y/ids.length}),{x:0,y:0});
    const parent=planets.find(p=>p.id===ids[0]);
    const base=ids.length===1?planetRadius(parent?.entryCount??0)+42:24;
    notes.sort((a,b)=>a.id.localeCompare(b.id)).forEach((e,i)=>{
      const angle=i*2.3999632297+.4,r=base+Math.sqrt(i)*22;
      result[e.id]={x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r};
    });
  }
  return result;
}
export function zoomAt(camera:Camera,point:Point,zoom:number):Camera {
  const next=Math.max(.2,Math.min(4,zoom)),ratio=next/camera.zoom;
  return {zoom:next,x:point.x-(point.x-camera.x)*ratio,y:point.y-(point.y-camera.y)*ratio};
}
const isVec3=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n));
export function validUniverse(value:unknown):value is UniverseState {
  const v=value as UniverseState;
  return !!v&&Array.isArray(v.planetIds)&&v.planetIds.every(id=>typeof id==='string')&&!!v.positions&&typeof v.positions==='object'&&Object.values(v.positions).every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y))&&Number.isFinite(v.camera?.x)&&Number.isFinite(v.camera?.y)&&v.camera.zoom>=.2&&v.camera.zoom<=4&&(!v.baseline||isBaseline(v.baseline))&&(v.positions3D===undefined||(!!v.positions3D&&typeof v.positions3D==='object'&&Object.values(v.positions3D).every(isVec3)))&&(v.camera3D===undefined||(isVec3(v.camera3D?.position)&&isVec3(v.camera3D?.target)));
}
