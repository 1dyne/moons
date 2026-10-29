import {useEffect,useMemo,useRef,useState,type ComponentType,type DragEvent} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,Bookmark,BookOpen,Brain,Camera,Check,ChevronDown,Code,Coffee,Compass,Feather,FileText,Film,FlaskConical,Flame,Globe,GraduationCap,Headphones,Heart,Lightbulb,Link as LinkIcon,LoaderCircle,Mic,Music,Newspaper,Pencil,Plus,Star,Trash2,Upload,Video,X,type LucideProps} from 'lucide-react';
import {defaultTiles,type Store,type Tile} from '@/lib/model';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import Modal from './Modal';
import SparkComposer from './SparkComposer';
import AudioRecorder from './AudioRecorder';
import {isPdf,uploadPdf,uploadRecording} from '@/lib/upload-recording';
import {tr} from '@/lib/i18n';

type Icon=ComponentType<LucideProps>;
export const tileIcons:Record<string,Icon>={Flame,BookOpen,Newspaper,Mic,Video,Headphones,Lightbulb,Pencil,Bookmark,GraduationCap,Brain,Camera,Code,Globe,Heart,Music,Film,Coffee,Compass,Feather,FlaskConical,Star,FileText,Link:LinkIcon};
const iconNames=Object.keys(tileIcons).slice(0,24);
export const iconFor=(name:string)=>tileIcons[name]??FileText;
const tints=['#d2e0f6','#e2d9f3','#d9eee3','#c6e8ea','#eedbc7','#f3dede'];
export const adapterInfo:{id:string;label:string;live:boolean;hint:string}[]=[
  {id:'dump',label:'Dump',live:true,hint:tr('Type or paste text')},
  {id:'url',label:tr('Web link'),live:true,hint:tr('Article or report URL')},
  {id:'audio',label:tr('Audio / video file'),live:true,hint:'mp3, m4a, wav, mp4 up to 20MB'},
  {id:'pdf',label:'PDF',live:true,hint:'PDF · 20MB'},{id:'youtube',label:'YouTube',live:false,hint:''},{id:'github',label:'GitHub',live:false,hint:''},{id:'photo',label:tr('Book page photo (OCR)'),live:false,hint:''}];
const fieldInfo=[{id:'title',label:'Title'},{id:'author',label:tr('Author / source')},{id:'date',label:'Date'},{id:'url',label:'Link'}];
export const MAX_AUDIO=20*1024*1024;
export const tilesOf=(store:Store)=>[...(store.tiles??defaultTiles())].sort((a,b)=>a.position-b.position);

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;saved:(id:string)=>void;go:(url:string)=>void};

export function MaterialTiles({ctx,open}:{ctx:Ctx;open:(id:string)=>void}){
  const {store,ws}=ctx,tiles=tilesOf(store);
  const [edit,setEdit]=useState(false),[form,setForm]=useState<Tile|'new'|null>(null);
  const write=(next:Tile[])=>ws.commit(s=>({...s,tiles:next.map((t,i)=>({...t,position:i}))}));
  function move(i:number,d:number){const next=[...tiles];const j=i+d;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];write(next)}
  return <div className="tile-zone"><div className="media-tiles">{tiles.map((t,i)=>{const I=iconFor(t.icon);return <div key={t.id} className={`tile-wrap ${edit?'editing':''}`}>
    <button className="media-tile" style={{'--tile':tints[i%tints.length]} as React.CSSProperties} onClick={()=>edit?setForm(t):open(t.id)} data-testid={`tile-${t.id}`}><I size={29} strokeWidth={1.4}/><span>{t.name}</span></button>
    {edit&&<div className="tile-tools"><button aria-label={tr('Move {name} earlier',{name:t.name})} disabled={i===0} onClick={()=>move(i,-1)}><ArrowLeft size={13}/></button><button aria-label={tr('Move {name} later',{name:t.name})} disabled={i===tiles.length-1} onClick={()=>move(i,1)}><ArrowRight size={13}/></button></div>}</div>})}
    <button className="media-tile add-tile" onClick={()=>setForm('new')}><Plus size={26} strokeWidth={1.4}/><span>{tr('Add tile')}</span></button></div>
    <button className="text-button tile-edit-toggle" onClick={()=>setEdit(!edit)} aria-pressed={edit}>{edit?<><Check size={14}/>{tr('Done editing')}</>:<><Pencil size={14}/>{tr('Edit tiles')}</>}</button>
    {form&&<TileModal store={store} tile={form==='new'?null:form} close={()=>setForm(null)} save={t=>{const exists=tiles.some(x=>x.id===t.id);write(exists?tiles.map(x=>x.id===t.id?t:x):[...tiles,t]);setForm(null)}} remove={id=>{write(tiles.filter(t=>t.id!==id));setForm(null);ctx.notify(tr('Tile removed. Your nodes are untouched.'))}}/>}
  </div>;
}

