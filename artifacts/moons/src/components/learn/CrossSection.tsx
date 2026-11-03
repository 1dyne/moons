import {tr} from '@/lib/i18n';
import type {ConceptKnowledge} from '@/lib/knowledge-v9';

const W=760,X0=96,X1=720,SEA=196,FLOOR=258;
const yOf=(score:number)=>188-(score/25-1)*42;
function curve(p:[number,number][]){if(!p.length)return '';let d=`M${p[0]![0]},${p[0]![1]}`;for(let i=0;i<p.length-1;i++){const a=p[i-1]??p[i]!,b=p[i]!,c=p[i+1]!,e=p[i+2]??c;
  d+=` C${(b[0]+(c[0]-a[0])/6).toFixed(1)},${(b[1]+(c[1]-a[1])/6).toFixed(1)} ${(c[0]-(e[0]-b[0])/6).toFixed(1)},${(c[1]-(e[1]-b[1])/6).toFixed(1)} ${c[0]},${c[1]}`}return d}

/** v9 5.5: one dot per concept. Ground = stage, dashed line = felt confidence (broken where none), lower layer = records, below the water = not yet explained. */
export default function CrossSection({list,selected,select}:{list:ConceptKnowledge[];selected:string|null;select:(id:string)=>void}){
  const n=list.length;
  if(!n)return <p className="muted">{tr('No concepts with records here yet.')}</p>;
  const xs=list.map((_,i)=>n===1?(X0+X1)/2:X0+i*(X1-X0)/(n-1));
  const gy=(k:ConceptKnowledge)=>k.unexplained?Math.max(yOf(k.score),SEA+10):yOf(k.score);
  const ground:[number,number][]=[[40,SEA+20],...list.map((k,i)=>[xs[i]!,gy(k)] as [number,number]),[W-10,gy(list[n-1]!)+14]];
  const strata:[number,number][]=[[40,FLOOR-6],...list.map((k,i)=>[xs[i]!,FLOOR-Math.min(k.recordCount*3.2,FLOOR-gy(k)-6)] as [number,number]),[W-10,FLOOR-8]];
  const runs:[number,number][][]=[];let run:[number,number][]=[];
  list.forEach((k,i)=>{if(!k.confidence){if(run.length>1)runs.push(run);run=[]}else run.push([xs[i]!,yOf(Math.max(25,k.confidence.value*10))])});if(run.length>1)runs.push(run);
  const levels=[tr('Came in'),tr('Organised'),tr('Checked'),tr('Can explain')];
  return <div className="cut-scroll"><svg className="cut" viewBox={`0 0 ${W} 310`} role="img" aria-label={tr('Cross-section: stage and confidence by concept')}>
    <rect className="sea" x="40" y={SEA} width={W-50} height={FLOOR-SEA}/>
    {levels.map((t,i)=><g key={t}><line className="grid" x1="40" x2={W-10} y1={yOf((i+1)*25)} y2={yOf((i+1)*25)}/><text className="lv" x="36" y={yOf((i+1)*25)+4} textAnchor="end">{t.slice(0,2)}</text></g>)}
    <path className="land" d={`${curve(ground)} L${W-10},${FLOOR} L40,${FLOOR}Z`}/>
    <path className="rock" d={`${curve(strata)} L${W-10},${FLOOR} L40,${FLOOR}Z`}/>
    {runs.map((r,i)=><path key={i} className="conf" d={curve(r)}/>)}
    {list.map((k,i)=>{const y=gy(k),on=selected===k.conceptId;return <g key={k.conceptId} className="hit" role="button" tabIndex={0} aria-pressed={on} aria-label={`${k.name}`} onClick={()=>select(k.conceptId)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(k.conceptId)}}}>
      <rect x={xs[i]!-42} y="30" width="84" height="264" fill="transparent"/>
      {k.terrain==='crater'&&k.confidence&&<line className="drop" x1={xs[i]} x2={xs[i]} y1={yOf(k.confidence.value*10)} y2={y}/>}
      <circle className={`dot ${on?'on':''}`} cx={xs[i]} cy={y} r="6"/>
      {k.star&&<text className="star" x={xs[i]!+10} y={y-8}>✦</text>}
      <text x={xs[i]} y="282" textAnchor="middle" className={on?'name on':'name'}>{k.name.length>8?k.name.slice(0,8)+'…':k.name}</text>
    </g>})}
  </svg>
  <ul className="cut-legend"><li><i className="lg-land"/>{tr('Ground: stage')}</li><li><i className="lg-conf"/>{tr('Dashed: how sure you felt')}</li><li><i className="lg-rock"/>{tr('Lower layer: records')}</li><li><i className="lg-sea"/>{tr('Under water: not explained yet')}</li></ul></div>;
}
