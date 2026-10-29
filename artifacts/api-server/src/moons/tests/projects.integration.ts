import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import type {ProjectProposal, ReviewDraft} from '@workspace/moons-sync/projects';
import {SCHEMA, q, newId, type Driver} from '../lib/server/db.ts';
import {initV5, initialWorkspace, loadWorkspace, persistWorkspace, validateStore} from '../lib/server/v5/workspace-store.ts';
import {claimWorkspace} from '../lib/server/v5/claim.ts';
import {saveProject, getProject, getProposal, proposalAction, projectHub, rotateTelemetry, acceptEvent, parseEvent, setGithubKey} from '../lib/server/projects/service.ts';
import {changedProjectSparks} from '../lib/server/projects/queue.ts';
import {runProjectJob} from '../lib/server/projects/worker.ts';
import {discussProposal} from '../lib/server/projects/review.ts';
import {openai} from '../lib/server/ai/openai.ts';
import type {Entry} from '../lib/server/v5/types.ts';

const memory = new PGlite(), original = openai.json;
const draft: ReviewDraft = {title: '프로젝트 검토함', rationale: '아이디어를 프로젝트와 연결한다.', change: '새로운 아이디어를 검토함에 모은다.', scope: ['검토함 추가'], preserve: ['원문 보존'], acceptance: ['사용자별 검토안 분리'], verification: ['두 사용자로 확인'], questions: ['알림 범위는?'], risks: ['미확인 코드'], codePaths: ['invented.ts']};
let owner: string, other: string, projectId: string, entryId: string, proposal: ProjectProposal;
before(async () => {
  await memory.exec(SCHEMA);
  const driver: Driver = {query: (s, p) => memory.query(s, p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s, p) => tx.query(s, p) as ReturnType<Driver['query']>}))};
  (globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve(driver);
  process.env.MOONS_ENCRYPTION_KEY = 'project-test-encryption-only';
  await initV5();
  owner = newId(); other = newId();
  await q('insert into guests(id) values($1),($2)', [owner, other]);
  await loadWorkspace(owner); await loadWorkspace(other);
  openai.json = (async task => {
    const input = JSON.parse(task.user);
    if (task.name === 'moons_project_match') return {data: {projectIds: input.projects.map((p: {id: string}) => p.id)}, model: 'fixture'};
    if (task.name === 'moons_project_discussion') return {data: {message: '알림은 검토안이 준비됐을 때 보내겠습니다.', draft: {...draft, questions: []}}, model: 'fixture'};
    assert.equal(task.name, 'moons_project_review');
    assert.ok(input.projects.every((p: {name: string}) => p.name !== 'Other private project'));
    return {data: {proposals: [{projectId: input.projects[0].id, evidenceQuote: input.source.body, draft},
      {projectId: 'another-owners-project', evidenceQuote: input.source.body, draft}]}, model: 'fixture'};
  }) as typeof openai.json;
});
after(async () => {openai.json = original; await q('select 1'); await memory.close();});

test('projects: connections are owner-scoped and private notes cannot cross spaces', async () => {
  const store = (await loadWorkspace(owner)).store;
  const p = await saveProject(owner, {name: 'MOONS', goal: '생각을 실제 작업으로 연결', repository: '', website: '', noteIds: []}, store);
  projectId = p.id;
  await saveProject(other, {name: 'Other private project', goal: 'Private', repository: ''}, (await loadWorkspace(other)).store);
  await assert.rejects(() => getProject(other, projectId), (e: {status: number}) => e.status === 404);
  await assert.rejects(() => saveProject(other, {name: 'X', goal: 'X', noteIds: ['private-note']}, store), (e: {status: number}) => e.status === 404);
  await assert.rejects(() => saveProject(owner, {name: 'X', goal: 'X', website: 'javascript:alert(1)'}, store));
  await assert.rejects(() => saveProject(owner, {name: 'X', goal: 'X', contextPaths: ['../.env']}, store));
  const key = 'github-test-secret'; await setGithubKey(owner, projectId, key);
  const publicData = await getProject(owner, projectId);
  assert.equal(publicData.githubConnected, true); assert.ok(!JSON.stringify(publicData).includes(key));
});

