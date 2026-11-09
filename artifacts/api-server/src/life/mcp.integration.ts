import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA, newId, type Driver} from '../moons/lib/server/db.ts';
import {registerPlannerTools} from './mcp-tools.ts';
import {getSpec, allRecords} from './store.ts';

// The connector tools, called the way the MCP server calls them (owner from the OAuth token).
const tools = new Map<string, (args: never, owner: string) => Promise<unknown>>();
registerPlannerTools(((name: string, _d: string, _s: unknown, run: (a: never, o: string) => Promise<unknown>) => { tools.set(name, run); }) as never);
const call = (name: string, args: unknown) => tools.get(name)!(args as never, owner) as Promise<Record<string, unknown>>;
const memory = new PGlite(); let owner: string;
before(async () => {
  await memory.exec(SCHEMA);
  (globalThis as unknown as {__moonsDb: Promise<Driver>}).__moonsDb = Promise.resolve({query: (s, p) => memory.query(s, p) as ReturnType<Driver['query']>, transaction: fn => memory.transaction(tx => fn({query: (s, p) => tx.query(s, p) as ReturnType<Driver['query']>}))} as Driver);
  owner = newId();
});

test('Claude builds a planner from the conversation, then fills it; the guide lists widgets and fonts', async () => {
  const guide = await (tools.get('planner_guide')!({} as never, owner)) as string;
  assert.match(guide, /timetable/); assert.match(guide, /gaegu/);
  const built = await call('build_planner', {name: 'LEET 다꾸', skinPreset: 'deco', widgets: [{type: 'focus', x: 0, y: 0, w: 12, h: 3}, {type: 'tasks', x: 0, y: 3, w: 7, h: 12}, {type: 'timetable', x: 7, y: 3, w: 5, h: 16}, {type: 'sticker', options: {glyph: '🐰'}}, {type: 'nope'}]});
  assert.equal(built.version, 1); assert.deepEqual(built.ignored, ['nope']);
  const spec = (await getSpec(owner))!.spec;
  assert.equal(spec.name, 'LEET 다꾸'); assert.equal(spec.skin!.font, 'gaegu'); assert.equal(spec.canvas.day!.length, 4);
  const plan = await call('add_goal_plan', {goal: {title: '2027 LEET 상위 10%', deadline: '2027-01'}, milestones: [{title: '언어이해 기출 1회독', due: '2026-12', effortHours: 40}, {title: '추리논증 기출 1회독', due: '2027-01', effortHours: 60}],
    firstTasks: [{title: '언어이해 2024 1세트', milestone: 0, estimateMin: 60}]});
  assert.equal((plan.milestoneIds as string[]).length, 2); assert.ok(plan.feasible);
  await call('add_items', {tasks: [{title: '팀 회의', fixedStart: '14:00', fixedEnd: '15:00'}], routines: [{title: '아침 스트레칭'}], personas: [{name: '수험생'}]});
  const records = await allRecords(owner);
  assert.equal(records.filter(r => r.kind === 'task').length, 2);
  const meeting = records.find(r => r.kind === 'task' && (r.body as {title: string}).title === '팀 회의')!;
  assert.match((meeting.body as {plan: {start: {value: string}}}).plan.start.value, /T05:00:00/); // 14:00 in Seoul
  const today = await call('get_today', {});
  assert.ok(Array.isArray((today.today as {tasks: unknown[]}).tasks));
  const rebuilt = await call('build_planner', {widgets: [{type: 'bullet'}]});
  assert.equal(rebuilt.version, 2); assert.equal((await allRecords(owner)).length, records.length, 'rebuilding keeps every record');
});
