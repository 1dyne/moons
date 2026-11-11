import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {LifeRecord} from '@workspace/life-contract';
import {at, minuteOf, reorder, sortDay} from './schedule.ts';

const D = '2026-11-11';
const task = (id: string, start?: number, len?: number, order?: number) => ({id, kind: 'task', createdAt: id, logicalDay: D,
  body: {title: id, order: order ?? null, priority: null, plan: {start: start === undefined ? null : at(D, start), end: start !== undefined && len ? at(D, start + len) : null}}}) as unknown as LifeRecord<'task'>;
const startMin = (p: {plan?: {start?: {value: string} | null}}) => p.plan?.start ? minuteOf(D, p.plan.start.value) : null;

test('timed tasks come first by time, the rest by dragged order', () => {
  const list = sortDay([task('c', undefined, undefined, 20), task('b', 600, 60), task('a', 540, 30), task('d', undefined, undefined, 10)]);
  assert.deepEqual(list.map(t => t.id), ['a', 'b', 'd', 'c']);
});

test('dragging among timed tasks swaps their slots, each keeps its length', () => {
  const list = sortDay([task('a', 540, 30), task('b', 600, 60)]);
  const out = reorder(list, 'b', 0);
  const b = out.find(x => x.id === 'b')!, a = out.find(x => x.id === 'a')!;
  assert.equal(startMin(b), 540); assert.equal(minuteOf(D, b.plan!.end!.value), 600);
  assert.equal(startMin(a), 600); assert.equal(minuteOf(D, a.plan!.end!.value), 630);
});

test('an untimed task dropped on a timed one takes its start and pushes overlaps', () => {
  const list = sortDay([task('a', 540, 60), task('b', 600, 60), task('x', undefined, undefined, 0)]);
  const out = reorder(list, 'x', 0);
  assert.equal(startMin(out.find(p => p.id === 'x')!), 540);
  assert.equal(startMin(out.find(p => p.id === 'a')!), 570);
  assert.equal(startMin(out.find(p => p.id === 'b')!), 630);
});

test('a timed task dropped among untimed ones loses its time; untimed get their new order', () => {
  const list = sortDay([task('a', 540, 60), task('x', undefined, undefined, 0), task('y', undefined, undefined, 10)]);
  const out = reorder(list, 'a', 2);
  const a = out.find(p => p.id === 'a')!;
  assert.equal(a.plan!.start, null); assert.equal(a.order, 20);
  const y = reorder(sortDay([task('x', undefined, undefined, 0), task('y', undefined, undefined, 10)]), 'y', 0);
  assert.deepEqual(y.map(p => [p.id, p.order]).sort(), [['x', 10], ['y', 0]]);
});
