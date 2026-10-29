import type {ConnectorProvider,ProjectConnection,ResourceChoice,ServiceSnapshot} from '@workspace/moons-sync/projects';
import {q,json,newId} from '../db.ts';
import {seal,open} from '../v5/ai-access.ts';
import {WorkspaceError,now} from '../v5/types.ts';
import {getProject,object,text,safeUrl} from './service.ts';

const providers=new Set<ConnectorProvider>(['railway','cloudflare-pages','cloudflare-workers','neon','link']);
type Config={provider:ConnectorProvider;key:string;accountId:string;resourceId:string};
type Data=Record<string,any>;
const segment=(s:string)=>{if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(s))throw new WorkspaceError(400,'Invalid service resource ID.');return encodeURIComponent(s);};
function config(input:unknown):Config {
  const b=object(input),provider=String(b.provider) as ConnectorProvider;
  if(!providers.has(provider))throw new WorkspaceError(400,'Unknown connection provider.');
  const key=text(b.key??'',2000,provider!=='link'),accountId=text(b.accountId??'',160),resourceId=text(b.resourceId??'',160);
  if(provider.startsWith('cloudflare')&&!/^[a-f0-9]{32}$/i.test(accountId))throw new WorkspaceError(400,'Enter the Cloudflare account ID (32 characters).');
  if(accountId)segment(accountId);if(resourceId&&provider!=='railway')segment(resourceId);
  return {provider,key,accountId,resourceId};
}
// Only fixed provider endpoints and read operations. Never fetch user-entered dashboard URLs.
async function request(provider:ConnectorProvider,path:string,key:string,query?:{query:string;variables?:Data}):Promise<Data> {
  const origin=provider==='railway'?'https://backboard.railway.com/graphql/v2':provider==='neon'?'https://console.neon.tech/api/v2':'https://api.cloudflare.com/client/v4';
  const response=await fetch(origin+path,{method:query?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json',...(provider==='railway'?{'Project-Access-Token':key}:{Authorization:`Bearer ${key}`}),...(query?{'Content-Type':'application/json'}:{})},...(query?{body:JSON.stringify(query)}:{})});
  if(!response.ok)throw new WorkspaceError(502,`Service connection failed (${response.status}). Check the token and resource access.`);
  const reader=response.body?.getReader();let raw='';let size=0;
  if(!reader)throw new WorkspaceError(502,'Empty service response.');
  const decoder=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw new WorkspaceError(502,'Service response is too large.');}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();let data:Data;try{data=JSON.parse(raw);}catch{throw new WorkspaceError(502,'Invalid service response.');}
  if(data.success===false||data.errors?.length)throw new WorkspaceError(502,'Service access was refused. Check the token permissions.');
  return data;
}
async function railway(c:Config) {
  const claims=(await request(c.provider,'',c.key,{query:'query { projectToken { projectId environmentId } }'})).data?.projectToken;
  if(!claims?.environmentId||!claims?.projectId)throw new WorkspaceError(502,'Use a Railway project environment token.');
  const env=(await request(c.provider,'',c.key,{query:'query($id: String!) { environment(id: $id) { id name serviceInstances { edges { node { id serviceName latestDeployment { id status } } } } } }',variables:{id:claims.environmentId}})).data?.environment;
  if(!env)throw new WorkspaceError(502,'Railway environment was not found.');
  return {projectId:String(claims.projectId),env,services:(env.serviceInstances?.edges??[]).map((e:Data)=>e.node) as Data[]};
}
const display=(v:unknown)=>String(v??'Unknown').slice(0,200);
export async function discoverConnections(input:unknown):Promise<{resources:ResourceChoice[];limited:boolean}> {
  const c=config(input);if(c.provider==='link')return {resources:[],limited:false};
  if(c.provider==='railway') {const r=await railway(c);return {resources:r.services.map(s=>({id:display(s.id),name:display(s.serviceName),environment:display(r.env.name),url:`https://railway.com/project/${segment(r.projectId)}?environmentId=${segment(r.env.id)}`})),limited:false};}
  if(c.provider==='neon') {
    if(c.resourceId){const r=await request(c.provider,`/projects/${segment(c.resourceId)}`,c.key);return {resources:[{id:display(r.project.id),name:display(r.project.name)}],limited:false};}
    const r=await request(c.provider,`/projects?limit=100${c.accountId?`&org_id=${segment(c.accountId)}`:''}`,c.key);
    return {resources:(r.projects??[]).map((p:Data)=>({id:display(p.id),name:display(p.name)})),limited:!!r.pagination?.cursor};
  }
  const path=c.provider==='cloudflare-pages'?'pages/projects?per_page=100':'workers/scripts';
  const r=await request(c.provider,`/accounts/${segment(c.accountId)}/${path}`,c.key);
  return {resources:(r.result??[]).map((p:Data)=>({id:display(c.provider==='cloudflare-pages'?p.name:p.id),name:display(c.provider==='cloudflare-pages'?p.name:p.id)})),limited:(r.result_info?.total_pages??1)>1};
}
export async function connectionSnapshot(c:Config):Promise<{snapshot:ServiceSnapshot;name:string;url:string;environment:string}> {
  const checkedAt=now();
  if(c.provider==='railway'){
    const r=await railway(c),service=r.services.find(s=>s.id===c.resourceId);
    if(!service)throw new WorkspaceError(404,'Service was not found in this environment.');
    return {name:display(service.serviceName),environment:display(r.env.name),url:`https://railway.com/project/${segment(r.projectId)}?environmentId=${segment(r.env.id)}`,
      snapshot:{checkedAt,status:display(service.latestDeployment?.status??'No deployment'),summary:display(service.serviceName),facts:[{label:'Environment',value:display(r.env.name)},{label:'Deployment',value:display(service.latestDeployment?.id??'None')} ]}};
  }
  if(c.provider==='neon'){
    const root=`/projects/${segment(c.resourceId)}`;
    const project=(await request(c.provider,root,c.key)).project;
    const endpoints=(await request(c.provider,`${root}/endpoints`,c.key)).endpoints??[];
    return {name:display(project.name),environment:'database',url:`https://console.neon.tech/app/projects/${segment(c.resourceId)}`,
      snapshot:{checkedAt,status:endpoints.length?endpoints.map((e:Data)=>display(e.current_state)).join(' / ').slice(0,200):'No compute',summary:display(project.name),facts:[{label:'Region',value:display(project.region_id)},{label:'Computes',value:String(endpoints.length)}]}};
  }
  const root=`/accounts/${segment(c.accountId)}`;
  if(c.provider==='cloudflare-pages'){
    const p=(await request(c.provider,`${root}/pages/projects/${segment(c.resourceId)}`,c.key)).result;
    const d=p.canonical_deployment;
    return {name:display(p.name),environment:'production',url:`https://dash.cloudflare.com/${segment(c.accountId)}/pages/view/${segment(c.resourceId)}`,
      snapshot:{checkedAt,status:display(d?.latest_stage?.status??'No production deployment'),summary:display(p.name),...(d?.modified_on?{updatedAt:String(d.modified_on)}:{}),facts:[{label:'Branch',value:display(p.production_branch)},{label:'Deployment',value:display(d?.id??'None')}]}};
  }
  if(c.provider==='cloudflare-workers'){
    const scripts=(await request(c.provider,`${root}/workers/scripts`,c.key)).result??[];
    const p=scripts.find((s:Data)=>s.id===c.resourceId);if(!p)throw new WorkspaceError(404,'Worker was not found in this account.');
    return {name:display(p.id),environment:'worker',url:`https://dash.cloudflare.com/${segment(c.accountId)}/workers/services/view/${segment(c.resourceId)}`,
      snapshot:{checkedAt,status:'Metadata available',summary:display(p.id),...(p.modified_on?{updatedAt:String(p.modified_on)}:{}),facts:[{label:'Compatibility date',value:display(p.compatibility_date)}]}};
  }
  throw new WorkspaceError(400,'Links do not have automatic status.');
}
export async function listConnections(owner:string):Promise<ProjectConnection[]> {
  return (await q<{data:ProjectConnection;revision:number;credentialStored:boolean}>('select data,revision,credential is not null "credentialStored" from project_connections where owner_id=$1 order by id',[owner])).map(r=>({...r.data,revision:r.revision,credentialStored:r.credentialStored}));
}
export async function getConnection(owner:string,id:string) {
  const c=(await q<{data:ProjectConnection;credential:string|null;revision:number}>('select data,credential,revision from project_connections where owner_id=$1 and id=$2',[owner,id]))[0];
  if(!c)throw new WorkspaceError(404,'Connection not found.');return c;
}
export async function addConnection(owner:string,projectId:string,input:unknown) {
  await getProject(owner,projectId);const b=object(input),c=config(b);
  if((await listConnections(owner)).filter(x=>x.projectId===projectId).length>=20)throw new WorkspaceError(400,'Connection limit reached.');
  let connection:ProjectConnection={id:newId(),projectId,provider:c.provider,name:text(b.name??'',100)||c.provider,resourceId:c.resourceId,accountId:c.accountId,environment:text(b.environment??'',100),url:safeUrl(b.url),createdAt:now(),revision:1,credentialStored:c.provider!=='link'};
  if(c.provider==='link'){if(!connection.url)throw new WorkspaceError(400,'Add a service dashboard URL.');}
  else {if(!c.resourceId)throw new WorkspaceError(400,'Choose a service resource.');connection={...connection,...await connectionSnapshot(c)};}
  await q('insert into project_connections(owner_id,id,project_id,data,credential) values($1,$2,$3,$4::jsonb,$5)',[owner,connection.id,projectId,json(connection),c.provider==='link'?null:seal(c.key)]);
  return connection;
}
export async function syncConnection(owner:string,id:string) {
  const row=await getConnection(owner,id),c=row.data;
  if(!row.credential)throw new WorkspaceError(400,'Links do not have automatic status.');
  try{
    const next={...c,...await connectionSnapshot({provider:c.provider,key:open(row.credential),accountId:c.accountId,resourceId:c.resourceId})};delete next.error;
    const saved=await q('update project_connections set data=$3::jsonb,revision=revision+1 where owner_id=$1 and id=$2 and revision=$4 returning id',[owner,id,json(next),row.revision]);
    if(!saved.length)throw new WorkspaceError(409,'Connection changed. Reload before syncing.');return {...next,revision:row.revision+1};
  }catch(e){const error=e instanceof WorkspaceError?e.message:'Service connection is unavailable.';await q("update project_connections set data=data||jsonb_build_object('error',$3::text) where owner_id=$1 and id=$2 and revision=$4",[owner,id,error,row.revision]);throw new WorkspaceError(e instanceof WorkspaceError?e.status:502,error);}
}
export async function removeConnection(owner:string,id:string){await getConnection(owner,id);await q('delete from project_connections where owner_id=$1 and id=$2',[owner,id]);}
