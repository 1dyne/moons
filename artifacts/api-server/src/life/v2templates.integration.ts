import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA, newId, type Driver} from '../moons/lib/server/db.ts';
import {addDays, weekday, type v2} from '@workspace/life-contract';
import {evalSignal, onOpen, value, type Item} from '@workspace/lit-core';
import {putSettings} from './store.ts';
import {ctxOf, getScreen, installTemplate, listSuggestions, loadWorkspace, runMoment, saveV2} from './v2.ts';

// The example templates (artifacts/lit/public/templates) installed into an empty lit, then used.
// They are data only: everything here runs through the generic grammar.
// Run from artifacts/api-server (pnpm run test:life).
const tpl = (f: string) => JSON.parse(readFileSync(`../lit/public/templates/${f}`, 'utf8'));
const memory = new PGlite(); let owner: string;
before(async () => {
  await memory.exec(SCHEMA);
  const driver: Driver = {query: (s, p) => memory.query(s, p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s, p) => tx.query(s, p) as ReturnType<Driver['query']>}))};
  (globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve(driver);
  owner = newId();
  await putSettings(owner, {tz: 'Asia/Seoul', dayBoundary: '04:00'});
});
const refs = async (t: string) => ((await getScreen(owner)).body as v2.ScreenBody).installed[t]!;
const item = async (body: unknown) => (await saveV2(owner, null, {kind: 'item', body})).record as Item;
const update = async (it: Item, values: Record<string, unknown>) => saveV2(owner, it.id, {kind: 'item', body: {...it.body, values: {...it.body.values, ...values}}});

test('templates install in order; a template that needs another is refused until that one is there', async () => {
  await assert.rejects(installTemplate(owner, tpl('routine.json')), /lit\.daily/);
  const d = await installTemplate(owner, tpl('daily.json'));
  assert.ok(d.created > 20);
  for (const f of ['routine.json', 'energy.json', 'toomuch.json', 'workout.json']) await installTemplate(owner, tpl(f));
  const screen = (await getScreen(owner)).body as v2.ScreenBody;
  assert.deepEqual(screen.pages.map(p => p.name), ['홈', '오늘', '목표', '루틴', '컨디션', '운동']);
  const ws = await loadWorkspace(owner);
  assert.equal([...ws.properties.values()].filter(p => p.body.role === 'start').length, 1, 'templates share one start property');
});

test('daily → goal: checking lines moves progress; achieving celebrates and opens the retro form; 100% is suggested', async () => {
  const r = await refs('lit.daily');
  const goal = await item({dbs: [r.$goals], values: {[r.$title!]: '시험 합격', [r.$gstate!]: 'active'}});
  const a = await item({dbs: [r.$daily], values: {[r.$title!]: '기출 1회', [r.$state!]: 'todo', [r.$goal!]: [goal.id]}});
  const b = await item({dbs: [r.$daily], values: {[r.$title!]: '오답 정리', [r.$state!]: 'todo', [r.$goal!]: [goal.id]}});
  await update(a, {[r.$state!]: 'did'});
  let ws = await loadWorkspace(owner);
  assert.equal(value(ws, ws.items.get(goal.id)!, r.$progress!), 50);
  await update(b, {[r.$state!]: 'drop'});
  ws = await loadWorkspace(owner);
  assert.equal(value(ws, ws.items.get(goal.id)!, r.$progress!), 100, 'a cancelled line does not count');
  assert.ok((await listSuggestions(owner)).some(p => p.item === goal.id), '100% → suggestion to mark it achieved');
  const done = await update(ws.items.get(goal.id)!, {[r.$gstate!]: 'achieved'});
  assert.deepEqual(done.effects.map(e => e.kind), ['effect', 'notify', 'openForm']);
  const form = done.effects[2] as {dbs: string[]; values: Record<string, unknown>};
  assert.deepEqual(form.dbs, [r.$retro]);
  assert.deepEqual(form.values[r.$about!], [goal.id]);
});

