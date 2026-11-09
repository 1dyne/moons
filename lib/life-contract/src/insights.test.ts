import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBody, type AnyRecord, type Kind} from './records.ts';
import {capacity, dayCondition, efficiency, estimateAccuracy, goalChain, goalPercent, goalSchedule, personaShare, suggestGoal, unlinkedDone, weeklyFocus} from './insights.ts';
import {addDays} from './day.ts';

let rev = 0;
const rec = (kind: Kind, id: string, body: unknown, logicalDay: string | null = null) => ({id, kind, revision: ++rev, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z', deletedAt: null, logicalDay, tz: 'Asia/Seoul', source: {type: 'planner', confirmed: true}, body: parseBody(kind, body)}) as AnyRecord;
const D = '2026-11-09';
const records = [
  rec('persona', 'P1', {name: '수험생'}), rec('persona', 'P2', {name: '직장인'}),
  rec('goal', 'Y', {title: '로스쿨 합격', horizon: 'year', period: '2027'}),
  rec('goal', 'M1', {title: 'LEET 기출 1회독', horizon: 'milestone', period: '2026-12', parentGoalId: 'Y', weight: 2}),
  rec('goal', 'M2', {title: '자소서 초안', horizon: 'milestone', period: '2027-03', parentGoalId: 'Y', status: 'achieved'}),
  rec('task', 'T1', {title: '언어이해 1세트', goalIds: ['M1'], personaIds: ['P1'], plan: {state: 'committed', estimateMin: 60}, outcome: {result: 'done'}}, D),
  rec('task', 'T2', {title: '추리논증 1세트', goalIds: ['M1'], personaIds: ['P1'], plan: {state: 'committed', estimateMin: 60}}, D),
  rec('task', 'T3', {title: '회의', personaIds: ['P2'], plan: {state: 'committed', fixed: true, start: {value: '2026-11-09T10:00:00+09:00', precision: 'minute'}, end: {value: '2026-11-09T12:00:00+09:00', precision: 'minute'}}}, D),
  rec('session', 'S1', {taskId: 'T1', label: '언어이해 1세트', start: '2026-11-09T07:00:00+09:00', end: '2026-11-09T08:30:00+09:00', condition: 8}, D),
  rec('session', 'S2', {taskId: 'T3', label: '회의', start: '2026-11-09T10:00:00+09:00', end: '2026-11-09T10:30:00+09:00', condition: 3}, D),
  rec('condition', 'C1', {at: '2026-11-09T06:30:00+09:00', energy: 6, moment: 'wake'}, D),
];

test('goal percent rolls up milestones by weight; achieved counts 100', () => {
  assert.deepEqual(goalPercent('M1', records), {pct: 50, basis: 'tasks'});
  assert.deepEqual(goalPercent('Y', records), {pct: Math.round((50 * 2 + 100) / 3), basis: 'children'});
  const t1 = records.find(r => r.id === 'T1') as Parameters<typeof goalChain>[0];
  assert.deepEqual(goalChain(t1, records).map(c => c.map(g => g.id)), [['M1', 'Y']]);
});

test('day condition: wake score, minute-weighted timer scores, overall', () => {
  assert.deepEqual(dayCondition(records, D), {wake: 6, focus: 6.8, evening: null, score: 6.4, samples: 2});
});

test('capacity subtracts fixed appointments and scales by waking energy', () => {
  const c = capacity(records, D, {wake: '07:00', sleep: '23:00', energy: 6});
  assert.equal(c.awake, 960); assert.equal(c.fixedMin, 120); assert.equal(c.free, 840);
  assert.equal(c.realistic, Math.round(840 * .5)); assert.equal(c.planned, 60); assert.equal(c.over, 0);
});

test('estimate vs actual and persona share', () => {
  assert.deepEqual(estimateAccuracy(records, D, D).ratio, 1.5);
  const p = personaShare(records, D);
  assert.deepEqual(p.rows.map(r => [r.name, r.minutes, r.tasks, r.share]), [['수험생', 90, 2, 75], ['직장인', 30, 1, 25]]);
});

test('efficiency finds the better time of day and writes a tip', () => {
  const e = efficiency(records, D, D, 'Asia/Seoul');
  assert.equal(e.byTime.find(b => b.id === 'morning')!.minutes, 120);
  assert.equal(e.byTime.find(b => b.id === 'morning')!.condition, 6.8);
  assert.ok(e.tips[0]!.includes('오전'));
});

test('schedule: milestones from all goals share one weekly budget; late goals and bottleneck months show up', () => {
  const day = '2026-11-01';
  const rs = [
    rec('goal', 'A', {title: '로스쿨', horizon: 'year', period: '2027', deadline: '2027-01'}),
    rec('goal', 'A1', {title: '기출 1회독', horizon: 'milestone', period: '2026-12', parentGoalId: 'A', effortHours: 40}),
    rec('goal', 'B', {title: '책 쓰기', horizon: 'year', period: '2027', deadline: '2027-06'}),
    rec('goal', 'B1', {title: '초고 절반', horizon: 'milestone', period: '2026-12', parentGoalId: 'B', effortHours: 30}),
    rec('goal', 'B2', {title: '퇴고', horizon: 'milestone', period: '2027-05', parentGoalId: 'B'}),
  ];
  const s = goalSchedule(rs, day, 300); // 5h a week
  assert.equal(s.unestimated, 1);
  assert.deepEqual(s.rows.map(r => r.id), ['A1', 'B1']); // same due month: weight tie keeps due order
  assert.equal(s.rows[0]!.finish, addDays(day, Math.ceil(2400 / (300 / 7))));
  assert.ok(s.goals.find(g => g.id === 'B')!.projected > '2026-12-31');
  assert.ok(s.bottlenecks.length > 0 && s.bottlenecks[0]!.goals.length === 2);
  assert.equal(weeklyFocus(rs, day), 600);
});

test('a new task suggests the goal it shares words with; finished unlinked tasks are listed', () => {
  const day = '2026-11-09';
  const rs = [
    rec('goal', 'Y', {title: '로스쿨 합격', horizon: 'year', period: '2027'}),
    rec('goal', 'M1', {title: '언어이해 기출 5개년 1회독', horizon: 'milestone', period: '2026-12', parentGoalId: 'Y'}),
    rec('goal', 'M2', {title: '추리논증 기출 1회독', horizon: 'milestone', period: '2027-01', parentGoalId: 'Y'}),
    rec('task', 'T1', {title: '보고서', plan: {state: 'committed'}, outcome: {result: 'done'}}, day),
  ];
  assert.equal(suggestGoal(rs, day, '언어이해 2024 1세트')?.id, 'M1');
  assert.equal(suggestGoal(rs, day, '추리논증 오답 정리')?.id, 'M2');
  assert.equal(suggestGoal(rs, day, '장보기'), null);
  assert.deepEqual(unlinkedDone(rs, day).map(t => t.id), ['T1']);
});
