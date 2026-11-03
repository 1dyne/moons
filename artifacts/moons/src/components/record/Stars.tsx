import {useState} from 'react';
import {Star} from 'lucide-react';
import {tr} from '@/lib/i18n';

/** v9 1장 결정 8: confidence as five stars in half steps = 1..10. */
export default function Stars({value,onChange,size=20,label=tr('How sure are you?')}:{value?:number;onChange:(v:number)=>void;size?:number;label?:string}){
  const [hover,setHover]=useState<number|null>(null);const shown=hover??value??0;
  return <div className="stars" role="radiogroup" aria-label={label} onMouseLeave={()=>setHover(null)}>
    {[1,2,3,4,5].map(i=>{const full=shown>=i*2,half=!full&&shown>=i*2-1;
      return <span key={i} className="star" style={{width:size,height:size}}>
        <Star size={size} className="star-bg"/>
        {(full||half)&&<span className="star-fill" style={{width:full?'100%':'50%'}}><Star size={size}/></span>}
        <button type="button" className="half l" role="radio" aria-checked={value===i*2-1} aria-label={tr('{n} out of 10',{n:i*2-1})} onMouseEnter={()=>setHover(i*2-1)} onClick={()=>onChange(i*2-1)}/>
        <button type="button" className="half r" role="radio" aria-checked={value===i*2} aria-label={tr('{n} out of 10',{n:i*2})} onMouseEnter={()=>setHover(i*2)} onClick={()=>onChange(i*2)}/>
      </span>})}
    {value!==undefined&&<small className="stars-n">{value}/10</small>}
  </div>;
}
