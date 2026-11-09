import {useRef,useState} from 'react';
import {Check,Mic,Paperclip,Plus,RotateCcw,Send,Square,Trash2,X} from 'lucide-react';
import RichText,{type RichHandle} from './RichText';
import {tr} from '@/lib/i18n';
import {newBlock,type Block,type BlockValues,type Mark} from '@/lib/pages';
import {uid} from '@/lib/model';
import {assetUrl,isAudio,isImage,storageApi} from '@/lib/storage-client';

type Ctx<K extends keyof BlockValues>={block:Block<K>;set:(v:BlockValues[K])=>void;notify:(m:string)=>void};
const today=()=>new Date().toISOString().slice(0,10);

export function ListEditor({items,set,placeholder,add,label}:{items:string[];set:(v:string[])=>void;placeholder:string;add:string;label:string}){
  return <div className="b-list">{items.map((t,i)=><div className="b-row" key={i}><input aria-label={`${label} ${i+1}`} value={t} placeholder={placeholder} onChange={e=>set(items.map((x,j)=>j===i?e.target.value:x))} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();const n=[...items];n.splice(i+1,0,'');set(n);setTimeout(()=>(e.currentTarget.parentElement?.nextElementSibling?.querySelector('input') as HTMLInputElement|null)?.focus())}if(e.key==='Backspace'&&!t&&items.length>1){e.preventDefault();set(items.filter((_,j)=>j!==i))}}}/><button className="icon-button tiny" aria-label={tr('Delete')} onClick={()=>set(items.filter((_,j)=>j!==i))}><X size={13}/></button></div>)}<button className="text-button" onClick={()=>set([...items,''])}><Plus size={14}/>{add}</button></div>;
}

export function FieldsBlock({block,set}:Ctx<'fields'>){
  const f=block.value.fields;
  return <div className="b-fields">{f.map((x,i)=><div className="b-field" key={i}><input className="b-field-label" aria-label={tr('Field name')} value={x.label} placeholder={tr('Field')} onChange={e=>set({fields:f.map((y,j)=>j===i?{...y,label:e.target.value}:y)})}/><textarea aria-label={x.label||tr('Field')} value={x.text} rows={Math.max(1,Math.min(8,x.text.split('\n').length))} onChange={e=>set({fields:f.map((y,j)=>j===i?{...y,text:e.target.value}:y)})}/><button className="icon-button tiny" aria-label={tr('Delete')} onClick={()=>set({fields:f.filter((_,j)=>j!==i)})}><X size={13}/></button></div>)}<button className="text-button" onClick={()=>set({fields:[...f,{label:'',text:''}]})}><Plus size={14}/>{tr('Field')}</button></div>;
}

export function StatusBlock({block,set}:Ctx<'status'>){
  const opts:[BlockValues['status']['value'],string][]=[['open',tr('Unsolved')],['doing',tr('Solving')],['done',tr('Solved')]];
  return <div className="b-status" role="group" aria-label={tr('Status')}>{opts.map(([k,l])=><button key={k} className={`pill ${block.value.value===k?'on '+k:''}`} aria-pressed={block.value.value===k} onClick={()=>set({value:k})}>{l}</button>)}</div>;
}

export function LogBlock({block,set}:Ctx<'log'>){
  const [d,setD]=useState('');const items=block.value.items;
  const add=()=>{if(!d.trim())return;set({items:[...items,{at:today(),text:d.trim()}]});setD('')};
  return <div className="b-log">{items.map((x,i)=><div className="b-log-item" key={i}><i/><small>{x.at}</small><span>{x.text}</span><button className="icon-button tiny" aria-label={tr('Delete')} onClick={()=>set({items:items.filter((_,j)=>j!==i)})}><X size={12}/></button></div>)}
    <div className="b-row"><input aria-label={tr('Add fix')} value={d} placeholder={tr('Add fix')} onChange={e=>setD(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();add()}}}/><button className="secondary small" onClick={add}>{tr('Add')}</button></div></div>;
}

