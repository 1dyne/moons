import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA, newId, type Driver} from '../moons/lib/server/db.ts';
import type {Item} from '@workspace/lit-core';
import {putSettings, recordHistory} from './store.ts';
import {acceptSuggestion, listSuggestions, loadWorkspace, mergeProperties, previewRule, runMoment, saveV2} from './v2.ts';

const memory = new PGlite(); let owner: string;
before(async () => {
  await memory.exec(SCHEMA);
  const driver: Driver = {query: (s, p) => memory.query(s, p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s, p) => tx.query(s, p) as ReturnType<Driver['query']>}))};
  (globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve(driver);
  owner = newId();
  await putSettings(owner, {tz: 'Asia/Seoul', dayBoundary: '04:00'});
});
const make = async (kind: string, body: unknown) => (await saveV2(owner, null, {kind, body})).record;

test('a whole small workspace: properties, a database, items, a rule that runs on the server', async () => {
  const title = await make('property', {name: '이름', kind: 'title', role: 'title'});
  const day = await make('property', {name: '날짜', kind: 'date', role: 'day'});
  const state = await make('property', {name: '상태', kind: 'select', role: 'done', options: [{id: 'todo', name: '할 일', meaning: 'open'}, {id: 'did', name: '한 일', meaning: 'done'}]});
  const link = await make('property', {name: '어디에', kind: 'relation'});
  const pct = await make('property', {name: '진행률', kind: 'formula', formula: {op: 'rollup', via: link.id, back: true, agg: 'doneRatio'}});
  const db = await make('database', {name: '하루 일과', properties: [title.id, day.id, state.id, link.id]});
  const big = await make('database', {name: '큰 일', properties: [title.id, pct.id]});
  const g = await make('item', {dbs: [big.id], values: {[title.id]: '프로젝트'}});
  const t = await make('item', {dbs: [db.id], values: {[title.id]: '첫 줄', [day.id]: '2026-12-01', [state.id]: 'todo', [link.id]: [g.id]}});
  assert.equal(t.logicalDay, '2026-12-01', 'an item lands on the day of its day role');
  await make('rule', {name: '끝내면 축하', on: {kind: 'enter'}, source: {dbs: [db.id], where: [{role: 'done', op: 'is', value: '@done'}]}, do: [{do: 'notify', text: '{title} 끝'}]});
  const done = await saveV2(owner, t.id, {kind: 'item', baseRevision: t.revision, body: {...(t as Item).body, values: {...(t as Item).body.values, [state.id]: 'did'}}});
  assert.deepEqual(done.effects, [{kind: 'notify', text: '첫 줄 끝', item: t.id}]);
  const ws = await loadWorkspace(owner);
  const {value} = await import('@workspace/lit-core');
  assert.equal(value(ws, ws.items.get(g.id)!, pct.id), 100);
  await assert.rejects(saveV2(owner, null, {kind: 'property', body: {name: 'x', kind: 'text', role: 'start'}}), /cannot hold/);
});

test('auto rules write and leave their name in the history; suggest rules wait for the user', async () => {
  const flag = await make('property', {name: '표시', kind: 'checkbox'});
  const note = await make('property', {name: '내용', kind: 'text'});
  const inbox = await make('database', {name: '모음', properties: [note.id, flag.id]});
  const auto = await make('rule', {on: {kind: 'enter'}, source: {where: [{on: 'text', op: 'contains', value: '중요'}]}, do: [{do: 'set', values: {[flag.id]: {set: true}}}]});
  const idea = await make('rule', {mode: 'suggest', on: {kind: 'change'}, source: {where: [{on: 'db', op: 'is', value: '@none'}, {on: 'text', op: 'contains', value: '메모'}]}, do: [{do: 'set', values: {[note.id]: {copy: note.id}}}]});
  const a = await saveV2(owner, null, {kind: 'item', body: {text: '중요한 전화'}});
  const id = a.record.id, ws = await loadWorkspace(owner);
  assert.equal(ws.items.get(id)!.body.values[flag.id], true);
  const hist = await recordHistory(owner, id);
  assert.equal(hist.at(-1)!.source.ref, `rule:${auto.id}`);
  // a suggest rule that would change nothing is not shown
  await saveV2(owner, null, {kind: 'item', body: {text: '메모 하나'}});
  assert.equal((await listSuggestions(owner)).filter(p => p.rule === idea.id).length, 0);
  // archive suggestion
  const tidy = await make('rule', {mode: 'suggest', on: {kind: 'change'}, source: {dbs: [inbox.id]}, do: [{do: 'archive'}]});
  const kept = await make('item', {dbs: [inbox.id], text: '오래된 것'});
  const sug = (await listSuggestions(owner)).filter(p => p.rule === tidy.id);
  assert.deepEqual(sug.map(p => p.item), [kept.id]);
  assert.equal((await previewRule(owner, tidy.id)).length, 1);
  assert.equal((await loadWorkspace(owner)).items.get(kept.id)!.body.archived, false, 'not applied until accepted');
  await acceptSuggestion(owner, tidy.id, kept.id);
  assert.equal((await loadWorkspace(owner)).items.get(kept.id)!.body.archived, true);
  await assert.rejects(acceptSuggestion(owner, tidy.id, kept.id), /nothing to change/);
});

test('day start creates repeating lines once; merging two properties keeps every value', async () => {
  const title = await make('property', {name: '제목', kind: 'title', role: 'title'});
  const from = await make('property', {name: '원본', kind: 'relation'});
  const src = await make('database', {name: '매일', properties: [title.id]});
  const out = await make('database', {name: '오늘 것', properties: [title.id, from.id]});
  await make('item', {dbs: [src.id], values: {[title.id]: '물 마시기'}});
  await make('rule', {on: {kind: 'dayStart'}, source: {dbs: [src.id]}, do: [{do: 'createEach', dbs: [out.id], link: from.id, values: {[title.id]: {copy: title.id}}}]});
  await runMoment(owner, {kind: 'dayStart'});
  await runMoment(owner, {kind: 'dayStart'});
  const ws = await loadWorkspace(owner), made = [...ws.items.values()].filter(x => x.body.dbs.includes(out.id));
  assert.equal(made.length, 1);
  assert.equal(made[0]!.body.values[title.id], '물 마시기');

  const a = await make('property', {name: '걸린 시간', kind: 'duration'}), b = await make('property', {name: '걸린시간', kind: 'number'});
  const x = await make('item', {values: {[a.id]: 20}});
  await make('lens', {name: '긴 것', where: [{prop: a.id, op: 'gt', value: 10}]});
  const r = await mergeProperties(owner, a.id, b.id);
  assert.equal(r.removed, a.id);
  const ws2 = await loadWorkspace(owner);
  assert.equal(ws2.properties.has(a.id), false);
  assert.equal(ws2.items.get(x.id)!.body.values[b.id], 20);
  assert.ok([...ws2.lenses.values()].some(l => JSON.stringify(l.body).includes(b.id)));
});
