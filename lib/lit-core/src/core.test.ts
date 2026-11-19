import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ulid, v2, type AnyRecord, type LifeRecord} from '@workspace/life-contract';
import {aggregate, applyValues, nest, title, buildWorkspace, evalSignal, expr, inferDatabase, itemView, mergeProperty, onItemWrite, onMoment, parseCapture, preview, query, suggestions, tidyReport, value, withItem, type Ctx, type Item} from './index.ts';

// The tests build their own databases. Words like 하루 일과 or 목표 appear only here, never in the engine.
let n = 0;
function rec<K extends v2.V2Kind>(kind: K, body: unknown, logicalDay: string | null = null): LifeRecord<K> {
  n++;
  const at = new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString();
  return {id: ulid(Date.UTC(2026, 10, 1) + n), kind, revision: n, createdAt: at, updatedAt: at, deletedAt: null, logicalDay, tz: 'Asia/Seoul', source: {type: 'planner', confirmed: true}, body: v2.V2_BODIES[kind].parse(body)} as unknown as LifeRecord<K>;
}
const ctx: Ctx = {today: '2026-11-17', now: new Date('2026-11-17T03:00:00Z')};
const prop = (name: string, kind: v2.PropertyKind, x: Record<string, unknown> = {}) => rec('property', {name, kind, ...x});
const set = (item: Item, values: Record<string, v2.CellValue>): Item => ({...item, revision: item.revision + 1, body: applyValues(item.body, values)});

function planner() {
  const title = prop('이름', 'title', {role: 'title'}), day = prop('날짜', 'date', {role: 'day'});
  const start = prop('시작', 'datetime', {role: 'start'}), end = prop('끝', 'datetime', {role: 'end'});
  const state = prop('상태', 'select', {role: 'done', options: [{id: 'todo', name: '할 일', meaning: 'open'}, {id: 'did', name: '한 일', meaning: 'done'}, {id: 'part', name: '일부', meaning: 'open'}, {id: 'drop', name: '취소', meaning: 'skip'}]});
  const est = prop('예상', 'duration');
  const goalLink = prop('목표', 'relation');
  const spent = prop('소요', 'formula', {formula: {op: 'diff', a: end.id, b: start.id}});
  const gap = prop('예상 대비', 'formula', {formula: {op: 'expr', expr: `{${spent.id}} - {${est.id}}`}});
  const progress = prop('진행률', 'formula', {unit: '%', formula: {op: 'rollup', via: goalLink.id, back: true, agg: 'doneRatio'}});
  const daily = rec('database', {name: '하루 일과', properties: [title.id, day.id, start.id, end.id, state.id, est.id, goalLink.id, spent.id, gap.id]});
  const goals = rec('database', {name: '목표', properties: [title.id, progress.id]});
  return {title, day, start, end, state, est, goalLink, spent, gap, progress, daily, goals};
}

test('checking a line moves the progress of what it is linked to (rollup of done meaning)', () => {
  const p = planner();
  const g = rec('item', {dbs: [p.goals.id], values: {[p.title.id]: '시험 준비'}});
  const t1 = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: 'a', [p.state.id]: 'did', [p.goalLink.id]: [g.id]}}, '2026-11-17');
  const t2 = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: 'b', [p.state.id]: 'todo', [p.goalLink.id]: [g.id]}}, '2026-11-17');
  const t3 = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: 'c', [p.state.id]: 'drop', [p.goalLink.id]: [g.id]}}, '2026-11-17');
  let ws = buildWorkspace([...Object.values(p), g, t1, t2, t3] as AnyRecord[]);
  assert.equal(value(ws, ws.items.get(g.id)!, p.progress.id), 50, 'one of two counted lines is done; the cancelled one does not count');
  ws = withItem(ws, set(t2, {[p.state.id]: 'did'}));
  assert.equal(value(ws, ws.items.get(g.id)!, p.progress.id), 100);
});