export function TableBlock({block,set}:Ctx<'table'>){
  const {columns,rows}=block.value;
  const setCell=(r:number,c:number,v:string)=>set({columns,rows:rows.map((row,i)=>i===r?row.map((x,j)=>j===c?v:x):row)});
  return <div className="b-table-wrap"><table className="b-table"><thead><tr>{columns.map((c,i)=><th key={i}><input aria-label={tr('Column name')} value={c} placeholder={tr('Column')} onChange={e=>set({columns:columns.map((x,j)=>j===i?e.target.value:x),rows})}/></th>)}<th className="b-add"><button className="icon-button tiny" aria-label={tr('Add column')} onClick={()=>set({columns:[...columns,''],rows:rows.map(r=>[...r,''])})}><Plus size={13}/></button></th></tr></thead>
    <tbody>{rows.map((r,i)=><tr key={i}>{columns.map((_,j)=><td key={j}><input aria-label={`${columns[j]||tr('Column')} ${i+1}`} value={r[j]??''} onChange={e=>setCell(i,j,e.target.value)}/></td>)}<td className="b-add"><button className="icon-button tiny" aria-label={tr('Delete row')} onClick={()=>set({columns,rows:rows.filter((_,k)=>k!==i)})}><X size={12}/></button></td></tr>)}</tbody></table>
    <button className="text-button" onClick={()=>set({columns,rows:[...rows,columns.map(()=>'')]})}><Plus size={14}/>{tr('Row')}</button></div>;
}

export function ChecklistBlock({block,set}:Ctx<'checklist'>){
  const items=block.value.items;
  return <div className="b-list">{items.map((x,i)=><div className="b-row" key={i}><input type="checkbox" checked={x.done} aria-label={tr('Done')} onChange={e=>set({items:items.map((y,j)=>j===i?{...y,done:e.target.checked}:y)})}/><input aria-label={`${tr('Item')} ${i+1}`} value={x.text} className={x.done?'done':''} onChange={e=>set({items:items.map((y,j)=>j===i?{...y,text:e.target.value}:y)})} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();const n=[...items];n.splice(i+1,0,{text:'',done:false});set({items:n})}}}/><button className="icon-button tiny" aria-label={tr('Delete')} onClick={()=>set({items:items.filter((_,j)=>j!==i)})}><X size={12}/></button></div>)}<button className="text-button" onClick={()=>set({items:[...items,{text:'',done:false}]})}><Plus size={14}/>{tr('Item')}</button></div>;
}

export function TimelineBlock({block,set}:Ctx<'timeline'>){
  const items=block.value.items;
  return <div className="b-timeline">{items.map((x,i)=><div className="b-tl" key={i}><i/><input type="date" aria-label={tr('Date')} value={x.date} onChange={e=>set({items:items.map((y,j)=>j===i?{...y,date:e.target.value}:y)})}/><input aria-label={tr('What happened')} value={x.text} onChange={e=>set({items:items.map((y,j)=>j===i?{...y,text:e.target.value}:y)})}/><button className="icon-button tiny" aria-label={tr('Delete')} onClick={()=>set({items:items.filter((_,j)=>j!==i)})}><X size={12}/></button></div>)}<button className="text-button" onClick={()=>set({items:[...items,{date:today(),text:''}]})}><Plus size={14}/>{tr('Add')}</button></div>;
}

export function CardBlock({block,set}:Ctx<'card'>){
  const [flip,setFlip]=useState(false);const {front,back}=block.value;
  return <div className="b-card"><div className="b-card-edit"><label>{tr('Card front')}<input value={front} onChange={e=>set({front:e.target.value,back})}/></label><label>{tr('Card back')}<textarea value={back} rows={2} onChange={e=>set({front,back:e.target.value})}/></label></div>
    <button className={`flipcard ${flip?'flipped':''}`} onClick={()=>setFlip(!flip)} aria-label={tr('Flip card')}><span className="face front">{front||tr('Card front')}</span><span className="face back">{back||tr('Card back')}</span></button></div>;
}

export function ClozeBlock({block,set}:Ctx<'cloze'>){
  const [open,setOpen]=useState<Set<number>>(new Set());const parts=block.value.text.split(/\[\[(.+?)\]\]/g);
  return <div className="b-cloze"><textarea aria-label={tr('Cloze text')} placeholder={tr('Wrap words to hide in [[ ]]')} value={block.value.text} rows={2} onChange={e=>set({text:e.target.value})}/>
    {parts.length>1&&<p className="cloze-view">{parts.map((p,i)=>i%2?<button key={i} className={`cloze-gap ${open.has(i)?'open':''}`} onClick={()=>setOpen(new Set([...open,i]))}>{open.has(i)?p:'　　　'}</button>:<span key={i}>{p}</span>)}{open.size>0&&<button className="icon-button tiny" aria-label={tr('Hide again')} onClick={()=>setOpen(new Set())}><RotateCcw size={12}/></button>}</p>}</div>;
}

