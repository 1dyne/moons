import {AsyncLocalStorage} from 'node:async_hooks';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {q} from '../db.ts';
import {kstDay} from './kst.ts';
import {WorkspaceError} from './types.ts';
import {MODELS,STEPS,defaultModel,providerReady,resolveModel} from '../ai/catalog.ts';

// Who pays for AI on this request. With the user's own key there is no daily limit;
// otherwise the operator key is used and counted per person per KST day. Operators (MOONS_OPERATORS)
// have no limit and choose the model for each step (ai/catalog.ts).
/** onUsage replaces the usage log (scripts/eval-structure.mjs counts its own calls, without a database). */
export const aiScope=new AsyncLocalStorage<{apiKey?:string;owner?:string;operator?:boolean;models?:Record<string,string>;project?:string;onUsage?:(row:{task:string;model:string;input:number;output:number;cost:number|null;ok:boolean})=>void}>();
export const AI_TABLES=[
 `create table if not exists feedback(id text primary key,owner_id text not null,text text not null,page text,created_at timestamptz default now())`,
 `alter table feedback add column if not exists payload jsonb`,
 `create table if not exists ai_keys(owner_id text primary key,provider text not null,key_enc text not null,created_at timestamptz default now())`,
 `create table if not exists ai_usage(owner_id text not null,day text not null,calls integer not null default 0,primary key(owner_id,day))`,
 `create table if not exists ai_calls(id bigserial primary key,owner_id text,at timestamptz not null default now(),step text not null,task text not null,provider text not null,model text not null,input_tokens integer not null default 0,output_tokens integer not null default 0,cached_tokens integer not null default 0,cost_usd double precision,ms integer,ok boolean not null default true)`,
 `alter table ai_calls add column if not exists project_id text`,
 `create index if not exists ai_calls_at on ai_calls(at)`,
 `create table if not exists ai_models(owner_id text not null,step text not null,model text not null,primary key(owner_id,step))`,
];
export const dailyLimit=()=>Math.max(0,Number(process.env.MOONS_DAILY_AI_LIMIT)||60);

// AES-256-GCM. MOONS_ENCRYPTION_KEY should be set in production; SESSION_SECRET is the fallback.
function secret(){
 const raw=process.env.MOONS_ENCRYPTION_KEY||process.env.SESSION_SECRET;
 if(!raw)throw new WorkspaceError(503,'Key storage is not configured on this server.');
 return createHash('sha256').update(raw).digest();
}
export function seal(text:string){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',secret(),iv);
 const body=Buffer.concat([c.update(text,'utf8'),c.final()]);
 return [iv,c.getAuthTag(),body].map(b=>b.toString('base64url')).join('.');
}
export function open(sealed:string){
 const [iv,tag,body]=sealed.split('.').map(p=>Buffer.from(p,'base64url'));
 const d=createDecipheriv('aes-256-gcm',secret(),iv!);d.setAuthTag(tag!);
 return Buffer.concat([d.update(body!),d.final()]).toString('utf8');
}

async function ownKey(owner:string){
 const row=(await q<{key_enc:string}>('select key_enc from ai_keys where owner_id=$1',[owner]))[0];
 if(!row)return null;
 try{return open(row.key_enc)}catch{return null}
}

