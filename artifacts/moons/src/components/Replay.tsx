import {useEffect,useState} from 'react';
import {LoaderCircle,Pause,Play,SkipBack,X} from 'lucide-react';
import {buildFrames,fetchEvents,type Frame} from '@/lib/replay';
import {tr} from '@/lib/i18n';

const speeds=[1,4,16];

/** Plays the space's history in the universe view, like a time-lapse of a drawing. Read-only. */
export function useReplay(){
  const [frames,setFrames]=useState<Frame[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(4);
  async function start(){setLoading(true);setError('');try{const f=buildFrames(await fetchEvents());setFrames(f);setIndex(0);setPlaying(f.length>1)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  function stop(){setFrames(null);setPlaying(false)}
  useEffect(()=>{if(!playing||!frames)return;if(index>=frames.length-1){setPlaying(false);return}
    const t=setTimeout(()=>setIndex(i=>Math.min(frames.length-1,i+1)),Math.max(30,600/speed));return()=>clearTimeout(t)},[playing,index,frames,speed]);
  return {frames,frame:frames?.[index]??null,index,setIndex,playing,setPlaying,speed,setSpeed,loading,error,start,stop};
}
export type ReplayState=ReturnType<typeof useReplay>;

export function ReplayBar({r}:{r:ReplayState}){
  if(!r.frames)return null;
  const total=r.frames.length,at=r.frame?.at;
  return <div className="replay-bar" role="region" aria-label={tr('History replay')}>
    <button className="icon-button" aria-label={tr('From the start')} onClick={()=>{r.setIndex(0);r.setPlaying(false)}}><SkipBack size={16}/></button>
    <button className="icon-button" aria-label={r.playing?tr('Pause'):tr('Play')} onClick={()=>{if(r.index>=total-1)r.setIndex(0);r.setPlaying(!r.playing)}}>{r.playing?<Pause size={16}/>:<Play size={16}/>}</button>
    <input type="range" min={0} max={Math.max(0,total-1)} value={r.index} aria-label={tr('Point in history')} onChange={e=>{r.setPlaying(false);r.setIndex(Number(e.target.value))}}/>
    <span className="replay-time">{at?new Date(at).toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):''}<small>{r.index+1}/{total}</small></span>
    <div className="replay-speed" role="group" aria-label={tr('Speed')}>{speeds.map(s=><button key={s} className={r.speed===s?'selected':''} aria-pressed={r.speed===s} onClick={()=>r.setSpeed(s)}>{s}×</button>)}</div>
    <button className="text-button" onClick={r.stop}><X size={14}/>{tr('Back to now')}</button>
  </div>;
}

export function ReplayButton({r}:{r:ReplayState}){
  return <button className="replay-start" aria-label={tr('Replay history')} onClick={()=>void r.start()} disabled={r.loading} title={tr('Replay how this space grew')}>{r.loading?<LoaderCircle className="spin" size={15}/>:<Play size={15}/>}<span className="replay-label">{tr('Replay history')}</span>{r.error&&<small role="alert"> · {r.error}</small>}</button>;
}