export function QCardsBlock({block,set}:Ctx<'qcards'>){
  const [mode,setMode]=useState<'edit'|'go'>('edit'),[i,setI]=useState(0),[show,setShow]=useState(false);const cards=block.value.cards;
  if(mode==='go'&&cards.length){const c=cards[Math.min(i,cards.length-1)]!;return <div className="b-qgo"><div className="q-card"><small>{Math.min(i,cards.length-1)+1} / {cards.length}</small><h4>{c.q||'…'}</h4>{show?<p>{c.a||'—'}</p>:<button className="secondary small" onClick={()=>setShow(true)}>{tr('Answer')}</button>}</div><div className="b-row"><button className="icon-button" aria-label={tr('Previous')} onClick={()=>{setI(Math.max(0,i-1));setShow(false)}}>←</button><button className="icon-button" aria-label={tr('Next')} onClick={()=>{setI(Math.min(cards.length-1,i+1));setShow(false)}}>→</button><button className="text-button" onClick={()=>setMode('edit')}>{tr('Edit')}</button></div></div>}
  return <div className="b-qcards">{cards.map((c,k)=><div className="b-q" key={k}><input aria-label={tr('Question')} placeholder={tr('Question')} value={c.q} onChange={e=>set({cards:cards.map((x,j)=>j===k?{...x,q:e.target.value}:x)})}/><textarea aria-label={tr('Answer')} placeholder={tr('Answer')} rows={1} value={c.a} onChange={e=>set({cards:cards.map((x,j)=>j===k?{...x,a:e.target.value}:x)})}/><button className="icon-button tiny" aria-label={tr('Delete')} onClick={()=>set({cards:cards.filter((_,j)=>j!==k)})}><X size={12}/></button></div>)}
    <div className="b-row"><button className="text-button" onClick={()=>set({cards:[...cards,{q:'',a:''}]})}><Plus size={14}/>{tr('Card')}</button>{cards.some(c=>c.q)&&<button className="secondary small" onClick={()=>{setI(0);setShow(false);setMode('go')}}>{tr('Go through')}</button>}</div></div>;
}

export function ChatBlock({block,set,onAsk}:Ctx<'chat'>&{onAsk?:()=>void}){
  const [d,setD]=useState('');const {messages,steps,step=0}=block.value;
  const q=steps&&step<steps.length?steps[step]:null;
  const send=()=>{const t=d.trim();if(!t)return;const at=new Date().toISOString();const m=[...messages];if(q)m.push({by:'ai',text:q,at});m.push({by:'user',text:t,at});set({...block.value,messages:m,step:steps?step+1:step});setD('')};
  return <div className="b-chat">{messages.map((m,i)=><div key={i} className={`bubble ${m.by}`}>{m.text}</div>)}{q&&<div className="bubble ai next">{q}</div>}
    <div className="b-chat-input"><textarea aria-label={tr('Dump to MOONS')} rows={1} placeholder={q?tr('Answer'):tr('Dump it here')} value={d} onChange={e=>setD(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send()}}}/><button className="icon-button" aria-label={tr('Send')} onClick={send}><Send size={16}/></button></div>
    {(onAsk&&messages.some(m=>m.by==='user'))&&<button className="text-button" onClick={onAsk}>{tr('Ask MOONS')}</button>}</div>;
}

export function LinkBlock({block,set}:Ctx<'link'>){
  const {url,title}=block.value;const ok=/^https?:\/\//.test(url);
  return <div className="b-link"><input aria-label={tr('Link')} placeholder="https://" value={url} onChange={e=>set({url:e.target.value.trim(),title})}/>{ok&&<a href={url} target="_blank" rel="noreferrer noopener">{title||url}</a>}</div>;
}

export function pickFile(accept?:string):Promise<File|null>{return new Promise(res=>{const i=document.createElement('input');i.type='file';if(accept)i.accept=accept;i.onchange=()=>res(i.files?.[0]??null);i.click()})}
export async function uploadToBlock(file:File,notify:(m:string)=>void):Promise<BlockValues['file']|null>{
  try{const {id}=await storageApi.upload(file);return {assetId:id,name:file.name,mime:file.type||'application/octet-stream'}}catch(e){notify((e as Error).message||tr('Upload failed.'));return null}
}