function TileModal({store,tile,close,save,remove}:{store:Store;tile:Tile|null;close:()=>void;save:(t:Tile)=>void;remove:(id:string)=>void}){
  const [icon,setIcon]=useState(tile?.icon??'Bookmark'),[name,setName]=useState(tile?.name??''),[adapters,setAdapters]=useState<string[]>(tile?.adapters??['dump']),[planet,setPlanet]=useState(tile?.defaultPlanet??''),[fields,setFields]=useState<string[]>(tile?.fields??['title']),[confirm,setConfirm]=useState(false);
  const toggle=(list:string[],set:(v:string[])=>void,id:string)=>set(list.includes(id)?list.filter(x=>x!==id):[...list,id]);
  const ok=name.trim()&&adapters.length>0;
  return <Modal title={tile?tr('Edit tile'):tr('Add tile')} close={close}><form className="tile-form" onSubmit={e=>{e.preventDefault();if(!ok)return;save({id:tile?.id??crypto.randomUUID(),name:name.trim(),icon,adapters,fields:fields.includes('title')?fields:['title',...fields],position:tile?.position??99,...(planet?{defaultPlanet:planet}:{})})}}>
    <span className="label">{tr('Icon')}</span><div className="icon-grid" role="group" aria-label={tr('Icon')}>{iconNames.map(n=>{const I=tileIcons[n];return <button type="button" key={n} aria-label={n} aria-pressed={icon===n} className={icon===n?'selected':''} onClick={()=>setIcon(n)}><I size={19} strokeWidth={1.5}/></button>})}</div>
    <label className="form-label">{tr('Name')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={24} placeholder={tr('e.g. Research papers')} required/></label>
    <span className="label">{tr('How it gets in')}</span><div className="chip-row">{adapterInfo.filter(a=>a.live).map(a=><button type="button" key={a.id} className={adapters.includes(a.id)?'selected':''} aria-pressed={adapters.includes(a.id)} onClick={()=>toggle(adapters,setAdapters,a.id)}>{a.label}</button>)}</div>
    <label className="form-label">{tr('Default planet')}<select value={planet} onChange={e=>setPlanet(e.target.value)}><option value="">{tr('None (Dwarf Planet)')}</option>{store.planets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <span className="label">{tr('Input fields')}</span><div className="chip-row">{fieldInfo.map(f=><button type="button" key={f.id} disabled={f.id==='title'} className={fields.includes(f.id)||f.id==='title'?'selected':''} aria-pressed={fields.includes(f.id)||f.id==='title'} onClick={()=>toggle(fields,setFields,f.id)}>{f.label}</button>)}</div>
    <div className="modal-actions">{tile&&(confirm?<button type="button" className="danger" onClick={()=>remove(tile.id)}>{tr('Confirm delete')}</button>:<button type="button" className="text-button" onClick={()=>setConfirm(true)}><Trash2 size={14}/>{tr('Delete')}</button>)}<button className="secondary" type="button" onClick={close}>{tr('Cancel')}</button><button className="primary" disabled={!ok}>{tr('Save tile')}<Check size={16}/></button></div></form></Modal>;
}

const isUrl=(t:string)=>/^https?:\/\/\S+$/i.test(t.trim());
export function MaterialPage({tileId,ctx,back}:{tileId:string;ctx:Ctx;back:()=>void}){
  const {store,ws}=ctx,tiles=tilesOf(store),tile=tiles.find(t=>t.id===tileId)??tiles[0];
  const [adapter,setAdapter]=useState(tile.adapters[0]??'dump'),[title,setTitle]=useState(''),[author,setAuthor]=useState(''),[date,setDate]=useState(''),[url,setUrl]=useState(''),[text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[over,setOver]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  const [recording,setRecording]=useState(false);
  useEffect(()=>{setAdapter(tile.adapters[0]??'dump');setError('')},[tile.id]);
  const I=iconFor(tile.icon),planet=store.planets.find(p=>p.id===tile.defaultPlanet);
  const fields=useMemo(()=>new Set(tile.fields),[tile.fields]);
  function takeFile(f:File){if(f.size>MAX_AUDIO){setError(tr('This file is over 20MB.'));return}setError('');setFile(f);setAdapter(isPdf(f)?'pdf':'audio');if(!title)setTitle(f.name.replace(/\.[^.]+$/,''))}
  function drop(e:DragEvent){e.preventDefault();setOver(false);const f=e.dataTransfer.files?.[0];if(f){takeFile(f);return}const t=e.dataTransfer.getData('text/plain');if(isUrl(t)){setUrl(t.trim());setAdapter('url')}}
  async function finish(before:Set<string>,extraMeta:boolean){
    const next=ws.getStore()?.entries.find(e=>!before.has(e.id));
    if(next&&extraMeta){const meta={...(author&&{author}),...(date&&{readAt:date}),...(url&&adapter!=='url'?{url}:{})};if(Object.keys(meta).length)ws.commit(s=>({...s,entries:s.entries.map(e=>e.id===next.id?{...e,meta:{...e.meta,...meta}}:e)}))}
    setTitle('');setAuthor('');setDate('');setUrl('');setText('');setFile(null);
    if(next)ctx.saved(next.id);else ctx.notify(tr('Saved to Nodes.'));
  }
  async function submit(){
    if(recording)return;
    setError('');const before=new Set((ws.getStore()?.entries??[]).map(e=>e.id));setBusy(true);
    try{
      if(adapter==='pdf'){
        if(!file)throw new Error(tr('Choose a PDF first.'));
        await uploadPdf(ws,file,title.trim()||file.name.replace(/\.pdf$/i,''),tile.defaultPlanet);
      }else if(adapter==='audio'){
        if(!file)throw new Error(tr('Choose or drop an audio file first.'));
        await uploadRecording(ws,file,title.trim()||file.name,tile.defaultPlanet);
      }else if(adapter==='url'){
        if(!isUrl(url))throw new Error(tr('Paste a full link starting with http:// or https://'));
        let host=url;try{host=new URL(url).hostname}catch{/* keep */}
        await ws.action('material',{adapter:'url',title:title.trim()||host,url:url.trim(),...(tile.defaultPlanet?{defaultPlanet:tile.defaultPlanet}:{})});
      }else{
        if(!text.trim())throw new Error(tr('Write or paste the material text first.'));
        await ws.action('material',{adapter:'dump',title:title.trim()||text.trim().slice(0,40),text,...(tile.defaultPlanet?{defaultPlanet:tile.defaultPlanet}:{})});
      }
      await finish(before,true);
    }catch(e){setError(errMsg(e))}finally{setBusy(false)}
  }
  async function dump(value:string){
    try{await ws.action('material',{adapter:'dump',title:value.slice(0,40),text:value,...(tile.defaultPlanet?{defaultPlanet:tile.defaultPlanet}:{})});ctx.notify(planet?`Saved to ${planet.name}.`:tr('Saved to Nodes.'));return true}
    catch(e){ctx.notify(errMsg(e));return false}
  }
  const primary=adapterInfo.filter(a=>a.live&&tile.adapters.includes(a.id)),more=adapterInfo.filter(a=>!primary.includes(a));
  const canSend=!recording&&(adapter==='audio'||adapter==='pdf'?!!file&&(adapter==='pdf')===isPdf(file):adapter==='url'?!!url.trim():!!text.trim());
  return <section className="material-page">
    <div className="media-editor-top"><button className="text-button" onClick={back}><ArrowLeft size={16}/>{tr('Write')}</button><span><I size={15}/>{tile.name}</span><span className="tiny-caption">{planet?`Lands in ${planet.name}`:''}</span></div>
    <div className="material-switch" role="tablist" aria-label={tr('Tiles')}>{tiles.map(t=>{const TI=iconFor(t.icon);return <button key={t.id} role="tab" aria-selected={t.id===tile.id} className={t.id===tile.id?'active':''} onClick={()=>ctx.go(`/media/${t.id}`)}><TI size={14}/>{t.name}</button>})}</div>
    <AudioRecorder file={file} onRecorded={takeFile} onActiveChange={setRecording} disabled={busy||ws.busy>0}/>
    <div className={`dropzone ${over?'over':''}`} onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={drop} onPaste={e=>{const t=e.clipboardData.getData('text');if(isUrl(t)&&!(e.target as HTMLElement).matches('textarea')){e.preventDefault();setUrl(t.trim());setAdapter('url')}}}>
      <Upload size={26} strokeWidth={1.3}/><p><strong>{tr('Drop a file or paste a link')}</strong></p>
      <div className="chip-row detected" role="group" aria-label={tr('How this gets in')}>{primary.map(a=><button key={a.id} className={adapter===a.id?'selected':''} aria-pressed={adapter===a.id} onClick={()=>setAdapter(a.id)}>{a.label}</button>)}{!primary.some(a=>a.id===adapter)&&<button className="selected">{adapterInfo.find(a=>a.id===adapter)?.label}</button>}</div>
      <input ref={fileInput} type="file" hidden accept={adapter==='pdf'?"application/pdf,.pdf":"audio/*,video/mp4,.mp3,.m4a,.wav,.mp4,application/pdf,.pdf"} onChange={e=>{const f=e.target.files?.[0];if(f)takeFile(f);e.target.value=''}}/>
    </div>
    <form className="paper-editor material-form" onSubmit={e=>{e.preventDefault();void submit()}}>
      <label className="sr-only" htmlFor="mat-title">{tr('Title')}</label><input id="mat-title" className="title-input" value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} placeholder={tr('Title')}/>
      <div className="metadata-fields">{fields.has('author')&&<label>{tr('Author / source')}<input value={author} onChange={e=>setAuthor(e.target.value)} maxLength={150} placeholder={tr('Optional')}/></label>}{fields.has('date')&&<label>{tr('Date')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>}{(fields.has('url')||adapter==='url')&&<label className="full">{tr('Link')}<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></label>}</div>
      {adapter==='audio'||adapter==='pdf'?<div className="file-pick"><button type="button" className="secondary" onClick={()=>fileInput.current?.click()}><Upload size={15}/>{file?tr('Change file'):adapter==='pdf'?tr('Choose a PDF'):tr('Choose audio file')}</button>{file&&<span>{file.name} · {(file.size/1048576).toFixed(1)}MB<button type="button" aria-label={tr('Remove file')} onClick={()=>setFile(null)}><X size={13}/></button></span>}</div>
      :adapter==='url'?null
      :<textarea aria-label={tr('Material text')} placeholder={tr('Paste or write the material text')} value={text} onChange={e=>setText(e.target.value)} maxLength={60000}/>}
      {error&&<p role="alert" className="field-error">{error}</p>}
      <div className="paper-actions"><span className="muted">{busy&&adapter!=='dump'?tr('Reading the original — this can take a minute.'):''}</span><button type="submit" className="primary" disabled={!canSend||busy}>{busy?<LoaderCircle className="spin" size={16}/>:null}SEND <ArrowUpRight size={17}/></button></div>
    </form>
    <details className="more-ways"><summary>{tr('More ways to add')}<ChevronDown size={14}/></summary><ul>{more.map(a=><li key={a.id} className={a.live?'':'soon'}>{a.live?<button onClick={()=>setAdapter(a.id)}><b>{a.label}</b><span>{a.hint}</span></button>:<><b>{a.label}</b><span>{tr('Designed, shipping next')}</span></>}</li>)}</ul></details>
    <div className="material-dump"><span className="eyebrow">DUMP WINDOW{planet?` · ${planet.name}`:''}</span><SparkComposer draftKey={`moons.draft.material.${tile.id}`} label={tr('Dump a spark')} placeholder={tr('Think out loud about it')} onSubmit={dump}/></div>
  </section>;
}