test('routine: the day start makes today\'s lines once, linked back to the routine', async () => {
  const d = await refs('lit.daily'), r = await refs('lit.routine'), ctx = await ctxOf(owner);
  await item({dbs: [r.$routines], values: {[d.$title!]: '독서', [r.$days!]: ['0', '1', '2', '3', '4', '5', '6'], [d.$est!]: 30}});
  await runMoment(owner, {kind: 'dayStart'}); await runMoment(owner, {kind: 'dayStart'});
  const ws = await loadWorkspace(owner);
  const made = [...ws.items.values()].filter(x => x.body.dbs.includes(d.$daily!) && x.body.values[r.$from!]);
  const expected = 1 + ([1, 2, 3, 4, 5].includes(weekday(ctx.today)) ? 1 : 0); // + the sample routine on weekdays
  assert.equal(made.length, expected);
  const reading = made.find(x => x.body.values[d.$title!] === '독서')!;
  assert.equal(reading.body.values[d.$day!], ctx.today);
  assert.equal(reading.body.values[d.$state!], 'todo');
});

test('energy + available time + too much: plans over the time left move non-must lines to 희망사항', async () => {
  const d = await refs('lit.daily'), e = await refs('lit.energy'), ctx = await ctxOf(owner);
  await item({dbs: [d.$daily], values: {[d.$title!]: '수업', [d.$fixed!]: true, [d.$est!]: 120, [d.$day!]: ctx.today}});
  await item({dbs: [e.$check], values: {[e.$awake!]: 960, [e.$score!]: 5}});
  let ws = await loadWorkspace(owner);
  assert.deepEqual(evalSignal(ws, e.$availSig!, ctx).value, (960 - 120) * 5 / 10);
  const must = await item({dbs: [d.$daily], values: {[d.$title!]: '보고서', [d.$cat!]: 'must', [d.$est!]: 300, [d.$day!]: ctx.today, [d.$state!]: 'todo'}});
  const extra = await item({dbs: [d.$daily], values: {[d.$title!]: '책 정리', [d.$est!]: 100, [d.$day!]: ctx.today, [d.$state!]: 'todo'}});
  ws = await loadWorkspace(owner);
  assert.equal(ws.items.get(extra.id)!.body.values[d.$cat!], 'want', 'moved by the rule once planned time went over');
  assert.equal(ws.items.get(must.id)!.body.values[d.$cat!], 'must');
  const low = await item({dbs: [e.$energyLog], values: {[e.$score!]: 3}});
  assert.ok(low);
});

test('workout: opening a line with 운동 goes to the workout page carrying it; last time\'s weight shows', async () => {
  const d = await refs('lit.daily'), w = await refs('lit.workout'), ctx = await ctxOf(owner);
  const line = await item({dbs: [d.$daily], values: {[d.$title!]: '저녁 운동', [d.$day!]: ctx.today, [d.$state!]: 'todo'}});
  const ws = await loadWorkspace(owner);
  const screen = (await getScreen(owner)).body as v2.ScreenBody, page = screen.pages.find(p => p.name === '운동')!;
  assert.deepEqual(onOpen(ws, ws.items.get(line.id)!, ctx), [{kind: 'goTo', page: page.id, item: line.id}]);
  const squat = [...ws.items.values()].find(x => x.body.values[d.$title!] === '스쿼트')!;
  await item({dbs: [w.$sets], values: {[w.$kind!]: [squat.id], [w.$weight!]: 60, [d.$start!]: `${addDays(ctx.today, -2)}T10:00:00.000Z`}});
  const s2 = await item({dbs: [w.$sets], values: {[w.$kind!]: [squat.id], [w.$weight!]: 65, [d.$start!]: `${ctx.today}T10:00:00.000Z`}});
  const ws2 = await loadWorkspace(owner);
  assert.equal(value(ws2, ws2.items.get(s2.id)!, w.$prev!), 60);
  assert.equal(value(ws2, ws2.items.get(squat.id)!, w.$best!), 65);
});
