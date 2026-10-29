import {useEffect,useRef,useState} from 'react';
import '../styles/elk-map.css';

// A map laid out by ELK (layered). The model never sets coordinates; ELK does. Groups nest nodes (sections).
export type MapNode={id:string;label:string;className?:string;title?:string;badge?:string};
export type MapEdge={id:string;from:string;to:string;label?:string;className?:string};
export type MapGroup={id:string;label:string;nodes:string[]};
type Laid={nodes:(MapNode&{x:number;y:number;w:number;h:number})[];edges:(MapEdge&{points:{x:number;y:number}[];lx?:number;ly?:number})[];groups:(MapGroup&{x:number;y:number;w:number;h:number})[];w:number;h:number};

const charW=(c:string)=>/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(c)?13.5:7.6;
export const textWidth=(s:string)=>[...s].reduce((a,c)=>a+charW(c),0);
const LINE=230;
/** Wraps a label into lines no wider than LINE px. */
export function wrap(label:string){
  const words=label.split(/(\s+)/),lines:string[]=[];let cur='';
  for(const w of words){if(textWidth(cur+w)>LINE&&cur.trim()){lines.push(cur.trim());cur=w.trimStart()}else cur+=w}
  if(cur.trim())lines.push(cur.trim());
  return lines.slice(0,4).map((l,i,a)=>i===3&&a.length===4&&textWidth(l)>LINE?l.slice(0,24)+'…':l);
}

export async function layout(nodes:MapNode[],edges:MapEdge[],groups:MapGroup[]=[],direction:'RIGHT'|'DOWN'='RIGHT'):Promise<Laid>{
  const {default:ELK}=await import('elkjs/lib/elk.bundled.js');
  const elk=new ELK();
  const size=(n:MapNode)=>{const lines=wrap(n.label);return {width:Math.max(...lines.map(textWidth),40)+24,height:lines.length*18+16}};
  const inGroup=new Set(groups.flatMap(g=>g.nodes));
  const child=(n:MapNode)=>({id:n.id,...size(n)});
  const graph={id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':direction,'elk.hierarchyHandling':'INCLUDE_CHILDREN','elk.spacing.nodeNode':'22','elk.layered.spacing.nodeNodeBetweenLayers':'48','elk.edgeRouting':'ORTHOGONAL','elk.padding':'[top=12,left=12,bottom=12,right=12]'},
    children:[...groups.map(g=>({id:g.id,layoutOptions:{'elk.padding':'[top=34,left=14,bottom=14,right=14]'},children:nodes.filter(n=>g.nodes.includes(n.id)).map(child)})),...nodes.filter(n=>!inGroup.has(n.id)).map(child)],
    edges:edges.filter(e=>nodes.some(n=>n.id===e.from)&&nodes.some(n=>n.id===e.to)).map(e=>({id:e.id,sources:[e.from],targets:[e.to],labels:e.label?[{text:e.label,width:textWidth(e.label)*0.85+8,height:14}]:[]}))};
  type Out={id:string;x?:number;y?:number;width?:number;height?:number;children?:Out[];edges?:{id:string;container?:string;sections?:{startPoint:{x:number;y:number};endPoint:{x:number;y:number};bendPoints?:{x:number;y:number}[]}[];labels?:{x?:number;y?:number}[]}[]};
  const res=await elk.layout(graph as never) as unknown as Out;
  const pos=new Map<string,{x:number;y:number;w:number;h:number}>();
  const walk=(o:Out,dx:number,dy:number)=>{for(const c of o.children??[]){const x=dx+(c.x??0),y=dy+(c.y??0);pos.set(c.id,{x,y,w:c.width??0,h:c.height??0});walk(c,x,y)}};
  walk(res,0,0);
  const allEdges:NonNullable<Out['edges']>=[];const collect=(o:Out)=>{allEdges.push(...(o.edges??[]));(o.children??[]).forEach(collect)};collect(res);
  const offset=(id?:string)=>id&&id!=='root'?pos.get(id)??{x:0,y:0}:{x:0,y:0};
  return {w:res.width??0,h:res.height??0,
    nodes:nodes.flatMap(n=>{const p=pos.get(n.id);return p?[{...n,...p}]:[]}),
    groups:groups.flatMap(g=>{const p=pos.get(g.id);return p?[{...g,...p}]:[]}),
    edges:edges.flatMap(e=>{const o=allEdges.find(x=>x.id===e.id);const s=o?.sections?.[0];if(!s)return [];const off=offset(o!.container);
      const pts=[s.startPoint,...(s.bendPoints??[]),s.endPoint].map(p=>({x:p.x+off.x,y:p.y+off.y}));const l=o!.labels?.[0];
      return [{...e,points:pts,...(l?.x!==undefined?{lx:l.x+off.x,ly:(l.y??0)+off.y}:{})}]})};
}