test('renaming properties and options changes nothing that is computed or filtered', () => {
  const p = planner();
  const t = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: 'a', [p.state.id]: 'did'}}, '2026-11-17');
  const lens = rec('lens', {name: '끝낸 것', where: [{prop: p.state.id, op: 'is', value: 'did'}]});
  const renamed = {...p.state, body: {...p.state.body, name: 'Status', options: p.state.body.options.map(o => ({...o, name: o.name + '!'}))}};
  for (const s of [p.state, renamed]) {
    const ws = buildWorkspace([...Object.values(p), s, t, lens] as AnyRecord[]);
    assert.deepEqual(query(ws, {lens: lens.id}, ctx).map(x => x.id), [t.id]);
    assert.equal(itemView(ws, ws.items.get(t.id)!, ctx).done, 'done');
  }
});

test('items can live without a database; lit suggests a database from what they use', () => {
  const weight = prop('무게', 'number'), reps = prop('횟수', 'number'), note = prop('메모', 'text');
  const a = rec('item', {text: '스쿼트', values: {[weight.id]: 60, [reps.id]: 5}}, '2026-11-16');
  const b = rec('item', {text: '데드', values: {[weight.id]: 80, [reps.id]: 3, [note.id]: '허리'}}, '2026-11-17');
  const ws = buildWorkspace([weight, reps, note, a, b]);
  assert.deepEqual(query(ws, {where: [{on: 'db', op: 'is', value: '@none'}]}, ctx).length, 2);
  const s = inferDatabase(ws, [a.id, b.id]);
  assert.deepEqual(s.suggested.sort(), [weight.id, reps.id, note.id].sort().filter(id => id !== note.id).concat(note.id).sort());
  assert.equal(s.properties.find(x => x.id === note.id)!.share, 50);
  assert.ok(tidyReport(ws).untaggedItems.includes(a.id));
});

test('a condition on a role matches across databases; every item lands on a day', () => {
  const p = planner();
  const other = rec('database', {name: '다른 것', properties: [p.title.id, p.state.id]});
  const x = rec('item', {dbs: [p.daily.id], values: {[p.day.id]: '2026-11-17', [p.state.id]: 'todo'}});
  const y = rec('item', {dbs: [other.id], values: {[p.state.id]: 'todo'}}, '2026-11-17'); // no day property: the day it was written
  const z = rec('item', {dbs: [other.id], values: {[p.state.id]: 'did'}}, '2026-11-17');
  const w = rec('item', {dbs: [p.daily.id], values: {[p.day.id]: '2026-11-18', [p.state.id]: 'todo'}});
  const ws = buildWorkspace([...Object.values(p), other, x, y, z, w] as AnyRecord[]);
  const today = query(ws, {where: [{role: 'day', op: 'is', value: '@today'}, {role: 'done', op: 'is', value: '@open'}]}, ctx).map(i => i.id);
  assert.deepEqual(today.sort(), [x.id, y.id].sort());
});

test('formulas: time difference, developer expression, last time\'s value', () => {
  const p = planner();
  const t = rec('item', {dbs: [p.daily.id], values: {[p.start.id]: '2026-11-17T00:00:00Z', [p.end.id]: '2026-11-17T01:30:00Z', [p.est.id]: 60}});
  let ws = buildWorkspace([...Object.values(p), t] as AnyRecord[]);
  assert.equal(value(ws, t, p.spent.id), 90);
  assert.equal(value(ws, t, p.gap.id), 30);
  assert.equal(expr('(2 + 3) * 4 / 2', () => null), 10);
  assert.equal(expr('2 +', () => null), null);
  const kind = prop('종목', 'relation'), weight = prop('무게', 'number');
  const before = prop('지난번 무게', 'formula', {formula: {op: 'latest', of: weight.id, match: kind.id}});
  const squat = rec('item', {text: '스쿼트'});
  const s1 = rec('item', {values: {[kind.id]: [squat.id], [weight.id]: 55, [p.start.id]: '2026-11-10T00:00:00Z'}});
  const s2 = rec('item', {values: {[kind.id]: [squat.id], [weight.id]: 60, [p.start.id]: '2026-11-14T00:00:00Z'}});
  const s3 = rec('item', {values: {[kind.id]: [squat.id], [p.start.id]: '2026-11-17T00:00:00Z'}});
  ws = buildWorkspace([...Object.values(p), kind, weight, before, squat, s1, s2, s3] as AnyRecord[]);
  assert.equal(value(ws, s3, before.id), 60);
  assert.equal(value(ws, s1, before.id), null);
  assert.equal(aggregate(ws, [s1, s2, s3], 'max', weight.id), 60);
});

