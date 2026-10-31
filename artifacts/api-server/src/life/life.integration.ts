import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA, newId, type Driver} from '../moons/lib/server/db.ts';
import {TEMPLATES} from '@workspace/planner-spec';
import {buildNow, ALL_SCOPES} from '@workspace/life-contract';
import {changesSince, deleteRecord, getSettings, getSpec, listRecords, putSettings, recordHistory, saveSpec, writeRecord, allRecords} from './store.ts';

const memory = new PGlite(); let owner: string, other: string;
before(async () => {
  await memory.exec(SCHEMA);
  const driver: Driver = {query: (s, p) => memory.query(s, p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s, p) => tx.query(s, p) as ReturnType<Driver['query']>}))};
  (globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve(driver);
  owner = newId(); other = newId();
});

test('settings and spec versions', async () => {
  assert.equal((await getSettings(owner)).configured, false);
  await putSettings(owner, {tz: 'Asia/Seoul', dayBoundary: '04:00'});
  await assert.rejects(putSettings(owner, {tz: 'Mars/Base', dayBoundary: '04:00'}), /time zone/);
  assert.equal((await saveSpec(owner, TEMPLATES[1]!.spec)).version, 1);
  assert.equal((await saveSpec(owner, {...TEMPLATES[1]!.spec, name: '바뀐 이름'})).version, 2);
  assert.equal((await getSpec(owner))!.spec.name, '바뀐 이름');
  await assert.rejects(saveSpec(owner, {specVersion: 1}), /Invalid planner spec/);
});

test('writes get stable ids and increasing revisions; stale writes and kind changes are refused', async () => {
  const goal = await writeRecord(owner, null, {kind: 'goal', body: {title: '단어 1000개', horizon: 'month', period: '2026-10', target: {amount: 1000, unit: '단어', aggregation: 'sum'}}});
  assert.match(goal.id, /^[0-9A-Z]{26}$/);
  const task = await writeRecord(owner, null, {kind: 'task', logicalDay: '2026-10-31', body: {title: '단어 50개', goalIds: [goal.id], plan: {state: 'committed', target: {amount: 50, unit: '단어'}}}});
  assert.equal(task.revision, goal.revision + 1);
  assert.equal((task.body as {outcome: {result: string}}).outcome.result, 'unknown');
  const done = await writeRecord(owner, task.id, {kind: 'task', logicalDay: '2026-10-31', baseRevision: task.revision, body: {...task.body, outcome: {result: 'done', amount: 50, unit: '단어'}}});
  assert.equal(done.id, task.id); assert.equal(done.createdAt, task.createdAt);
  await assert.rejects(writeRecord(owner, task.id, {kind: 'task', baseRevision: task.revision, body: task.body}), /changed elsewhere/);
  await assert.rejects(writeRecord(owner, task.id, {kind: 'goal', body: {title: 'x', horizon: 'year', period: '2026'}}), /change its kind/);
  await assert.rejects(writeRecord(owner, null, {kind: 'task', body: {title: ''}}), /Invalid task/);
  assert.deepEqual((await recordHistory(owner, task.id)).map(r => (r.body as {outcome: {result: string}}).outcome.result), ['unknown', 'done']);

  const snapshot = buildNow(await allRecords(owner), await getSettings(owner), new Date('2026-10-31T13:00:00Z'), {revision: done.revision, scopes: ALL_SCOPES, modules: {sleep: false, condition: true}, lastActivityAt: null});
  assert.ok(!('state' in snapshot.goals) && snapshot.goals[0]!.progress === '50/1000 단어');
});

test('deletes are tombstones in changes; another account sees nothing', async () => {
  const {items} = await listRecords(owner, {from: '2026-10-31', to: '2026-10-31'});
  assert.deepEqual(items.map(r => r.kind).sort(), ['goal', 'task']);
  const task = items.find(r => r.kind === 'task')!;
  const before = (await changesSince(owner, 0)).nextSince;
  await deleteRecord(owner, task.id);
  const after = await changesSince(owner, before);
  assert.equal(after.items.length, 1); assert.ok(after.items[0]!.deletedAt);
  assert.equal((await listRecords(owner, {from: '2026-10-31', to: '2026-10-31', kinds: ['task']})).items.length, 0);
  await assert.rejects(writeRecord(owner, task.id, {kind: 'task', body: {title: 'x'}}), /deleted/);
  assert.equal((await changesSince(other, 0)).items.length, 0);
  await assert.rejects(deleteRecord(other, task.id), /not found/);
});