export default function ElkMap({nodes,edges,groups=[],direction='RIGHT',select,selected,label}:{nodes:MapNode[];edges:MapEdge[];groups?:MapGroup[];direction?:'RIGHT'|'DOWN';select?:(id:string)=>void;selected?:string|null;label:string}){
  const [laid,setLaid]=useState<Laid|null>(null),[error,setError]=useState(false),box=useRef<HTMLDivElement>(null);
  const sig=JSON.stringify([nodes,edges,groups,direction]);
  useEffect(()=>{let live=true;
    // A chain much wider than the page reads better top-down than scrolled sideways.
    layout(nodes,edges,groups,direction).then(async l=>{const room=box.current?.clientWidth??1200;
      if(direction==='RIGHT'&&l.w>room*1.25){const down=await layout(nodes,edges,groups,'DOWN');if(down.w<l.w)l=down}
      if(live)setLaid(l)},()=>{if(live)setError(true)});return()=>{live=false}},[sig]);
  if(error)return <ul className="elk-fallback">{nodes.map(n=><li key={n.id}>{n.label}</li>)}</ul>;
  if(!laid)return <div ref={box} className="elk-map loading" aria-busy="true"/>;
  return <div ref={box} className="elk-map"><svg role="img" aria-label={label} viewBox={`0 0 ${Math.ceil(laid.w)} ${Math.ceil(laid.h)}`} width={Math.ceil(laid.w)} height={Math.ceil(laid.h)}>
    <defs><marker id="elk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className="elk-arrowhead"/></marker></defs>
    {laid.groups.map(g=><g key={g.id} className="elk-group"><rect x={g.x} y={g.y} width={g.w} height={g.h} rx={12}/><text x={g.x+14} y={g.y+21}>{g.label}</text></g>)}
    {laid.edges.map(e=><g key={e.id} className={`elk-edge ${e.className??''}`}><polyline points={e.points.map(p=>`${p.x},${p.y}`).join(' ')} markerEnd="url(#elk-arrow)"/>{e.label&&e.lx!==undefined&&<text x={e.lx} y={(e.ly??0)+11}>{e.label}</text>}</g>)}
    {laid.nodes.map(n=>{const lines=wrap(n.label);return <g key={n.id} className={`elk-node ${n.className??''} ${selected===n.id?'selected':''}`} onClick={select?()=>select(n.id):undefined} role={select?'button':undefined} tabIndex={select?0:undefined} onKeyDown={select?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(n.id)}}:undefined}>
      <title>{n.title??n.label}</title><rect x={n.x} y={n.y} width={n.w} height={n.h} rx={9}/>
      {lines.map((l,i)=><text key={i} x={n.x+12} y={n.y+21+i*18}>{l}</text>)}
      {n.badge&&<text className="elk-badge" x={n.x+n.w-6} y={n.y+12} textAnchor="end">{n.badge}</text>}</g>})}
  </svg></div>;
}
