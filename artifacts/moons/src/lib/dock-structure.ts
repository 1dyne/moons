// Dock: a project drawn as a map, and its usage and costs rolled up (pure; the screens are DockStructure / DockCosts).
import type {ConnectedProject,ProjectConnection,ProjectEvent,ProjectHub} from '@workspace/moons-sync/projects';
import type {Store} from './model.ts';
import {tr} from './i18n.ts';

export type MapNode={id:string;label:string;className?:string;title?:string;badge?:string};
export type MapEdge={id:string;from:string;to:string;label?:string;className?:string};
export type MapGroup={id:string;label:string;nodes:string[]};
const connectionNames:Record<string,string>={railway:'Railway','cloudflare-pages':'Cloudflare Pages','cloudflare-workers':'Cloudflare Workers',neon:'Neon',link:'Other service'};
export type Built={nodes:MapNode[];edges:MapEdge[];groups:MapGroup[];open:Map<string,string>};
const runtime=new Set(['railway','cloudflare-pages','cloudflare-workers']);

/** The project drawn as a map: its code, the services it runs on, its plan and its context.
 *  Lines MOONS can infer (code deploys to a runtime, a runtime uses the database, milestones in order) are drawn for it;
 *  the user adds the rest. Nothing here is checked live — service states are the last snapshot. */
export function projectStructure(p:ConnectedProject,connections:ProjectConnection[],store:Store):Built{
  const nodes:MapNode[]=[{id:'project',label:p.name,className:'center'}],edges:MapEdge[]=[],groups:MapGroup[]=[],open=new Map<string,string>();
  const code:string[]=[],services:string[]=[],plan:string[]=[],context:string[]=[];
  if(p.repository){
    nodes.push({id:'repo',label:p.repository.replace(/^https?:\/\/(www\.)?github\.com\//,''),className:p.connectionError?'check':'',badge:p.snapshot?undefined:'?',title:p.snapshot?`${p.snapshot.branch} · ${p.snapshot.sha.slice(0,7)} · ${p.snapshot.commitTitle}`:tr('Not checked')});
    code.push('repo');edges.push({id:'e-repo',from:'project',to:'repo'});
    open.set('repo',/^https?:/.test(p.repository)?p.repository:`https://github.com/${p.repository}`);
    // Top-level folders of the repository snapshot, with how many files each holds.
    const dirs=new Map<string,number>();
    for(const path of p.snapshot?.paths??[]){const top=path.includes('/')?path.split('/')[0]!:'';if(top)dirs.set(top,(dirs.get(top)??0)+1)}
    for(const [d,n] of [...dirs].sort((a,b)=>b[1]-a[1]).slice(0,12)){const id=`dir:${d}`;nodes.push({id,label:`${d}/`,badge:String(n)});code.push(id);edges.push({id:`e-${id}`,from:'repo',to:id})}
  }
  const mine=connections.filter(c=>c.projectId===p.id);
  for(const c of mine){
    const id=`conn:${c.id}`;
    nodes.push({id,label:`${connectionNames[c.provider]??c.provider} · ${c.name}`,className:c.error?'check':c.provider==='link'?'empty':'',title:c.error??c.snapshot?.summary??c.snapshot?.status});
    services.push(id);if(c.url)open.set(id,c.url);
    if(runtime.has(c.provider))edges.push({id:`e-${id}`,from:p.repository?'repo':'project',to:id,label:tr('Deploys'),className:'spine'});
    else edges.push({id:`e-${id}`,from:'project',to:id});
  }
  for(const db of mine.filter(c=>c.provider==='neon'))for(const r of mine.filter(c=>c.provider==='railway'))edges.push({id:`e-${r.id}-${db.id}`,from:`conn:${r.id}`,to:`conn:${db.id}`,label:tr('Data')});
  const ms=[...(p.milestones??[])].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  ms.forEach((m,i)=>{const id=`ms:${m.id}`;nodes.push({id,label:m.date?`${m.title} · ${m.date.slice(5).replace('-','/')}`:m.title,className:m.done?'':'unsure',badge:m.done?'✓':undefined});plan.push(id);
    edges.push(i===0?{id:`e-${id}`,from:'project',to:id}:{id:`e-${id}`,from:`ms:${ms[i-1]!.id}`,to:id,label:tr('Next')})});
  for(const id of p.noteIds){const e=store.entries.find(x=>x.id===id);if(!e)continue;const key=`note:${id}`;nodes.push({id:key,label:(e.title||e.body).slice(0,50),className:'material'});context.push(key);open.set(key,`/entries/${id}/original`)}
  for(const c of p.contexts){const key=`ctx:${c.id}`;nodes.push({id:key,label:`${c.title} · ${c.source}`,className:'material'});context.push(key)}
  const ids=new Set(nodes.map(n=>n.id));
  for(const l of p.links??[])if(ids.has(l.from)&&ids.has(l.to))edges.push({id:`u-${l.id}`,from:l.from,to:l.to,label:l.label||undefined});
  if(code.length)groups.push({id:'g-code',label:tr('Code'),nodes:code});
  if(services.length)groups.push({id:'g-services',label:tr('Services'),nodes:services});
  if(plan.length)groups.push({id:'g-plan',label:tr('Plan'),nodes:plan});
  if(context.length)groups.push({id:'g-context',label:tr('Context'),nodes:context});
  return {nodes,edges,groups,open};
}


export type Money={unit:string;basis:'estimated'|'reported';value:number};
/** App-reported costs summed per currency and basis; values that differ in either are never added together. */
export function costsOf(events:ProjectEvent[]):Money[]{
  const out=new Map<string,Money>();
  for(const e of events.filter(e=>e.kind==='cost')){const k=`${e.unit}:${e.basis}`;const m=out.get(k)??{unit:e.unit,basis:e.basis,value:0};m.value+=e.value;out.set(k,m)}
  return [...out.values()];
}
export function rollup(p:ConnectedProject,hub:ProjectHub){
  const ev=hub.events.filter(e=>e.projectId===p.id);
  const ai=hub.aiByProject?.find(x=>x.projectId===p.id);
  const deploys=ev.filter(e=>e.kind==='deployment').map(e=>e.at).sort();
  return {ai,costs:costsOf(ev),errors:ev.filter(e=>e.kind==='error').reduce((n,e)=>n+e.value,0),usage:ev.filter(e=>e.kind==='usage'),
    lastDeploy:deploys.at(-1),attention:(hub.connections??[]).filter(c=>c.projectId===p.id&&c.error).length+(p.connectionError?1:0)};
}
