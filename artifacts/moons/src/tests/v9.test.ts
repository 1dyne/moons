import test from 'node:test';
import assert from 'node:assert/strict';
import {spaceOf,targetFor,focusOfPath} from '../lib/spaces.ts';
import {newBlock,newPage,snapshotEntries,snapshotParts,currentEntries} from '../lib/pages.ts';
import {marksToHtml,toggleMark} from '../lib/richtext.ts';
import {withAncestors,removePlanet,planetTree,colorOf} from '../lib/planets.ts';
import {shapeOf} from '../lib/tools.ts';
import type {Planet} from '../lib/model.ts';

test('every old path belongs to one space', () => {
  const cases: [string, string][] = [['/', 'record'], ['/notes', 'record'], ['/entries/a/original', 'record'], ['/entries/a', 'learn'], ['/entries/a/compare', 'learn'], ['/station/x', 'learn'], ['/chat', 'learn'],
    ['/galaxy', 'space'], ['/universe', 'space'], ['/concepts/c', 'space'], ['/teams', 'share'], ['/projects/p', 'satellite'], ['/planner', 'satellite'], ['/satellite/s', 'satellite'], ['/settings', 'profile'], ['/pages/p', 'record'], ['/learn', 'learn'], ['/storage', 'record']];
  for (const [p, s] of cases) assert.equal(spaceOf(p), s, p);
});

test('switching space keeps the thing in view', () => {
  const f = focusOfPath('/entries/e1/original')!;
  assert.deepEqual(f, {type: 'entry', id: 'e1'});
  assert.equal(targetFor('learn', 'record', f), '/learn?focus=e1');
  assert.equal(targetFor('space', 'record', f), '/galaxy?focus=e1');
  assert.equal(targetFor('record', 'learn', f), '/entries/e1/original');
  assert.equal(targetFor('learn', 'learn', f), '/learn');
  assert.equal(targetFor('record', 'space', {type: 'page', id: 'p'}), '/pages/p');
  assert.equal(targetFor('learn', 'record', {type: 'page', id: 'p'}, () => 'e9'), '/learn?focus=e9');
});

test('a snapshot keeps my words and each pasted source apart, and only when changed', () => {
  const p = newPage({title: 'T', planetIds: ['x'], blocks: [newBlock('heading', {text: '원인'}), newBlock('text', {text: '주어만 읽었다.'}), newBlock('text', {text: '긴 지문 원문입니다.'}, 'source'), newBlock('chat', {messages: [{by: 'ai', text: '왜?', at: ''}, {by: 'user', text: '급해서', at: ''}]}), newBlock('text', {text: 'AI가 쓴 말'}, 'ai')]});
  const parts = snapshotParts(p);
  assert.equal(parts.text, '원인\n주어만 읽었다.\n급해서');
  assert.deepEqual(parts.sources.map(s => s.text), ['긴 지문 원문입니다.']);
  const snap = snapshotEntries(p, {entries: []})!;
  assert.equal(snap.entries.length, 2);
  const [dump, src] = snap.entries;
  assert.equal(dump!.kind, 'dump'); assert.equal(src!.kind, 'media');
  assert.ok(dump!.sentences.every(s => dump!.body.includes(s)));
  assert.equal(snapshotEntries({...p, snapshotHash: snap.hash}, {entries: []}), null);
  const next = snapshotEntries({...p, latestEntryId: dump!.id, snapshotHash: snap.hash, blocks: [...p.blocks, newBlock('text', {text: '더 썼다.'})]}, {entries: snap.entries})!;
  assert.equal(next.entries[0]!.parentEntryId, dump!.id);
  assert.deepEqual(currentEntries([...snap.entries, ...next.entries]).map(e => e.id).includes(dump!.id), false);
});

test('marks toggle and render as mark, b and a only', () => {
  let m = toggleMark([], 0, 3, 'hl');
  assert.equal(marksToHtml('가나다라', m), '<mark>가나다</mark>라');
  m = toggleMark(m, 0, 3, 'hl');
  assert.deepEqual(m, []);
  assert.equal(marksToHtml('<x>', []), '&lt;x&gt;');
  assert.match(marksToHtml('ab', [{type: 'link', start: 0, end: 2, href: 'javascript:alert(1)'}]), /href="#"/);
});

test('choosing a child planet includes its parents; removing a parent lifts children', () => {
  const P = (id: string, parentId?: string): Planet => ({id, name: id, color: '#5b86f0', position: {x: 0, y: 0}, entryCount: 0, openSignalRatio: 0, ...(parentId ? {parentId} : {})});
  const ps = [P('leet'), P('lang', 'leet'), P('err', 'lang'), P('dev')];
  assert.deepEqual(withAncestors(['err'], ps).sort(), ['err', 'lang', 'leet']);
  assert.deepEqual(planetTree(ps).map(p => [p.id, p.depth]), [['leet', 0], ['lang', 1], ['err', 2], ['dev', 0]]);
  assert.equal(removePlanet(ps, 'lang').find(p => p.id === 'err')!.parentId, 'leet');
  assert.notEqual(colorOf(ps[1]!, ps), '#5b86f0');
});

test('a structure keeps the shape and drops the words', () => {
  const s = shapeOf([newBlock('fields', {fields: [{label: '상황', text: '시간 압박'}]}), newBlock('text', {text: '내 말'}), newBlock('chat', {messages: [{by: 'user', text: 'x', at: ''}], steps: ['Q'], step: 1})]);
  assert.equal((s[0]!.value as {fields: {label: string; text: string}[]}).fields[0]!.label, '상황');
  assert.equal((s[0]!.value as {fields: {text: string}[]}).fields[0]!.text, '');
  assert.equal((s[1]!.value as {text: string}).text, '');
  assert.deepEqual((s[2]!.value as {messages: unknown[]; steps: string[]}).messages, []);
});

import {isBridgeRequest,originOf} from '../lib/sat-bridge.ts';
import {columnKind} from '../lib/space-views.ts';
import {dueSnapshots} from '../lib/scheduled.ts';
test('the Satellite bridge only reads its own message shape and origin', () => {
  assert.equal(isBridgeRequest({moons: 'v1', id: '1', op: 'set', key: 'a', value: 1}), true);
  assert.equal(isBridgeRequest({moons: 'v1', id: '1', op: 'eval'}), false);
  assert.equal(isBridgeRequest('hi'), false);
  assert.equal(originOf('https://drill.example.com/app?x=1'), 'https://drill.example.com');
  assert.equal(originOf('nope'), null);
});
test('a table column kind is read from its values', () => {
  assert.equal(columnKind(['1', '2.5', '']), 'number');
  assert.equal(columnKind(['2026-11-01', '2026-11-03']), 'date');
  assert.equal(columnKind(['상황', '3']), 'text');
});
test('scheduled structuring takes the last snapshot of an earlier day only', () => {
  const mk = (id: string, at: string, extra = {}) => ({id, kind: 'dump' as const, body: 'x', sentences: ['x'], locked: true, createdAt: at, status: 'saved' as const, planetIds: [], meta: {pageId: 'p'}, ...extra});
  const entries = [mk('a', '2026-11-01T10:00:00'), mk('b', '2026-11-01T12:00:00', {parentEntryId: 'a'}), mk('c', '2026-11-03T09:00:00', {meta: {pageId: 'q'}})];
  assert.deepEqual(dueSnapshots({entries}, new Date('2026-11-03T12:00:00')).map(e => e.id), ['b']);
});
