import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA, newId, type Driver} from '../moons/lib/server/db.ts';
import {registerLitV2Tools} from './mcp-v2.ts';
import {putSettings, writeRecord} from './store.ts';
import {clearLegacy, legacyCount} from './v2.ts';

const memory = new PGlite(); let owner: string;
const tools = new Map<string, (args: unknown, owner: string) => Promise<unknown>>();
before(async () => {
  await memory.exec(SCHEMA);
  const driver: Driver = {query: (s, p) => memory.query(s, p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s, p) => tx.query(s, p) as ReturnType<Driver['query']>}))};
  (globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve(driver);
  owner = newId();
  await putSettings(owner, {tz: 'Asia/Seoul', dayBoundary: '04:00'});
  registerLitV2Tools(((name: string, _d: string, _s: unknown, run: (a: unknown, o: string) => Promise<unknown>) => { tools.set(name, run); }) as never);
});
const call = <T>(name: string, args: unknown = {}) => tools.get(name)!(args, owner) as Promise<T>;

test('Claude can read the grammar, install a template with its requirements, write and read items', async () => {
  assert.match(await call<string>('lit_guide'), /Property role/);
  const list = await call<{id: string; installed: boolean}[]>('list_templates');
  assert.ok(list.some(t => t.id === 'lit.workout'));
  const r = await call<{installed: string[]}>('install_template', {id: 'lit.workout'});
  assert.deepEqual(r.installed, ['하루 일과 + 목표', '운동 기록']);
  const ws = await call<{databases: {id: string; name: string}[]; properties: {id: string; name: string; role: string | null}[]}>('get_workspace');
  const daily = ws.databases.find(d => d.name === '하루 일과')!, title = ws.properties.find(p => p.role === 'title')!;
  const saved = await call<{saved: {id: string}[]}>('save_items', {items: [{dbs: [daily.id], values: {[title.id]: '산책'}}]});
  const q = await call<{items: {id: string; title: string}[]}>('query_items', {source: {dbs: [daily.id]}, period: 'today'});
  assert.deepEqual(q.items.map(i => i.title), ['산책']);
  await call('save_items', {items: [{id: saved.saved[0]!.id, values: {[title.id]: '저녁 산책'}}]});
  assert.equal((await call<{items: {title: string}[]}>('query_items', {source: {dbs: [daily.id]}})).items[0]!.title, '저녁 산책');
  const pages = await call<{pages: {name: string}[]}>('save_pages', {pages: [{name: '새 페이지', widgets: [{title: '목록', parts: [{kind: 'checklist', view: {dbs: [daily.id], period: 'day'}}]}]}]});
  assert.deepEqual(pages.pages.map(p => p.name), ['새 페이지']);
});

test('the old planner\'s records can be cleared on request', async () => {
  await writeRecord(owner, null, {kind: 'task', logicalDay: '2026-11-01', body: {title: '옛 할 일'}});
  assert.equal(await legacyCount(owner), 1);
  assert.deepEqual(await clearLegacy(owner), {cleared: 1});
  assert.equal(await legacyCount(owner), 0);
});
