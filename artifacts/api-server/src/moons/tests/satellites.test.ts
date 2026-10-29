import test from 'node:test';
import assert from 'node:assert/strict';
import {applyItem, draftFromRecords, parseRecord, recordEntry, linkRecordConcepts, type Satellite} from '../lib/server/satellites/store.ts';
import {shouldRun} from '../lib/server/satellites/digest.ts';
import {conceptState, type Concept} from '../lib/server/v5/concepts.ts';
import type {Store} from '../lib/server/v5/types.ts';

const record = parseRecord({id: 'r1', kind: 'attempt', title: 'TEPS 어휘 · 3회차', summary: '3문항 중 2개 정답', at: '2026-10-28T09:00:00Z', concepts: ['affluent'],
  items: [{label: 'affluent', result: 'wrong', answer: 'opulent'}, {label: 'frugal', result: 'right'}, {label: ''}], userText: ['affluent는 돈이 많아 여유가 있는 상태다.'], secret: 'dropped', link: 'http://insecure'});

test('a record keeps only the contract fields', () => {
  assert.equal(record.items.length, 2);
  assert.equal('secret' in record, false);
  assert.equal(record.link, undefined);
  assert.throws(() => parseRecord({kind: 'attempt'}));
});

test('the note keeps the user lines and the reported facts apart, and MOONS stays outside the original', () => {
  const d = draftFromRecords('s1', [record]);
  d.moons = {summary: 'affluent와 opulent를 섞음', patterns: []};
  assert.deepEqual(d.missed, ['affluent']);
  const e = recordEntry(d);
  assert.equal(e.kind, 'record');
  assert.ok(!e.body.includes('섞음'));
  const lineBy = e.meta!.lineBy as string[];
  assert.equal(lineBy[0], 'user');
  assert.ok(lineBy.slice(1).every(x => x === 'satellite'));
});

test('record concepts: the user line counts as theirs, a repeated miss keeps the concept from "checked"', () => {
  const store = {version: 1, entries: [], planets: [], satellites: [{id: 's1', planetIds: []}] as unknown as Satellite[]} as unknown as Store;
  const id = applyItem(store, 'record_note', draftFromRecords('s1', [record]) as unknown as Record<string, unknown>, {type: 'satellite', id: 's1'})!;
  const entry = store.entries.find(x => x.id === id)!;
  const c = (store.concepts as Concept[]).find(x => x.name === 'affluent')!;
  assert.ok(c.mentions.some(m => m.by === 'user'));
  assert.ok(c.mentions.some(m => m.by === 'material'));
  const compared = {...entry, analysis: {} as never, comparison: {items: [{answer: 0, verdict: 'kept'}]} as never};
  assert.equal(conceptState(c, [compared]), 'organized');
  linkRecordConcepts(store, entry, ['없는 개념']);
  assert.ok(!(store.concepts as Concept[]).some(x => x.name === '없는 개념'), 'a concept the note never says is not added');
});

test('Claude proposals: relayed user words become a marked spark, anything else AI material', () => {
  const store = {version: 1, entries: [], planets: []} as unknown as Store;
  applyItem(store, 'note', {text: '내가 이해한 건 이거다.', words: 'user'}, {type: 'claude'});
  applyItem(store, 'note', {text: '클로드의 설명이다.'}, {type: 'claude'});
  assert.deepEqual(store.entries.map(e => [e.kind, e.meta?.relayedBy]), [['media', 'claude'], ['dump', 'claude']]);
  applyItem(store, 'question', {title: 'ELK는 왜 그룹을 지원하나?', subQuestions: ['그룹이란?']}, {type: 'claude'});
  const q = store.entries[0] as unknown as {kind: string; question: {subQuestions: {layer: string}[]}};
  assert.equal(q.kind, 'question'); assert.equal(q.question.subQuestions[0]!.layer, 'ai');
  assert.throws(() => applyItem(store, 'nope', {}, {type: 'claude'}));
});

test('the agent runs only when allowed, with something new, after the minimum gap', () => {
  const sat = (mode: string, lastRunAt?: string) => ({id: 's', agent: {mode, lastRunAt}}) as unknown as Satellite;
  const s = {minHours: 6, maxRecords: 50}, t = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(shouldRun(sat('off'), 5, s, 'open', t), false);
  assert.equal(shouldRun(sat('on_open'), 0, s, 'open', t), false);
  assert.equal(shouldRun(sat('on_open', '2026-10-28T09:00:00Z'), 5, s, 'open', t), false);
  assert.equal(shouldRun(sat('on_open', '2026-10-28T05:00:00Z'), 5, s, 'open', t), true);
  assert.equal(shouldRun(sat('manual'), 5, s, 'open', t), false);
  assert.equal(shouldRun(sat('manual'), 5, s, 'manual', t), true);
});
