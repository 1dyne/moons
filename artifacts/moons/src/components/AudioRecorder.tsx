import {useEffect,useRef,useState} from 'react';
import {Mic,Square,LoaderCircle} from 'lucide-react';
import {tr} from '@/lib/i18n';

const MAX_BYTES=20*1024*1024;
export default function AudioRecorder({file,onRecorded,onActiveChange,disabled=false}:{file:File|null;onRecorded:(file:File)=>void;onActiveChange?:(active:boolean)=>void;disabled?:boolean}){
 const [phase,setPhase]=useState<'idle'|'requesting'|'recording'>('idle'),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[url,setUrl]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),mounted=useRef(true),chunks=useRef<Blob[]>([]),failed=useRef(false);
 const callback=useRef(onRecorded);callback.current=onRecorded;
 const activeCallback=useRef(onActiveChange);activeCallback.current=onActiveChange;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recorder.current?.state!=='inactive')recorder.current?.stop();stream.current?.getTracks().forEach(t=>t.stop());activeCallback.current?.(false)}},[]);
 useEffect(()=>{if(!file){setUrl('');return}const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file]);
 useEffect(()=>{if(phase!=='recording')return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer)},[phase]);
 useEffect(()=>{if(phase!=='recording')return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[phase]);
 function stop(){if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop())}
 async function start(){
  if(disabled||phase!=='idle')return;
  setError('');setSeconds(0);setPhase('requesting');failed.current=false;activeCallback.current?.(true);
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error(tr('Microphone recording is unavailable here. Open the published HTTPS site in Chrome or Safari, or upload an audio file.'));
   const input=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
   if(!mounted.current){input.getTracks().forEach(t=>t.stop());return}
   stream.current=input;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(input,mime?{mimeType:mime}:undefined);recorder.current=rec;chunks.current=[];let bytes=0;
   rec.ondataavailable=e=>{if(e.data.size){chunks.current.push(e.data);bytes+=e.data.size;if(bytes>=MAX_BYTES&&rec.state==='recording'){setError(tr('Recording reached the 20MB limit and stopped. Review it before saving.'));stop()}}};
   rec.onerror=()=>{failed.current=true;if(mounted.current)setError(tr('Recording failed. Your previous recording is unchanged. Please try again.'));stop()};
   rec.onstop=()=>{
    input.getTracks().forEach(t=>t.stop());stream.current=null;recorder.current=null;
    if(!mounted.current)return;
    setPhase('idle');activeCallback.current?.(false);
    if(failed.current)return;
    const type=rec.mimeType||chunks.current[0]?.type||'audio/webm',blob=new Blob(chunks.current,{type});chunks.current=[];
    if(!blob.size){setError(tr('No audio was captured. Check your microphone and try again.'));return}
    if(blob.size>MAX_BYTES){setError(tr('This recording is over 20MB. Record a shorter clip or upload a compressed file.'));return}
    const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
    callback.current(new File([blob],`recording-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`,{type}));
   };
   input.getAudioTracks().forEach(t=>t.addEventListener('ended',stop,{once:true}));
   rec.start(1000);setPhase('recording');
  }catch(e){
   stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;recorder.current=null;
   if(!mounted.current)return;
   const name=(e as DOMException).name;
   setError(name==='NotAllowedError'?tr('Microphone access was blocked. Allow microphone access in your browser, then try again.'):name==='NotFoundError'?tr('No microphone was found. Connect one or upload an audio file.'):(e as Error).message);
   setPhase('idle');activeCallback.current?.(false);
  }
 }
 return <div className="audio-capture">
  <div className="audio-capture-row">
   <button type="button" className={`secondary audio-record-button ${phase==='recording'?'is-recording':''}`} disabled={phase==='requesting'||(disabled&&phase!=='recording')} onClick={()=>phase==='recording'?stop():void start()} aria-label={phase==='recording'?tr('Stop recording'):tr('Record audio')}>
    {phase==='requesting'?<LoaderCircle size={17} className="spin"/>:phase==='recording'?<Square size={16}/>:<Mic size={17}/>}
    {phase==='requesting'?tr('Allow microphone…'):phase==='recording'?tr('Stop recording'):tr('Record audio')}
   </button>
   {phase==='recording'?<span role="status">Recording · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>:<span className="muted">{tr('Record an original · up to 20MB')}</span>}
  </div>
  {error&&<p className="audio-capture-error" role="alert">{error}</p>}
  {url&&phase==='idle'&&<audio aria-label={tr('Recording preview')} controls preload="metadata" src={url}/>}
 </div>;
}
