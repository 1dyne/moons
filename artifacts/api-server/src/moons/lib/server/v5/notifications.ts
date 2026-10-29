import {q,json,newId} from '../db.ts';
import {type Notification,type Store,now} from './types.ts';
import {kstDay} from './kst.ts';
import {adjustmentCandidates} from './adjustments.ts';
import {impostorReveals} from './impostor.ts';

// All detection uses SQL aggregates. Emotion alone never creates a bias_watch.
export async function notificationCandidates(store:Store,owner?:string) {
 const data=json(store);
 const shifted=await q<{topic:string;shift_type:string;n:number;evidence:string[]}>(`
 with entries as (select e from jsonb_array_elements($1::jsonb->'entries') e where (e->>'createdAt')::timestamptz>now()-interval '7 days'),
 facts as (select e->>'id' id,p #>> '{}' topic,c->>'shiftType' shift_type
 from entries cross join lateral jsonb_array_elements(e->'planetIds') p cross join lateral jsonb_array_elements(coalesce(e->'comparison'->'items','[]')) c
 where c->>'verdict'='shifted' and c->>'shiftType' is not null)
 select topic,shift_type,count(*)::int n,array_agg(distinct id) evidence from facts group by topic,shift_type having count(*)>=3`,[data]);
 const emotions=await q<{topic:string;family:string;n:number;evidence:string[]}>(`
 with entries as (select e from jsonb_array_elements($1::jsonb->'entries') e where (e->>'createdAt')::timestamptz>now()-interval '7 days'),
 facts as (select distinct e->>'id' id,p #>> '{}' topic,em->>'family' family from entries
 cross join lateral jsonb_array_elements(e->'planetIds') p cross join lateral jsonb_array_elements(coalesce(e->'analysis'->'nodes','[]')) node
 cross join lateral jsonb_array_elements(coalesce(node->'emotions','[]')) em)
 select topic,family,count(*)::int n,array_agg(distinct id) evidence from facts group by topic,family having count(*)>=3`,[data]);
 const missed=await q<{topic:string;n:number;evidence:string[]}>(`
 with entries as (select e from jsonb_array_elements($1::jsonb->'entries') e),
 facts as (select answer.e->>'id' id,p #>> '{}' topic from entries answer
 join entries original on original.e->>'id'=answer.e->'comparison'->>'materialEntryId'
 cross join lateral jsonb_array_elements(original.e->'planetIds') p
 cross join lateral jsonb_array_elements(coalesce(answer.e->'comparison'->'items','[]')) item
 where item->>'verdict'='missed' and (answer.e->>'createdAt')::timestamptz>now()-interval '7 days')
 select topic,count(*)::int n,array_agg(distinct id) evidence from facts group by topic having count(*)>=3`,[data]);
 const biases=await q<{topic:string;family:string;evidence:string[]}>(`
 with entries as (select e from jsonb_array_elements($1::jsonb->'entries') e where (e->>'createdAt')::timestamptz>now()-interval '14 days'),
 ratios as (select e->>'id' id,p #>> '{}' topic,
 (select count(*) filter(where c->>'verdict' in ('shifted','added'))::float/nullif(count(*) filter(where c->>'verdict'<>'missed'),0) from jsonb_array_elements(coalesce(e->'comparison'->'items','[]')) c) ratio
 from entries cross join lateral jsonb_array_elements(e->'planetIds') p),
 emotions as (select e->>'id' id,p #>> '{}' topic,em->>'family' family,(em->>'intensity')::int intensity
 from entries cross join lateral jsonb_array_elements(e->'planetIds') p cross join lateral jsonb_array_elements(coalesce(e->'analysis'->'nodes','[]')) node
 cross join lateral jsonb_array_elements(coalesce(node->'emotions','[]')) em),
 sums as (select topic,family,sum(intensity) intensity,array_agg(distinct id) evidence from emotions group by topic,family),
 threshold as (select percentile_cont(.8) within group(order by intensity) t from sums),
 overall as (select avg(ratio) ratio from (select distinct id,ratio from ratios where ratio is not null) user_answers),
 topic_ratios as (select topic,avg(ratio) ratio from ratios group by topic)
 select sums.topic,family,evidence from sums join topic_ratios using(topic),threshold,overall
 where sums.intensity>=threshold.t and topic_ratios.ratio>overall.ratio`,[data]);
 const title=(id:string)=>store.planets.find(p=>p.id===id)?.name??'this topic';
 const candidates:{key:string;kind:string;headline:string;evidence:string[]}[]=[];
 for(const r of shifted)candidates.push({key:`shift:${r.topic}:${r.shift_type}`,kind:'breaking_news',headline:`BREAKING ${r.shift_type.replaceAll('_',' ')} recurred in "${title(r.topic)}" — ${r.n} times this week.`,evidence:r.evidence});
 for(const r of emotions)candidates.push({key:`emotion:${r.topic}:${r.family}`,kind:'breaking_news',headline:`BREAKING "${title(r.topic)}" and ${r.family} appeared together ${r.n} times this week.`,evidence:r.evidence});
 for(const r of missed)candidates.push({key:`missed:${r.topic}`,kind:'breaking_news',headline:`BREAKING Some emphasis in "${title(r.topic)}" was missed ${r.n} times this week.`,evidence:r.evidence});
 for(const r of biases)candidates.push({key:`bias:${r.topic}:${r.family}`,kind:'bias_watch',headline:`Heads up: "${title(r.topic)}" has stronger ${r.family} tags and more Shifted or Added readings than your average. Worth knowing.`,evidence:r.evidence});
 candidates.push(...adjustmentCandidates(store));
 return candidates;
}
export function limitNotifications(existing:Notification[],candidates:{key:string;kind:string;headline:string;evidence:string[]}[],settings?:Store['settings'],time=now()) {
 const day=kstDay(time);
 const count=existing.filter(n=>kstDay(n.createdAt)===day&&['breaking_news','bias_watch','adjustment'].includes(n.kind)).length;
 const recent=new Set(existing.filter(n=>Date.parse(time)-Date.parse(n.createdAt)<7*86400000).map(n=>n.key));
 return candidates.filter(n=>!recent.has(n.key)&&settings?.notificationKinds?.[n.kind]!==false).slice(0,Math.max(0,2-count)).map(n=>({...n,id:newId(),status:'new',createdAt:time}));
}
export async function refreshNotifications(store:Store,owner?:string) {
 const existing=store.notifications??[];
 // Impostor reveals are owed to the user, so they are not subject to the daily cap.
 const reveals=owner?await impostorReveals(owner,store):[];
 return [...reveals,...limitNotifications(existing,await notificationCandidates(store,owner),store.settings),...existing];
}
