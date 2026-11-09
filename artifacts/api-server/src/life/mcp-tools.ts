import {z} from 'zod';
import {ALL_SCOPES, buildNow, goalSchedule, logicalDay, weeklyFocus, type AnyRecord} from '@workspace/life-contract';
import {FONTS, PALETTE, SKIN_PRESETS, WIDGETS, buildSpec, uses, type PlannerSpec} from '@workspace/planner-spec';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';
import {allRecords, getSettings, getSpec, lastActivity, putSettings, saveSpec, writeRecord} from './store.ts';

// Planner tools for the MOONS connector: Claude talks with the user, then builds and fills the planner directly.
// Writes go straight to the user's planner (it is their own tool, not their knowledge base); nothing is invented
// about the user — the guide tells the model to ask first and to show the plan before building.
type Tool = <S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>, owner: string) => Promise<unknown>) => unknown;
const plannerUrl = () => (process.env.PLANNER_PUBLIC_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5174')).replace(/\/$/, '');

const guide = () => `MOONS 플래너 · 대화로 만드는 나만의 다이어리
너는 "플래너 문"처럼 사용자와 대화하며 사용자의 하루에 맞는 플래너를 만든다. 순서:
1. 묻기: 무엇을 관리하고 싶은지(할 일, 루틴, 공부 시간, 컨디션, 수면, 목표, 회고, 다꾸 꾸미기), 하루 리듬(기상·취침), 쓰는 기기(폰/PC), 좋아하는 느낌(색·글꼴·종이). 모르는 건 지어내지 않는다.
2. 제안: 어떤 위젯을 어디에 둘지, 스킨(색·글꼴·종이)을 말로 짧게 보여 주고 사용자의 OK를 받는다.
3. 만들기: build_planner. 기존 플래너가 있으면 get_planner로 먼저 보고, 바꾸는 것만 반영한다(바꿔도 기록은 그대로, 새 버전이 된다).
4. 채우기(원하면): 큰 목표는 add_goal_plan(마일스톤에 끝낼 달·예상 시간), 할 일·루틴·페르소나는 add_items. 할 일은 goalId로 목표에 이어야 체크가 진행률이 된다.
5. 마지막에 플래너 주소를 알려 준다: ${plannerUrl()} (홈 화면에 설치 가능). 사용자는 "꾸미기"로 언제든 직접 고칠 수 있다.

격자: 12칸 × 30px 줄. x 0~11, w 1~12, y 0부터, h는 줄 수. 겹치면 뒤 위젯이 아래로 밀린다. 꾸미기 위젯(sticker·tape·image·shape)은 겹치고 options.rotate(-45~45)로 기울일 수 있다.
위젯: ${WIDGETS.map(w => `${w.type}(${w.label}, 기본 ${w.w}×${w.h}: ${w.desc})`).join('; ')}.
위젯 옵션 예: tasks{categories,amounts} routine{mode:"pick_daily"|"fixed_all",askReason} timetable/hourly/page{startHour} checkin{wake:"07:00",sleep:"00:00"} text{text,size:"s|m|l|xl",align} progress/dday{goalId|date,label} sticker{glyph,size} tape{pattern:"plain|stripe|dot|check|grid",color,opacity} image{src(https),frame:"polaroid|round|circle|none",caption} shape{shape:"heart|star|cloud|circle|label|flower",color,text}.
위젯 꾸밈: title(""이면 숨김), font, color(강조), background, ink(글자색), style("card|line|filled|plain").
스킨: accent·background·surface·ink(#hex), paper("plain|grid|dot|lined"), font, card, heading("rule|pill|plain"), radius(0~28). 프리셋: ${SKIN_PRESETS.map(p => p.id).join(', ')}.
글꼴 id: ${FONTS.map(f => `${f.id}(${f.kind})`).join(', ')}.
팔레트: ${PALETTE.join(' ')}.
기록 규칙: 하루는 logicalDay(YYYY-MM-DD, 사용자 하루 경계 기준). 목표는 연간 → 마일스톤(끝낼 달) → 할 일. 사용자가 말하지 않은 시험일·점수 등은 묻는다.`;

const looseWidget = z.object({type: z.string(), x: z.number().int().optional(), y: z.number().int().optional(), w: z.number().int().optional(), h: z.number().int().optional(),
  title: z.string().max(40).optional(), font: z.string().max(40).optional(), color: z.string().optional(), background: z.string().optional(), ink: z.string().optional(),
  style: z.enum(['card', 'line', 'filled', 'plain']).optional(), options: z.record(z.unknown()).optional()});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const month = z.string().regex(/^\d{4}-\d{2}$/);

async function ensureSettings(owner: string, tz?: string) {
  const s = await getSettings(owner);
  if (!s.configured) return putSettings(owner, {tz: tz ?? 'Asia/Seoul', dayBoundary: '04:00'});
  return s;
}

export function registerPlannerTools(tool: Tool) {
  tool('planner_guide', 'MOONS 플래너를 대화로 만들고 채우는 방법: 순서, 위젯·스킨·글꼴 목록, 기록 규칙. 플래너 도구를 쓰기 전에 한 번 읽는다.', {}, async () => guide());

  tool('get_planner', '사용자의 지금 플래너: 이름, 버전, 위젯 배치, 스킨, 하루 기준, 기록 수, 주소.', {}, async (_a, owner) => {
    const planner = await getSpec(owner), settings = await getSettings(owner), records = await allRecords(owner);
    const count = (k: string) => records.filter(r => r.kind === k).length;
    return {url: plannerUrl(), exists: !!planner, version: planner?.version ?? null, name: planner?.spec.name ?? null,
      widgets: planner?.spec.canvas?.day ?? null, skin: planner?.spec.skin ?? null, settings: settings.configured ? {tz: settings.tz, dayBoundary: settings.dayBoundary} : null,
      records: {goals: count('goal'), tasks: count('task'), routines: count('routine'), personas: count('persona')}};
  });

  tool('build_planner', '플래너를 만들거나 바꾼다(새 버전, 기록은 그대로). widgets는 위젯 배치(guide 참고), skin은 바꿀 스킨 값만. 사용자에게 계획을 보여 주고 OK를 받은 뒤에 부른다.',
    {name: z.string().max(40).optional(), widgets: z.array(looseWidget).min(1).max(80), skin: z.record(z.unknown()).optional(), skinPreset: z.string().optional(),
      weekLayout: z.enum(['horizontal', 'vertical']).optional(), timezone: z.string().optional()},
    async ({name, widgets, skin, skinPreset, weekLayout, timezone}, owner) => {
      await ensureSettings(owner, timezone);
      const current = (await getSpec(owner))?.spec as PlannerSpec | undefined;
      const preset = SKIN_PRESETS.find(p => p.id === skinPreset)?.skin;
      const {spec, dropped} = buildSpec(current ?? null, {name, widgets, skin: {...(preset ?? {}), ...(skin ?? {})}, weekLayout});
      const saved = await saveSpec(owner, spec);
      return {url: plannerUrl(), version: saved.version, widgets: spec.canvas.day!.map(w => `${w.type}@${w.x},${w.y} ${w.w}×${w.h}`), ignored: dropped,
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

  tool('add_items', '할 일·루틴·페르소나를 플래너에 넣는다. 할 일은 day(없으면 오늘), goalId로 목표에 이으면 체크가 진행률이 된다. fixedStart/fixedEnd(HH:MM)면 고정 일정.',
    {tasks: z.array(z.object({title: z.string().min(1).max(200), day: day.optional(), category: z.enum(['must', 'want', 'leisure']).optional(), estimateMin: z.number().int().min(1).max(1440).optional(),
      goalId: z.string().optional(), fixedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(), fixedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional()})).max(50).optional(),
      routines: z.array(z.object({title: z.string().min(1).max(200), mode: z.enum(['pick_daily', 'fixed_all']).optional(), goalId: z.string().optional(), weekdays: z.array(z.number().int().min(0).max(6)).optional()})).max(30).optional(),
      personas: z.array(z.object({name: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()})).max(10).optional()},
    async ({tasks, routines, personas}, owner) => {
      const settings = await ensureSettings(owner), today = logicalDay(new Date(), settings);
      const src = {type: 'planner' as const, ref: 'claude', confirmed: true};
      const at = (d: string, hm: string) => new Date(`${d}T${hm}:00${offset(settings.tz, d)}`).toISOString();
      const made = {tasks: 0, routines: 0, personas: 0};
      for (const t of tasks ?? []) {
        const d = t.day ?? today, fixed = t.fixedStart && t.fixedEnd ? {fixed: true, start: {value: at(d, t.fixedStart), precision: 'minute'}, end: {value: at(d, t.fixedEnd), precision: 'minute'}} : {};
        await writeRecord(owner, null, {kind: 'task', logicalDay: d, body: {title: t.title, category: t.category ?? null, goalIds: t.goalId ? [t.goalId] : [], plan: {state: 'committed', estimateMin: t.estimateMin ?? null, ...fixed}}, source: src}); made.tasks++;
      }
      for (const r of routines ?? []) { await writeRecord(owner, null, {kind: 'routine', body: {title: r.title, mode: r.mode ?? 'pick_daily', goalIds: r.goalId ? [r.goalId] : [], recurrence: r.weekdays?.length ? {freq: 'weekly', byWeekday: r.weekdays} : {freq: 'daily'}}, source: src}); made.routines++; }
      for (const p of personas ?? []) { await writeRecord(owner, null, {kind: 'persona', body: {name: p.name, ...(p.color ? {color: p.color} : {})}, source: src}); made.personas++; }
      return {...made, url: plannerUrl()};
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
