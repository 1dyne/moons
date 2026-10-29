import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA,q,newId,type Driver} from '../lib/server/db.ts';
import {initV5,loadWorkspace} from '../lib/server/v5/workspace-store.ts';
import {saveProject} from '../lib/server/projects/service.ts';
import {claimWorkspace} from '../lib/server/v5/claim.ts';
import {discoverConnections,addConnection,listConnections,getConnection,syncConnection,removeConnection} from '../lib/server/projects/connectors.ts';
const memory=new PGlite(),original=globalThis.fetch,account='a'.repeat(32),secret='fake-test-key';let owner:string,other:string,pid:string;let fail=false;const requests:{url:string;method:string}[]=[];
before(async()=>{
 await memory.exec(SCHEMA);const driver:Driver={query:(s,p)=>memory.query(s,p) as ReturnType<Driver['query']>,transaction:fn=>memory.transaction(tx=>fn({query:(s,p)=>tx.query(s,p) as ReturnType<Driver['query']>}))};
 (globalThis as unknown as {__moonsDb:Promise<Driver>}).__moonsDb=Promise.resolve(driver);process.env.MOONS_ENCRYPTION_KEY='connector-test-only';await initV5();owner=newId();other=newId();await q('insert into guests(id) values($1),($2)',[owner,other]);
 pid=(await saveProject(owner,{name:'App',goal:'Ship'},(await loadWorkspace(owner)).store)).id;
 globalThis.fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET';requests.push({url,method});assert.equal(init?.redirect,'error');
  if(fail)return Response.json({error:secret},{status:401});
  if(url==='https://backboard.railway.com/graphql/v2'){
   assert.equal((init!.headers as Record<string,string>)['Project-Access-Token'],secret);assert.equal(method,'POST');const body=JSON.parse(String(init!.body));assert.ok(body.query.startsWith('query'));assert.ok(!body.query.includes('mutation'));
   return Response.json({data:body.query.includes('projectToken')?{projectToken:{projectId:'rail-project',environmentId:'env-prod'}}:{environment:{id:'env-prod',name:'production',serviceInstances:{edges:[{node:{id:'service-1',serviceName:'api',latestDeployment:{id:'deploy-1',status:'SUCCESS'},variables:{SECRET:secret}}}]}}}});
  }
  assert.equal(method,'GET');assert.equal((init!.headers as Record<string,string>).Authorization,`Bearer ${secret}`);
  if(url.startsWith('https://api.cloudflare.com/client/v4/'))return Response.json({success:true,result:url.includes('workers/scripts')?[{id:'worker-1',compatibility_date:'2026-10-01',secrets:[secret]}]:url.includes('/pages/projects/site-1')?{name:'site-1',production_branch:'main',canonical_deployment:{id:'prod',latest_stage:{status:'success'},env_vars:{SECRET:secret}},latest_deployment:{id:'preview',latest_stage:{status:'failure'}},deployment_configs:{production:{env_vars:{SECRET:secret}}}}:[{name:'site-1',env_vars:{SECRET:secret}}]});
  if(url.startsWith('https://console.neon.tech/api/v2/'))return Response.json(url.endsWith('/endpoints')?{endpoints:[{current_state:'idle',host:'secret-host'}]}:url.includes('/projects/neon-1')?{project:{id:'neon-1',name:'Database',region_id:'aws-us-east-1',password:secret}}:{projects:[{id:'neon-1',name:'Database'}],pagination:{cursor:'next'}});
  throw new Error(`Unexpected outbound request: ${url}`);
 };
});
after(async()=>{globalThis.fetch=original;await memory.close();});
test('Cloudflare selects production and never stores environment secrets or tokens in public metadata',async()=>{
 const input={provider:'cloudflare-pages',key:secret,accountId:account,resourceId:'site-1'};
 const found=await discoverConnections(input);assert.equal(found.resources[0]?.id,'site-1');assert.ok(!JSON.stringify(found).includes(secret));
 const c=await addConnection(owner,pid,input);assert.equal(c.snapshot?.status,'success');assert.equal(c.snapshot?.facts.find(x=>x.label==='Deployment')?.value,'prod');
 assert.ok(!JSON.stringify(c).includes(secret));const stored=await getConnection(owner,c.id);assert.ok(stored.credential&&!stored.credential.includes(secret));
 await assert.rejects(()=>getConnection(other,c.id),(e:{status:number})=>e.status===404);assert.equal((await listConnections(other)).length,0);
 fail=true;await assert.rejects(()=>syncConnection(owner,c.id));fail=false;const failed=await getConnection(owner,c.id);assert.equal(failed.data.snapshot?.status,'success');assert.ok(!failed.data.error?.includes(secret));
 const refreshed=await syncConnection(owner,c.id);assert.equal(refreshed.error,undefined);await removeConnection(owner,c.id);await assert.rejects(()=>getConnection(owner,c.id));
});
test('Railway uses environment project token and fixed GraphQL read queries',async()=>{
 const input={provider:'railway',key:secret,resourceId:'service-1'};assert.equal((await discoverConnections(input)).resources[0]?.environment,'production');const c=await addConnection(owner,pid,input);assert.equal(c.snapshot?.status,'SUCCESS');assert.ok(c.url.includes('environmentId=env-prod'));
});
test('Neon supports scoped project lookup and treats idle as metadata; Workers exposes only metadata',async()=>{
 assert.equal((await discoverConnections({provider:'neon',key:secret})).limited,true);
 const found=await discoverConnections({provider:'neon',key:secret,resourceId:'neon-1'});assert.equal(found.resources.length,1);
 const c=await addConnection(owner,pid,{provider:'neon',key:secret,resourceId:'neon-1'});assert.equal(c.snapshot?.status,'idle');assert.ok(!JSON.stringify(c).includes('secret-host'));
 const w=await addConnection(owner,pid,{provider:'cloudflare-workers',key:secret,accountId:account,resourceId:'worker-1'});assert.equal(w.snapshot?.status,'Metadata available');assert.ok(!JSON.stringify(w).includes(secret));
});
test('link connections do not fetch arbitrary URLs; invalid provider IDs and foreign projects are rejected',async()=>{
 const count=requests.length;await addConnection(owner,pid,{provider:'link',url:'https://example.com/dashboard',name:'Other'});assert.equal(requests.length,count);
 await assert.rejects(()=>addConnection(owner,pid,{provider:'link',url:'javascript:alert(1)'}));
 await assert.rejects(()=>discoverConnections({provider:'neon',key:secret,resourceId:'../secret'}));
 await assert.rejects(()=>addConnection(other,pid,{provider:'railway',key:secret,resourceId:'service-1'}));assert.equal(requests.length,count);
});
test('project dates reject invalid calendar values without server errors',async()=>{
 const store=(await loadWorkspace(owner)).store;
 for(const targetDate of ['2026-99-99','2026-02-30'])await assert.rejects(()=>saveProject(owner,{name:'Bad date',goal:'Test',targetDate},store),(e:{status:number})=>e.status===400);
 await assert.rejects(()=>saveProject(owner,{name:'Bad milestone',goal:'Test',milestones:[{id:'m',title:'Ship',date:'2026-02-30'}]},store),(e:{status:number})=>e.status===400);
});
test('claiming an anonymous space moves connections and encrypted credentials to the account owner',async()=>{
 const count=(await listConnections(owner)).length;
 await claimWorkspace('connector-user','connector@example.invalid',other);await claimWorkspace('connector-user','connector@example.invalid',owner);
 assert.equal((await listConnections(owner)).length,0);const moved=await listConnections(other);assert.equal(moved.length,count);
 const railway=moved.find(c=>c.provider==='railway')!;assert.equal((await syncConnection(other,railway.id)).snapshot?.status,'SUCCESS');
 await assert.rejects(()=>getConnection(owner,railway.id),(e:{status:number})=>e.status===404);
});
