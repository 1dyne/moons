import test from 'node:test';
import assert from 'node:assert/strict';
import {conceptKnowledge,understanding,fieldSummaries,checkList,KNOWLEDGE_REVEAL,CRATER_GAP} from '../lib/knowledge-v9.ts';
import type {Store,Entry,Planet} from '../lib/model.ts';
import type {Concept} from '../lib/concepts.ts';

const P = (id: string, parentId?: string): Planet => ({id, name: id, color: '#5b86f0', position: {x: 0, y: 0}, entryCount: 0, openSignalRatio: 0, ...(parentId ? {parentId} : {})});
const E = (id: string, planetIds: string[], extra: Partial<Entry> = {}): Entry => ({id, kind: 'dump', body: 'x', sentences: ['x'], locked: true, createdAt: '2026-11-01', status: 'saved', planetIds, ...extra});
const compared = {materialEntryId: 'm', materialTitle: 'm', summary: '', items: [{answer: 0, verdict: 'kept' as const, original: [0], note: ''}], quotes: []};
const C = (id: string, state: Concept['state'], entryIds: string[], explains = false): Concept => ({id, name: id, aliases: [], kind: 'term', definition: [], relations: [], mentions: entryIds.map(e => ({entryId: e, sentence: 0, by: 'user' as const, explains})), state, createdAt: 't'});
const base = (concepts: Concept[], entries: Entry[], confidence: Store['confidence'] = []): Store => ({version: 1, entries, planets: [P('leet'), P('lang', 'leet'), P('dev')], concepts, confidence});

test('a concept counts in the top field of its notes and has evidence only from compare, attempt or explanation', () => {
  const s = base([C('a', 'checked', ['e1', 'e2']), C('b', 'seen', ['e3'])], [E('e1', ['lang'], {comparison: compared}), E('e2', ['lang']), E('e3', ['dev'])]);
  const k = conceptKnowledge(s);
  const a = k.find(x => x.conceptId === 'a')!, b = k.find(x => x.conceptId === 'b')!;
  assert.deepEqual(a.fields, ['leet']); assert.equal(a.recordCount, 2); assert.equal(a.side, 'front'); assert.equal(a.evidence[0]!.kind, 'compare');
  assert.equal(b.side, 'back'); assert.equal(b.terrain, 'fog');
  assert.deepEqual(conceptKnowledge(s), k, 'same data, same numbers');
});

test('understanding = record-weighted stage score over evidence concepts (6.3)', () => {
  const s = base([C('a', 'checked', ['e1', 'e2'], true), C('b', 'explainable', ['e1'], true), C('c', 'seen', ['e9'])], [E('e1', ['leet']), E('e2', ['leet']), E('e9', ['leet'])]);
  const k = conceptKnowledge(s).filter(x => x.fields.includes('leet'));
  // a: n=2,s=75 ; b: n=1,s=100 ; c has no evidence → left out
  assert.equal(understanding(k), Math.round((2 * 75 + 1 * 100) / 3));
});

test('crater and star from confidence vs stage; a page rating stands in when the concept has none', () => {
  const s = base([C('a', 'seen', ['e1'], true), C('b', 'explainable', ['e2'], true)], [E('e1', ['leet'], {meta: {pageId: 'p1'}}), E('e2', ['leet'])],
    [{id: '1', targetType: 'page', targetId: 'p1', value: 9, at: '2026-11-01'}, {id: '2', targetType: 'concept', targetId: 'b', value: 6, at: '2026-11-01'}]);
  const k = conceptKnowledge(s);
  const a = k.find(x => x.conceptId === 'a')!, b = k.find(x => x.conceptId === 'b')!;
  assert.deepEqual(a.confidence, {value: 9, by: 'page'}); assert.equal(90 - 25 >= CRATER_GAP, true); assert.equal(a.terrain, 'crater');
  assert.equal(b.star, true);
  assert.equal(checkList(s, 'leet')[0]!.kind, 'gap');
});

test('a field opens at the reveal threshold, never with fake values', () => {
  const ids = Array.from({length: KNOWLEDGE_REVEAL.concepts}, (_, i) => `c${i}`);
  const concepts = ids.map((id, i) => C(id, 'organized', ['e1'], i < KNOWLEDGE_REVEAL.evidence));
  const sum = fieldSummaries(base(concepts, [E('e1', ['leet'])]));
  assert.equal(sum.find(f => f.field === 'leet')!.open, true);
  const less = fieldSummaries(base(concepts.slice(1), [E('e1', ['leet'])]));
  assert.equal(less.find(f => f.field === 'leet')!.open, false);
  assert.equal(less.find(f => f.field === 'leet')!.understanding, null);
});

test('going back a stage lowers the ground', () => {
  const up = conceptKnowledge(base([C('a', 'checked', ['e1'], true)], [E('e1', ['leet'])]))[0]!;
  const down = conceptKnowledge(base([C('a', 'organized', ['e1'], true)], [E('e1', ['leet'])]))[0]!;
  assert.ok(down.score < up.score);
});