export function FileBlock({block,set,notify}:Ctx<'file'>){
  const {assetId,name,mime}=block.value;const [busy,setBusy]=useState(false);
  if(!assetId)return <div className="b-file empty"><button className="secondary small" disabled={busy} onClick={async()=>{const f=await pickFile();if(!f)return;setBusy(true);const v=await uploadToBlock(f,notify);setBusy(false);if(v)set(v)}}><Paperclip size={15}/>{busy?tr('Uploading…'):tr('Choose file')}</button></div>;
  const url=assetUrl(assetId);
  return <div className="b-file">{isImage(mime)?<img src={url} alt={name}/>:isAudio(mime)?<audio controls src={url}/>:null}<a href={url} target="_blank" rel="noreferrer noopener"><Paperclip size={14}/>{name}</a></div>;
}

export function GalleryBlock({block,set,notify}:Ctx<'gallery'>){
  const ids=block.value.assetIds;
  return <div className="b-gallery">{ids.map(id=><div key={id} className="g-item"><img src={assetUrl(id)} alt=""/><button className="icon-button tiny" aria-label={tr('Delete')} onClick={()=>set({assetIds:ids.filter(x=>x!==id)})}><X size={12}/></button></div>)}<button className="g-add" aria-label={tr('Add image')} onClick={async()=>{const f=await pickFile('image/*');if(!f)return;const v=await uploadToBlock(f,notify);if(v?.assetId)set({assetIds:[...ids,v.assetId]})}}><Plus size={20}/></button></div>;
}

const NOTE_COLORS=['#fff1a8','#dfe8fb','#f6d0d3','#d6f0e2','#e6dffa'];
export function CanvasBlock({block,set}:Ctx<'canvas'>){
  const {items,links}=block.value;const drag=useRef<{id:string;sx:number;sy:number;ox:number;oy:number}|null>(null);
  const [linking,setLinking]=useState<string|null>(null),[mode,setMode]=useState(false),[label,setLabel]=useState<{from:string;to:string}|null>(null),[lt,setLt]=useState('');
  const byId=new Map(items.map(i=>[i.id,i]));
  const add=()=>set({items:[...items,{id:uid(),text:'',x:20+(items.length*37)%360,y:20+(items.length*29)%200,w:150,color:NOTE_COLORS[items.length%NOTE_COLORS.length]}],links});
  const click=(id:string)=>{if(!mode)return;if(!linking){setLinking(id);return}if(linking!==id){setLabel({from:linking,to:id});setLt('')}setLinking(null)};
  return <div className="b-canvas"><div className="b-row"><button className="secondary small" onClick={add}><Plus size={14}/>{tr('Note')}</button><button className={`secondary small ${mode?'on':''}`} aria-pressed={mode} onClick={()=>{setMode(!mode);setLinking(null)}}>{tr('Connect')}</button></div>
    <div className="canvas-area">
      {links.map((l,i)=>{const a=byId.get(l.from),b=byId.get(l.to);if(!a||!b)return null;const x1=a.x+a.w/2,y1=a.y+18,x2=b.x+b.w/2,y2=b.y+18,len=Math.hypot(x2-x1,y2-y1),ang=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
        return <div key={i}><i className="c-line" style={{left:x1,top:y1,width:len,transform:`rotate(${ang}deg)`}}/>{l.label&&<button className="c-label" style={{left:(x1+x2)/2,top:(y1+y2)/2}} onClick={()=>set({items,links:links.filter((_,j)=>j!==i)})} title={tr('Remove line')}>{l.label}</button>}</div>})}
      {items.map(it=><div key={it.id} className={`c-note ${linking===it.id?'sel':''}`} style={{left:it.x,top:it.y,width:it.w,background:it.color}} onClick={()=>click(it.id)}>
        <div className="c-handle" onPointerDown={e=>{drag.current={id:it.id,sx:e.clientX,sy:e.clientY,ox:it.x,oy:it.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}} onPointerMove={e=>{const d=drag.current;if(!d||d.id!==it.id)return;set({items:items.map(x=>x.id===it.id?{...x,x:Math.max(0,d.ox+e.clientX-d.sx),y:Math.max(0,d.oy+e.clientY-d.sy)}:x),links})}} onPointerUp={()=>{drag.current=null}}/>
        <textarea aria-label={tr('Note')} value={it.text} rows={2} onChange={e=>set({items:items.map(x=>x.id===it.id?{...x,text:e.target.value}:x),links})}/>
        <button className="icon-button tiny c-del" aria-label={tr('Delete')} onClick={e=>{e.stopPropagation();set({items:items.filter(x=>x.id!==it.id),links:links.filter(l=>l.from!==it.id&&l.to!==it.id)})}}><X size={11}/></button></div>)}
      {label&&<div className="c-ask"><input autoFocus aria-label={tr('Line name')} placeholder={tr('Line name')} value={lt} onChange={e=>setLt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){set({items,links:[...links,{...label,label:lt.trim()}]});setLabel(null)}}}/><button className="icon-button tiny" aria-label={tr('Connect')} onClick={()=>{set({items,links:[...links,{...label,label:lt.trim()}]});setLabel(null)}}><Check size={13}/></button></div>}
    </div></div>;
}

