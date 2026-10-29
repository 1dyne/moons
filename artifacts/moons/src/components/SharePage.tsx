import {useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import {LineLogo} from './Brand';
import {tr} from '@/lib/i18n';
import {verdictTag} from '@/lib/verdicts';
import '../styles/print.css';

type SharedNote={id:string;title:string;createdAt:string;body?:string;quotes?:{text:string}[];materialTitle?:string;
  comparison?:{summary:string;items:{verdict:string;note:string;answer:number}[]};sentences?:string[];
  emotions?:{word:string;intensity:number}[];updates?:{body:string;createdAt:string}[];memos?:{body:string}[];
  confidence?:{value:number;at:string}[];links?:{to:string;relation:string;reason:string}[]};
const verdict:Record<string,string>=Object.fromEntries(Object.entries(verdictTag).map(([k,t])=>[k,`${t.symbol} ${t.label}`]));
const day=(iso:string)=>new Date(iso).toLocaleDateString();

/** Public, read-only page for a share link. No workspace, no guest cookie. */
export default function SharePage({token}:{token:string}){
  const [data,setData]=useState<{title:string;createdAt:string;notes:SharedNote[]}|null>(null),[error,setError]=useState('');
  useEffect(()=>{document.querySelector('meta[name="robots"]')?.setAttribute('content','noindex');
    fetch(`${import.meta.env.BASE_URL}api/public/shares/${encodeURIComponent(token)}`).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message??tr('This link is not available.'));setData(d);document.title=`${d.title} · MOONS`}).catch(e=>setError((e as Error).message))},[token]);
  if(error)return <main className="share-page"><LineLogo/><h1>{tr('This link is not available.')}</h1><p>{tr('It may have been turned off by its owner.')}</p></main>;
  if(!data)return <main className="share-page"><LoaderCircle className="spin"/></main>;
  const titles=new Map(data.notes.map(n=>[n.id,n.title]));
  return <main className="share-page"><header className="share-head"><LineLogo/><div><h1>{data.title}</h1><p>{tr('Shared from MOONS · read only')}</p></div></header>
    {data.notes.map(n=><article key={n.id} className="print-page note">
      <header><h1>{n.title}</h1><p>{day(n.createdAt)}</p></header>
      {n.body&&<div className="body">{n.body.split('\n').map((l,i)=><p key={i}>{l}</p>)}</div>}
      {n.quotes&&n.quotes.length>0&&<><h2>{tr('Quotes from the original')}{n.materialTitle&&<small> — {n.materialTitle}</small>}</h2>{n.quotes.map((q,i)=><blockquote key={i}>{q.text}</blockquote>)}</>}
      {n.comparison&&<><h2>{tr('Comparison')}</h2><p>{n.comparison.summary}</p><ul className="cmp">{n.comparison.items.map((i,k)=><li key={k}><b>{verdict[i.verdict]??i.verdict}</b>{n.sentences?.[i.answer]&&<q>{n.sentences[i.answer]}</q>}<span>{i.note}</span></li>)}</ul></>}
      {n.emotions&&n.emotions.length>0&&<><h2>{tr('Emotions MOONS heard')}</h2><p>{n.emotions.map(e=>`${e.word} (${e.intensity})`).join(' · ')}</p></>}
      {n.updates&&n.updates.length>0&&<><h2>{tr('What I knew first → what I corrected')}</h2><ul>{n.updates.map((u,k)=><li key={k}><small>{day(u.createdAt)}</small> {u.body}</li>)}</ul></>}
      {n.memos&&n.memos.length>0&&<><h2>{tr('Memos')}</h2><ul>{n.memos.map((m,k)=><li key={k}>{m.body}</li>)}</ul></>}
      {n.confidence&&n.confidence.length>0&&<><h2>{tr('Confidence history')}</h2><p>{n.confidence.map(c=>`${day(c.at)} ${c.value}/10`).join(' → ')}</p></>}
      {n.links&&n.links.length>0&&<><h2>{tr('Connections')}</h2><ul>{n.links.map((l,k)=><li key={k}><b>{l.relation}</b> {titles.get(l.to)??''}{l.reason&&<> — {l.reason}</>}</li>)}</ul></>}
    </article>)}
  </main>;
}
