import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBody, type AnyRecord, type Kind} from '@workspace/life-contract';
import {deployedOver, energyPoints, focusReachedAt, goalActualMin, lightOf, missionState, roi} from './lifeLogic.ts';

let n = 0;
const rec = (kind: Kind, body: unknown, logicalDay: string | null = null, extra: Partial<AnyRecord> = {}) => ({id: `R${++n}`, kind, revision: n, createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', deletedAt: null, logicalDay, tz: 'Asia/Seoul', source: {type: 'planner', confirmed: true}, body: parseBody(kind, body), ...extra}) as AnyRecord;
const D = '2026-11-10';

test('energy light: points from timer-stop scores and checks, coloured 7↑ blue, 4–6 amber, 3↓ red', () => {
  const rs = [rec('session', {label: '기출', start: '2026-11-10T00:00:00Z', end: '2026-11-10T01:00:00Z', condition: 8}, D), rec('condition', {at: '2026-11-10T05:00:00Z', energy: 5, moment: 'check'}, D)];
  const pts = energyPoints(rs, D);
  assert.deepEqual(pts.map(p => p.score), [8, 5]);
  assert.deepEqual([lightOf(8), lightOf(5), lightOf(3)], ['blue', 'amber', 'red']);
});

test('mission: whichever fills first wins, and free time starts from that moment', () => {
  const rs = [
    rec('session', {label: 'a', start: '2026-11-10T00:00:00Z', end: '2026-11-10T05:00:00Z'}, D),
    rec('session', {label: 'b', start: '2026-11-10T06:00:00Z', end: '2026-11-10T10:00:00Z'}, D),
    rec('task', {title: '기출', category: 'must', plan: {state: 'committed'}, outcome: {result: 'done', completedAt: '2026-11-10T11:00:00Z'}}, D),
    rec('task', {title: '영화', category: 'want', plan: {state: 'committed'}}, D),
  ];
  assert.equal(focusReachedAt(rs, D, 480), '2026-11-10T09:00:00.000Z');
  const m = missionState(rs, D, 480, new Date('2026-11-10T12:00:00Z'));
  assert.equal(m.plan, 1, 'want is not part of 일정'); assert.equal(m.winner, 'focus'); assert.equal(m.wonAt, '2026-11-10T09:00:00.000Z');
  const early = missionState(rs, D, 600, new Date('2026-11-10T12:00:00Z'));
  assert.equal(early.winner, 'plan');
});

test('persona limit counts only deployed; goal effort sums sessions under the goal; ROI = impact ÷ hours', () => {
  const m = '2026-11';
  const ps = [1, 2, 3, 4].map(i => rec('persona', {name: `P${i}`, months: {[m]: {status: i < 4 ? 'deployed' : 'attached'}}}));
  assert.deepEqual(deployedOver(ps as never, m, 3), {count: 3, over: false});
  assert.equal(deployedOver(ps as never, m, 2).over, true);
  const top = rec('goal', {title: 'LEET', horizon: 'year', period: '2027'}), ms = rec('goal', {title: '1회독', horizon: 'milestone', period: '2026-11', parentGoalId: top.id});
  const t = rec('task', {title: '기출', goalIds: [ms.id]}, D);
  const s = rec('session', {taskId: t.id, label: '기출', start: '2026-11-10T00:00:00Z', end: '2026-11-10T02:00:00Z'}, D);
  assert.equal(goalActualMin([top, ms, t, s], top.id), 120);
  assert.equal(roi(8, 120), 4); assert.equal(roi(null, 120), null);
});