test('projects: a tagged dump is queued atomically; unrelated edits do not repeat it', async () => {
  const current = await loadWorkspace(owner), store = structuredClone(current.store);
  store.settings = {...store.settings, satellites: ['projects']} as typeof store.settings;
  entryId = newId(); const body = '내 아이디어를 프로젝트에 연결해서 검토안을 만들자.';
  store.entries.push({id: entryId, kind: 'dump', body, sentences: [body], planetIds: [], projectIds: [projectId], locked: true, status: 'saved', createdAt: new Date().toISOString()});
  assert.equal(changedProjectSparks(current.store, store).length, 1);
  await persistWorkspace(owner, current.revision, validateStore(store, current.store));
  const again = await loadWorkspace(owner);
  await persistWorkspace(owner, again.revision, again.store);
  assert.equal((await q('select id from project_jobs where owner_id=$1', [owner])).length, 1);
  const changed = structuredClone(store); changed.entries[0]!.body = 'rewritten';
  assert.throws(() => validateStore(changed, store));
});

test('projects: worker creates grounded proposals and notices, rejects foreign IDs and invented code paths', async () => {
  assert.equal(await runProjectJob(), true);
  const hub = await projectHub(owner);
  proposal = hub.proposals[0]!;
  assert.equal(hub.proposals.length, 1); assert.equal(proposal.match, 'tagged'); assert.equal(proposal.notice, 'new');
  assert.deepEqual(proposal.draft.codePaths, []);
  assert.equal(hub.jobs[0]!.state, 'complete');
  assert.equal((await projectHub(other)).proposals.length, 0);
  assert.equal(await runProjectJob(), false);
  await assert.rejects(() => getProposal(other, proposal.id), (e: {status: number}) => e.status === 404);
});

test('projects: discussion revises but cannot approve; unresolved questions block confirmation', async () => {
  await assert.rejects(() => proposalAction(owner, proposal.id, {action: 'confirm', revision: proposal.revision}), /questions/);
  proposal = await discussProposal(owner, proposal.id, proposal.revision, '검토안 준비 때만 알려줘.');
  assert.equal(proposal.status, 'review'); assert.equal(proposal.briefs.length, 0); assert.equal(proposal.messages.length, 2);
  await assert.rejects(() => proposalAction(owner, proposal.id, {action: 'confirm', revision: 1}), (e: {status: number}) => e.status === 409);
  proposal = await proposalAction(owner, proposal.id, {action: 'confirm', revision: proposal.revision});
  assert.equal(proposal.status, 'confirmed'); assert.equal(proposal.briefs.length, 1);
  assert.match(proposal.briefs[0]!.markdown, /내 아이디어를 프로젝트/);
  assert.match(proposal.briefs[0]!.markdown, /No automatic merge or deployment/);
  await assert.rejects(() => proposalAction(owner, proposal.id, {action: 'edit', revision: proposal.revision, draft}));
});

test('projects: reopening keeps approved snapshots immutable and results bind to a version', async () => {
  const frozen = structuredClone(proposal.briefs[0]!);
  proposal = await proposalAction(owner, proposal.id, {action: 'handoff', revision: proposal.revision});
  proposal = await proposalAction(owner, proposal.id, {action: 'result', revision: proposal.revision, briefId: frozen.id, text: 'Tests passed according to the agent.', url: 'https://github.com/1dyne/moons/pull/1'});
  assert.equal(proposal.status, 'reported'); assert.equal(proposal.results[0]!.evidence, 'reported');
  proposal = await proposalAction(owner, proposal.id, {action: 'reopen', revision: proposal.revision});
  proposal = await proposalAction(owner, proposal.id, {action: 'edit', revision: proposal.revision, draft: {...draft, questions: [], title: '두 번째 검토안'}});
  proposal = await proposalAction(owner, proposal.id, {action: 'confirm', revision: proposal.revision});
  assert.deepEqual(proposal.briefs[0], frozen); assert.equal(proposal.briefs[1]!.version, 2);
  assert.notEqual(proposal.briefs[1]!.digest, frozen.digest);
  await assert.rejects(() => proposalAction(other, proposal.id, {action: 'result', revision: proposal.revision, briefId: frozen.id, text: 'stolen', url: ''}));
});

