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

test('lit connector: tabs, named task properties and a table the user can fill from chat', async () => {
  await call('build_planner', {widgets: [{type: 'tasks', options: {groupBy: '과목'}}], taskProps: [{name: '과목', type: 'select', options: ['언어', '추리']}],
    tabs: [{name: '오늘', kind: 'today'}, {name: '공부 기록', kind: 'page', widgets: [{type: 'table', title: '기출', options: {firstName: '회차', scope: 'all', columns: [{name: '점수', type: 'number'}, {name: '오답', type: 'text'}]}}]}, {name: '목표', kind: 'goals'}]});
  const spec = (await getSpec(owner))!.spec;
  assert.deepEqual(spec.tabs!.map(t => t.name), ['오늘', '공부 기록', '목표']);
  const subj = spec.props.task[0]!;
  assert.equal(subj.name, '과목'); assert.equal(spec.canvas.day![0]!.options.groupBy, subj.id, 'groupBy by name becomes the property id');
  const table = spec.tabs![1]!.widgets![0]!;
  const got = await call('get_planner', {});
  assert.equal((got.tables as {id: string}[])[0]!.id, table.id);
  await call('add_items', {tasks: [{title: '2024 언어', props: {과목: '언어'}}], rows: [{table: '기출', name: '2024', cells: {점수: 62, 오답: '3, 17'}}]});
  const records = await allRecords(owner);
  const t = records.find(r => r.kind === 'task' && (r.body as {title: string}).title === '2024 언어')!;
  assert.equal((t.body as {props: Record<string, unknown>}).props[subj.id], '언어');
  const row = records.find(r => r.kind === 'note' && (r.body as {signifier: string}).signifier === 'row')!;
  const cols = table.options.columns as {id: string; name: string}[];
  assert.equal((row.body as {cells: Record<string, unknown>}).cells[cols.find(c => c.name === '점수')!.id], 62);
  // Rebuilding the day page without tabs keeps the user's tabs.
  await call('build_planner', {widgets: [{type: 'tasks'}]});
  assert.equal((await getSpec(owner))!.spec.tabs!.length, 3);
});

test('P0: availability drives plans; tasks and table rows can be listed, edited, moved and deleted; sessions fill a log table', async () => {
  const {writeRecord} = await import('./store.ts');
  const av = await call('set_availability', {weekdayMinutes: [435, 435, 180, 435, 180, 435, 435], exceptions: [{date: '2026-11-21', minutes: 0, note: '데이트'}, {date: '2026-11-28', hours: 1, note: '발표'}]});
  assert.equal((av.availability as {exceptions: unknown[]}).exceptions.length, 2);
  const plan = await call('add_goal_plan', {goal: {title: 'LEET 11월', deadline: '2026-12'}, milestones: [{title: '11월분', due: '2026-11', effortHours: 30}]});
  assert.equal(plan.capacityBasis, 'availability');
  const more = await call('set_availability', {exceptions: [{date: '2026-12-01', hours: 2}], addExceptions: true});
  assert.equal((more.availability as {exceptions: unknown[]}).exceptions.length, 3);

  // A log table for sessions, with a task property (Role) matched by name.
  await call('build_planner', {widgets: [{type: 'tasks'}, {type: 'table', title: '집중 로그', options: {autoLog: 'sessions', scope: 'all', columns: [{name: '할 일', type: 'text'}, {name: 'Role', type: 'text'}, {name: '시작', type: 'text'}, {name: '분', type: 'number'}, {name: '컨디션', type: 'number'}]}},
    {type: 'table', title: '소원 상자', options: {scope: 'all', columns: [{name: '상태', type: 'select', options: ['잠김', '해금', '사용함']}]}}],
    taskProps: [{name: 'Role', type: 'select', options: ['Scholar', 'Speaker']}]});
  await call('add_items', {tasks: [{title: '기출 1세트', day: '2026-11-10', props: {Role: 'Scholar'}}, {title: '기출 2세트', day: '2026-11-10'}], rows: [{table: '소원 상자', name: '케이크', cells: {상태: '잠김'}}]});
  const tasks = await call('list_tasks', {day: '2026-11-10'} as never) as unknown as {id: string; title: string; props: Record<string, unknown>}[];
  const t1 = tasks.find(t => t.title === '기출 1세트')!, t2 = tasks.find(t => t.title === '기출 2세트')!;
  assert.equal(t1.props.Role, 'Scholar');
  const moved = await call('update_task', {id: t2.id, day: '2026-11-11', result: 'done', props: {Role: 'Speaker'}});
  assert.equal(moved.day, '2026-11-11'); assert.equal(moved.result, 'done');
  await call('delete_task', {id: t1.id});
  assert.deepEqual((await call('list_tasks', {from: '2026-11-10', to: '2026-11-11'}) as unknown as {title: string}[]).map(t => t.title).filter(t => t.startsWith('기출 ')), ['기출 2세트']);

  const wish = await call('list_rows', {table: '소원 상자', where: {상태: '잠김'}}) as {rows: {id: string; name: string}[]};
  assert.equal(wish.rows[0]!.name, '케이크');
  const opened = await call('update_row', {id: wish.rows[0]!.id, cells: {상태: '해금'}});
  assert.equal((opened.cells as Record<string, unknown>)['상태'], '해금');

  // Timer stops → a row; rating the condition later updates the same row.
  const s = await writeRecord(owner, null, {kind: 'session', logicalDay: '2026-11-11', body: {taskId: t2.id, label: '기출 2세트', start: '2026-11-11T00:00:00Z', end: '2026-11-11T01:30:00Z'}});
  await writeRecord(owner, s.id, {kind: 'session', logicalDay: '2026-11-11', body: {...s.body, condition: 5}});
  const log = await call('list_rows', {table: '집중 로그'}) as {rows: {cells: Record<string, unknown>; name: string}[]};
  assert.equal(log.rows.length, 1, 'one session, one row');
  assert.deepEqual([log.rows[0]!.cells['할 일'], log.rows[0]!.cells['Role'], log.rows[0]!.cells['분'], log.rows[0]!.cells['컨디션'], log.rows[0]!.cells['시작']], ['기출 2세트', 'Speaker', 90, 5, '09:00']);
  const sessions = await call('list_sessions', {day: '2026-11-11', from: '2026-11-11'}) as unknown as {condition: number; props: Record<string, unknown>}[];
  assert.equal(sessions[0]!.condition, 5); assert.equal(sessions[0]!.props.Role, 'Speaker');
  await call('delete_row', {id: (wish.rows[0]!).id});
  assert.equal(((await call('list_rows', {table: '소원 상자'})) as {rows: unknown[]}).rows.length, 0);
});
