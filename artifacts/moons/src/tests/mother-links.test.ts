import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregatePlanetEdges} from '../lib/mother-links.ts';
import {toggleCompare, compareEntries} from '../lib/compare-tray.ts';

const thoughts = [
  {id: 't1', planetIds: ['B', 'A']}, {id: 't2', planetIds: ['A']}, {id: 't3', planetIds: ['B']}, {id: 't4', planetIds: ['C']},
];
test('weight = shared nodes + inter-node links, deterministic', () => {
  const links = [{a: 't2', b: 't3'}, {a: 't3', b: 't2'}, {a: 't2', b: 't4'}];
  const one = aggregatePlanetEdges(thoughts, links), two = aggregatePlanetEdges([...thoughts].reverse(), [...links].reverse());
  assert.deepEqual(one, two);
  assert.deepEqual(one[0], {a: 'A', b: 'B', shared: 1, links: 1, weight: 2});
  assert.deepEqual(one[1], {a: 'A', b: 'C', shared: 0, links: 1, weight: 1});
});
test('hidden planets are excluded', () => {
  assert.equal(aggregatePlanetEdges(thoughts, [], ['A']).length, 0);
});
test('compare tray caps at 3 and keeps source', () => {
  let ids: string[] = [];
  for (const id of ['a', 'b', 'c']) ids = toggleCompare(ids, id).ids;
  assert.equal(toggleCompare(ids, 'd').full, true);
  assert.deepEqual(toggleCompare(ids, 'b').ids, ['a', 'c']);
  const src = [{id: 'a', body: 'x'.repeat(500)}];
  assert.equal(compareEntries(['a'], src)[0], src[0]);
});
