import {useState} from 'react';
import * as Icons from 'lucide-react';
import {Check} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {builtinStructures,builtinTools,DEFAULT_TOOLBAR,structureTool} from '@/lib/tools';
import {uid,type Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';

const KINDS=[['study','Study'],['exam','Exam'],['work','Work'],['project','Project'],['reading','Reading'],['daily','Daily life'],['language','Language'],['dev','Development']] as const;
const COLORS=['#5b86f0','#b8c94a','#f07c4b','#e8558c','#4fb884','#9b7be0','#e0b44f','#5bb8c9'];
const iconOf=(n:string)=>(Icons as unknown as Record<string,Icons.LucideIcon>)[n]??Icons.Shapes;

/** v9 4.6: once, skippable. What you record → first planets; formats you'll use → toolbar; MOONS suggestions on or off. */
export default function Onboarding({store,ws,done}:{store:Store;ws:WorkspaceApi;done:()=>void}){
  const [step,setStep]=useState(0),[kinds,setKinds]=useState<string[]>([]),[names,setNames]=useState<Record<string,string>>({}),[tools,setTools]=useState<string[]>(DEFAULT_TOOLBAR),[suggest,setSuggest]=useState(true);
  const all=[...builtinTools().filter(t=>t.id!=='text'),...builtinStructures().map(structureTool)];
  function finish(skip=false){
    ws.commit(s=>{
      const have=new Set(s.planets.map(p=>p.name.trim()));
      const add=skip?[]:kinds.map((k,i)=>({name:(names[k]??tr(KINDS.find(x=>x[0]===k)![1])).trim(),i})).filter(x=>x.name&&!have.has(x.name)).map(({name,i})=>({id:uid(),name,color:COLORS[(s.planets.length+i)%COLORS.length]!,position:{x:20+Math.random()*60,y:25+Math.random()*50},entryCount:0,openSignalRatio:0}));
      return {...s,planets:[...s.planets,...add],settings:{...(s.settings!),onboarded:true,onboardKinds:kinds,...(skip?{}:{toolbar:tools,moonsSuggest:suggest})}};
    });
    done();
  }
  const toggle=(list:string[],id:string)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];
  return <div className="onboard" role="dialog" aria-modal="true" aria-label={tr('Getting started')}>
    <div className="onboard-card">
      <div className="ob-steps">{[0,1,2].map(i=><i key={i} className={i===step?'on':i<step?'done':''}/>)}</div>
      {step===0&&<><h2>{tr('What do you record?')}</h2>
        <div className="ob-chips">{KINDS.map(([k,l])=><button key={k} className={`chip ${kinds.includes(k)?'on':''}`} aria-pressed={kinds.includes(k)} onClick={()=>setKinds(toggle(kinds,k))}>{tr(l)}</button>)}</div>
        {kinds.length>0&&<div className="ob-names"><small>{tr('First mother planets')}</small>{kinds.map(k=><input key={k} aria-label={tr('Planet name')} value={names[k]??tr(KINDS.find(x=>x[0]===k)![1])} onChange={e=>setNames({...names,[k]:e.target.value})} maxLength={40}/>)}</div>}</>}
      {step===1&&<><h2>{tr('Formats you will use often')}</h2>
        <div className="ob-tiles">{all.map(t=>{const I=iconOf(t.icon);const on=tools.includes(t.id);return <button key={t.id} className={`ob-tile ${on?'on':''}`} aria-pressed={on} onClick={()=>setTools(toggle(tools,t.id))}>
          <span className="ob-mini">{t.structure?t.structure.blocks.map((b,i)=><i key={i} className={`m-${b.kind}`}/>):<I size={26} strokeWidth={1.5}/>}</span><span>{t.label}</span>{on&&<Check size={15} className="ob-check"/>}</button>})}</div></>}
      {step===2&&<><h2>{tr('MOONS suggestions')}</h2>
        <div className="ob-suggest"><button className={`ob-tile wide ${suggest?'on':''}`} aria-pressed={suggest} onClick={()=>setSuggest(true)}><span>{tr('On')}</span><small>{tr('Formats · planets · connections')}</small></button><button className={`ob-tile wide ${!suggest?'on':''}`} aria-pressed={!suggest} onClick={()=>setSuggest(false)}><span>{tr('Off')}</span></button></div></>}
      <div className="ob-actions"><button className="text-button" onClick={()=>finish(true)}>{tr('Skip')}</button><span className="pe-spacer"/>{step>0&&<button className="secondary" onClick={()=>setStep(step-1)}>{tr('Back')}</button>}{step<2?<button className="primary" onClick={()=>setStep(step+1)}>{tr('Next')}</button>:<button className="primary" onClick={()=>finish()}>{tr('Start')}</button>}</div>
    </div>
  </div>;
}
