import {useRef,useState} from 'react';
import {ArrowDown,ArrowLeft,ArrowUp,Camera,Check,GripVertical,LoaderCircle,Pencil,Plus,Trash2,X} from 'lucide-react';
import type {Store} from '@/lib/model';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {blockInfo,blockKinds,emptyValue,formFromDraft,formsOf,makeFormEntry,missingRequired,newBlock,newForm,type BlockKind,type BlockValue,type ChecklistItem,type FormBlock,type FormTemplate,type FormValues} from '@/lib/forms';
import {iconFor,tileIcons} from './MaterialHub';
import SparkComposer,{type ComposerHandle} from './SparkComposer';
import {tr} from '@/lib/i18n';
import '../styles/forms.css';

type Ctx={store:Store;ws:WorkspaceApi;notify:(m:string)=>void;go:(url:string)=>void;saved:(id:string)=>void};
const iconNames=Object.keys(tileIcons).slice(0,24);

/* ---------- Filling a form ---------- */

export function FormFill({form,ctx}:{form:FormTemplate;ctx:Ctx}){
  const init=()=>Object.fromEntries(form.blocks.map(b=>[b.id,emptyValue(b)])) as FormValues;
  const [values,setValues]=useState<FormValues>(init),[free,setFree]=useState(''),[error,setError]=useState('');
  const composer=useRef<ComposerHandle|null>(null);
  const set=(id:string,v:BlockValue)=>{setValues(x=>({...x,[id]:v}));setError('')};
  function save(text:string){
    const missing=missingRequired(form,values);
    if(missing.length){setError(tr('Fill in: {labels}',{labels:missing.join(', ')}));return false}
    const entry=makeFormEntry(form,values,text);
    if(!entry){setError(tr('Write something first.'));return false}
    if(!ctx.ws.commit(s=>({...s,entries:[entry,...s.entries]}))){ctx.notify(tr('This space changed elsewhere. Resolve the conflict above first.'));return false}
    setValues(init());composer.current?.set('');setFree('');ctx.saved(entry.id);return true;
  }
  return <div className="form-fill">
    {form.blocks.map(b=><BlockInput key={b.id} block={b} value={values[b.id]??null} set={v=>set(b.id,v)} store={ctx.store}/>)}
    <div className="form-free"><span className="label">{tr('Anything else, in your own words')}</span>
      <SparkComposer draftKey={`moons.form.${form.id}`} label={tr('Free writing for {name}',{name:form.name})} onSubmit={save} onText={v=>setFree(v)} handle={composer} hint={tr('Enter saves the whole form · Shift+Enter for a new line')} sendLabel={tr('Save')}/></div>
    {error&&<p role="alert" className="field-error">{error}</p>}
    <div className="form-actions"><button className="text-button" onClick={()=>ctx.go(`/forms/${form.id}/edit`)}><Pencil size={14}/>{tr('Edit form')}</button><button className="primary" onClick={()=>save(free)}>{tr('Save')}<Check size={16}/></button></div>
  </div>;
}