export function TextBlock({block,set,handle,onEnter,onBackspaceEmpty,onPasteLong,onSelect,onFocus,heading}:{block:Block<'text'>|Block<'heading'>;set:(v:{text:string;marks?:Mark[]})=>void;handle:(h:RichHandle)=>void;onEnter:(before:{text:string;marks:Mark[]},after:{text:string;marks:Mark[]})=>void;onBackspaceEmpty:()=>void;onPasteLong:(t:string)=>void;onSelect:(r:{start:number;end:number}|null,rect:DOMRect|null)=>void;onFocus:()=>void;heading?:1|2}){
  const v=block.value as {text:string;marks?:Mark[]};
  return <RichText label={heading?tr('Heading'):tr('Text')} className={heading?`h${heading}`:''} text={v.text} marks={v.marks} placeholder={heading?tr('Heading'):tr('Write freely')} onChange={(t,m)=>set({...v,text:t,marks:m})} handle={handle} onEnter={onEnter} onBackspaceEmpty={onBackspaceEmpty} onPasteLong={onPasteLong} onSelect={onSelect} onFocus={onFocus}/>;
}

export function Recorder({onDone,notify}:{onDone:(f:File)=>void;notify:(m:string)=>void}){
  const [rec,setRec]=useState<MediaRecorder|null>(null),[sec,setSec]=useState(0);const t=useRef<ReturnType<typeof setInterval>|null>(null);
  async function start(){try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const r=new MediaRecorder(stream);const chunks:Blob[]=[];r.ondataavailable=e=>chunks.push(e.data);
    r.onstop=()=>{stream.getTracks().forEach(x=>x.stop());if(t.current)clearInterval(t.current);const type=r.mimeType||'audio/webm';onDone(new File([new Blob(chunks,{type})],`${tr('Recording')} ${new Date().toLocaleString()}.webm`,{type}))};
    r.start();setRec(r);setSec(0);t.current=setInterval(()=>setSec(s=>s+1),1000)}catch{notify(tr('Microphone access was blocked. Allow microphone access in your browser, then try again.'))}}
  return rec?<button className="icon-button rec-on" aria-label={tr('Stop recording')} onClick={()=>{rec.stop();setRec(null)}}><Square size={15}/><small>{Math.floor(sec/60)}:{String(sec%60).padStart(2,'0')}</small></button>
    :<button className="icon-button" aria-label={tr('Record audio')} title={tr('Record audio')} onClick={()=>void start()}><Mic size={18}/></button>;
}

export function DeleteButton({onClick}:{onClick:()=>void}){return <button className="icon-button tiny" aria-label={tr('Delete block')} onClick={onClick}><Trash2 size={13}/></button>}
export const blockLabel=(k:string)=>({heading:tr('Heading'),text:tr('Text'),chat:tr('Chat'),table:tr('Table'),fields:tr('Fields'),status:tr('Status'),log:tr('Fix log'),checklist:tr('Checklist'),steps:tr('Steps'),timeline:tr('Timeline'),card:tr('Card'),cloze:tr('Cloze'),qcards:tr('Question cards'),file:tr('File'),link:tr('Link'),canvas:tr('Canvas'),gallery:tr('Gallery')} as Record<string,string>)[k]??k;
export {newBlock};
