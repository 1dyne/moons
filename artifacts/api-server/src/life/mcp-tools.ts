import {z} from 'zod';
import './autolog.ts';
import {ALL_SCOPES, Availability, addDays, availableOn, buildNow, dayCondition, estimateAccuracy, goalPercent, goalSchedule, logicalDay, periodSummary, personaShare, weeklyFocus, type AnyRecord, type LifeRecord} from '@workspace/life-contract';
import {BLOCKS, PERMISSIONS, isCode, BUILTIN_TABS, FONTS, GAUGES, PALETTE, PROP_TYPES, SKIN_PRESETS, WIDGETS, WIDGET_LABELS, buildSpec, newPropId, normalizeWidgets, tabsOf, toFree, uses, type PlannerSpec, type PropDef} from '@workspace/planner-spec';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';
import {listLibrary, saveLibrary} from './library.ts';
import {allRecords, deleteRecord, getSettings, getSpec, lastActivity, putAvailability, putSettings, saveSpec, writeRecord} from './store.ts';

// Planner tools for the MOONS connector: Claude talks with the user, then builds and fills the planner directly.
// Writes go straight to the user's planner (it is their own tool, not their knowledge base); nothing is invented
// about the user — the guide tells the model to ask first and to show the plan before building.
type Tool = <S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>, owner: string) => Promise<unknown>) => unknown;
const plannerUrl = () => (process.env.PLANNER_PUBLIC_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5174')).replace(/\/$/, '');

const guide = () => `lit · 대화로 만들고 마음대로 꾸미는 나만의 다이어리 (MOONS의 다이어리)
너는 lit의 플래너 문처럼 사용자와 대화하며 사용자의 하루에 맞는 플래너를 만든다. 순서:
1. 묻기: 무엇을 관리하고 싶은지(할 일, 루틴, 공부 시간, 컨디션, 수면, 목표, 회고, 다꾸 꾸미기), 하루 리듬(기상·취침), 쓰는 기기(폰/PC), 좋아하는 느낌(색·글꼴·종이). 모르는 건 지어내지 않는다.
꼭 지킬 것 (개인 공간이다):
- 플래너 이름(name)·탭 이름·위젯 제목은 사용자가 직접 말한 것만 쓴다. 지어내지 않는다(사용자는 화면에서 두 번 눌러 고친다).
- 설명·주석·안내 문장을 넣지 않는다: 안내용 text 위젯, 설명 열, 예시 문장, 플레이스홀더 금지. text 위젯은 사용자가 그 문구를 원할 때만.
- 메모·소원처럼 '눌러서 새 페이지를 열고 꾸미는' 칸은 pagebox 위젯(options.icon: memo|mail|box|bowl|moon|gift|star). 잠김→해금 소원 목록은 wishes 위젯(표 아님). 같은 할 일·목표를 다르게 보려면 list 위젯(필터)으로. 표(table)는 사용자가 직접 기록할 칸이 필요할 때만.
- 과목 타이머: focus{subjects:[{name,color}], showTasks, askCondition, buttonColor}. 에너지 신호등: energy{greenAt, redAt, warnAt, timeline, labels:{"msg.blue","msg.amber","msg.red"}(사용자가 준 문구만)}. 오늘의 나: personas{display:"donut"|"top", prop}. 목록 보기: list{source:"tasks"|"goals", period:"today"|"week"|"month"|"overdue"|"all", status:"open"|"done"|"all", category, goalId, propId, propValue}. 주간·월·목표·분석을 페이지에 넣을 때: week-view, month-view, goals-view, insights-view.
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
자동 기록 표: 표 위젯 options.autoLog = "sessions"(집중 세션: 타이머를 멈추면 한 줄, 컨디션을 매기면 갱신) | "achievements"(목표 이룸 → 성취 기록지) | "adjustments"(목표 포기 → 조정 기록지). 열은 이름으로 맞춘다: 날짜, 할 일, 페르소나, 시작, 끝, 분, 시간, 컨디션, 메모, 목표, 완료일, 실제 시간(분), 임팩트, ROI, 다음엔 누가, 상태 + 할 일 속성 이름(Role 등).
가용 시간: set_availability(요일별 + 날짜 예외)를 먼저 정하면 add_goal_plan의 가능한 날짜·병목이 그 시간으로 계산된다.
고치기: list_tasks → update_task(날짜 옮기기 포함)/delete_task, list_rows → update_row/delete_row, list_sessions. 분석은 get_insights(요약)를 먼저 읽는다.
목표 이룸·포기: update_goal(status achieved: impact 1~10·nextOwner me/ai/outsource·note → 성취 기록지, ROI 자동 / dropped: note → 조정 기록지 / active: 다시 목표로). 페르소나: set_persona(월별 deployed/attached/standby·우선순위·roles). 할 일 속성 type "role"은 페르소나별 역할 중에서 고른다.
기본 위젯: energy{warnAt(기본 6),startHour}(에너지 신호등: 7↑ 파랑, 4~6 호박, 3↓ 빨강) · mission{focusTarget(분, 기본 480), wishTable(표 id), statusColumn('상태'), lockedValue('잠김'), unlockValue('해금')} · persona-board{limit(기본 3)}. 하고 싶은 일(category want)은 회색이고 달성률에서 빠진다.
버튼·칸 문구는 위젯 options.labels로 바꾼다: ${Object.entries(WIDGET_LABELS).map(([t, ls]) => `${t}{${ls!.map(l => l.key).join(',')}}`).join(' ')}. 예시 문장을 플레이스홀더로 넣지 않는다(개인 공간이다).
내 위젯(create_widget): lit에 없는 위젯은 설명서(manifest)로 만들어 사용자의 라이브러리에 넣는다. 블록 위젯이 기본이다: data.columns(열 이름·종류, key는 생략하면 이름) + view(블록 목록: ${BLOCKS.map(b => `${b.id}=${b.name}`).join(', ')}). 블록에서 열은 이름으로 부른다. 예: {"id":"leet-score","name":"기출 점수","permissions":["table:read","table:write"],"data":{"columns":[{"name":"회차","type":"text"},{"name":"점수","type":"number"}]},"view":[{"block":"form"},{"block":"chart","x":"회차","y":"점수"},{"block":"stat","value":"점수","agg":"avg","label":"평균"}]}.
코드 위젯은 블록으로 안 될 때만: html·css·code(JavaScript, 전역 lit API: lit.table.rows/add/update/remove, lit.tasks.today, lit.goals.list, lit.condition.today, lit.context, lit.on('change')). 인터넷 접속은 막혀 있다. permissions: ${PERMISSIONS.map(p => p.id).join(', ')} 중 필요한 것만. 코드 위젯은 사용자가 lit에서 권한을 보고 승인해야 돈다고 알려 준다.
기록 규칙: 하루는 logicalDay(YYYY-MM-DD, 사용자 하루 경계 기준). 목표는 연간 → 마일스톤(끝낼 달) → 할 일. 사용자가 말하지 않은 시험일·점수 등은 묻는다.`;

const looseWidget = z.object({type: z.string(), x: z.number().int().optional(), y: z.number().int().optional(), w: z.number().int().optional(), h: z.number().int().optional(),
  title: z.string().max(40).optional(), font: z.string().max(40).optional(), color: z.string().optional(), background: z.string().optional(), ink: z.string().optional(),
  style: z.enum(['card', 'line', 'filled', 'plain']).optional(), options: z.record(z.unknown()).optional()});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cell = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const propIn = z.object({name: z.string().min(1).max(30), type: z.enum(['text', 'number', 'select', 'check', 'date', 'role']), options: z.array(z.string().min(1).max(30)).max(100).optional()});
/** Properties by name: an existing one keeps its id (so values stay), new ones get an id. */
function mergeProps(current: PropDef[], input: z.infer<typeof propIn>[]): PropDef[] {
  return input.map(p => ({id: current.find(c => c.name === p.name)?.id ?? newPropId(), name: p.name, type: p.type, options: p.type === 'select' ? p.options ?? [] : []}));
}
/** A tasks widget may name its group property; store the property id. Table columns get ids too. */
function fixGroupBy(spec: PlannerSpec) {
  for (const w of [...(spec.canvas.day ?? []), ...(spec.tabs ?? []).flatMap(t => t.widgets ?? [])]) {
    if (w.type === 'tasks' && typeof w.options.groupBy === 'string') { const d = spec.props.task.find(p => p.name === w.options.groupBy); if (d) w.options.groupBy = d.id; }
    if (w.type === 'table' && Array.isArray(w.options.columns)) w.options.columns = (w.options.columns as {id?: string; name: string; type?: string; options?: string[]}[]).slice(0, 20).map(c => ({id: c.id && /^[a-z0-9]{1,24}$/.test(c.id) ? c.id : newPropId(), name: String(c.name).slice(0, 30), type: ['text', 'number', 'select', 'check', 'date', 'role'].includes(c.type ?? '') ? c.type : 'text', options: c.type === 'select' ? c.options ?? [] : []}));
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
        ...(t.kind === 'page' ? {widgets: toFree(normalizeWidgets(t.widgets ?? [], `p${i}${Date.now().toString(36).slice(-3)}-`).widgets)} : {})}));
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
      const records = await allRecords(owner), av = (await getSettings(owner)).availability;
      // The user's own availability (by weekday, with exceptions) when set; otherwise recent actual focus.
      const s = goalSchedule(records, today, weeklyFocus(records, today), av ? d => availableOn(av, d) : undefined);
      const mine = s.goals.find(g => g.id === top.id);
      return {goalId: top.id, milestoneIds: ids, deadline: mine?.deadline ?? goal.deadline ?? null, feasible: mine?.projected ?? null, lateDays: mine?.lateDays ?? 0,
        capacityBasis: av ? 'availability' : 'recent_focus', weeklyFocusMin: av ? Array.from({length: 7}, (_, i) => availableOn(av, addDays(today, i))).reduce((a, b) => a + b, 0) : s.weeklyMin, bottlenecks: s.bottlenecks.map(b => ({month: b.month, needMin: b.demandMin, haveMin: b.capacityMin, goals: b.goals})), url: plannerUrl()};
    });

  tool('add_items', '할 일·루틴·페르소나·표의 줄을 플래너에 넣는다. 할 일 props와 표 cells는 속성·열 이름으로 보낸다. 할 일은 day(없으면 오늘), goalId로 목표에 이으면 체크가 진행률이 된다. start/end(HH:MM)면 그 시각에 놓이는 할 일(데일리 플래너는 시작 시각 순), fixedStart/fixedEnd면 고정 일정.',
    {tasks: z.array(z.object({title: z.string().min(1).max(200), day: day.optional(), category: z.enum(['must', 'want', 'leisure']).optional(), estimateMin: z.number().int().min(1).max(1440).optional(),
      goalId: z.string().optional(), start: z.string().regex(/^\d{2}:\d{2}$/).optional(), end: z.string().regex(/^\d{2}:\d{2}$/).optional(), fixedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(), fixedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
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
        const d = t.day ?? today, fixed = t.fixedStart && t.fixedEnd ? {fixed: true, start: {value: at(d, t.fixedStart), precision: 'minute'}, end: {value: at(d, t.fixedEnd), precision: 'minute'}}
          : t.start ? {start: {value: at(d, t.start), precision: 'minute'}, end: t.end ? {value: at(d, t.end), precision: 'minute'} : null} : {};
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

  tool('create_widget', '내 위젯을 설명서(manifest)로 만들어 사용자의 lit 라이브러리에 넣는다(같은 id면 새 버전). place:true면 오늘 페이지 아래에 붙인다. 블록 위젯은 바로 쓰이고, 코드 위젯은 사용자가 lit에서 승인해야 실행된다. 사용자에게 무엇을 만들지 말하고 OK를 받은 뒤에 부른다.',
    {manifest: z.record(z.unknown()), place: z.boolean().optional()},
    async ({manifest, place}, owner) => {
      const item = await saveLibrary(owner, {kind: 'custom', data: {manifest}}, 'claude');
      const m = (item.data as {manifest: {name: string; size: {w: number; h: number}}}).manifest;
      if (place) {
        const current = (await getSpec(owner))?.spec as PlannerSpec | undefined;
        if (!current) throw new WorkspaceError(404, '아직 플래너가 없어요. build_planner로 먼저 만든다.');
        const day = current.canvas?.day ?? [], bottom = day.reduce((n, w) => Math.max(n, w.y + w.h), 0);
        await saveSpec(owner, {...current, canvas: {day: [...day, {id: `custom-${Date.now().toString(36)}`, type: 'custom', x: 0, y: bottom, w: m.size.w * 4, h: m.size.h * 3, title: m.name, options: {ref: item.id}}], mode: 'free'}});
      }
      const code = isCode((item.data as {manifest: Parameters<typeof isCode>[0]}).manifest);
      return {id: item.id, name: item.name, placed: !!place, needsApproval: code, url: plannerUrl(),
        note: code ? '코드 위젯이라 사용자가 lit의 메뉴 → 설치한 위젯(또는 위젯 칸)에서 권한을 보고 승인해야 실행된다고 알려 준다.' : '꾸미기 → 내 위젯에서 언제든 다시 붙일 수 있다고 알려 준다.'};
    });

  tool('list_widgets', '사용자 lit 라이브러리의 내 위젯·저장한 위젯·페이지 틀·스킨 목록(설명서 포함).', {}, async (_a, owner) =>
    (await listLibrary(owner)).map(i => ({id: i.id, kind: i.kind, name: i.name, enabled: i.enabled, approved: !!i.approved, source: i.source, ...(i.kind === 'custom' ? {manifest: (i.data as {manifest: unknown}).manifest} : {})})));

  tool('get_today', '사용자의 오늘(또는 지금) 상태: 할 일과 결과, 목표 진행률, 지금 집중 중인 일, 컨디션·수면.', {}, async (_a, owner) => {
    const settings = await getSettings(owner), spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
    if (!spec) throw new WorkspaceError(404, '아직 플래너가 없어요. build_planner로 먼저 만든다.');
    const records: AnyRecord[] = await allRecords(owner);
    const now = buildNow(records, settings, new Date(), {revision: settings.revision, scopes: ALL_SCOPES, lastActivityAt: await lastActivity(owner),
      modules: {sleep: uses(spec, 'sleep'), condition: uses(spec, 'condition'), timer: uses(spec, 'timer')}});
    // Session by session (with the condition rated when the timer stopped), for logs and energy analysis.
    return {...now, sessions: sessionsOf(records, now.user.logicalDay, now.user.logicalDay, settings.tz)};
  });

  tool('set_availability', '사용자가 집중에 쓸 수 있는 시간을 정한다: 요일별(일~토, 분 또는 시간) + 날짜별 예외(데이트, 발표 등). 목표 일정·병목 계산이 이 값을 쓴다. clear:true면 지우고 최근 실제 집중 시간으로 돌아간다.',
    {weekdayMinutes: z.array(z.number().int().min(0).max(1440)).length(7).optional(), weekdayHours: z.array(z.number().min(0).max(24)).length(7).optional(),
      exceptions: z.array(z.object({date: day, minutes: z.number().int().min(0).max(1440).optional(), hours: z.number().min(0).max(24).optional(), note: z.string().max(80).optional()})).max(400).optional(),
      addExceptions: z.boolean().optional(), clear: z.boolean().optional()},
    async ({weekdayMinutes, weekdayHours, exceptions, addExceptions, clear}, owner) => {
      if (clear) return {availability: await putAvailability(owner, null)};
      const cur = (await getSettings(owner)).availability;
      const weekday = weekdayMinutes ?? weekdayHours?.map(h => Math.round(h * 60)) ?? cur?.weekday;
      if (!weekday) throw new WorkspaceError(400, '처음에는 요일별 시간(weekdayMinutes 또는 weekdayHours, 일요일부터 7개)이 필요해요.');
      const ex = (exceptions ?? []).map(e => ({date: e.date, minutes: e.minutes ?? Math.round((e.hours ?? 0) * 60), note: e.note ?? null}));
      const merged = addExceptions && cur ? [...cur.exceptions.filter(e => !ex.some(x => x.date === e.date)), ...ex] : exceptions ? ex : cur?.exceptions ?? [];
      const av = await putAvailability(owner, Availability.parse({weekday, exceptions: merged.sort((a, b) => a.date.localeCompare(b.date))}));
      return {availability: av, note: '다음 add_goal_plan부터 이 시간으로 가능한 날짜와 병목을 계산한다.'};
    });

  tool('list_tasks', '할 일 목록(기간·날짜). id·날짜·제목·분류(must/want/leisure)·결과·목표·속성(이름으로)·예상 시간. 고치거나 옮기기 전에 읽는다.',
    {from: day.optional(), to: day.optional(), includeClosed: z.boolean().optional()},
    async ({from, to, includeClosed}, owner) => {
      const settings = await getSettings(owner), today = logicalDay(new Date(), settings);
      const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined, defs = spec?.props?.task ?? [];
      const a = from ?? today, b = to ?? from ?? today;
      return (await allRecords(owner)).filter((r): r is LifeRecord<'task'> => r.kind === 'task' && !!r.logicalDay && r.logicalDay >= a && r.logicalDay <= b)
        .filter(t => includeClosed || !['cancelled', 'postponed'].includes(t.body.outcome.result))
        .map(t => ({id: t.id, day: t.logicalDay, title: t.body.title, category: t.body.category, result: t.body.outcome.result, routine: !!t.body.routineId, fixed: t.body.plan.fixed,
          estimateMin: t.body.plan.estimateMin, goalIds: t.body.goalIds, props: byNameOut(defs, t.body.props)}));
    });

  tool('update_task', '할 일 하나를 고친다: 제목, 날짜 옮기기(day), 분류, 결과(done/partial/missed/unknown…), 예상 시간, 목표(goalId, null이면 끊기), 속성(이름으로), 형광펜. 바꿀 것만 보낸다.',
    {id: z.string(), title: z.string().min(1).max(200).optional(), day: day.optional(), category: z.enum(['must', 'want', 'leisure']).nullable().optional(),
      result: z.enum(['done', 'partial', 'in_progress', 'missed', 'postponed', 'cancelled', 'unknown']).optional(), estimateMin: z.number().int().min(1).max(1440).nullable().optional(),
      goalId: z.string().nullable().optional(), props: z.record(cell).optional(), highlight: z.enum(['yellow', 'pink', 'green', 'blue']).nullable().optional()},
    async ({id, title, day: d, category, result, estimateMin, goalId, props, highlight}, owner) => {
      const t = (await allRecords(owner)).find((r): r is LifeRecord<'task'> => r.id === id && r.kind === 'task');
      if (!t) throw new WorkspaceError(404, '할 일을 찾지 못했어요. list_tasks로 id를 확인한다.');
      const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined, defs = spec?.props?.task ?? [];
      const now = new Date().toISOString(), b = t.body;
      const outcome = result === undefined ? b.outcome : {...b.outcome, result, reportedAt: result === 'unknown' ? null : now, completedAt: result === 'done' ? now : result === 'unknown' ? null : b.outcome.completedAt};
      const next = {...b, ...(title ? {title} : {}), ...(category !== undefined ? {category} : {}), ...(highlight !== undefined ? {highlight} : {}),
        ...(goalId !== undefined ? {goalIds: goalId ? [goalId] : []} : {}), ...(props ? {props: {...b.props, ...byNameIn(defs, props)}} : {}),
        plan: {...b.plan, ...(estimateMin !== undefined ? {estimateMin} : {})}, outcome};
      const saved = await writeRecord(owner, id, {kind: 'task', logicalDay: d ?? t.logicalDay, body: next, baseRevision: t.revision});
      return {id: saved.id, day: saved.logicalDay, title: (saved.body as {title: string}).title, result: (saved.body as {outcome: {result: string}}).outcome.result};
    });

  tool('delete_task', '할 일 하나를 지운다(기록 이력에는 남는다). 다시 배정할 때 중복을 없애는 데 쓴다.', {id: z.string()}, async ({id}, owner) => {
    const t = (await allRecords(owner)).find(r => r.id === id && r.kind === 'task');
    if (!t) throw new WorkspaceError(404, '할 일을 찾지 못했어요.');
    await deleteRecord(owner, id); return {deleted: id};
  });

  tool('list_rows', '표(DB) 위젯의 줄을 읽는다. table은 표의 id나 제목(get_planner의 tables). where로 열 값이 같은 줄만, from/to로 날짜를 좁힌다. 값은 열 이름으로 돌려준다.',
    {table: z.string().min(1).max(60), where: z.record(cell).optional(), from: day.optional(), to: day.optional(), limit: z.number().int().min(1).max(500).optional()},
    async ({table, where, from, to, limit}, owner) => {
      const {w, cols} = await tableOf(owner, table);
      const rows = (await allRecords(owner)).filter((r): r is LifeRecord<'note'> => r.kind === 'note' && r.body.signifier === 'row' && r.body.table === w.id)
        .filter(r => (!from || (r.logicalDay ?? '') >= from) && (!to || (r.logicalDay ?? '') <= to))
        .map(r => ({id: r.id, day: r.logicalDay, name: r.body.text, cells: byNameOut(cols, r.body.cells), createdAt: r.createdAt}))
        .filter(r => !where || Object.entries(where).every(([k, v]) => r.cells[k] === v || (k === (w.options.firstName ?? '이름') && r.name === v)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {table: {id: w.id, title: w.title ?? null, firstName: w.options.firstName ?? '이름', columns: cols.map(c => ({name: c.name, type: c.type, options: c.options})), autoLog: w.options.autoLog ?? null}, rows: rows.slice(-(limit ?? 200))};
    });

  tool('update_row', '표의 줄 하나를 고친다(열 이름으로, 보낸 칸만 바뀜). name은 첫 열. 예: 소원 상자 상태 잠김→해금→사용함.',
    {id: z.string(), cells: z.record(cell).optional(), name: z.string().max(500).optional(), day: day.optional()},
    async ({id, cells, name, day: d}, owner) => {
      const r = (await allRecords(owner)).find((x): x is LifeRecord<'note'> => x.id === id && x.kind === 'note' && x.body.signifier === 'row');
      if (!r) throw new WorkspaceError(404, '줄을 찾지 못했어요. list_rows로 id를 확인한다.');
      const {cols} = await tableOf(owner, r.body.table ?? '');
      const saved = await writeRecord(owner, id, {kind: 'note', logicalDay: d ?? r.logicalDay, body: {...r.body, ...(name !== undefined ? {text: name} : {}), cells: {...r.body.cells, ...byNameIn(cols, cells)}}, baseRevision: r.revision}) as LifeRecord<'note'>;
      return {id: saved.id, name: saved.body.text, cells: byNameOut(cols, saved.body.cells)};
    });

  tool('delete_row', '표의 줄 하나를 지운다.', {id: z.string()}, async ({id}, owner) => {
    const r = (await allRecords(owner)).find(x => x.id === id && x.kind === 'note' && (x.body as {signifier: string}).signifier === 'row');
    if (!r) throw new WorkspaceError(404, '줄을 찾지 못했어요.');
    await deleteRecord(owner, id); return {deleted: id};
  });

  tool('update_goal', '목표 하나의 상태를 바꾼다. achieved면 성취 기록지(실제 시간은 집중 기록에서 합산, ROI = 임팩트 ÷ 노력 시간), dropped면 조정 기록지(메모)를 남기고, active로 되돌리면(다시 목표로) 기록지를 지운다. personaIds로 키우는 페르소나를 잇는다.',
    {id: z.string(), status: z.enum(['active', 'achieved', 'dropped', 'paused']).optional(), impact: z.number().int().min(1).max(10).optional(), nextOwner: z.enum(['me', 'ai', 'outsource']).optional(),
      note: z.string().max(2000).optional(), personaIds: z.array(z.string()).max(10).optional(), title: z.string().min(1).max(200).optional(), deadline: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional()},
    async ({id, status, impact, nextOwner, note, personaIds, title, deadline}, owner) => {
      const records = await allRecords(owner);
      const g = records.find((r): r is LifeRecord<'goal'> => r.id === id && r.kind === 'goal');
      if (!g) throw new WorkspaceError(404, '목표를 찾지 못했어요.');
      const actual = goalActualMin(records, id);
      const retro = status === 'achieved' ? {kind: 'achieved' as const, at: new Date().toISOString(), actualMin: actual, impact: impact ?? null, roi: impact && actual ? Math.round(impact / Math.max(.1, actual / 60) * 100) / 100 : null, nextOwner: nextOwner ?? null, note: note ?? null}
        : status === 'dropped' ? {kind: 'dropped' as const, at: new Date().toISOString(), actualMin: actual, impact: null, roi: null, nextOwner: null, note: note ?? null}
        : status === 'active' ? null : g.body.retro;
      const saved = await writeRecord(owner, id, {kind: 'goal', body: {...g.body, ...(status ? {status} : {}), ...(title ? {title} : {}), ...(deadline !== undefined ? {deadline} : {}), ...(personaIds ? {personaIds} : {}), retro}, baseRevision: g.revision}) as LifeRecord<'goal'>;
      return {id: saved.id, status: saved.body.status, retro: saved.body.retro, note: status === 'achieved' || status === 'dropped' ? '자동 기록 표(성취·조정)가 있으면 한 줄이 들어갔다.' : undefined};
    });

  tool('set_persona', '페르소나를 만들거나 고친다: 이번 달(또는 month) 상태 deployed/attached/standby와 우선순위, 역할(roles: 페르소나 → Role 2단). 이번 달 Deployed가 한도를 넘으면 warning을 돌려준다.',
    {name: z.string().min(1).max(40), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), status: z.enum(['deployed', 'attached', 'standby']).nullable().optional(), priority: z.number().int().min(1).max(9).nullable().optional(),
      roles: z.array(z.string().min(1).max(40)).max(60).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), active: z.boolean().optional(), limit: z.number().int().min(1).max(12).optional()},
    async ({name, month, status, priority, roles, color, active, limit}, owner) => {
      const settings = await getSettings(owner), m = month ?? logicalDay(new Date(), settings).slice(0, 7);
      const records = await allRecords(owner);
      const cur = records.find((r): r is LifeRecord<'persona'> => r.kind === 'persona' && !r.deletedAt && r.body.name === name);
      const months = {...(cur?.body.months ?? {})};
      if (status === null) delete months[m];
      else if (status || priority !== undefined) { const st = status ?? months[m]?.status; if (st) months[m] = {status: st, priority: priority !== undefined ? priority : months[m]?.priority ?? null}; }
      const body = {...(cur?.body ?? {name}), name, months, ...(roles ? {roles} : {}), ...(color ? {color} : {}), ...(active !== undefined ? {active} : {})};
      const saved = await writeRecord(owner, cur?.id ?? null, {kind: 'persona', body, ...(cur ? {baseRevision: cur.revision} : {}), source: {type: 'planner', ref: 'claude', confirmed: true}}) as LifeRecord<'persona'>;
      const all = (await allRecords(owner)).filter((r): r is LifeRecord<'persona'> => r.kind === 'persona' && r.body.active);
      const deployed = all.filter(p => p.body.months?.[m]?.status === 'deployed').map(p => p.body.name), max = limit ?? 3;
      return {id: saved.id, name: saved.body.name, month: m, status: saved.body.months?.[m] ?? null, roles: saved.body.roles, deployed, ...(deployed.length > max ? {warning: `${m} Deployed ${deployed.length}개로 한도 ${max}를 넘었어요. Attached(루틴화된 것)는 세지 않아요.`} : {})};
    });

  tool('get_insights', '분석 요약(먼저 이것을 읽고, 필요할 때만 원본 표·세션을 연다): 기간 달성률(하고 싶은 일 제외), 순집중, 컨디션·수면 평균, 시간대별 에너지, 낮은 컨디션 횟수, 예상 대비 실제, 페르소나 시간 비중과 이번 달 배치, 목표 진행률과 가능한 날짜·병목.',
    {days: z.number().int().min(1).max(120).optional()},
    async ({days}, owner) => {
      const settings = await getSettings(owner), today = logicalDay(new Date(), settings), n = days ?? 14, from = addDays(today, -(n - 1));
      const records = await allRecords(owner), sum = periodSummary(records, from, today);
      // Energy by hour (local): timer-stop scores at the middle of each session, plus condition checks.
      const hourOf = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', {timeZone: settings.tz, hour: '2-digit', hourCycle: 'h23'}).format(new Date(iso)));
      const byHour = new Map<number, number[]>(), add = (iso: string, v: number) => { const h = hourOf(iso); byHour.set(h, [...(byHour.get(h) ?? []), v]); };
      let low = 0;
      for (const r of records) {
        if (!r.logicalDay || r.logicalDay < from || r.logicalDay > today || r.deletedAt) continue;
        if (r.kind === 'session' && r.body.end && r.body.condition !== null) { add(new Date((Date.parse(r.body.start) + Date.parse(r.body.end)) / 2).toISOString(), r.body.condition); if (r.body.condition <= 6) low++; }
        if (r.kind === 'condition' && r.body.energy !== null) { add(r.body.at, r.body.energy); if (r.body.energy <= 6) low++; }
      }
      const av = settings.availability, sched = goalSchedule(records, today, weeklyFocus(records, today), av ? d => availableOn(av, d) : undefined);
      const month = today.slice(0, 7), personas = records.filter((r): r is LifeRecord<'persona'> => r.kind === 'persona' && !r.deletedAt && r.body.active);
      const daysList = Array.from({length: n}, (_, i) => addDays(from, i));
      return {range: {from, to: today, days: n},
        tasks: sum.tasks, wants: sum.wants, routines: sum.routines, focusMin: sum.focusMin, focusPerDayMin: Math.round(sum.focusMin / n), condition: sum.condition, sleepMin: sum.sleepMin, writtenDays: sum.writtenDays,
        daily: daysList.map(d => ({day: d, focusMin: Math.round(records.filter((r): r is LifeRecord<'session'> => r.kind === 'session' && !r.deletedAt && r.logicalDay === d && !!r.body.end).reduce((m2, s) => m2 + (Date.parse(s.body.end!) - Date.parse(s.body.start)) / 60000, 0)), condition: dayCondition(records, d).score})),
        energyByHour: [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, v]) => ({hour, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10, samples: v.length})),
        lowConditionCount: low,
        estimate: {ratio: estimateAccuracy(records, from, today).ratio},
        personaShare: personaShare(records, today, n).rows.map(r => ({name: r.name, minutes: r.minutes, share: r.share})),
        personasThisMonth: personas.map(p => ({name: p.body.name, status: p.body.months?.[month]?.status ?? null, priority: p.body.months?.[month]?.priority ?? null})),
        goals: records.filter((r): r is LifeRecord<'goal'> => r.kind === 'goal' && !r.deletedAt && r.body.status === 'active' && !r.body.parentGoalId)
          .map(g => { const sg = sched.goals.find(x => x.id === g.id); return {id: g.id, title: g.body.title, percent: goalPercent(g.id, records).pct, deadline: g.body.deadline, feasible: sg?.projected ?? null, lateDays: sg?.lateDays ?? 0}; }),
        bottlenecks: sched.bottlenecks.map(b => ({month: b.month, needMin: b.demandMin, haveMin: b.capacityMin, goals: b.goals})), capacityBasis: av ? 'availability' : 'recent_focus'};
    });

  tool('list_sessions', '집중 세션(타이머) 목록: 날짜·할 일·페르소나·시작·끝·분·컨디션(멈출 때 입력)·메모·할 일 속성(Role 등).',
    {from: day.optional(), to: day.optional()},
    async ({from, to}, owner) => {
      const settings = await getSettings(owner), today = logicalDay(new Date(), settings);
      const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
      return sessionsOf(await allRecords(owner), from ?? today, to ?? from ?? today, settings.tz, spec?.props?.task ?? []);
    });
}

const clockIn = (iso: string, tz: string) => new Intl.DateTimeFormat('en-GB', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(iso));
/** Sessions in a range, with the task, personas, condition and the task's properties by name. */
function sessionsOf(records: AnyRecord[], from: string, to: string, tz: string, defs: PropDef[] = []) {
  const name = (id: string) => (records.find(x => x.id === id)?.body as {name?: string; title?: string} | undefined);
  return records.filter((r): r is LifeRecord<'session'> => r.kind === 'session' && !r.deletedAt && !!r.logicalDay && r.logicalDay >= from && r.logicalDay <= to)
    .sort((a, b) => a.body.start.localeCompare(b.body.start)).map(s => {
      const t = records.find(x => x.id === s.body.taskId && x.kind === 'task') as LifeRecord<'task'> | undefined;
      const persons = s.body.personaIds.length ? s.body.personaIds : t?.body.personaIds ?? [];
      return {id: s.id, day: s.logicalDay, task: t?.body.title ?? null, taskId: s.body.taskId, label: s.body.label, personas: persons.map(id => name(id)?.name).filter(Boolean),
        start: clockIn(s.body.start, tz), end: s.body.end ? clockIn(s.body.end, tz) : null, running: !s.body.end,
        minutes: s.body.end ? Math.round((Date.parse(s.body.end) - Date.parse(s.body.start)) / 60000) : null, condition: s.body.condition, note: s.body.note,
        goals: (t?.body.goalIds ?? []).map(id => name(id)?.title).filter(Boolean), props: t ? byNameOut(defs, t.body.props) : {}};
    });
}
/** Values stored by id → by the name the user gave (and back). */
function byNameOut(defs: {id: string; name: string}[], values: Record<string, unknown> | undefined) {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([k]) => k !== '__src').map(([k, v]) => [defs.find(d => d.id === k)?.name ?? k, v])) as Record<string, string | number | boolean | null>;
}
function byNameIn(defs: {id: string; name: string}[], values: Record<string, unknown> | undefined) {
  return Object.fromEntries(Object.entries(values ?? {}).flatMap(([k, v]) => { const d = defs.find(x => x.name === k || x.id === k); return d ? [[d.id, v]] : []; })) as Record<string, string | number | boolean | null>;
}
async function tableOf(owner: string, ref: string) {
  const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
  const all = [...(spec?.canvas?.day ?? []), ...(spec?.tabs ?? []).flatMap(t => t.widgets ?? [])].filter(w => w.type === 'table');
  const w = all.find(x => x.id === ref) ?? all.find(x => (x.title ?? '') === ref);
  if (!w) throw new WorkspaceError(404, `표를 찾지 못했어요: ${ref}. get_planner의 tables에서 id나 제목을 고른다.`);
  return {w, cols: (w.options.columns as PropDef[] | undefined) ?? []};
}

