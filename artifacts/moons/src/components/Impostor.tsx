import {useEffect,useState} from 'react';
import {Check,LoaderCircle,ShieldQuestion} from 'lucide-react';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import Modal from './Modal';
import {tr} from '@/lib/i18n';

const levels=[['off',tr('Off')],['rare',tr('Rarely (10%)')],['sometimes',tr('Sometimes (25%)')],['often',tr('Often (50%)')]] as const;
const kindText:Record<string,string>={overreach:tr('One step further than you said'),phantom_premise:tr('An assumption you never stated'),self_drift:tr('A slightly changed version of something you wrote before')};

/** Settings: the user decides whether an impostor may be planted, and how often. */
export function ImpostorCard({store,ws}:{store:Store;ws:WorkspaceApi}){
  const value=store.settings?.impostor??'off';
  const set=(v:typeof levels[number][0])=>ws.commit(s=>({...s,settings:{...(s.settings??{profileContext:true,notificationKinds:{}}),impostor:v}}));
  return <section className="settings-card"><h2><ShieldQuestion size={17}/>{tr('Impostor')}</h2>
    
    <div className="chip-row" role="radiogroup" aria-label={tr('Impostor')}>{levels.map(([v,label])=><button key={v} role="radio" aria-checked={value===v} className={value===v?'selected':''} onClick={()=>set(v)}>{label}</button>)}</div>
    
  </section>;
}

type Detail={id:string;entryId:string;nodeId:string;kind:string;text:string;checkVerdict:string|null;revealVerdict:string|null};

/** The reveal: show the planted line and let the user answer, with a required comment. */
export function ImpostorReveal({impostorId,ws,close,notify,open}:{impostorId:string;ws:WorkspaceApi;close:()=>void;notify:(m:string)=>void;open:(entryId:string)=>void}){
  const [d,setD]=useState<Detail|null>(null),[verdict,setVerdict]=useState(''),[comment,setComment]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{fetch(`${import.meta.env.BASE_URL}api/impostors/${impostorId}`,{credentials:'include'}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x?.error?.message);setD(x)}).catch(e=>setError((e as Error).message))},[impostorId]);
  async function decide(){
    setBusy(true);setError('');
    try{
      await ws.upload(async()=>{const r=await fetch(`${import.meta.env.BASE_URL}api/impostors/${impostorId}/decide`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({verdict,comment})});const x=await r.json();if(!r.ok)throw Object.assign(new Error(x?.error?.message),{status:r.status,data:x});return x});
      notify(verdict==='mine'?tr('Kept as yours, marked as adopted.'):verdict==='not_mine'?tr('Removed from your structure.'):tr('Kept as fog for now.'));close();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <Modal title={tr('There was an impostor')} close={close}><div className="impostor-reveal">
    {!d&&!error&&<LoaderCircle className="spin"/>}
    {d&&<>
      <p>{d.checkVerdict==='mean'?tr('You marked this line “I mean…”. You were right: you never wrote it.'):tr('You confirmed this line, but you never wrote it.')}</p>
      <blockquote>{d.text}</blockquote><p className="hint">{kindText[d.kind]??d.kind}</p>
      {d.revealVerdict?<p>{tr('You already answered this one.')}</p>:<>
        <span className="label">{tr('Is it really yours?')}</span>
        <div className="chip-row">{([['mine',tr('Yes, it’s mine')],['not_mine',tr('No, not mine')],['unsure',tr('Not sure yet')]] as const).map(([v,l])=><button key={v} className={verdict===v?'selected':''} aria-pressed={verdict===v} onClick={()=>setVerdict(v)}>{l}</button>)}</div>
        <textarea rows={3} required aria-label={tr('Why? (required)')} placeholder={tr('Why? (required)')} value={comment} onChange={e=>setComment(e.target.value)} maxLength={500}/>
        <div className="modal-actions"><button className="text-button" onClick={()=>open(d.entryId)}>{tr('Open the note')}</button><button className="primary" disabled={busy||!verdict||!comment.trim()} onClick={()=>void decide()}>{busy?<LoaderCircle className="spin" size={14}/>:<Check size={14}/>}{tr('Answer')}</button></div>
      </>}
    </>}
    {error&&<p role="alert" className="field-error">{error}</p>}
  </div></Modal>;
}
