import test from 'node:test';
import assert from 'node:assert/strict';
import {conceptState, mergeConcepts, unfamiliar, verifyConcepts, type Concept} from '../lib/server/v5/concepts.ts';
import type {Entry, Store} from '../lib/server/v5/types.ts';

const entry = (id: string, sentences: string[], extra: Partial<Entry> = {}): Entry => ({id, kind: 'dump', body: sentences.join(' '), sentences, locked: true, createdAt: 't', status: 'saved', planetIds: [], ...extra} as Entry);
const raw = (name: string, mentions: {sentence: number; explains: boolean}[], extra: Record<string, unknown> = {}) =>
  ({existing_id: null, name, aliases: [], kind: 'method', mentions, definition: null, relations: [], ...extra}) as Parameters<typeof verifyConcepts>[0][number];

test('concepts without a footing in the note are dropped', () => {
  const e = entry('e1', ['강화학습은 보상으로 배운다.', '오늘은 비가 왔다.']);
  const out = verifyConcepts([
    raw('강화학습', [{sentence: 0, explains: true}, {sentence: 1, explains: false}]),
    raw('지도학습', [{sentence: 0, explains: false}]),
    raw('이건 문장이다.', [{sentence: 0, explains: false}]),
    raw('보상', [{sentence: 9, explains: false}]),
  ], e, []);
  assert.deepEqual(out.map(c => c.name), ['강화학습']);
  assert.deepEqual(out[0]!.mentions, [{sentence: 0, explains: true}]);
});

test('a definition must be a verbatim part of its sentence', () => {
  const e = entry('e1', ['강화학습은 보상으로 배우는 방법이다.']);
  const [ok] = verifyConcepts([raw('강화학습', [{sentence: 0, explains: true}], {definition: {sentence: 0, text: '보상으로 배우는 방법'}})], e, []);
  const [bad] = verifyConcepts([raw('강화학습', [{sentence: 0, explains: true}], {definition: {sentence: 0, text: '보상을 최대화하는 학습'}})], e, []);
  assert.ok(ok!.definition);
  assert.equal(bad!.definition, null);
});

test('merging joins concepts by name and alias across notes and keeps each layer', () => {
  const store = {entries: [], planets: []} as unknown as Store;
  const spark = entry('s', ['RL은 보상으로 배운다.']), material = entry('m', ['Reinforcement learning (RL) uses rewards.'], {kind: 'media'});
  mergeConcepts(store, material, verifyConcepts([raw('Reinforcement learning', [{sentence: 0, explains: true}], {aliases: ['RL']})], material, []));
  const existing = store.concepts as Concept[];
  mergeConcepts(store, spark, verifyConcepts([raw('RL', [{sentence: 0, explains: true}])], spark, existing));
  const list = store.concepts as Concept[];
  assert.equal(list.length, 1);
  assert.deepEqual(list[0]!.mentions.map(m => m.by), ['material', 'user']);
  assert.equal(unfamiliar(list[0]!), false);
});

test('state rises with structuring and comparing, and falls when a sentence shifted', () => {
  const c: Concept = {id: 'c', name: 'x', aliases: [], kind: 'term', definition: [], relations: [], mentions: [{entryId: 'e', sentence: 0, by: 'user', explains: true}], state: 'seen', createdAt: 't'};
  const e = entry('e', ['x는 y다.']);
  assert.equal(conceptState(c, [e]), 'seen');
  const structured = {...e, analysis: {} as Entry['analysis']};
  assert.equal(conceptState(c, [structured]), 'organized');
  const compared = {...structured, comparison: {items: [{answer: 0, verdict: 'same'}]} as unknown as Entry['comparison']};
  assert.equal(conceptState(c, [compared]), 'explainable');
  const shifted = {...structured, comparison: {items: [{answer: 0, verdict: 'shifted'}]} as unknown as Entry['comparison']};
  assert.equal(conceptState(c, [shifted]), 'organized');
});
