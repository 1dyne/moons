import {useMemo,useState} from 'react';
import {Plus,X} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {uid,type Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {currentEntries,type BlockValues,type Page} from '@/lib/pages';
import {columnKind,putView,type SpaceViewDef} from '@/lib/space-views';
import {planetTree,withAncestors} from '@/lib/planets';
import {knowledgeLabel,knowledgeOf} from '@/lib/knowledge';
import {ratingsFor} from '@/lib/planner';

/** v9 7.1 표 보기: rows are my notes; typing a column name makes a column; the kind is read from the values. Field blocks can become columns. */
export default function TableView({view,store,ws,go,notify}:{view:SpaceViewDef;store:Store;ws:WorkspaceApi;go:(u:string)=>void;notify:(m:string)=>void}){
  const t=view.table??{columns:[],cells:{}};
  const save=(next:typeof t)=>ws.commit(s=>putView(s,{...view,table:next}));
  const [newCol,setNewCol]=useState(''),[sort,setSort]=useState<{col:string;dir:1|-1}>({col:'date',dir:-1});
  const rows=useMemo(()=>currentEntries(store.entries).filter(e=>e.kind!=='media'&&(!t.planetId||withAncestors(e.planetIds,store.planets).includes(t.planetId))),[store.entries,t.planetId]);
  const kinds=Object.fromEntries(t.columns.map(c=>[c.id,columnKind(rows.map(r=>t.cells[r.id]?.[c.id]??''))]));
  const val=(e:typeof rows[number],col:string)=>col==='title'?(e.title||e.body.slice(0,40)):col==='date'?e.createdAt:col==='stage'?String(['seen','organized','checked','explainable'].indexOf(e.knowledge??knowledgeOf(e))):col==='sure'?String(ratingsFor(store,String(e.meta?.pageId??e.id)).at(-1)?.value??''):t.cells[e.id]?.[col]??'';
  const sorted=[...rows].sort((a,b)=>{const x=val(a,sort.col),y=val(b,sort.col);const k=kinds[sort.col]??(sort.col==='stage'||sort.col==='sure'?'number':'text');return (k==='number'?(Number(x)||0)-(Number(y)||0):x.localeCompare(y))*sort.dir});
  async function fromFields(){
    try{const {pages}=await fetch(`${import.meta.env.BASE_URL}api/pages?full=1`,{credentials:'include'}).then(r=>r.json()) as {pages:Page[]};
      const labels=new Map<string,string>();const cells={...t.cells};const cols=[...t.columns];
      for(const p of pages){if(!p.latestEntryId)continue;for(const b of p.blocks??[]){if(b.kind!=='fields')continue;for(const f of (b.value as BlockValues['fields']).fields){const name=f.label.trim();if(!name)continue;
        let id=labels.get(name)??cols.find(c=>c.name===name)?.id;if(!id){id=uid();cols.push({id,name})}labels.set(name,id);cells[p.latestEntryId]={...(cells[p.latestEntryId]??{}),[id]:f.text.trim()}}}}
      save({...t,columns:cols,cells});notify(tr('Columns made from fields.'))}catch(e){notify((e as Error).message)}
  }
  const head=(col:string,label:string)=><th key={col}><button className="th-sort" onClick={()=>setSort({col,dir:sort.col===col?(sort.dir===1?-1:1):1})}>{label}{sort.col===col?(sort.dir===1?' ↑':' ↓'):''}</button></th>;
  return <div className="table-view">
    <div className="board-bar"><select aria-label={tr('Mother planet')} value={t.planetId??''} onChange={e=>save({...t,planetId:e.target.value||undefined})}><option value="">{tr('All planets')}</option>{planetTree(store.planets).map(p=><option key={p.id} value={p.id}>{'　'.repeat(p.depth)}{p.name}</option>)}</select>
      <button className="secondary small" onClick={()=>void fromFields()}>{tr('Columns from fields')}</button></div>
    <div className="b-table-wrap"><table className="db-table"><thead><tr>{head('title',tr('Title'))}{head('stage',tr('Stage'))}{head('sure',tr('Felt'))}{head('date',tr('Date'))}
      {t.columns.map(c=><th key={c.id} className={`k-${kinds[c.id]}`}><span className="th-edit"><input aria-label={tr('Column name')} value={c.name} onChange={e=>save({...t,columns:t.columns.map(x=>x.id===c.id?{...x,name:e.target.value}:x)})}/><button className="th-sort" onClick={()=>setSort({col:c.id,dir:sort.col===c.id?(sort.dir===1?-1:1):1})} aria-label={tr('Sort')}>{sort.col===c.id?(sort.dir===1?'↑':'↓'):'↕'}</button><button className="icon-button tiny" aria-label={tr('Delete column')} onClick={()=>save({...t,columns:t.columns.filter(x=>x.id!==c.id)})}><X size={11}/></button></span></th>)}
      <th className="th-new"><form onSubmit={e=>{e.preventDefault();const n=newCol.trim();if(!n)return;save({...t,columns:[...t.columns,{id:uid(),name:n}]});setNewCol('')}}><input aria-label={tr('New column')} placeholder={tr('New column')} value={newCol} onChange={e=>setNewCol(e.target.value)}/><button className="icon-button tiny" aria-label={tr('Add column')}><Plus size={13}/></button></form></th></tr></thead>
      <tbody>{sorted.map(e=><tr key={e.id}><td><button className="text-button" onClick={()=>go(`/entries/${e.id}/original`)}>{e.title||e.body.slice(0,40)||tr('Untitled')}</button></td><td>{knowledgeLabel[e.knowledge??knowledgeOf(e)]}</td><td>{val(e,'sure')||'—'}</td><td className="muted">{e.createdAt.slice(0,10)}</td>
        {t.columns.map(c=><td key={c.id} className={`k-${kinds[c.id]}`}><input aria-label={c.name} value={t.cells[e.id]?.[c.id]??''} onChange={ev=>save({...t,cells:{...t.cells,[e.id]:{...(t.cells[e.id]??{}),[c.id]:ev.target.value}}})}/></td>)}<td/></tr>)}</tbody></table></div>
  </div>;
}
