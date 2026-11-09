import {Columns3,LayoutDashboard,Lightbulb,Orbit,Plus,Trash2} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {uid,type Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {dropView,putView,spaceViewsOf,type SpaceViewDef} from '@/lib/space-views';
import GraphView from './GraphView';
import BoardView from './BoardView';
import TableView from './TableView';

/** v9 7.1 Space: the graph, my boards and tables, kept as views. */
export default function SpaceView({store,ws,notify,go,viewId,focus}:{store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(u:string)=>void;viewId?:string;focus?:string}){
  const views=spaceViewsOf(store),cur=views.find(v=>v.id===viewId);
  function make(type:'board'|'table',seed?:string){const at=new Date().toISOString();const n=type==='board'?tr('Board {n}',{n:views.filter(v=>v.type==='board').length+1}):tr('Table {n}',{n:views.filter(v=>v.type==='table').length+1});
    const v:SpaceViewDef={id:uid(),name:n,type,createdAt:at,updatedAt:at,...(type==='board'?{board:{style:'pin',items:seed?[{id:uid(),kind:'ref',ref:{type:'entry',id:seed},x:80,y:80,w:180}]:[],links:[]}}:{table:{columns:[],cells:{}}})};
    if(ws.commit(s=>putView(s,v)))go(`/galaxy/view/${v.id}`)}
  const toBoard=(entryId:string)=>{const b=views.filter(v=>v.type==='board').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    if(!b){make('board',entryId);return}
    ws.commit(s=>putView(s,{...b,board:{...b.board!,items:[...b.board!.items,{id:uid(),kind:'ref',ref:{type:'entry',id:entryId},x:80+b.board!.items.length*30,y:80+b.board!.items.length*24,w:180}]}}));go(`/galaxy/view/${b.id}`)};
  const Icon=(t:SpaceViewDef['type'])=>t==='board'?LayoutDashboard:t==='table'?Columns3:Orbit;
  return <section className={`space ${cur?'light':'dark'}`}>
    <nav className="space-tabs" aria-label={tr('Views')}>
      <button className={!cur?'on':''} onClick={()=>go('/galaxy')}><Orbit size={15}/>{tr('Universe')}</button>
      <button onClick={()=>go('/concepts')}><Lightbulb size={15}/>{tr('Concepts')}</button>
      {views.map(v=>{const I=Icon(v.type);return <span key={v.id} className={`vt ${cur?.id===v.id?'on':''}`}><button onClick={()=>go(`/galaxy/view/${v.id}`)}><I size={15}/>{v.name}</button>
        {cur?.id===v.id&&<><button className="icon-button tiny" aria-label={tr('Rename')} onClick={()=>{const n=window.prompt(tr('View name'),v.name)?.trim();if(n)ws.commit(s=>putView(s,{...v,name:n}))}}>✎</button><button className="icon-button tiny" aria-label={tr('Delete view')} onClick={()=>{if(window.confirm(tr('Delete this view? Your notes stay.'))){ws.commit(s=>dropView(s,v.id));go('/galaxy')}}}><Trash2 size={12}/></button></>}</span>})}
      <button className="add" onClick={()=>make('board')}><Plus size={14}/>{tr('Board')}</button>
      <button className="add" onClick={()=>make('table')}><Plus size={14}/>{tr('Table')}</button>
    </nav>
    {!cur?<GraphView store={store} go={go} focus={focus} toBoard={toBoard} openSat={id=>go(`/satellite/${id}`)}/>
      :cur.type==='board'?<BoardView key={cur.id} view={cur} store={store} ws={ws} notify={notify} go={go}/>
      :cur.type==='table'?<TableView key={cur.id} view={cur} store={store} ws={ws} go={go} notify={notify}/>:null}
  </section>;
}
