import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDump} from '../lib/server/v5/dump-map.ts';
import {alignConcepts, entryKnowledge, targetsOf, verifyCards} from '../lib/server/v5/next-explore.ts';
import type {Entry, Store} from '../lib/server/v5/types.ts';

const sentences = ['노드를 만들어놓고 페이지로 설명한다.', '인간은 부정확한 단어를 쓴다.', '그래서 AI를 굴려 상관관계를 본다.', '이 페이지는 한장이다.'];

test('a dump is taken down in its own words: terms, connectives, senses and gaps', () => {
  const v = verifyDump({
    claims: [
      {subj: '인간', obj: '부정확한 단어', asserted: null, sentences: [1]},
      {subj: 'AI를 굴려', obj: '상관관계', asserted: '그래서', sentences: [2]},
      {subj: '인공지능', obj: '상관관계', asserted: '그래서', sentences: [2]},
      {subj: 'AI', obj: '상관관계', asserted: '따라서', sentences: [2]},
    ],
    senses: [{term: '페이지', senses: [{label: '화면', sentences: [0]}, {label: '문서', sentences: [3]}]}, {term: '노드', senses: [{label: 'a', sentences: [0]}]}],
    gaps: [{from: 'AI를 굴려', to: '상관관계', sentences: [2], missing: '어떻게 상관관계를 보는가?'}, {from: '없는 말', to: '상관관계', sentences: [2], missing: 'x'}],
  }, sentences);
  assert.deepEqual(v.claims.map(c => [c.subj, c.asserted]), [['인간', null], ['AI를 굴려', '그래서'], ['AI', null]]);
  assert.equal(v.senses.length, 1);
  assert.equal(v.gaps.length, 1);
});

const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({id, kind: 'dump', body: '', sentences: ['a', 'b', 'c'], locked: true, createdAt: 't', status: 'done', planetIds: [], ...extra} as Entry);

test('concepts line up by id, every target gets a card, and knowledge follows 1.1', () => {
  const original = entry('o', {kind: 'media', sentences: ['원문 하나.', '원문 둘.', '원문 셋.']});
  const answer = entry('a', {analysis: {} as Entry['analysis'], comparison: {materialEntryId: 'o', materialTitle: '', summary: '', quotes: [],
    items: [{answer: 0, verdict: 'kept', original: [0], note: ''}, {answer: 1, verdict: 'shifted', original: [1], note: '조건 빠짐'}, {answer: -1, verdict: 'missed', original: [2], note: ''}]}});
  const store = {version: 1, entries: [original, answer], planets: [], concepts: [
    {id: 'x', name: 'X', aliases: [], kind: 'term', definition: [], relations: [], mentions: [{entryId: 'o', sentence: 2, by: 'material'}, {entryId: 'a', sentence: 0, by: 'user', explains: true}], state: 'seen', createdAt: 't'},
    {id: 'y', name: 'Y', aliases: [], kind: 'term', definition: [], relations: [], mentions: [{entryId: 'o', sentence: 1, by: 'material'}], state: 'seen', createdAt: 't'},
  ]} as unknown as Store;
  assert.deepEqual(alignConcepts(store, answer, original), {shared: ['x'], missed: ['y'], added: []});
  const targets = targetsOf(store, answer, original);
  assert.deepEqual(targets.map(t => t.kind), ['shifted', 'missed', 'concept']);
  const cards = verifyCards([{target: targets[0]!.key, question: '원문은 조건을 뭐라고 했나?', concepts: ['Y', 'Z'], why: [1, 9]}], targets, store, original);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards[0]!.concepts, ['y']);
  assert.deepEqual(cards[0]!.why, [1]);
  assert.ok(cards[1]!.question && cards[1]!.concepts.length);
  assert.equal(entryKnowledge(entry('n')), 'seen');
  assert.equal(entryKnowledge(answer), 'checked');
  const good = {...answer, comparison: {...answer.comparison!, items: answer.comparison!.items.slice(0, 1)}, meta: {explainConfirmed: 't'}};
  assert.equal(entryKnowledge(good), 'explainable');
});
