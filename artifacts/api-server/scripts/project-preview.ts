// Local browser-test fixture. No credentials, persistent database or outbound network.
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA, type Driver} from '../src/moons/lib/server/db.ts';
import {openai} from '../src/moons/lib/server/ai/openai.ts';
import {runProjectJob} from '../src/moons/lib/server/projects/worker.ts';
import type {ReviewDraft} from '@workspace/moons-sync/projects';
import path from 'node:path';

for (const key of ['DATABASE_URL', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
process.env.WEB_DIST_DIR = path.resolve('../moons/dist/public');
process.env.MOONS_ENCRYPTION_KEY = 'local-browser-fixture-only';
const memory = new PGlite(); await memory.exec(SCHEMA);
const driver: Driver = {query: (s,p) => memory.query(s,p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s,p) => tx.query(s,p) as ReturnType<Driver['query']>}))};
(globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve(driver);
globalThis.fetch = async (input,init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if(url.origin==='https://backboard.railway.com')return Response.json({data:JSON.parse(String(init?.body)).query.includes('projectToken')?{projectToken:{projectId:'project-1',environmentId:'env-1'}}:{environment:{id:'env-1',name:'production',serviceInstances:{edges:[{node:{id:'service-1',serviceName:'My API',latestDeployment:{id:'deploy-1',status:'SUCCESS'}}}]}}}});
  if(url.origin==='https://api.cloudflare.com')return Response.json({success:true,result:url.pathname.endsWith('/pages/projects')?[{name:'my-site'}]:{name:'my-site',production_branch:'main',canonical_deployment:{id:'prod-1',latest_stage:{status:'success'}}}});
  if(url.origin==='https://console.neon.tech')return Response.json(url.pathname.endsWith('/endpoints')?{endpoints:[{current_state:'idle'}]}:url.pathname.endsWith('/projects')?{projects:[{id:'neon-1',name:'App database'}]}:{project:{id:'neon-1',name:'App database',region_id:'aws-us-east-1'}});
  if (url.origin !== 'https://api.github.com') throw new Error('Outbound network disabled in fixture');
  const p = url.pathname;
  const data = p.endsWith('/check-runs') ? {check_runs: [{name: 'fixture check', status: 'completed', conclusion: 'success'}]}
    : p.includes('/git/trees/') ? {tree: [{path:'README.md',type:'blob'}],truncated:false}
    : p.includes('/contents/') ? {type:'file',encoding:'base64',content:Buffer.from('# Fixture repository\nPreserve the original idea.').toString('base64')}
    : p.includes('/commits/') ? {sha:'0123456789abcdef',commit:{message:'Fixture latest progress',tree:{sha:'tree1'}}}
    : {default_branch:'main'};
  return Response.json(data);
};
const draft: ReviewDraft = {title:'Project review inbox',rationale:'Connect ideas to the project.',change:'Prepare an actionable review before assigning work.',scope:['Add a review inbox'],preserve:['Keep the original dump'],acceptance:['Only the owner sees proposals'],verification:['Test two separate spaces'],questions:['When should we notify?'],risks:['Fixture content, not real model QA'],codePaths:['README.md']};
openai.json = (async task => {
  const input = JSON.parse(task.user);
  if (task.name === 'moons_project_match') return {data:{projectIds:input.projects.slice(0,1).map((p:{id:string})=>p.id)},model:'fixture'};
  if (task.name === 'moons_project_review') return {data:{proposals:[{projectId:input.projects[0].id,evidenceQuote:input.source.body,draft}]},model:'fixture'};
  if (task.name === 'moons_project_discussion') return {data:{message:'Notify only when the review is ready.',draft:{...draft,questions:[]}},model:'fixture'};
  throw new Error(`Unexpected fixture task: ${task.name}`);
}) as typeof openai.json;
const {default:app} = await import('../src/app.ts');
let active=false;
const timer=setInterval(()=>{if(!active){active=true;void runProjectJob().finally(()=>{active=false;});}},300);
const server=app.listen(4317,'127.0.0.1',()=>process.stdout.write('Project fixture ready at http://127.0.0.1:4317\n'));
process.on('SIGTERM',()=>{clearInterval(timer);server.close(()=>{void memory.close().then(()=>process.exit(0));});});