/** "+09:00" for a time zone on a date, so HH:MM from the user means their local time. */
function offset(tz: string, d: string) {
  const at = new Date(`${d}T12:00:00Z`);
  const local = new Date(at.toLocaleString('en-US', {timeZone: tz})), utc = new Date(at.toLocaleString('en-US', {timeZone: 'UTC'}));
  const min = Math.round((local.getTime() - utc.getTime()) / 60000), sign = min >= 0 ? '+' : '-', a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** Focus minutes on a goal: sessions of tasks linked to it or to any goal under it. */
function goalActualMin(records: AnyRecord[], goalId: string) {
  const goals = records.filter((r): r is LifeRecord<'goal'> => r.kind === 'goal' && !r.deletedAt), ids = new Set([goalId]);
  for (let added = true; added;) { added = false; for (const g of goals) if (g.body.parentGoalId && ids.has(g.body.parentGoalId) && !ids.has(g.id)) { ids.add(g.id); added = true; } }
  const tasks = new Set(records.filter((r): r is LifeRecord<'task'> => r.kind === 'task' && r.body.goalIds.some(id => ids.has(id))).map(t => t.id));
  return Math.round(records.filter((r): r is LifeRecord<'session'> => r.kind === 'session' && !r.deletedAt && !!r.body.taskId && tasks.has(r.body.taskId) && !!r.body.end).reduce((m, s) => m + (Date.parse(s.body.end!) - Date.parse(s.body.start)) / 60000, 0));
}
