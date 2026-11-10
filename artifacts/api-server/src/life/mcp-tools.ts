import {z} from 'zod';
import {ALL_SCOPES, buildNow, goalSchedule, logicalDay, weeklyFocus, type AnyRecord} from '@workspace/life-contract';
import {BUILTIN_TABS, FONTS, GAUGES, PALETTE, PROP_TYPES, SKIN_PRESETS, WIDGETS, WIDGET_LABELS, buildSpec, newPropId, normalizeWidgets, tabsOf, toFree, uses, type PlannerSpec, type PropDef} from '@workspace/planner-spec';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';
import {allRecords, getSettings, getSpec, lastActivity, putSettings, saveSpec, writeRecord} from './store.ts';

// Planner tools for the MOONS connector: Claude talks with the user, then builds and fills the planner directly.
// Writes go straight to the user's planner (it is their own tool, not their knowledge base); nothing is invented
// about the user — the guide tells the model to ask first and to show the plan before building.
type Tool = <S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>, owner: string) => Promise<unknown>) => unknown;
const plannerUrl = () => (process.env.PLANNER_PUBLIC_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5174')).replace(/\/$/, '');

const guide = () => `lit · 대화로 만들고 마음대로 꾸미는 나만의 다이어리 (MOONS의 다이어리)
너는 lit의 플래너 문처럼 사용자와 대화하며 사용자의 하루에 맞는 플래너를 만든다. 순서:
1. 묻기: 무엇을 관리하고 싶은지(할 일, 루틴, 공부 시간, 컨디션, 수면, 목표, 회고, 다꾸 꾸미기), 하루 리듬(기상·취침), 쓰는 기기(폰/PC), 좋아하는 느낌(색·글꼴·종이). 모르는 건 지어내지 않는다.
2. 제안: 어떤 위젯을 어디에 둘지, 스킨(색·글꼴·종이)을 말로 짧게 보여 주고 사용자의 OK를 받는다.
3. 만들기: build_planner. 기존 플래너가 있으면 get_planner로 먼저 보고, 바꾸는 것만 반영한다(바꿔도 기록은 그대로, 새 버전이 된다).
4. 채우기(원하면): 큰 목표는 add_goal_plan(마일스톤에 끝낼 달·예상 시간), 할 일·루틴·페르소나는 add_items. 할 일은 goalId로 목표에 이어야 체크가 진행률이 된다.
5. 마지막에 플래너 주소를 알려 준다: ${plannerUrl()} (홈 화면에 설치 가능). 사용자는 "꾸미기"로 언제든 직접 고칠 수 있다.

위치는 12칸 × 30px 줄 단위로 보낸다(x 0~11, w 1~12, y 0부터, h 줄 수). 저장할 때 4배 고운 칸으로 바뀌고 위젯끼리 겹칠 수 있다(배치 방식은 하나). 쓰는 화면에서는 위젯이 내용만큼 자라고 아래 위젯이 밀려 내려간다. options.toggle:true면 위젯을 접고 펼 수 있다. 꾸미기 위젯(sticker·tape·image·shape)은 겹치고 options.rotate(-45~45)로 기울일 수 있다.
위젯: ${WIDGETS.map(w => `${w.type}(${w.label}, 기본 ${w.w}×${w.h}: ${w.desc})`).join('; ')}.
위젯 옵션 예: tasks{categories,amounts} routine{mode:"pick_daily"|"fixed_all",askReason} timetable/hourly/page{startHour} checkin{wake:"07:00",sleep:"00:00"} text{text,size:"s|m|l|xl",align} progress/dday{goalId|date,label} sticker{glyph,size} tape{pattern:"plain|stripe|dot|check|grid",color,opacity} image{src(https),frame:"polaroid|round|circle|none",caption} shape{shape:"heart|star|cloud|circle|label|flower",color,text}.
위젯 꾸밈: title(""이면 숨김), font, color(강조), background, ink(글자색), style("card|line|filled|plain").
스킨: accent·background·surface·ink(#hex), paper("plain|grid|dot|lined"), font, card, heading("rule|pill|plain"), radius(0~28), gauge(진행률 모양: ${GAUGES.map(g => `${g.id}=${g.name}`).join(", ")}), check("box|circle"), done("red-strike|strike|fade|highlight"). 기본은 계기판(회색 판, 검정 선, 노랑 신호, 모서리 0). 프리셋: ${SKIN_PRESETS.map(p => p.id).join(', ')}.
글꼴 id: ${FONTS.map(f => `${f.id}(${f.kind})`).join(', ')}.
팔레트: ${PALETTE.join(' ')}.
탭: 노션 페이지처럼 사용자가 추가·삭제·이름을 바꾼다. tabs로 보낼 수 있다: kind는 ${BUILTIN_TABS.map(t => `${t.kind}(${t.name})`).join(', ')}, page(빈 페이지 + 그 페이지의 widgets). 탭을 안 보내면 지금 탭 그대로.
사용자가 이름 붙이는 속성: taskProps로 모든 할 일에 속성을 단다(이름, type ${PROP_TYPES.map(t => `${t.id}=${t.name}`).join('·')}, select면 options). tasks 위젯 options.groupBy에 select 속성 이름을 주면 그 선택지로 할 일을 나눈다.
표 위젯(type "table"): options.columns=[{name,type,options}], options.firstName(첫 열 이름), options.scope("day" 그날 줄만 | "all" 모든 날). 줄은 add_items의 rows로 넣는다.
버튼·칸 문구는 위젯 options.labels로 바꾼다: ${Object.entries(WIDGET_LABELS).map(([t, ls]) => `${t}{${ls!.map(l => l.key).join(',')}}`).join(' ')}. 예시 문장을 플레이스홀더로 넣지 않는다(개인 공간이다).
기록 규칙: 하루는 logicalDay(YYYY-MM-DD, 사용자 하루 경계 기준). 목표는 연간 → 마일스톤(끝낼 달) → 할 일. 사용자가 말하지 않은 시험일·점수 등은 묻는다.`;

const looseWidget = z.object({type: z.string(), x: z.number().int().optional(), y: z.number().int().optional(), w: z.number().int().optional(), h: z.number().int().optional(),
  title: z.string().max(40).optional(), font: z.string().max(40).optional(), color: z.string().optional(), background: z.string().optional(), ink: z.string().optional(),
  style: z.enum(['card', 'line', 'filled', 'plain']).optional(), options: z.record(z.unknown()).optional()});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cell = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const propIn = z.object({name: z.string().min(1).max(30), type: z.enum(['text', 'number', 'select', 'check', 'date']), options: z.array(z.string().min(1).max(30)).max(30).optional()});
/** Properties by name: an existing one keeps its id (so values stay), new ones get an id. */
function mergeProps(current: PropDef[], input: z.infer<typeof propIn>[]): PropDef[] {
  return input.map(p => ({id: current.find(c => c.name === p.name)?.id ?? newPropId(), name: p.name, type: p.type, options: p.type === 'select' ? p.options ?? [] : []}));
}
/** A tasks widget may name its group property; store the property id. Table columns get ids too. */
function fixGroupBy(spec: PlannerSpec) {
  for (const w of [...(spec.canvas.day ?? []), ...(spec.tabs ?? []).flatMap(t => t.widgets ?? [])]) {
    if (w.type === 'tasks' && typeof w.options.groupBy === 'string') { const d = spec.props.task.find(p => p.name === w.options.groupBy); if (d) w.options.groupBy = d.id; }
    if (w.type === 'table' && Array.isArray(w.options.columns)) w.options.columns = (w.options.columns as {id?: string; name: string; type?: string; options?: string[]}[]).slice(0, 20).map(c => ({id: c.id && /^[a-z0-9]{1,24}$/.test(c.id) ? c.id : newPropId(), name: String(c.name).slice(0, 30), type: ['text', 'number', 'select', 'check', 'date'].includes(c.type ?? '') ? c.type : 'text', options: c.type === 'select' ? c.options ?? [] : []}));
  }
}
const month = z.string().regex(/^\d{4}-\d{2}$/);

async function ensureSettings(owner: string, tz?: string) {
  const s = await getSettings(owner);
  if (!s.configured) return putSettings(owner, {tz: tz ?? 'Asia/Seoul', dayBoundary: '04:00'});
  return s;
}

export function registerPlannerTools(tool: Tool) {
  tool('planner_guide', 'lit(사용자 다이어리·플래너)을 대화로 만들고 채우는 방법: 순서, 위젯·스킨·글꼴 목록, 기록 규칙. 플래너 도구를 쓰기 전에 한 번 읽는다.', {}, async () => guide());

  tool('get_planner', '사용자의 지금 플래너: 이름, 버전, 위젯 배치, 스킨, 하루 기준, 기록 수, 주소.', {}, async (_a, owner) => {
    const planner = await getSpec(owner), settings = await getSettings(owner), records = await allRecords(owner);
    const count = (k: string) => records.filter(r => r.kind === k).length;
    return {url: plannerUrl(), exists: !!planner, version: planner?.version ?? null, name: planner?.spec.name ?? null,
      widgets: planner?.spec.canvas?.day ?? null, skin: planner?.spec.skin ?? null,
      tabs: planner ? tabsOf(planner.spec as PlannerSpec).map(t => ({name: t.name, kind: t.kind, widgets: t.widgets?.length ?? undefined})) : null, taskProps: (planner?.spec as PlannerSpec | undefined)?.props?.task ?? [],
      tables: planner ? [...((planner.spec as PlannerSpec).canvas?.day ?? []), ...((planner.spec as PlannerSpec).tabs ?? []).flatMap(t => t.widgets ?? [])].filter(w => w.type === 'table').map(w => ({id: w.id, title: w.title ?? null, columns: w.options.columns ?? []})) : [], settings: settings.configured ? {tz: settings.tz, dayBoundary: settings.dayBoundary} : null,
      records: {goals: count('goal'), tasks: count('task'), routines: count('routine'), personas: count('persona')}};
  });

  tool('build_planner', '플래너를 만들거나 바꾼다(새 버전, 기록은 그대로). widgets는 위젯 배치(guide 참고), skin은 바꿀 스킨 값만. 사용자에게 계획을 보여 주고 OK를 받은 뒤에 부른다.',
    {name: z.string().max(40).optional(), widgets: z.array(looseWidget).min(1).max(80), skin: z.record(z.unknown()).optional(), skinPreset: z.string().optional(),
      weekLayout: z.enum(['horizontal', 'vertical']).optional(), timezone: z.string().optional(), mode: z.enum(['free', 'grid']).optional(),
      tabs: z.array(z.object({name: z.string().min(1).max(20), kind: z.enum(['today', 'week', 'month', 'goals', 'insights', 'page']), widgets: z.array(looseWidget).max(80).optional()})).min(1).max(20).optional(),
      taskProps: z.array(propIn).max(20).optional()},
    async ({name, widgets, skin, skinPreset, weekLayout, timezone, tabs, taskProps}, owner) => {
      await ensureSettings(owner, timezone);
      const current = (await getSpec(owner))?.spec as PlannerSpec | undefined;
      const preset = SKIN_PRESETS.find(p => p.id === skinPreset)?.skin;
      const {spec, dropped} = buildSpec(current ?? null, {name, widgets, skin: {...(preset ?? {}), ...(skin ?? {})}, weekLayout, mode: 'free'});
      if (taskProps) spec.props = {task: mergeProps(current?.props?.task ?? [], taskProps)};
      if (tabs) spec.tabs = tabs.map((t, i) => ({id: t.kind === 'page' ? `p-${i}-${Date.now().toString(36)}` : (tabs.findIndex(x => x.kind === t.kind) === i ? t.kind : `${t.kind}-${i}`), name: t.name, kind: t.kind,
        ...(t.kind === 'page' ? {widgets: toFree(normalizeWidgets(t.widgets ?? []).widgets)} : {})}));
      else if (current?.tabs) spec.tabs = current.tabs;
      fixGroupBy(spec);
      const saved = await saveSpec(owner, spec);
      return {url: plannerUrl(), version: saved.version, widgets: spec.canvas.day!.map(w => `${w.id} ${w.type}@${w.x},${w.y} ${w.w}×${w.h}`), tabs: tabsOf(spec).map(t => t.name), taskProps: spec.props.task.map(p => p.name), ignored: dropped,
        note: '사용자에게 주소를 알려 주고, 화면에서 "꾸미기"로 직접 옮기고 꾸밀 수 있다고 말한다.'};
    });

  tool('add_goal_plan', '큰 목표 하나와 마일스톤(끝낼 달·예상 시간·기준)을 만들고, 원하면 첫 할 일을 데일리에 올린다. 결과로 원하는 마감 vs 가능한 날, 다른 목표와의 병목을 돌려준다.',
    {goal: z.object({title: z.string().min(1).max(200), deadline: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(), success: z.string().max(300).optional()}),
      milestones: z.array(z.object({title: z.string().min(1).max(200), due: month, effortHours: z.number().positive().max(2000).optional(), weight: z.number().int().min(1).max(5).optional(),
        measure: z.object({amount: z.number().positive(), unit: z.string().max(24)}).optional(), why: z.string().max(300).optional()})).max(12),
      firstTasks: z.array(z.object({title: z.string().min(1).max(200), day: day.optional(), milestone: z.number().int().min(0).max(11), estimateMin: z.number().int().min(1).max(1440).optional()})).max(20).optional()},
    async ({goal, milestones, firstTasks}, owner) => {
      const settings = await ensureSettings(owner), today = logicalDay(new Date(), settings);
      const top = await writeRecord(owner, null, {kind: 'goal', body: {title: goal.title, horizon: 'year', period: (goal.deadline ?? today).slice(0, 4), deadline: goal.deadline ?? null, criterion: goal.success ?? null}, source: {type: 'planner', ref: 'claude', confirmed: true}});
      const ids: string[] = [];
      for (const m of milestones) ids.push((await writeRecord(owner, null, {kind: 'goal', body: {title: m.title, horizon: 'milestone', period: m.due, parentGoalId: top.id, weight: m.weight ?? 1,
        effortHours: m.effortHours ?? null, criterion: m.why ?? null, target: m.measure ? {...m.measure, aggregation: 'sum'} : null}, source: {type: 'planner', ref: 'claude', confirmed: true}})).id);
      for (const t of firstTasks ?? []) if (ids[t.milestone]) await writeRecord(owner, null, {kind: 'task', logicalDay: t.day ?? today,
        body: {title: t.title, category: 'must', goalIds: [ids[t.milestone]], plan: {state: 'committed', estimateMin: t.estimateMin ?? null}}, source: {type: 'planner', ref: 'claude', confirmed: true}});
      const records = await allRecords(owner), s = goalSchedule(records, today, weeklyFocus(records, today));
      const mine = s.goals.find(g => g.id === top.id);
      return {goalId: top.id, milestoneIds: ids, deadline: mine?.deadline ?? goal.deadline ?? null, feasible: mine?.projected ?? null, lateDays: mine?.lateDays ?? 0,
        weeklyFocusMin: s.weeklyMin, bottlenecks: s.bottlenecks.map(b => ({month: b.month, needMin: b.demandMin, haveMin: b.capacityMin, goals: b.goals})), url: plannerUrl()};
    });

  tool('add_items', '할 일·루틴·페르소나·표의 줄을 플래너에 넣는다. 할 일 props와 표 cells는 속성·열 이름으로 보낸다. 할 일은 day(없으면 오늘), goalId로 목표에 이으면 체크가 진행률이 된다. fixedStart/fixedEnd(HH:MM)면 고정 일정.',
    {tasks: z.array(z.object({title: z.string().min(1).max(200), day: day.optional(), category: z.enum(['must', 'want', 'leisure']).optional(), estimateMin: z.number().int().min(1).max(1440).optional(),
      goalId: z.string().optional(), fixedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(), fixedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      props: z.record(cell).optional()})).max(50).optional(),
      rows: z.array(z.object({table: z.string().min(1).max(60), day: day.optional(), name: z.string().max(500).optional(), cells: z.record(cell).optional()})).max(100).optional(),
      routines: z.array(z.object({title: z.string().min(1).max(200), mode: z.enum(['pick_daily', 'fixed_all']).optional(), goalId: z.string().optional(), weekdays: z.array(z.number().int().min(0).max(6)).optional()})).max(30).optional(),
      personas: z.array(z.object({name: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()})).max(10).optional()},
    async ({tasks, routines, personas, rows}, owner) => {
      const settings = await ensureSettings(owner), today = logicalDay(new Date(), settings);
      const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
      const defs = spec?.props?.task ?? [];
      // Property and column values arrive by name; stored by id.
      const byName = (list: PropDef[], values: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(values ?? {}).flatMap(([k, v]) => { const d = list.find(x => x.name === k || x.id === k); return d ? [[d.id, v]] : []; }));
      const src = {type: 'planner' as const, ref: 'claude', confirmed: true};
      const at = (d: string, hm: string) => new Date(`${d}T${hm}:00${offset(settings.tz, d)}`).toISOString();
      const made = {tasks: 0, routines: 0, personas: 0};
      for (const t of tasks ?? []) {
        const d = t.day ?? today, fixed = t.fixedStart && t.fixedEnd ? {fixed: true, start: {value: at(d, t.fixedStart), precision: 'minute'}, end: {value: at(d, t.fixedEnd), precision: 'minute'}} : {};
        await writeRecord(owner, null, {kind: 'task', logicalDay: d, body: {title: t.title, category: t.category ?? null, goalIds: t.goalId ? [t.goalId] : [], props: byName(defs, t.props), plan: {state: 'committed', estimateMin: t.estimateMin ?? null, ...fixed}}, source: src}); made.tasks++;
      }
      for (const r of routines ?? []) { await writeRecord(owner, null, {kind: 'routine', body: {title: r.title, mode: r.mode ?? 'pick_daily', goalIds: r.goalId ? [r.goalId] : [], recurrence: r.weekdays?.length ? {freq: 'weekly', byWeekday: r.weekdays} : {freq: 'daily'}}, source: src}); made.routines++; }
      for (const p of personas ?? []) { await writeRecord(owner, null, {kind: 'persona', body: {name: p.name, ...(p.color ? {color: p.color} : {})}, source: src}); made.personas++; }
      const tables = [...(spec?.canvas?.day ?? []), ...(spec?.tabs ?? []).flatMap(t => t.widgets ?? [])].filter(w => w.type === 'table');
      let rowsMade = 0;
      for (const r of rows ?? []) {
        const w = tables.find(x => x.id === r.table || (x.title ?? '') === r.table);
        if (!w) throw new WorkspaceError(404, `표를 찾지 못했어요: ${r.table}. get_planner의 tables에서 id나 제목을 고른다.`);
        await writeRecord(owner, null, {kind: 'note', logicalDay: r.day ?? today, body: {text: r.name ?? '', signifier: 'row', table: w.id, cells: byName((w.options.columns as PropDef[] | undefined) ?? [], r.cells)}, source: src}); rowsMade++;
      }
      return {...made, rows: rowsMade, url: plannerUrl()};
    });

  tool('get_today', '사용자의 오늘(또는 지금) 상태: 할 일과 결과, 목표 진행률, 지금 집중 중인 일, 컨디션·수면.', {}, async (_a, owner) => {
    const settings = await getSettings(owner), spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
    if (!spec) throw new WorkspaceError(404, '아직 플래너가 없어요. build_planner로 먼저 만든다.');
    const records: AnyRecord[] = await allRecords(owner);
    return buildNow(records, settings, new Date(), {revision: settings.revision, scopes: ALL_SCOPES, lastActivityAt: await lastActivity(owner),
      modules: {sleep: uses(spec, 'sleep'), condition: uses(spec, 'condition'), timer: uses(spec, 'timer')}});
  });
}

/** "+09:00" for a time zone on a date, so HH:MM from the user means their local time. */
function offset(tz: string, d: string) {
  const at = new Date(`${d}T12:00:00Z`);
  const local = new Date(at.toLocaleString('en-US', {timeZone: tz})), utc = new Date(at.toLocaleString('en-US', {timeZone: 'UTC'}));
  const min = Math.round((local.getTime() - utc.getTime()) / 60000), sign = min >= 0 ? '+' : '-', a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
