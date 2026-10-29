import {useEffect,useState} from 'react';
import {Check,Cpu,KeyRound,LoaderCircle,MessageSquareWarning,Trash2} from 'lucide-react';
import Modal from './Modal';
import {tr} from '@/lib/i18n';
import '../styles/ai-settings.css';

type Provider='openai'|'anthropic'|'gemini';
type ModelInfo={id:string;provider:Provider;label:string;input:number|null;output:number|null};
type Models={catalog:ModelInfo[];steps:string[];ready:Record<Provider,boolean>;defaults:{fast:string;deep:string};chosen:Record<string,string>};
type Status={ownKey:{provider:string;since:string}|null;used:number;limit:number;operator?:boolean;models?:Models};
type UsageRow={step:string;provider:string;model:string;calls:number;failed:number;input:number;output:number;cached:number;cost:number|null;ms:number};
async function api<T>(path:string,init?:RequestInit){
  const r=await fetch(`${import.meta.env.BASE_URL}api/${path}`,{credentials:'include',...init,headers:{...(init?.body?{'content-type':'application/json'}:{})}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message??`Request failed (${r.status})`);return d as T;
}

/** Today's AI use on the operator key, and the user's own key (never shown back once saved). */
export function AiCard(){
  const [status,setStatus]=useState<Status|null>(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{api<Status>('ai/status').then(setStatus).catch(e=>setError((e as Error).message))},[]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{setStatus(await api<Status>('ai/key',{method:'PUT',body:JSON.stringify({provider:'openai',key})}));setKey('')}catch(x){setError((x as Error).message)}finally{setBusy(false)}}
  async function remove(){setBusy(true);setError('');try{setStatus(await api<Status>('ai/key',{method:'DELETE'}))}catch(x){setError((x as Error).message)}finally{setBusy(false)}}
  if(status?.operator&&status.models)return <OperatorAi models={status.models} update={setStatus}/>;
  return <section className="settings-card"><h2><KeyRound size={17}/>{tr('AI')}</h2>
    {status&&!status.ownKey&&<p>{tr('Today: {used} of {limit} AI requests on the MOONS key.',{used:status.used,limit:status.limit})}</p>}
    {status?.ownKey?<><p>{tr('Using your own {provider} key. No daily limit.',{provider:'OpenAI'})}</p><button className="secondary" disabled={busy} onClick={()=>void remove()}><Trash2 size={14}/>{tr('Remove my key')}</button></>
    :<form onSubmit={save}><label className="form-label">{tr('Your OpenAI API key (optional)')}<input type="password" autoComplete="off" spellCheck={false} placeholder="sk-..." value={key} onChange={e=>setKey(e.target.value)}/></label>
      
      <button className="primary" disabled={busy||!key.trim()}>{busy?<LoaderCircle className="spin" size={14}/>:<Check size={14}/>}{tr('Save key')}</button></form>}
    {error&&<p role="alert" className="field-error">{error}</p>}
  </section>;
}

const stepLabel:Record<string,string>={projects:tr('Project update'),structure:tr('Structuring'),claims:tr('Claims (answer map)'),relations:tr('Relation types'),dump:tr('Taking down sparks'),next:tr('Next to explore'),question:tr('Question'),chat_note:tr('Chat note'),explore_map:tr('Exploration map'),satellite_digest:tr('Satellite agent'),concepts:tr('Concepts'),compare:tr('Comparison'),emotions:tr('Emotion tags'),chat:tr('Chat'),form:tr('Form from a photo'),impostor:tr('Impostor'),other:tr('Other')};
const providerLabel:Record<Provider,string>={openai:'OpenAI',anthropic:'Anthropic',gemini:'Google Gemini'};
const usd=(n:number|null)=>n===null?'—':n<0.01?`$${n.toFixed(4)}`:`$${n.toFixed(2)}`;
const k=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(1)}k`:String(n);

/** Operator accounts: the model for each step (to compare quality across providers), and what AI has cost. */
function OperatorAi({models,update}:{models:Models;update:(s:Status)=>void}){
  const [chosen,setChosen]=useState<Record<string,string>>(models.chosen),[typed,setTyped]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [usage,setUsage]=useState<{all:UsageRow[];mine:UsageRow[]}|null>(null),[scope,setScope]=useState<'all'|'mine'>('all');
  useEffect(()=>{api<{all:UsageRow[];mine:UsageRow[]}>('ai/usage?days=30').then(setUsage).catch(()=>setUsage(null))},[saved]);
  const known=new Set(models.catalog.map(m=>m.id));
  async function save(){setBusy(true);setError('');setSaved(false);
    try{const body=Object.fromEntries(models.steps.map(s=>[s,chosen[s]==='custom'?(typed[s]??'').trim():(chosen[s]??'')]));
      update(await api<Status>('ai/models',{method:'PUT',body:JSON.stringify({models:body})}));setSaved(true)}catch(x){setError((x as Error).message)}finally{setBusy(false)}}
  const rows=usage?.[scope]??[];
  const total=rows.reduce((a,r)=>({calls:a.calls+r.calls,cost:a.cost+(r.cost??0),input:a.input+r.input,output:a.output+r.output}),{calls:0,cost:0,input:0,output:0});
  return <section className="settings-card"><h2><Cpu size={17}/>{tr('AI models')}</h2>
    <table className="ai-models"><tbody>{models.steps.map(step=>{const value=chosen[step]&&!known.has(chosen[step])&&chosen[step]!=='custom'?'custom':chosen[step]??'';
      return <tr key={step}><th scope="row">{stepLabel[step]??step}</th><td>
        <select aria-label={stepLabel[step]??step} value={value} onChange={e=>{setChosen({...chosen,[step]:e.target.value});setSaved(false)}}>
          <option value="">{tr('Default')} · {step==='structure'||step==='claims'?`${models.defaults.fast} / ${models.defaults.deep}`:models.defaults.fast}</option>
          {(['openai','anthropic','gemini'] as Provider[]).map(p=><optgroup key={p} label={`${providerLabel[p]}${models.ready[p]?'':' · '+tr('no key')}`}>
            {models.catalog.filter(m=>m.provider===p).map(m=><option key={m.id} value={m.id} disabled={!models.ready[p]}>{m.label} · ${m.input} / ${m.output}</option>)}</optgroup>)}
          <option value="custom">{tr('Type a model…')}</option>
        </select>
        {value==='custom'&&<input aria-label={tr('Model id')} placeholder="gemini:gemini-3.7-flash" value={typed[step]??(known.has(chosen[step]??'')||chosen[step]==='custom'?'':chosen[step]??'')} onChange={e=>{setTyped({...typed,[step]:e.target.value});setSaved(false)}}/>}
      </td></tr>})}</tbody></table>
    <button className="primary" disabled={busy} onClick={()=>void save()}>{busy?<LoaderCircle className="spin" size={14}/>:<Check size={14}/>}{saved?tr('Saved'):tr('Save')}</button>
    {error&&<p role="alert" className="field-error">{error}</p>}
    <h3>{tr('Last 30 days')}</h3>
    <div className="ai-usage-scope" role="group" aria-label={tr('Whose usage')}><button aria-pressed={scope==='all'} onClick={()=>setScope('all')}>{tr('Everyone')}</button><button aria-pressed={scope==='mine'} onClick={()=>setScope('mine')}>{tr('Me')}</button></div>
    <p className="ai-usage-total">{total.calls} · {k(total.input)} / {k(total.output)} · <b>{usd(total.cost)}</b></p>
    <div className="ai-usage-wrap"><table className="ai-usage"><thead><tr><th>{tr('Step')}</th><th>{tr('Model')}</th><th>{tr('Calls')}</th><th>{tr('In / out')}</th><th>{tr('Cost')}</th><th>ms</th></tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i}><td>{stepLabel[r.step]??r.step}</td><td>{r.model}</td><td>{r.calls}{r.failed>0&&<small className="field-error"> !{r.failed}</small>}</td><td>{k(r.input)} / {k(r.output)}</td><td>{usd(r.cost)}</td><td>{r.ms}</td></tr>)}</tbody></table></div>
  </section>;
}

/** Beta feedback. Only what is typed here and the current page are sent. */
export function FeedbackDialog({close,notify}:{close:()=>void;notify:(m:string)=>void}){
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');
    try{await api('feedback',{method:'POST',body:JSON.stringify({text,page:window.location.pathname})});notify(tr('Thanks. Your feedback was sent.'));close()}catch(x){setError((x as Error).message)}finally{setBusy(false)}}
  return <Modal title={tr('Send feedback')} close={close}><form className="feedback-form" onSubmit={send}>
    <p>{tr('What did not work as you expected? Only this text and the page you are on are sent — not your notes.')}</p>
    <textarea rows={6} required maxLength={4000} value={text} onChange={e=>setText(e.target.value)} aria-label={tr('Feedback')} placeholder={tr('e.g. On the planner, the timer stopped when I switched tabs.')}/>
    {error&&<p role="alert" className="field-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>{tr('Cancel')}</button><button className="primary" disabled={busy||!text.trim()}>{busy?<LoaderCircle className="spin" size={14}/>:<MessageSquareWarning size={14}/>}{tr('Send')}</button></div>
  </form></Modal>;
}

/** Temporary: send one structure for review. Sends this note, its structure and your symbols — nothing else. */
export function ReviewDialog({entryId,close,notify}:{entryId:string;close:()=>void;notify:(m:string)=>void}){
  const [comment,setComment]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');
    try{await api('analysis-review',{method:'POST',body:JSON.stringify({entryId,comment})});notify(tr('Sent for review. Thank you.'));close()}catch(x){setError((x as Error).message)}finally{setBusy(false)}}
  return <Modal title={tr('Send this analysis for review')} close={close}><form className="feedback-form" onSubmit={send}>
    <p>{tr('This note, its structure and your symbols go to the MOONS team so the analysis can be improved. Nothing else from your space is sent.')}</p>
    <textarea rows={5} maxLength={4000} value={comment} onChange={e=>setComment(e.target.value)} aria-label={tr('What felt off?')} placeholder={tr('What felt off? (optional) e.g. lines are missing, the groups are wrong')}/>
    {error&&<p role="alert" className="field-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>{tr('Cancel')}</button><button className="primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={14}/>:<MessageSquareWarning size={14}/>}{tr('Send')}</button></div>
  </form></Modal>;
}
