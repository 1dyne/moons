import test from 'node:test';
import assert from 'node:assert/strict';
import {costsOf,projectStructure,rollup} from '../lib/dock-structure.ts';
import type {ConnectedProject,ProjectConnection,ProjectEvent,ProjectHub} from '@workspace/moons-sync/projects';
import type {Store} from '../lib/model.ts';

const project=(extra:Partial<ConnectedProject>={}):ConnectedProject=>({id:'p',name:'MOONS',goal:'',repository:'1dyne/moons',website:'',contextPaths:[],noteIds:['n1'],watch:true,createdAt:'',updatedAt:'',contexts:[],revision:1,
  snapshot:{repo:'1dyne/moons',branch:'main',sha:'abcdef0',checkedAt:'',commitTitle:'x',checks:[],files:[],unavailable:[],paths:['artifacts/a.ts','artifacts/b.ts','docs/x.md','README.md']},
  milestones:[{id:'m2',title:'베타',date:'2026-12-01',done:false},{id:'m1',title:'첫 공개',date:'2026-11-01',done:true}],...extra});
const conn=(id:string,provider:ProjectConnection['provider']):ProjectConnection=>({id,projectId:'p',provider,name:id,resourceId:'',accountId:'',environment:'',url:`https://${id}.example`,createdAt:'',revision:1,credentialStored:true});
const store={version:1,entries:[{id:'n1',kind:'dump',body:'스펙',sentences:['스펙'],planetIds:[],createdAt:'',locked:true,status:'saved'}],planets:[]} as unknown as Store;

test('the structure map draws code, services, plan and context with the lines it can infer', ()=>{
  const p=project({links:[{id:'l',from:'note:n1',to:'conn:api',label:'명세'},{id:'bad',from:'gone',to:'repo',label:''}]});
  const m=projectStructure(p,[conn('api','railway'),conn('db','neon'),conn('other','link')],store);
  assert.deepEqual(m.groups.map(g=>[g.label,g.nodes.length]),[['Code',3],['Services',3],['Plan',2],['Context',1]]);
  const e=(from:string,to:string)=>m.edges.find(x=>x.from===from&&x.to===to);
  assert.equal(e('repo','conn:api')?.className,'spine');
  assert.ok(e('conn:api','conn:db'));
  assert.ok(e('ms:m1','ms:m2'),'milestones in date order');
  assert.equal(e('note:n1','conn:api')?.label,'명세');
  assert.ok(!m.edges.some(x=>x.from==='gone'),'lines to missing nodes are dropped');
  assert.equal(m.nodes.find(n=>n.id==='dir:artifacts')?.badge,'2');
  assert.equal(m.open.get('repo'),'https://github.com/1dyne/moons');
});

test('costs never add different currencies or bases, and each project rolls up its own', ()=>{
  const ev=(projectId:string,kind:ProjectEvent['kind'],value:number,unit='USD',basis:ProjectEvent['basis']='estimated',at='2026-10-20'):ProjectEvent=>({id:`${projectId}${kind}${value}`,projectId,kind,name:kind,value,unit,at,basis,source:'app',aggregation:'sum'});
  const events=[ev('p','cost',1),ev('p','cost',2),ev('p','cost',5,'USD','reported'),ev('p','cost',900,'KRW'),ev('q','cost',3),ev('p','error',4),ev('p','deployment',1,'count','reported','2026-10-25')];
  assert.deepEqual(costsOf(events.filter(e=>e.projectId==='p')).map(m=>[m.unit,m.basis,m.value]),[['USD','estimated',3],['USD','reported',5],['KRW','estimated',900]]);
  const hub={projects:[project()],proposals:[],jobs:[],events,connections:[],aiUsage:{calls:3,cost:0.5,unknown:0},aiByProject:[{projectId:'p',calls:2,cost:0.2,unknown:0}]} as ProjectHub;
  const r=rollup(project(),hub);
  assert.equal(r.ai?.cost,0.2);assert.equal(r.errors,4);assert.equal(r.lastDeploy,'2026-10-25');
});