test('projects: project tokens isolate telemetry, deduplicate retries, revoke and preserve cost basis', async () => {
  const {token} = await rotateTelemetry(owner, projectId); assert.ok(token);
  const event = {id: 'cost-request-1', kind: 'cost', name: 'API', value: 0.02, unit: 'USD', at: new Date().toISOString(), basis: 'estimated', source: 'OpenAI'};
  assert.equal((await acceptEvent(token!, event)).accepted, true);
  assert.equal((await acceptEvent(token!, event)).accepted, false);
  assert.equal((await projectHub(owner)).events[0]!.basis, 'estimated');
  assert.equal((await projectHub(other)).events.length, 0);
  assert.ok(!JSON.stringify(await projectHub(owner)).includes(token!));
  assert.throws(() => parseEvent({...event, value: NaN}, projectId));
  assert.throws(() => parseEvent({...event, at: 'invalid'}, projectId));
  await rotateTelemetry(owner, projectId, true);
  await assert.rejects(() => acceptEvent(token!, {...event, id: 'after-revoke'}), (e: {status: number}) => e.status === 401);
});

test('projects: disabled satellite does not queue background analysis', () => {
  const before = initialWorkspace(), next = structuredClone(before);
  next.entries.push({id: 'disabled', kind: 'dump', body: 'idea', sentences: ['idea'], planetIds: [], locked: true, status: 'saved', createdAt: new Date().toISOString()});
  assert.deepEqual(changedProjectSparks(before, next), []);
});

test('projects: untagged ideas use matching and an in-flight pause cancels publication', async () => {
  const current=await loadWorkspace(owner), store=structuredClone(current.store);
  const idea:Entry={id:newId(),kind:'dump',body:'A fresh applicable idea',sentences:['A fresh applicable idea'],planetIds:[],locked:true,status:'saved',createdAt:new Date().toISOString()};
  store.entries.push(idea);
  await persistWorkspace(owner,current.revision,validateStore(store,current.store));
  await runProjectJob();
  assert.equal((await projectHub(owner)).proposals.find(p=>p.entryId===idea.id)?.match,'suggested');
  const latest=await loadWorkspace(owner), next=structuredClone(latest.store);
  const cancelled={...idea,id:newId(),body:'Cancel this while inference runs',sentences:['Cancel this while inference runs']};
  next.entries.push(cancelled);
  await persistWorkspace(owner,latest.revision,validateStore(next,latest.store));
  const fixture=openai.json;
  openai.json=(async task=>{
    const result=await fixture(task);
    if(task.name==='moons_project_review'){
      const p=await getProject(owner,projectId);
      await saveProject(owner,{...p,watch:false},(await loadWorkspace(owner)).store,projectId);
    }
    return result;
  }) as typeof openai.json;
  try {await runProjectJob();} finally {openai.json=fixture;}
  assert.ok(!(await projectHub(owner)).proposals.some(p=>p.entryId===cancelled.id));
});

test('projects: cost increments sum while repeated billing snapshots use the latest value', async()=>{
  const {token}=await rotateTelemetry(owner,projectId);
  const event={kind:'cost',name:'Billing',unit:'USD',basis:'reported',source:'invoice',aggregation:'latest'};
  await acceptEvent(token!,{...event,id:'invoice-old',value:20,at:new Date(Date.now()-10000).toISOString()});
  await acceptEvent(token!,{...event,id:'invoice-new',value:25,at:new Date().toISOString()});
  const increment={...event,name:'requests',source:'app',aggregation:'sum'};
  await acceptEvent(token!,{...increment,id:'r1',value:0.01,at:new Date().toISOString()});
  await acceptEvent(token!,{...increment,id:'r2',value:0.02,at:new Date().toISOString()});
  const events=(await projectHub(owner)).events;
  assert.equal(events.find(e=>e.name==='Billing')?.value,25);
  assert.equal(events.find(e=>e.name==='requests')?.value,0.03);
});

test('projects: anonymous project data follows an account claim across devices', async () => {
  await claimWorkspace('project-user', 'project-user@example.invalid', other);
  await claimWorkspace('project-user', 'project-user@example.invalid', owner);
  assert.equal((await getProject(other, projectId)).name, 'MOONS');
  assert.equal((await getProposal(other, proposal.id)).briefs.length, 2);
  assert.equal((await projectHub(other)).events.length, 3);
  await assert.rejects(() => getProject(owner, projectId), (e: {status: number}) => e.status === 404);
});