function BlockInput({block,value,set,store}:{block:FormBlock;value:BlockValue;set:(v:BlockValue)=>void;store:Store}){
  const id=`block-${block.id}`;
  const head=<label htmlFor={id} className="block-label">{block.label}{block.required&&<span className="req" aria-label={tr('required')}>*</span>}</label>;
  switch(block.kind){
    case 'text':return <div className="form-block">{head}<input id={id} value={typeof value==='string'?value:''} onChange={e=>set(e.target.value)} maxLength={300}/></div>;
    case 'longtext':return <div className="form-block">{head}<textarea id={id} rows={3} value={typeof value==='string'?value:''} onChange={e=>set(e.target.value)} maxLength={5000}/></div>;
    case 'link':return <div className="form-block">{head}<input id={id} type="url" placeholder="https://" value={typeof value==='string'?value:''} onChange={e=>set(e.target.value)}/></div>;
    case 'date':return <div className="form-block">{head}<input id={id} type="date" value={typeof value==='string'?value:''} onChange={e=>set(e.target.value)}/></div>;
    case 'time':return <div className="form-block">{head}<input id={id} type="time" value={typeof value==='string'?value:''} onChange={e=>set(e.target.value)}/></div>;
    case 'estimate':return <div className="form-block">{head}<div className="inline-unit"><input id={id} type="number" min={0} max={1440} step={5} value={typeof value==='number'?value:''} onChange={e=>set(e.target.value===''?null:Math.max(0,Number(e.target.value)))}/><span>{tr('min')}</span></div></div>;
    case 'scale':return <div className="form-block">{head}<div className="scale-row" role="radiogroup" aria-labelledby={id}>{Array.from({length:10},(_,i)=>i+1).map(n=><button type="button" key={n} role="radio" aria-checked={value===n} className={value===n?'selected':''} onClick={()=>set(value===n?null:n)}>{n}</button>)}</div><span id={id} hidden>{block.label}</span></div>;
    case 'select':return <div className="form-block">{head}<div className="chip-row" id={id}>{(block.options??[]).map(o=><button type="button" key={o} aria-pressed={value===o} className={value===o?'selected':''} onClick={()=>set(value===o?null:o)}>{o}</button>)}</div></div>;
    case 'planet':return <div className="form-block">{head}<select id={id} value={typeof value==='string'?value:''} onChange={e=>set(e.target.value||null)}><option value="">{tr('None (Dwarf Planet)')}</option>{store.planets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>;
    case 'checklist':{const items=Array.isArray(value)?value as ChecklistItem[]:[];
      const put=(i:number,patch:Partial<ChecklistItem>)=>set(items.map((x,j)=>j===i?{...x,...patch}:x));
      return <div className="form-block">{head}<ul className="check-list">{items.map((x,i)=><li key={i}><input type="checkbox" checked={x.done} aria-label={tr('Done')} onChange={e=>put(i,{done:e.target.checked})}/><input value={x.text} onChange={e=>put(i,{text:e.target.value})} aria-label={tr('Item {n}',{n:i+1})}/><button type="button" className="icon-button" aria-label={tr('Remove item')} onClick={()=>set(items.filter((_,j)=>j!==i))}><X size={14}/></button></li>)}</ul><button type="button" className="text-button" onClick={()=>set([...items,{text:'',done:false}])}><Plus size={14}/>{tr('Add item')}</button></div>}
    case 'steps':{const items=Array.isArray(value)?value as string[]:[];
      return <div className="form-block">{head}<ol className="step-list">{items.map((x,i)=><li key={i}><input value={x} onChange={e=>set(items.map((y,j)=>j===i?e.target.value:y))} aria-label={tr('Step {n}',{n:i+1})}/><button type="button" className="icon-button" aria-label={tr('Remove step')} onClick={()=>set(items.filter((_,j)=>j!==i))}><X size={14}/></button></li>)}</ol><button type="button" className="text-button" onClick={()=>set([...items,''])}><Plus size={14}/>{tr('Add step')}</button></div>}
  }
}

/* ---------- Building a form ---------- */

export function FormBuilder({formId,ctx}:{formId:string|null;ctx:Ctx}){
  const forms=formsOf(ctx.store),existing=formId?forms.find(f=>f.id===formId)??null:null;
  const [form,setForm]=useState<FormTemplate>(()=>existing?structuredClone(existing):newForm(forms.length));
  const [picking,setPicking]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const photo=useRef<HTMLInputElement>(null);
  const patch=(p:Partial<FormTemplate>)=>setForm(f=>({...f,...p}));
  const patchBlock=(id:string,p:Partial<FormBlock>)=>patch({blocks:form.blocks.map(b=>b.id===id?{...b,...p}:b)});
  const move=(i:number,d:number)=>{const next=[...form.blocks];const j=i+d;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j]!,next[i]!];patch({blocks:next})};
  const ok=form.name.trim().length>0&&form.blocks.length>0&&form.blocks.every(b=>b.label.trim());
  function save(){
    if(!ok)return;const saved={...form,name:form.name.trim(),updatedAt:new Date().toISOString()};
    const done=ctx.ws.commit(s=>{const list=s.forms??[];return {...s,forms:list.some(f=>f.id===saved.id)?list.map(f=>f.id===saved.id?saved:f):[...list,saved]}});
    if(done){ctx.notify(tr('Form saved. It is now a banner on Home.'));ctx.go(`/?form=${saved.id}`)}
  }
  function remove(){if(!existing)return;if(ctx.ws.commit(s=>({...s,forms:(s.forms??[]).filter(f=>f.id!==existing.id)}))){ctx.notify(tr('Form removed. Entries written with it are untouched.'));ctx.go('/')}}
  async function fromPhoto(file:File){
    setError('');setReading(true);
    try{
      const body=new FormData();body.set('image',file);
      const res=await fetch(`${import.meta.env.BASE_URL}api/forms/from-photo`,{method:'POST',body,credentials:'include'});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data?.error?.message??tr('Could not read the photo.'));
      const draft=formFromDraft(data.draft??{},form.position);
      setForm(f=>({...draft,id:f.id,position:f.position,createdAt:f.createdAt,name:draft.name||f.name}));
      ctx.notify(tr('Draft ready. Check every block before saving — nothing is saved yet.'));
    }catch(e){setError(errMsg(e))}finally{setReading(false)}
  }
  const I=iconFor(form.icon);
  return <section className="page-shell form-builder">
    <div className="page-heading"><div><button className="text-button" onClick={()=>ctx.go('/')}><ArrowLeft size={15}/>{tr('Home')}</button><h1>{existing?tr('Edit form'):tr('New form')}</h1></div></div>
    <div className="builder-grid">
      <div className="settings-card builder-main">
        <div className="builder-name"><button type="button" className="icon-pick" aria-label={tr('Icon')} aria-expanded={picking} onClick={()=>setPicking(!picking)}><I size={22} strokeWidth={1.5}/></button>
          <input aria-label={tr('Form name')} placeholder={tr('e.g. Daily planner, Study log')} value={form.name} maxLength={40} onChange={e=>patch({name:e.target.value})}/></div>
        {picking&&<div className="icon-grid" role="group" aria-label={tr('Icon')}>{iconNames.map(n=>{const Ic=tileIcons[n]!;return <button type="button" key={n} aria-label={n} aria-pressed={form.icon===n} className={form.icon===n?'selected':''} onClick={()=>{patch({icon:n});setPicking(false)}}><Ic size={19} strokeWidth={1.5}/></button>})}</div>}
        {form.source==='photo'&&<p className="draft-note"><Camera size={14}/>{tr('Drafted from a photo by AI. It becomes yours when you save it.')}</p>}
        <ol className="block-editor">{form.blocks.map((b,i)=><li key={b.id} className="block-row">
          <GripVertical size={16} className="grip" aria-hidden/>
          <div className="block-fields">
            <div className="block-top"><span className="kind-chip">{blockInfo[b.kind].label}</span>
              <label className="req-toggle"><input type="checkbox" checked={!!b.required} onChange={e=>patchBlock(b.id,{required:e.target.checked})}/>{tr('Required')}</label></div>
            <input aria-label={tr('Block label')} value={b.label} maxLength={80} onChange={e=>patchBlock(b.id,{label:e.target.value})}/>
            {(b.kind==='select'||b.kind==='checklist'||b.kind==='steps')&&<OptionsEditor block={b} set={options=>patchBlock(b.id,{options})}/>}
          </div>
          <div className="block-tools"><button type="button" className="icon-button" aria-label={tr('Move up')} disabled={i===0} onClick={()=>move(i,-1)}><ArrowUp size={14}/></button><button type="button" className="icon-button" aria-label={tr('Move down')} disabled={i===form.blocks.length-1} onClick={()=>move(i,1)}><ArrowDown size={14}/></button><button type="button" className="icon-button" aria-label={tr('Remove block')} onClick={()=>patch({blocks:form.blocks.filter(x=>x.id!==b.id)})}><Trash2 size={14}/></button></div>
        </li>)}</ol>
        <div className="free-note">{tr('Free writing (always included)')}</div>
        <AddBlock add={k=>patch({blocks:[...form.blocks,newBlock(k)]})}/>
      </div>
      <aside className="settings-card builder-side">
        <h2>{tr('From a paper page')}</h2>
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void fromPhoto(f)}}/>
        <button className="secondary" disabled={reading} onClick={()=>photo.current?.click()}>{reading?<LoaderCircle className="spin" size={15}/>:<Camera size={15}/>}{reading?tr('Reading the photo…'):tr('Make from a photo')}</button>
        {error&&<p role="alert" className="field-error">{error}</p>}
        <h2 className="preview-title">{tr('Preview')}</h2><div className="form-preview" aria-hidden>{form.blocks.map(b=><div key={b.id} className="preview-block"><b>{b.label||'—'}</b><span>{blockInfo[b.kind].hint}</span></div>)}<div className="preview-block"><b>{tr('Anything else, in your own words')}</b></div></div>
      </aside>
    </div>
    <div className="modal-actions builder-actions">{existing&&(confirm?<button type="button" className="danger" onClick={remove}>{tr('Confirm delete')}</button>:<button type="button" className="text-button" onClick={()=>setConfirm(true)}><Trash2 size={14}/>{tr('Delete')}</button>)}<button className="secondary" onClick={()=>ctx.go('/')}>{tr('Cancel')}</button><button className="primary" disabled={!ok} onClick={save}>{tr('Save form')}<Check size={16}/></button></div>
  </section>;
}

