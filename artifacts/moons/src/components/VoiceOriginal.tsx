import {useState} from 'react';
import {LoaderCircle,Check,X} from 'lucide-react';
import {errMsg,type WorkspaceApi} from '@/lib/workspace-client';
import {uploadRecording} from '@/lib/upload-recording';
import AudioRecorder from './AudioRecorder';
import {tr} from '@/lib/i18n';

export default function VoiceOriginal({ws,saved}:{ws:WorkspaceApi;saved:(id:string)=>void}){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [recording,setRecording]=useState(false);
 async function save(){
  if(!file||busy||recording)return;setBusy(true);setError('');
  const before=new Set(ws.getStore()?.entries.map(e=>e.id));
  try{
   await uploadRecording(ws,file,tr('Voice recording'));
   const entry=ws.getStore()?.entries.find(e=>!before.has(e.id));
   setFile(null);if(entry)saved(entry.id);
  }catch(e){setError(errMsg(e))}finally{setBusy(false)}
 }
 return <div className="voice-original">
  <AudioRecorder file={file} onRecorded={next=>{setFile(next);setError('')}} onActiveChange={setRecording} disabled={busy||ws.busy>0}/>
  {file&&<div className="audio-capture-row">
   <button type="button" className="primary" disabled={busy||ws.busy>0||recording} onClick={()=>void save()}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>} {busy?tr('Saving and transcribing…'):tr('Save recording')}</button>
   <button type="button" className="text-button" disabled={busy||recording} onClick={()=>{setFile(null);setError('')}}><X size={15}/>{tr('Discard')}</button>
  </div>}
  {error&&<p role="alert" className="audio-capture-error">{error}</p>}
 </div>;
}