test('archived items leave every view and sum unless a lens asks for them', () => {
  const p = planner();
  const a = rec('item', {dbs: [p.daily.id], values: {[p.state.id]: 'did'}, archived: true}, '2026-11-01');
  const b = rec('item', {dbs: [p.daily.id], values: {[p.state.id]: 'todo'}}, '2026-11-17');
  const old = rec('lens', {name: '보관함', archived: true, where: [{prop: p.state.id, op: 'is', value: '@done'}]});
  const ws = buildWorkspace([...Object.values(p), a, b, old] as AnyRecord[]);
  assert.deepEqual(query(ws, {dbs: [p.daily.id]}, ctx).map(x => x.id), [b.id]);
  assert.deepEqual(query(ws, {lens: old.id}, ctx).map(x => x.id), [a.id]);
});

test('rules: enter fires once, suggest mode only suggests, preview shows what would change', () => {
  const p = planner();
  const cat = prop('분류', 'select', {options: [{id: 'must', name: '필수'}, {id: 'want', name: '희망'}]});
  const t = rec('item', {dbs: [p.daily.id], values: {[p.state.id]: 'todo', [cat.id]: 'must'}}, '2026-11-17');
  const party = rec('rule', {name: '끝내면', on: {kind: 'enter'}, source: {dbs: [p.daily.id], where: [{role: 'done', op: 'is', value: '@done'}]}, do: [{do: 'notify', text: '{title} 끝!'}, {do: 'effect', name: 'confetti'}]});
  const tidyUp = rec('rule', {name: '끝난 건 보관', mode: 'suggest', on: {kind: 'change'}, source: {dbs: [p.daily.id], where: [{role: 'done', op: 'is', value: '@done'}]}, do: [{do: 'archive'}]});
  const before = buildWorkspace([...Object.values(p), cat, t, party, tidyUp] as AnyRecord[]);
  const t2 = set(t, {[p.state.id]: 'did', [p.title.id]: '보고서'});
  const after = withItem(before, t2);
  const plans = onItemWrite(before, after, t, t2, ctx);
  const fired = plans.find(x => x.rule === party.id)!;
  assert.deepEqual(fired.effects.map(e => e.kind), ['notify', 'effect']);
  assert.equal((fired.effects[0] as {text: string}).text, '보고서 끝!');
  assert.equal(plans.find(x => x.rule === tidyUp.id)!.mode, 'suggest', 'the server applies auto plans only');
  // Written again while already done: enter does not fire again.
  const t3 = set(t2, {[cat.id]: 'want'});
  assert.equal(onItemWrite(after, withItem(after, t3), t2, t3, ctx).some(x => x.rule === party.id), false);
  assert.deepEqual(suggestions(after, ctx).map(x => x.writes[0]), [{op: 'archive', id: t.id}]);
  assert.equal(preview(after, tidyUp.id, ctx).length, 1);
});

test('day start: one item per source item, once a day (repeating lines are a rule, not a feature)', () => {
  const p = planner();
  const days = prop('요일', 'multi', {options: [0, 1, 2, 3, 4, 5, 6].map(i => ({id: String(i), name: String(i)}))});
  const from = prop('어디서 왔나', 'relation');
  const repeat = rec('database', {name: '반복', properties: [p.title.id, days.id]});
  const r1 = rec('item', {dbs: [repeat.id], values: {[p.title.id]: '스트레칭', [days.id]: ['2']}}); // 2026-11-17 is a Tuesday
  const r2 = rec('item', {dbs: [repeat.id], values: {[p.title.id]: '주말 청소', [days.id]: ['6']}});
  const rule = rec('rule', {on: {kind: 'dayStart'}, source: {dbs: [repeat.id], where: [{prop: days.id, op: 'contains', value: '@weekday'}]},
    do: [{do: 'createEach', dbs: [p.daily.id], link: from.id, values: {[p.title.id]: {copy: p.title.id}, [p.day.id]: {today: true}, [p.state.id]: {set: 'todo'}}}]});
  let ws = buildWorkspace([...Object.values(p), days, from, repeat, r1, r2, rule] as AnyRecord[]);
  const plans = onMoment(ws, {kind: 'dayStart'}, ctx);
  assert.equal(plans.length, 1);
  const w = plans[0]!.writes[0]!;
  assert.equal(w.op, 'create');
  assert.deepEqual((w as {values: Record<string, unknown>}).values[from.id], [r1.id]);
  const made = rec('item', {dbs: [p.daily.id], values: (w as {values: Record<string, v2.CellValue>}).values}, '2026-11-17');
  ws = withItem(ws, made);
  assert.equal(onMoment(ws, {kind: 'dayStart'}, ctx).length, 0, 'opening the day twice makes nothing new');
});

