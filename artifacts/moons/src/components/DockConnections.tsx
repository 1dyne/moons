import {useState} from 'react';
import {ArrowUpRight,Plus,RefreshCw,Unplug} from 'lucide-react';
import type {ConnectedProject,ConnectorProvider,ResourceChoice,ProjectConnection} from '@workspace/moons-sync/projects';
import type {ProjectHubApi} from '@/lib/project-client';
import {tr} from '@/lib/i18n';

export const connectionNames:Record<string,string>={railway:'Railway','cloudflare-pages':'Cloudflare Pages','cloudflare-workers':'Cloudflare Workers',neon:'Neon',link:'Other service'};
const guides:Record<string,{role:string;help:string;url:string}>={
  railway:{role:'Runtime and deployments',help:'Create a project token for the environment you want to connect. Dock reads service and deployment status. The token itself may allow more actions.',url:'https://docs.railway.com/integrations/api'},
  'cloudflare-pages':{role:'Website deployments',help:'Use an API token with Pages Read for the selected account. Find the account ID in the Cloudflare dashboard.',url:'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/'},
  'cloudflare-workers':{role:'Worker metadata',help:'Use Workers Scripts Read for the selected account. This connection shows metadata, not uptime or request analytics.',url:'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/'},
  neon:{role:'Database compute status',help:'Use a Neon API key with access to the selected project. Project-scoped keys can also modify resources; Dock only reads project and compute metadata. Never paste a database connection string.',url:'https://neon.com/docs/manage/api-keys'},
  link:{role:'Dashboard shortcut',help:'Save a dashboard link for any service. Links do not collect status or billing automatically.',url:''},
};
function ConnectorWizard({hub,projectId,close}:{hub:ProjectHubApi;projectId:string;close:()=>void}){
  const [provider,setProvider]=useState<ConnectorProvider>('railway'),[key,setKey]=useState(''),[accountId,setAccountId]=useState(''),[resourceId,setResourceId]=useState(''),[name,setName]=useState(''),[url,setUrl]=useState('');
  const [resources,setResources]=useState<ResourceChoice[]|null>(null),[limited,setLimited]=useState(false),[environment,setEnvironment]=useState('');
  const guide=guides[provider]!;
  const reset=()=>{setResources(null);setResourceId('');};
  return <form className="project-form dock-connection-form" onSubmit={e=>{e.preventDefault();void hub.request(`/${projectId}/connections`,{provider,key,accountId,resourceId,name,url,environment}).then(()=>{setKey('');close();}).catch(()=>undefined);}}>
    <div className="project-heading"><h3>{tr('Connect a service')}</h3><button type="button" onClick={close}>{tr('Cancel')}</button></div>
    <div className="dock-provider-picker">{Object.entries(connectionNames).map(([id,label])=><button type="button" key={id} aria-pressed={provider===id} onClick={()=>{setProvider(id as ConnectorProvider);setKey('');setAccountId('');reset();}}>{tr(label)}</button>)}</div>
    <p className="dock-connection-help"><b>{tr(guide.role)}</b><br/>{tr(guide.help)} {guide.url&&<a href={guide.url} target="_blank" rel="noreferrer">{tr('Connection guide')} ↗</a>}</p>
    {provider==='link'?<><label>{tr('Service name')}<input required value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label><label>{tr('Dashboard URL')}<input required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></label><label>{tr('Environment')}<input value={environment} onChange={e=>setEnvironment(e.target.value)} placeholder="production / staging"/></label></>:<>
      <label>{tr('API token')}<input required type="password" autoComplete="new-password" value={key} onChange={e=>{setKey(e.target.value);reset();}}/></label>
      {(provider.startsWith('cloudflare')||provider==='neon')&&<label>{tr(provider==='neon'?'Organization ID (optional)':'Cloudflare account ID')}<input required={provider.startsWith('cloudflare')} value={accountId} onChange={e=>{setAccountId(e.target.value);reset();}}/></label>}
      {provider==='neon'&&<label>{tr('Project ID (optional, for a scoped key)')}<input value={resourceId} onChange={e=>{setResourceId(e.target.value);setResources(null);}}/></label>}
      <button type="button" className="secondary" disabled={hub.busy||!key.trim()||(provider.startsWith('cloudflare')&&!accountId)} onClick={()=>{void hub.request<{resources:ResourceChoice[];limited:boolean}>('/connections/discover',{provider,key,accountId,resourceId}).then(r=>{setResources(r.resources);setLimited(r.limited);setResourceId(r.resources[0]?.id??'');}).catch(()=>undefined);}}>{tr('Find my resources')}</button>
      {resources&&<label>{tr('Choose resource')}<select required value={resourceId} onChange={e=>setResourceId(e.target.value)}>{!resources.length&&<option value="">{tr('No accessible resources')}</option>}{resources.map(r=><option key={r.id} value={r.id}>{r.name}{r.environment?` · ${r.environment}`:''}</option>)}</select></label>}
      {limited&&<p>{tr('Only the first page is shown. Use a project-scoped key or a direct project ID to narrow the list.')}</p>}
    </>}
    <button className="primary" disabled={hub.busy||(provider!=='link'&&(!resources||!resourceId))}>{tr('Connect selected service')}</button>
  </form>;
}
export function GithubConnection({project:p,hub}:{project:ConnectedProject;hub:ProjectHubApi}) {
  const [repo,setRepo]=useState(p.repository),[key,setKey]=useState(''),[paths,setPaths]=useState(p.contextPaths.join('\n'));
  const call=(path:string,b:unknown,method?:string)=>hub.request(path,b,method).catch(()=>undefined);
  return <section className="settings-card dock-github"><div className="project-heading"><div><small>{tr('Source code')}</small><h2>GitHub</h2></div>{p.repository&&<a href={`https://github.com/${p.repository}`} target="_blank" rel="noreferrer"><ArrowUpRight size={16}/>{p.repository}</a>}</div><p>{tr('Optional. Connect source code when you want code-aware proposals.')}</p>
    {p.snapshot&&<div className="dock-snapshot"><b>{p.snapshot.commitTitle}</b><small>{p.snapshot.sha.slice(0,12)} · {new Date(p.snapshot.checkedAt).toLocaleString()}</small>{p.snapshot.checks.map((c,i)=><span key={i}>{c.name}: {c.conclusion??c.status}</span>)}{!!p.snapshot.unavailable.length&&<small>{tr('Unavailable')}: {p.snapshot.unavailable.join(', ')}</small>}</div>}
    {p.connectionError&&<p role="alert">{p.connectionError}</p>}
    <div className="project-actions"><button disabled={hub.busy||!p.repository} onClick={()=>void call(`/${p.id}/sync`,{})}><RefreshCw size={14}/>{tr('Sync repository')}</button><span className="project-state">{tr(p.snapshot?'Last checked snapshot':'Code not inspected')}</span></div>
    <details open={!p.repository}><summary>{tr('Repository settings')}</summary><form className="project-form" onSubmit={e=>{e.preventDefault();void call(`/${p.id}`,{...p,repository:repo,contextPaths:paths.split('\n').map(x=>x.trim()).filter(Boolean)},'PUT');}}><label>{tr('Repository URL or owner/name')}<input value={repo} onChange={e=>setRepo(e.target.value)} placeholder="https://github.com/owner/repo"/></label><label>{tr('Context files')}<textarea value={paths} onChange={e=>setPaths(e.target.value)}/></label><button disabled={hub.busy}>{tr('Save repository')}</button></form></details>
    <details><summary>{tr('GitHub access')}</summary><form className="project-form" onSubmit={e=>{e.preventDefault();void hub.request(`/${p.id}/github-key`,{key},'PUT').then(()=>setKey('')).catch(()=>undefined);}}><label>{tr('Read-only GitHub token')}<input type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)}/></label><span>{tr(p.githubConnected?'Connected':'Public access')}</span><button disabled={hub.busy||!key}>{tr('Save connection')}</button>{p.githubConnected&&<button type="button" onClick={()=>void call(`/${p.id}/github-key`,{key:''},'PUT')}>{tr('Disconnect')}</button>}</form></details>
  </section>;
}
export function ConnectionCard({connection:c,hub}:{connection:ProjectConnection;hub:ProjectHubApi}){
  return <article className={`settings-card dock-service ${c.error?'attention':''}`}><div className="project-heading"><span className="market-eyebrow">{tr(connectionNames[c.provider]??c.provider)}</span><a href={c.url} target="_blank" rel="noreferrer" aria-label={`${tr('Open service')}: ${c.name}`}><ArrowUpRight size={17}/></a></div><h3>{c.name}</h3><small>{c.environment}</small>{c.snapshot?<div className="dock-snapshot"><b>{c.snapshot.status}</b>{c.snapshot.facts.map((f,i)=><small key={i}>{tr(f.label)}: {f.value}</small>)}<small>{tr('Last checked')}: {new Date(c.snapshot.checkedAt).toLocaleString()}</small></div>:<p className="project-state">{tr('Link only · no automatic status')}</p>}{c.error&&<p role="alert">{tr(c.error)}</p>}<div className="project-actions">{c.provider!=='link'&&<button disabled={hub.busy} onClick={()=>void hub.request(`/connections/${c.id}/sync`,{}).catch(()=>undefined)}><RefreshCw size={14}/>{tr('Refresh status')}</button>}<button disabled={hub.busy} onClick={()=>void hub.request(`/connections/${c.id}/remove`,{}).catch(()=>undefined)}><Unplug size={14}/>{tr('Disconnect')}</button></div></article>;
}
export default function DockConnections({project,hub}:{project:ConnectedProject;hub:ProjectHubApi}){
  const [adding,setAdding]=useState(false);
  const connections=(hub.data.connections??[]).filter(c=>c.projectId===project.id);
  return <div className="dock-section-stack"><div className="project-heading"><div><h2>{tr('Connected services')}</h2><p className="project-state">{tr('One project can use several services. Connect only what it uses.')}</p></div><button className="primary small" onClick={()=>setAdding(!adding)}><Plus size={14}/>{tr('Connect a service')}</button></div>
    {adding&&<ConnectorWizard hub={hub} projectId={project.id} close={()=>setAdding(false)}/>}
    <div className="dock-services">{connections.map(c=><ConnectionCard key={c.id} connection={c} hub={hub}/>)}</div>
    {!connections.length&&!adding&&<div className="dock-onboarding"><h3>{tr('Where does this project run?')}</h3><p>{tr('Railway for runtime, Cloudflare for web delivery, Neon for your database. You can add them later and start with a schedule today.')}</p><button className="secondary" onClick={()=>setAdding(true)}>{tr('Choose a service')}</button></div>}
    <GithubConnection key={`${project.id}:${project.repository}`} project={project} hub={hub}/>
  </div>;
}
