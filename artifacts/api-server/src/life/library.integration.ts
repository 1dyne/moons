import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA, newId, type Driver} from '../moons/lib/server/db.ts';
import {codeHash, runnable, type LibraryItem} from '@workspace/planner-spec';
import {createDevToken, deleteLibrary, listLibrary, ownerOfDevToken, revokeDevToken, listDevTokens, saveLibrary, setLibraryState} from './library.ts';
import {registerPlannerTools} from './mcp-tools.ts';
import {getSpec, saveSpec} from './store.ts';
import {TEMPLATES} from '@workspace/planner-spec';

const memory = new PGlite(); let owner: string, other: string;
const tools = new Map<string, (args: never, owner: string) => Promise<unknown>>();
registerPlannerTools(((name: string, _d: string, _s: unknown, run: (a: never, o: string) => Promise<unknown>) => { tools.set(name, run); }) as never);
before(async () => {
  await memory.exec(SCHEMA);
  (globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve({query: (s, p) => memory.query(s, p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s, p) => tx.query(s, p) as ReturnType<Driver['query']>}))} as Driver);
  owner = newId(); other = newId();
});

const blocks = {id: 'leet-score', name: '기출 점수', permissions: ['table:read', 'table:write'], data: {columns: [{name: '회차'}, {name: '점수', type: 'number'}]}, view: [{block: 'form'}, {block: 'chart', x: '회차', y: '점수'}]};
const code = {id: 'counter', name: '카운터', permissions: ['table:read', 'table:write'], code: 'lit.table.rows()'};

test('library: saved widgets, templates, skins and manifest widgets per account; bad manifests are refused', async () => {
  const w = await saveLibrary(owner, {kind: 'custom', data: {manifest: blocks}});
  assert.equal(w.id, 'w-leet-score'); assert.equal(w.name, '기출 점수');
  assert.ok(runnable(w as LibraryItem<'custom'>), 'a block widget runs without approval');
  await saveLibrary(owner, {kind: 'template', name: '수험 틀', data: {widgets: [{id: 'a', type: 'tasks', x: 0, y: 0, w: 24, h: 30, options: {}}]}});
  await saveLibrary(owner, {kind: 'skin', name: '밤', data: {skin: {background: '#151515'}}});
  await assert.rejects(saveLibrary(owner, {kind: 'custom', data: {manifest: {id: 'X Y', name: ''}}}), /내용을 읽지 못했어요/);
  await assert.rejects(saveLibrary(owner, {kind: 'custom', data: {manifest: {id: 'empty', name: '빈'}}}), /블록\(view\)이나 코드/);
  assert.equal((await listLibrary(owner)).length, 3);
  assert.equal((await listLibrary(other)).length, 0, 'another account sees nothing');
});

test('code widgets run only after approval of that exact code; changing code or permissions asks again', async () => {
  let it = await saveLibrary(owner, {kind: 'custom', data: {manifest: code}}) as LibraryItem<'custom'>;
  assert.equal(runnable(it), false);
  it = await setLibraryState(owner, it.id, {approve: true}) as LibraryItem<'custom'>;
  assert.equal(it.approved, codeHash(it.data.manifest)); assert.ok(runnable(it));
  it = await saveLibrary(owner, {kind: 'custom', data: {manifest: {...code, version: '1.0.1'}}}) as LibraryItem<'custom'>;
  assert.ok(runnable(it), 'same code, new version number: still approved');
  it = await saveLibrary(owner, {kind: 'custom', data: {manifest: {...code, code: 'lit.tasks.today()'}}}) as LibraryItem<'custom'>;
  assert.equal(runnable(it), false, 'new code needs a new approval');
  it = await setLibraryState(owner, it.id, {approve: true}) as LibraryItem<'custom'>;
  it = await saveLibrary(owner, {kind: 'custom', data: {manifest: {...code, code: 'lit.tasks.today()', permissions: ['tasks:read']}}}) as LibraryItem<'custom'>;
  assert.equal(runnable(it), false, 'new permissions need a new approval');
  it = await setLibraryState(owner, it.id, {enabled: false}) as LibraryItem<'custom'>;
  assert.equal(it.enabled, false);
  await deleteLibrary(owner, it.id);
  assert.ok(!(await listLibrary(owner)).some(x => x.id === it.id));
});

test('developer tokens: shown once, map to the owner, can be revoked', async () => {
  const {token} = await createDevToken(owner, '노트북');
  assert.match(token, /^litdev_/);
  assert.equal(await ownerOfDevToken(token), owner);
  const [t] = await listDevTokens(owner);
  assert.equal(t!.label, '노트북'); assert.ok(t!.lastUsedAt);
  await revokeDevToken(owner, t!.id);
  await assert.rejects(ownerOfDevToken(token), /취소/);
  await assert.rejects(ownerOfDevToken('litdev_nope'), /맞지 않거나/);
});

test('connector: Claude creates a widget into the library and can place it on the day page', async () => {
  await saveSpec(owner, TEMPLATES[0]!.spec);
  const out = await (tools.get('create_widget')!({manifest: {...blocks, id: 'mood-log', name: '기분 기록'}, place: true} as never, owner)) as {id: string; placed: boolean; needsApproval: boolean};
  assert.equal(out.id, 'w-mood-log'); assert.equal(out.needsApproval, false); assert.equal(out.placed, true);
  const day = (await getSpec(owner))!.spec.canvas.day!;
  assert.equal(day.at(-1)!.type, 'custom'); assert.equal(day.at(-1)!.options.ref, 'w-mood-log');
  const item = (await listLibrary(owner)).find(i => i.id === 'w-mood-log')!;
  assert.equal(item.source, 'claude');
  const codeOut = await (tools.get('create_widget')!({manifest: {...code, id: 'claude-code'}} as never, owner)) as {needsApproval: boolean};
  assert.equal(codeOut.needsApproval, true, 'Claude-made code still needs the user to approve it');
  const list = await (tools.get('list_widgets')!({} as never, owner)) as {id: string}[];
  assert.ok(list.some(i => i.id === 'w-claude-code'));
});