/** MOONS_OPERATORS lists operator accounts by Clerk user id or email, comma-separated. */
const operatorCache=new Map<string,{at:number;yes:boolean}>();
export async function isOperator(userId:string|null){
 if(!userId)return false;
 const list=(process.env.MOONS_OPERATORS??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(!list.length)return false;
 if(list.includes(userId.toLowerCase()))return true;
 const hit=operatorCache.get(userId);if(hit&&Date.now()-hit.at<600000)return hit.yes;
 let email=(await q<{email:string|null}>('select email from users where id=$1',[userId]).catch(()=>[]))[0]?.email??null;
 if(!email){try{const {clerkClient}=await import('@clerk/express');const u=await clerkClient.users.getUser(userId);email=u.emailAddresses.find(e=>e.id===u.primaryEmailAddressId)?.emailAddress??null}catch{email=null}}
 const yes=!!email&&list.includes(email.toLowerCase());
 operatorCache.set(userId,{at:Date.now(),yes});
 return yes;
}
export async function modelChoices(owner:string){
 return Object.fromEntries((await q<{step:string;model:string}>('select step,model from ai_models where owner_id=$1',[owner])).map(r=>[r.step,r.model]));
}

/** Run an AI-using request: with the user's key if they saved one, else within today's limit. Operators have no limit. */
export async function withAi<T>(owner:string,work:()=>Promise<T>,opts:{operator?:boolean;project?:string}={}):Promise<T>{
 const project=opts.project?{project:opts.project}:{};
 if(opts.operator)return aiScope.run({owner,operator:true,models:await modelChoices(owner),...project},work);
 const key=await ownKey(owner);
 if(key)return aiScope.run({apiKey:key,owner,...project},work);
 const day=kstDay(),limit=dailyLimit();
 const row=(await q<{calls:number}>(`insert into ai_usage(owner_id,day,calls) values($1,$2,1)
  on conflict(owner_id,day) do update set calls=ai_usage.calls+1 where ai_usage.calls<$3 returning calls`,[owner,day,limit]))[0];
 if(!row)throw new WorkspaceError(429,`You reached today's AI limit (${limit}). Connect your own API key in Settings to keep going, or come back tomorrow.`);
 return aiScope.run({owner,...project},work);
}

export async function aiStatus(owner:string,operator=false){
 const own=(await q<{provider:string;created_at:string}>('select provider,created_at::text from ai_keys where owner_id=$1',[owner]))[0];
 const used=(await q<{calls:number}>('select calls from ai_usage where owner_id=$1 and day=$2',[owner,kstDay()]))[0]?.calls??0;
 const base={ownKey:own?{provider:own.provider,since:own.created_at}:null,used,limit:dailyLimit(),operator};
 if(!operator)return base;
 return {...base,models:{catalog:MODELS,steps:[...STEPS.map(s=>s.id),'other'],ready:{openai:providerReady('openai'),anthropic:providerReady('anthropic'),gemini:providerReady('gemini')},
  defaults:{fast:defaultModel('fast'),deep:defaultModel('deep')},chosen:await modelChoices(owner)}};
}
/** Operator only: the model for each step. An empty value goes back to the default. */
export async function setModels(owner:string,choices:unknown){
 if(!choices||typeof choices!=='object')throw new WorkspaceError(400,'Choose a model for each step.');
 const steps=new Set<string>([...STEPS.map(s=>s.id),'other']);
 for(const [step,model] of Object.entries(choices as Record<string,unknown>)){
  if(!steps.has(step))throw new WorkspaceError(400,`Unknown step: ${step}`);
  if(model===''||model===null){await q('delete from ai_models where owner_id=$1 and step=$2',[owner,step]);continue}
  if(typeof model!=='string'||!resolveModel(model))throw new WorkspaceError(400,`Unknown model: ${String(model)}. Type a new one as provider:model-id.`);
  await q(`insert into ai_models(owner_id,step,model) values($1,$2,$3) on conflict(owner_id,step) do update set model=excluded.model`,[owner,step,model]);
 }
}
/** Operator only: what AI cost over the last days, by step and model, for the whole service and for this account. */
export async function usageReport(owner:string,days=30){
 const since=`now() - interval '${Math.max(1,Math.min(365,Math.floor(days)))} days'`;
 const rows=(mine:boolean)=>q<{step:string;provider:string;model:string;calls:number;failed:number;input:number;output:number;cached:number;cost:number|null;ms:number}>(
  `select step,provider,model,count(*)::int calls,count(*) filter (where not ok)::int failed,sum(input_tokens)::int input,sum(output_tokens)::int output,sum(cached_tokens)::int cached,sum(cost_usd)::float cost,avg(ms)::int ms
   from ai_calls where at>${since}${mine?' and owner_id=$1':''} group by step,provider,model order by cost desc nulls last`,mine?[owner]:[]);
 return {days,all:await rows(false),mine:await rows(true)};
}
export async function saveKey(owner:string,provider:unknown,key:unknown){
 if(provider!=='openai')throw new WorkspaceError(400,'Only OpenAI keys are supported for now.');
 if(typeof key!=='string'||!/^sk-[A-Za-z0-9_-]{20,200}$/.test(key.trim()))throw new WorkspaceError(400,'That does not look like an OpenAI API key.');
 await q(`insert into ai_keys(owner_id,provider,key_enc) values($1,$2,$3) on conflict(owner_id) do update set provider=excluded.provider,key_enc=excluded.key_enc,created_at=now()`,[owner,provider,seal(key.trim())]);
}
export async function removeKey(owner:string){await q('delete from ai_keys where owner_id=$1',[owner])}
