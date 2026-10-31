import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync} from 'node:fs';
import {weekBasic, buildNow, goalProgress, routineRate, ALL_SCOPES, type LifeRecord} from './index.ts';

const fx = weekBasic();
test('fixture: revisions are unique and increasing; corrections keep history', () => {
  const revs = fx.history.map(r => r.revision);
  assert.deepEqual(revs, [...revs].sort((a, b) => a - b));
  assert.equal(new Set(revs).size, revs.length);
  assert.ok(fx.history.length > fx.records.length);
  assert.ok(fx.records.some(r => r.deletedAt));
});
test('fixture: roll-up counts done and partial words, skips the empty day', () => {
  const month = fx.records.find(r => r.kind === 'goal' && r.body.horizon === 'month') as LifeRecord<'goal'>;
  assert.equal(goalProgress(month, fx.records, '')!.amount, 40 * 4 + 15); // Nov 1 is outside the October goal
  assert.deepEqual(routineRate(fx.records, '2026-10-26'), {basis: 'committed_today', done: 1, of: 2});
  assert.equal(fx.records.filter(r => r.logicalDay === '2026-10-29').length, 0);
});
test('fixture: now snapshot for the last day, and the JSON file is current', () => {
  const now = buildNow(fx.records, fx.settings, new Date('2026-11-01T14:00:00+09:00'), {revision: fx.records.at(-1)!.revision, scopes: ALL_SCOPES, modules: fx.modules, lastActivityAt: fx.records.at(-1)!.updatedAt});
  assert.equal(now.user.logicalDay, '2026-11-01');
  assert.deepEqual(now.condition, {state: 'unset'});
  const file = new URL('../fixtures/week-basic.json', import.meta.url);
  const json = JSON.stringify({...fx, nowExample: now}, null, 1) + '\n';
  if (process.env.WRITE_FIXTURES) writeFileSync(file, json);
  assert.equal(readFileSync(file, 'utf8'), json, 'Run WRITE_FIXTURES=1 pnpm test to refresh fixtures/week-basic.json');
});