function OptionsEditor({block,set}:{block:FormBlock;set:(o:string[])=>void}){
  const options=block.options??[];
  const label=block.kind==='select'?tr('Options'):block.kind==='steps'?tr('Default steps (prefilled each time)'):tr('Default items (prefilled each time)');
  return <div className="options-editor"><span className="label">{label}</span>{options.map((o,i)=><div key={i} className="option-row"><input value={o} maxLength={80} aria-label={tr('Option {n}',{n:i+1})} onChange={e=>set(options.map((x,j)=>j===i?e.target.value:x))}/><button type="button" className="icon-button" aria-label={tr('Remove option')} onClick={()=>set(options.filter((_,j)=>j!==i))}><X size={13}/></button></div>)}
    <button type="button" className="text-button" onClick={()=>set([...options,''])}><Plus size={13}/>{tr('Add')}</button></div>;
}

function AddBlock({add}:{add:(k:BlockKind)=>void}){
  const [open,setOpen]=useState(false);
  return <div className="add-block">{open?<div className="block-menu" role="menu">{blockKinds.map(k=><button key={k} role="menuitem" onClick={()=>{add(k);setOpen(false)}}><b>{blockInfo[k].label}</b><span>{blockInfo[k].hint}</span></button>)}</div>
    :<button className="secondary" onClick={()=>setOpen(true)}><Plus size={15}/>{tr('Add block')}</button>}</div>;
}