test('signals compare a measurement with a number or with another signal, and rules fire when one becomes true', () => {
  const p = planner();
  const planned = rec('signal', {name: '계획한 시간', measure: {dbs: [p.daily.id], of: p.est.id, agg: 'sum', period: 'today'}, op: 'gt', compare: {n: 0}});
  const budget = prop('쓸 수 있는 시간', 'number');
  const cap = rec('signal', {name: '쓸 수 있는 시간', measure: {where: [{prop: budget.id, op: 'filled'}], of: budget.id, agg: 'last', period: 'today'}, op: 'gt', compare: {n: 0}});
  const tooMuch = rec('signal', {name: '오늘은 무리', measure: {dbs: [p.daily.id], of: p.est.id, agg: 'sum', period: 'today'}, op: 'gt', compare: {signal: cap.id}});
  const warn = rec('rule', {on: {kind: 'signal', signal: tooMuch.id}, do: [{do: 'notify', text: '오늘 계획이 넘쳐요'}]});
  const c = rec('item', {values: {[budget.id]: 120}}, '2026-11-17');
  const t1 = rec('item', {dbs: [p.daily.id], values: {[p.est.id]: 90}}, '2026-11-17');
  const before = buildWorkspace([...Object.values(p), budget, planned, cap, tooMuch, warn, c, t1] as AnyRecord[]);
  assert.deepEqual(evalSignal(before, tooMuch.id, ctx), {met: false, value: 90, target: 120});
  const t2 = rec('item', {dbs: [p.daily.id], values: {[p.est.id]: 60}}, '2026-11-17');
  const after = withItem(before, t2);
  assert.equal(evalSignal(after, tooMuch.id, ctx).met, true);
  assert.deepEqual(onItemWrite(before, after, null, t2, ctx).map(x => x.effects[0]), [{kind: 'notify', text: '오늘 계획이 넘쳐요', item: null}]);
});

test('tidy: similar names are pointed out; merging moves values and every reference', () => {
  const a = prop('운동 시간', 'duration'), b = prop('운동시간', 'number'), c = prop('메모', 'text');
  const x = rec('item', {values: {[a.id]: 30}}), y = rec('item', {values: {[b.id]: 45}});
  const lens = rec('lens', {name: '긴 것', where: [{prop: a.id, op: 'gt', value: 20}]});
  const ws = buildWorkspace([a, b, c, x, y, lens]);
  assert.deepEqual(tidyReport(ws).similar, [[a.id, b.id]]);
  assert.deepEqual(tidyReport(ws).unusedProperties, [c.id]);
  const m = mergeProperty(ws, a.id, b.id);
  assert.equal(m.remove, a.id);
  const movedX = m.writes.find(w => w.id === x.id) as Item, movedLens = m.writes.find(w => w.id === lens.id)!;
  assert.deepEqual(movedX.body.values, {[b.id]: 30});
  assert.ok(JSON.stringify(movedLens.body).includes(b.id) && !JSON.stringify(movedLens.body).includes(a.id));
  assert.throws(() => mergeProperty(ws, a.id, c.id), /different kinds/);
});

test('quick capture is understood as a suggestion', () => {
  const p = planner(), w = prop('무게', 'number');
  const ws = buildWorkspace([...Object.values(p), w] as AnyRecord[]);
  const out = parseCapture(ws, '#하루일과 스쿼트 무게: 60kg 느낌: 좋음');
  assert.equal(out.text, '스쿼트');
  assert.deepEqual(out.tags, [{name: '하루일과', db: p.daily.id}]);
  assert.deepEqual(out.pairs.map(x => [x.prop, x.value]), [[w.id, 60], [null, '좋음']]);
});

test('a property kind that cannot hold a role is refused', () => {
  assert.throws(() => v2.PropertyBody.parse({name: 'x', kind: 'text', role: 'start'}));
  assert.throws(() => v2.PropertyBody.parse({name: 'x', kind: 'formula'}));
});

