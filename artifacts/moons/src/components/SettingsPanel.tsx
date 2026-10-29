import {useRef,useState} from 'react';
import {Download,FileUp,LoaderCircle,Check,AlertCircle} from 'lucide-react';
import {defaultSettings,noticeKinds,parseStore,type Store} from '@/lib/model';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import Modal from './Modal';
import AccountPanel from './AccountPanel';
import {AiCard} from './BetaPanels';
import {NotationCard} from './NotationCard';
import {SpacesSettings} from './Spaces';
import {lang,setLang,tr} from '@/lib/i18n';
const kindText:Record<string,[string,string]>={breaking_news:[tr('Breaking news'),tr('The same pattern shows up again and again')],bias_watch:[tr('Heads up'),tr('Emotion and shifted readings rise together on a topic')],adjustment:[tr('Adjustment proposals'),tr('Skipped steps, estimates and start times that keep drifting in your planner')],spy_reveal:[tr('Spy reveals'),tr('A planted line is revealed after you accepted it')],source_ready:[tr('Source ready'),tr('An original has been prepared to compare')]};
export default function SettingsPanel({store,ws,notify,download,go}:{store:Store;ws:WorkspaceApi;notify:(m:string)=>void;download:()=>void;go?:(url:string)=>void}){
  const settings=store.settings??defaultSettings(),file=useRef<HTMLInputElement>(null);
  const [name,setName]=useState(store.profile?.displayName??''),[user,setUser]=useState(store.profile?.username??''),[backup,setBackup]=useState<{raw:unknown;entries:number;chats:number;name:string}|null>(null),[error,setError]=useState(''),[importing,setImporting]=useState(false);
  const patch=(s:Partial<typeof settings>)=>ws.commit(st=>({...st,settings:{...(st.settings??defaultSettings()),...s}}));
  async function pick(f:File){setError('');try{const raw=JSON.parse(await f.text());const parsed=parseStore(JSON.stringify(raw));setBackup({raw,entries:parsed.entries.length,chats:parsed.chats?.length??0,name:f.name})}catch{setError(tr('That file is not a MOONS backup (JSON with version 1, entries and planets).'))}}
  async function run(){if(!backup)return;setImporting(true);try{await ws.action('import',{backup:backup.raw});notify(tr('Backup imported into your space.'));setBackup(null)}catch(e){setError(errMsg(e));setBackup(null)}finally{setImporting(false)}}
  return <section className="page-shell settings-page"><div className="page-heading"><div><h1>{tr('Settings')}</h1></div></div>
    <div className="settings-grid">
    <section className="settings-card"><h2>{tr('Language')}</h2>
      <div className="settings-actions" role="radiogroup" aria-label={tr('Language')}>{(['ko','en'] as const).map(l=><button key={l} role="radio" aria-checked={lang===l} className={lang===l?'primary':'secondary'} onClick={()=>{if(lang!==l)setLang(l)}}>{l==='ko'?'한국어':'English'}</button>)}</div></section>
    <section className="settings-card"><h2>{tr('Profile')}</h2>
      <form onSubmit={e=>{e.preventDefault();if(ws.commit(s=>({...s,profile:{username:user.trim(),displayName:name.trim()}})))notify(tr('Profile saved.'))}}><label className="form-label">{tr('Display name')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={30} placeholder={tr('e.g. River')}/></label><label className="form-label">{tr('Username')}<input value={user} onChange={e=>setUser(e.target.value)} maxLength={30} placeholder={tr('Optional')}/></label><button className="primary small">{tr('Save profile')}<Check size={15}/></button></form></section>
    <section className="settings-card"><h2>{tr('What MOONS may read in chat')}</h2>
      <label className="switch-row"><input type="checkbox" checked={settings.profileContext} onChange={e=>patch({profileContext:e.target.checked})}/><span><b>{tr('Profile context')}</b><small>{settings.profileContext?tr('On — free and notification chats can use your aggregates.'):tr('Off — chats only see what you pin.')}</small></span></label></section>
    <section className="settings-card"><h2>{tr('Notifications')}</h2>
      {noticeKinds.filter(k=>k!=='spy_reveal').map(k=><label key={k} className="switch-row"><input type="checkbox" checked={settings.notificationKinds[k]!==false} onChange={e=>patch({notificationKinds:{...settings.notificationKinds,[k]:e.target.checked}})}/><span><b>{kindText[k][0]}</b><small>{kindText[k][1]}</small></span></label>)}
      <button className="text-button" onClick={()=>ws.action('refresh_notifications',{}).then(()=>notify(tr('Checked for new notifications.')),e=>notify(errMsg(e)))}>{tr('Check now')}</button></section>
    <section className="settings-card"><h2>{tr('Backup')}</h2>
      <div className="settings-actions"><button className="secondary" onClick={download}><Download size={15}/>{tr('Download backup')}</button><button className="secondary" onClick={()=>file.current?.click()}><FileUp size={15}/>{tr('Import backup')}</button><input ref={file} type="file" hidden accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void pick(f);e.target.value=''}}/></div>
      {error&&<p role="alert" className="field-error"><AlertCircle size={13}/> {error}</p>}</section>
    <NotationCard store={store} ws={ws} notify={notify}/>
    <AiCard/>
    <SpacesSettings store={store} ws={ws} notify={notify}/>
    <AccountPanel ws={ws} go={go??(()=>undefined)}/>
    </div>
    {backup&&<Modal title={tr('Import backup')} close={()=>setBackup(null)}><p><b>{backup.name}</b> holds {backup.entries} nodes and {backup.chats} conversations. Import adds missing records without replacing your current originals. Duplicate records are kept once. Recording files are not included in JSON backups.</p><div className="modal-actions"><button className="secondary" onClick={()=>setBackup(null)}>{tr('Cancel')}</button><button className="primary" disabled={importing} onClick={()=>void run()}>{importing&&<LoaderCircle className="spin" size={15}/>}Import backup</button></div></Modal>}
  </section>;
}
