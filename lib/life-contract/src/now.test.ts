import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ALL_SCOPES, TaskBody, type AnyRecord, type Kind, parseBody, shareable} from './records.ts';
import {buildNow, goalProgress, routineRate} from './now.ts';
import {isoWeek, logicalDay, periodContains} from './day.ts';

const settings = {tz: 'Asia/Seoul', dayBoundary: '04:00'};
let rev = 0;
const rec = (kind: Kind, id: string, body: unknown, logicalDay: string | null = null, extra: Partial<AnyRecord> = {}) => ({
  id, kind, revision: ++rev, createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T01:00:00Z', deletedAt: null, logicalDay, tz: settings.tz,
  source: {type: 'planner', confirmed: true}, body: parseBody(kind, body), ...extra,
}) as AnyRecord;

test('logical day honours the day boundary in the user time zone', () => {
  assert.equal(logicalDay('2026-10-31T17:30:00Z', settings), '2026-10-31'); // 02:30 KST on Nov 1 → still Oct 31
  assert.equal(logicalDay('2026-10-31T19:30:00Z', settings), '2026-11-01'); // 04:30 KST
  assert.equal(isoWeek('2026-10-31'), '2026-W44');
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.ok(periodContains('2026-Q4', '2026-11-02') && !periodContains('2026-Q3', '2026-11-02'));
});

test('a new task is unknown, not undone', () => {
  assert.equal(TaskBody.parse({title: 'x'}).outcome.result, 'unknown');
});

const records = [
  rec('goal', 'Y', {title: 'TEPS 600', horizon: 'year', period: '2026'}),
  rec('goal', 'M', {title: '단어 1000개', horizon: 'month', period: '2026-10', parentGoalId: 'Y', target: {amount: 1000, unit: '단어', aggregation: 'sum'}}),
  rec('routine', 'R1', {title: '스트레칭', recurrence: {freq: 'daily'}, mode: 'pick_daily'}),
  rec('routine', 'R2', {title: '명상', recurrence: {freq: 'daily'}, mode: 'pick_daily'}),
  rec('task', 'T1', {title: '단어 50개', category: 'must', goalIds: ['M'], plan: {state: 'committed', target: {amount: 50, unit: '단어'}}, outcome: {result: 'done', amount: 50, unit: '단어'}}, '2026-10-31'),
  rec('task', 'T2', {title: '단어 복습', goalIds: ['M'], plan: {state: 'committed', target: {amount: 30, unit: '단어'}}, outcome: {result: 'partial', amount: 10}}, '2026-10-30'),
  rec('task', 'T3', {title: '스트레칭', routineId: 'R1', plan: {state: 'committed'}, outcome: {result: 'done'}}, '2026-10-31'),
  rec('task', 'T4', {title: '운동', category: 'want', plan: {state: 'committed'}}, '2026-10-31'),
  rec('task', 'T5', {title: '지운 일', goalIds: ['M'], plan: {state: 'committed'}, outcome: {result: 'done', amount: 500, unit: '단어'}}, '2026-10-31', {deletedAt: '2026-10-31T02:00:00Z'}),
  rec('session', 'S1', {taskId: 'T1', label: '단어 50개', start: '2026-10-31T10:00:00Z', end: '2026-10-31T10:50:00Z'}, '2026-10-31'),
  rec('session', 'S2', {taskId: 'T4', label: '운동', start: '2026-10-31T12:40:00Z'}, '2026-10-31'),
  rec('condition', 'C1', {at: '2026-10-31T02:00:00Z', energy: 3, mood: '피곤'}, '2026-10-31', {privateFields: ['mood']}),
];

test('goal progress sums linked outcomes, skips deleted tasks, and rolls up to the year goal', () => {
  const month = records.find(r => r.id === 'M') as Parameters<typeof goalProgress>[0];
  assert.deepEqual(goalProgress(month, records, 'now'), {amount: 60, unit: '단어', asOf: 'now', basis: 'linked_outcomes'});
});

test('pick_daily routines count only what was picked today', () => {
  assert.deepEqual(routineRate(records, '2026-10-31'), {basis: 'committed_today', done: 1, of: 1});
});

test('now: unknown stays unknown, private fields and unshared kinds are withheld', () => {
  const at = new Date('2026-10-31T13:05:00Z');
  const full = buildNow(records, settings, at, {revision: rev, scopes: ALL_SCOPES, modules: {sleep: false, condition: true}, lastActivityAt: null});
  assert.ok(!('state' in full.today));
  if (!('state' in full.today)) {
    assert.deepEqual(full.today.tasks.map(t => [t.id, t.result]), [['T1', 'done'], ['T3', 'done'], ['T4', 'unknown']]);
    assert.equal(full.today.tasks[0]!.amount, '50 단어');
  }
  assert.deepEqual(full.condition, {state: 'ok', energy: 3, mood: null, at: '2026-10-31T02:00:00Z'});
  assert.deepEqual(full.sleep, {state: 'unset'});
  const planOnly = buildNow(records, settings, at, {revision: rev, scopes: ['life.read.plan'], modules: {sleep: true, condition: true}, lastActivityAt: null});
  if (!('state' in planOnly.today)) assert.equal(planOnly.today.tasks[0]!.result, 'not_shared');
  assert.deepEqual(planOnly.condition, {state: 'not_shared'});
  assert.equal(shareable(records.find(r => r.id === 'C1')!, ['life.read.plan']), null);
});

test('focus: the running session counts up to now and is reported as active', () => {
  const at = new Date('2026-10-31T13:05:00Z');
  const n = buildNow(records, settings, at, {revision: rev, scopes: ALL_SCOPES, modules: {sleep: false, condition: true, timer: true}, lastActivityAt: null});
  assert.ok(n.focus.state === 'ok');
  if (n.focus.state === 'ok') {
    assert.equal(n.focus.todayMinutes, 75);
    assert.deepEqual(n.focus.active, {sessionId: 'S2', taskId: 'T4', title: '운동', startedAt: '2026-10-31T12:40:00Z', minutes: 25});
    assert.deepEqual(n.focus.byTask.map(r => [r.title, r.minutes]), [['단어 50개', 50], ['운동', 25]]);
  }
  assert.deepEqual(buildNow(records, settings, at, {revision: rev, scopes: ['life.read.plan'], modules: {sleep: false, condition: false, timer: true}, lastActivityAt: null}).focus, {state: 'not_shared'});
});
