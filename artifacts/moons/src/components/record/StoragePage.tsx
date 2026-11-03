import {useEffect,useMemo,useState} from 'react';
import {FileText,Folder,FolderPlus,Globe,Image as ImageIcon,Link as LinkIcon,Mic,Pencil,Trash2,Upload} from 'lucide-react';
import {tr} from '@/lib/i18n';
import {assetUrl,folderTree,isAudio,isImage,storageApi,type Asset,type Folder as F} from '@/lib/storage-client';
import {newBlock,newPage,pagesApi} from '@/lib/pages';
import {upsertPage} from '@/lib/v9-store';
import {uid} from '@/lib/model';
import {pickFile} from './Blocks';

/** v9 4.7 창고: kept as they are, no structuring, no AI. `정리` opens a page with the file in it; the file stays here. */
export default function StoragePage({notify,go}:{notify:(m:string)=>void;go:(u:string)=>void}){
  const [data,setData]=useState<{folders:F[];assets:Asset[]}>({folders:[],assets:[]}),[folder,setFolder]=useState<string|null>(null),[sel,setSel]=useState<string|null>(null),[busy,setBusy]=useState(false),[over,setOver]=useState(false);
  const load=()=>storageApi.list().then(setData,e=>notify((e as Error).message));
  useEffect(()=>{void load()},[]);
  const tree=useMemo(()=>folderTree(data.folders),[data.folders]);
  const inFolder=(a:Asset)=>folder===null?true:a.folderId===folder;
  const files=data.assets.filter(inFolder);const s=data.assets.find(a=>a.id===sel);
  async function upload(list:File[]){setBusy(true);for(const f of list){try{await storageApi.upload(f,folder)}catch(e){notify((e as Error).message)}}setBusy(false);void load()}
  async function newFolder(){const name=window.prompt(tr('Folder name'))?.trim();if(!name)return;await storageApi.saveFolder({id:uid(),name,parentId:folder});void load()}
  async function organize(a:Asset){const p=newPage({title:a.name.replace(/\.[a-z0-9]+$/i,''),assetId:a.id,blocks:[a.url&&!a.stored?newBlock('link',{url:a.url,title:a.name},'source'):newBlock('file',{assetId:a.id,name:a.name,mime:a.mime},'source'),newBlock('text')]});
    try{const saved=await pagesApi.save(p);upsertPage({...saved,blocks:p.blocks});go(`/pages/${p.id}`)}catch(e){notify((e as Error).message)}}
  const Icon=(a:Asset)=>a.url&&!a.stored?Globe:isImage(a.mime)?ImageIcon:isAudio(a.mime)?Mic:FileText;
  return <section className="storage" onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setOver(true)}}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);void upload(Array.from(e.dataTransfer.files))}}>
    <header className="storage-head"><h1>{tr('Storage')}</h1><span className="pe-spacer"/>
      <button className="secondary small" onClick={()=>void newFolder()}><FolderPlus size={15}/>{tr('Folder')}</button>
      <button className="secondary small" onClick={async()=>{const url=window.prompt(tr('Web link'),'https://')?.trim();if(!url)return;try{await storageApi.addLink(url,undefined,folder);void load()}catch(e){notify((e as Error).message)}}}><LinkIcon size={15}/>{tr('Link')}</button>
      <button className="primary small" disabled={busy} onClick={async()=>{const f=await pickFile();if(f)void upload([f])}}><Upload size={15}/>{busy?tr('Uploading…'):tr('Upload')}</button></header>
    <div className="storage-body">
      <nav className="storage-tree" aria-label={tr('Folders')}>
        <button className={folder===null?'on':''} onClick={()=>setFolder(null)}><Folder size={15}/>{tr('All')}<small>{data.assets.length}</small></button>
        {tree.map(f=><div key={f.id} className="st-row" style={{paddingLeft:f.depth*16}}><button className={folder===f.id?'on':''} onClick={()=>setFolder(f.id)}><Folder size={15}/>{f.name}<small>{data.assets.filter(a=>a.folderId===f.id).length}</small></button>
          {folder===f.id&&<><button className="icon-button tiny" aria-label={tr('Rename')} onClick={async()=>{const n=window.prompt(tr('Folder name'),f.name)?.trim();if(n){await storageApi.saveFolder({...f,name:n});void load()}}}><Pencil size={12}/></button><button className="icon-button tiny" aria-label={tr('Delete')} onClick={async()=>{if(window.confirm(tr('Delete this folder? Files move up one level.'))){await storageApi.removeFolder(f.id);setFolder(f.parentId);void load()}}}><Trash2 size={12}/></button></>}</div>)}
      </nav>
      <div className={`storage-grid ${over?'over':''}`}>
        {files.map(a=>{const I=Icon(a);return <button key={a.id} className={`asset ${sel===a.id?'on':''}`} onClick={()=>setSel(a.id)}>
          <span className="asset-thumb">{isImage(a.mime)&&a.stored?<img src={assetUrl(a.id)} alt=""/>:<I size={26} strokeWidth={1.5}/>}</span><span className="asset-name">{a.name}</span></button>})}
        {!files.length&&<div className="storage-empty"><Upload size={28} strokeWidth={1.4}/></div>}
      </div>
      {s&&<aside className="storage-panel">
        <span className="asset-thumb big">{isImage(s.mime)&&s.stored?<img src={assetUrl(s.id)} alt=""/>:(()=>{const I=Icon(s);return <I size={34} strokeWidth={1.4}/>})()}</span>
        <b className="asset-title">{s.name}</b><small className="muted">{s.url&&!s.stored?s.url:`${s.mime} · ${Math.max(1,Math.round(s.size/1024))}KB`}</small>
        <div className="actions"><button className="primary small" onClick={()=>void organize(s)}>{tr('Organize')}</button>
          <a className="secondary small btn-link" href={s.url&&!s.stored?s.url:assetUrl(s.id)} target="_blank" rel="noreferrer noopener">{tr('Open')}</a>
          <button className="secondary small" onClick={async()=>{const n=window.prompt(tr('Name'),s.name)?.trim();if(n){await storageApi.update(s.id,{name:n});void load()}}}>{tr('Rename')}</button></div>
        <label className="form-label">{tr('Move')}<select value={s.folderId??''} onChange={async e=>{await storageApi.update(s.id,{folderId:e.target.value||null});void load()}}><option value="">{tr('All')}</option>{tree.map(f=><option key={f.id} value={f.id}>{'　'.repeat(f.depth)}{f.name}</option>)}</select></label>
        <button className="text-button danger" onClick={async()=>{if(window.confirm(tr('Delete this file?'))){await storageApi.remove(s.id);setSel(null);void load()}}}><Trash2 size={14}/>{tr('Delete')}</button>
      </aside>}
    </div>
  </section>;
}