test('same-day rollup: one item sums what other items hold on its day', () => {
  const p = planner();
  const awake = prop('깨어 있을 시간', 'duration'), fixedSum = prop('고정 합', 'formula', {formula: {op: 'sameDay', dbs: [p.daily.id], where: [{role: 'fixed', op: 'is', value: true}], of: p.est.id, agg: 'sum'}});
  const fixed = prop('고정', 'checkbox', {role: 'fixed'});
  const left = prop('남는 시간', 'formula', {formula: {op: 'expr', expr: `{${awake.id}} - {${fixedSum.id}}`}});
  const check = rec('item', {values: {[awake.id]: 900}}, '2026-11-17');
  const a = rec('item', {dbs: [p.daily.id], values: {[fixed.id]: true, [p.est.id]: 120}}, '2026-11-17');
  const b = rec('item', {dbs: [p.daily.id], values: {[fixed.id]: true, [p.est.id]: 60}}, '2026-11-18');
  const c = rec('item', {dbs: [p.daily.id], values: {[p.est.id]: 30}}, '2026-11-17');
  const ws = buildWorkspace([...Object.values(p), awake, fixedSum, fixed, left, check, a, b, c] as AnyRecord[]);
  assert.equal(value(ws, check, fixedSum.id), 120);
  assert.equal(value(ws, check, left.id), 780);
});

test('sub-items: progress rolls up; parent and children move on their own; a user rule can act on the parent', () => {
  const p = planner();
  const up = prop('상위 항목', 'relation', {relation: {db: p.daily.id, many: false}});
  const sub = prop('하위 진행률', 'formula', {formula: {op: 'rollup', via: up.id, back: true, agg: 'doneRatio'}});
  const top = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: '텝스', [p.state.id]: 'todo', [p.day.id]: '2026-11-17'}});
  const mid = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: '청해', [p.state.id]: 'todo', [up.id]: [top.id], [p.day.id]: '2026-11-17'}});
  const t1 = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: 'test 1', [p.state.id]: 'todo', [up.id]: [mid.id], [p.day.id]: '2026-11-17'}});
  const t2 = rec('item', {dbs: [p.daily.id], values: {[p.title.id]: 'test 2', [p.state.id]: 'todo', [up.id]: [mid.id], [p.day.id]: '2026-11-17'}});
  let ws = buildWorkspace([...Object.values(p), up, sub, top, mid, t1, t2] as AnyRecord[]);
  assert.deepEqual(nest(ws, query(ws, {dbs: [p.daily.id]}, ctx), up.id).map(x => [title(ws, x.item), x.depth]), [['텝스', 0], ['청해', 1], ['test 1', 2], ['test 2', 2]]);
  // No rule: checking every child moves nothing else.
  const a = set(t1, {[p.state.id]: 'did'}), b = set(t2, {[p.state.id]: 'did'});
  let before = withItem(ws, a); const after = withItem(before, b);
  assert.equal(value(after, mid, sub.id), 100);
  assert.deepEqual(onItemWrite(before, after, t2, b, ctx), []);
  // The parent can be done while a child moves to tomorrow.
  const moved = set(t2, {[p.day.id]: '2026-11-18'}), doneTop = set(top, {[p.state.id]: 'did'});
  ws = withItem(withItem(ws, moved), doneTop);
  assert.deepEqual(nest(ws, query(ws, {dbs: [p.daily.id], where: [{role: 'day', op: 'is', value: '2026-11-17'}]}, ctx), up.id).map(x => title(ws, x.item)), ['텝스', '청해', 'test 1']);
  // With a rule the user made ("all sub-items done → done"), the parent is checked when its last child is.
  const rule = rec('rule', {on: {kind: 'enter'}, source: {dbs: [p.daily.id], where: [{prop: sub.id, op: 'gte', value: 100}, {role: 'done', op: 'is', value: '@open'}]}, do: [{do: 'set', values: {[p.state.id]: {set: 'did'}}}]});
  before = withItem(buildWorkspace([...Object.values(p), up, sub, top, mid, t1, t2, rule] as AnyRecord[]), a);
  const plans = onItemWrite(before, withItem(before, b), t2, b, ctx);
  assert.deepEqual(plans.map(x => x.item), [mid.id]);
});
