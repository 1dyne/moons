import {goalPercent, type AnyRecord, type Entry} from '@workspace/life-contract';
import type {E, FlowWrite, TypeDef} from './logic.ts';
import type {PropDef} from './canvas.ts';

// 기본 DB: lit's own records (할 일, 목표) seen as DBs, so the editor's parts, rules, conditions and sums work on
// them exactly as on a DB the user made. Nothing is copied: a task stays a task record; this file only translates
// it to an item (and an item's changes back to the task). Built-in properties have short word ids; the properties
// the user added to tasks (spec.props.task) keep their own ids and live in task.props.
export const SYSTEM_TYPE_IDS = ['task', 'goal'] as const;
export const isSystemType = (id: string) => id === 'task' || id === 'goal';

const STATE: [string, string][] = [['unknown', '할 일'], ['in_progress', '할 일'], ['done', '한 일'], ['partial', '일부'], ['missed', '못 함'], ['postponed', '미룸'], ['cancelled', '취소']];
const CAT: [string, string][] = [['must', '필수'], ['want', '희망사항'], ['leisure', '여가']];
const HL: [string, string][] = [['yellow', '노랑'], ['pink', '분홍'], ['green', '초록'], ['blue', '파랑']];
const HORIZON: [string, string][] = [['year', '연간'], ['quarter', '분기'], ['month', '월간'], ['week', '주간'], ['milestone', '마일스톤']];
const GSTATUS: [string, string][] = [['active', '진행 중'], ['achieved', '이룸'], ['dropped', '그만둠'], ['paused', '쉼']];
const name = (map: [string, string][], code: string | null | undefined) => map.find(([c]) => c === code)?.[1] ?? '';
const code = (map: [string, string][], label: unknown) => map.find(([, n]) => n === label)?.[0] ?? null;

type F = TypeDef['fields'][number];
const f = (id: string, nm: string, kind: F['kind'], x: Partial<F> = {}): F => ({id, name: nm, kind, desc: '', unit: '', options: [], max: 10, to: 'goal', ...x});
/** Built-in properties every 할 일 has (they can be hidden in a part, not removed from the DB). */
export const TASK_FIELDS: F[] = [
  f('title', '제목', 'text'),
  f('state', '상태', 'choice', {options: ['할 일', '한 일', '일부', '못 함', '미룸', '취소'], desc: '체크 칸으로 바뀌는 결과'}),
  f('cat', '분류', 'choice', {options: CAT.map(([, n]) => n)}),
  f('day', '날짜', 'date', {desc: '바꾸면 그날로 옮겨져요 (미루기)'}),
  f('start', '시작', 'time'), f('end', '끝', 'time'),
  f('est', '예상', 'duration', {unit: '분'}),
  f('amount', '한 만큼', 'number'),
  f('goal', '목표', 'link', {to: 'goal'}),
  f('reason', '못 한 이유', 'text'),
  f('hl', '형광펜', 'choice', {options: HL.map(([, n]) => n)}),
  f('fixed', '고정 일정', 'check'),
  f('routine', '루틴에서 옴', 'check', {desc: '오늘의 루틴에서 고른 할 일 (읽기 전용)'}),
];
export const GOAL_FIELDS: F[] = [
  f('title', '제목', 'text'),
  f('horizon', '기간', 'choice', {options: HORIZON.map(([, n]) => n)}),
  f('period', '언제', 'text'),
  f('status', '상태', 'choice', {options: GSTATUS.map(([, n]) => n)}),
  f('deadline', '마감', 'date'),
  f('progress', '진행률', 'number', {unit: '%', desc: '이어진 할 일·하위 목표로 lit이 계산 (고칠 수 없음)'}),
];
export const BUILTIN_FIELD_IDS: Record<string, string[]> = {task: TASK_FIELDS.map(x => x.id), goal: GOAL_FIELDS.map(x => x.id)};

const PROP_KIND: Record<string, F['kind']> = {text: 'text', number: 'number', select: 'choice', check: 'check', date: 'date', role: 'choice', signal: 'signal'};
/** The two 기본 DB as types: 할 일 with the user's own task properties after the built-in ones. */
export function systemTypes(taskProps: PropDef[] = []): TypeDef[] {
  const base = {unit: '', focus: false, from: '' as const};
  return [
    {...base, id: 'task', name: '할 일', icon: 'check', desc: '오늘 일정의 할 일 (lit 기본 DB)', fields: [...TASK_FIELDS, ...taskProps.map(p => f(p.id, p.name, PROP_KIND[p.type] ?? 'text', {options: p.options}))]},
    {...base, id: 'goal', name: '목표', icon: 'target', desc: '목표 탭의 목표 (lit 기본 DB)', fields: GOAL_FIELDS},
  ];
}
/** A user field of the 할 일 DB back as a task property (what the editor saves into spec.props.task). */
export function propOfField(x: F): PropDef {
  const type = x.kind === 'number' || x.kind === 'score' || x.kind === 'duration' ? 'number' : x.kind === 'choice' || x.kind === 'multi' ? 'select' : x.kind === 'check' ? 'check' : x.kind === 'date' ? 'date' : x.kind === 'signal' ? 'signal' : 'text';
  return {id: x.id, name: x.name, type, options: type === 'select' ? x.options : []} as PropDef;
}

// Clock times are shown in the user's time zone (the server runs in UTC), set once per planner or per owner.
let zone = 'Asia/Seoul';
export const setSystemZone = (tz: string) => { if (tz) zone = tz; };
const offsetMin = (t: number) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - Math.floor(t / 1000) * 1000) / 60000; };
export const zonedClock = (iso: string) => { const t = Date.parse(iso); if (Number.isNaN(t)) return ''; const d = new Date(t + offsetMin(t) * 60000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
/** "HH:MM" on a planner day → an instant (hours before the day boundary belong to the next calendar date). */
export const zonedIso = (day: string, hhmm: string, boundaryHour = 4) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number), minute = h * 60 + m + (h * 60 + m < boundaryHour * 60 ? 1440 : 0);
  const guess = Date.parse(`${day}T00:00:00Z`) + minute * 60000;
  return new Date(guess - offsetMin(guess) * 60000).toISOString();
};

type Rec = AnyRecord & {body: Record<string, unknown>};
const item = (r: Rec, type: string, fields: Record<string, unknown>, extra: Partial<Entry> = {}): E => ({...(r as unknown as E), kind: 'entry',
  body: {type, verb: 'planned', at: r.createdAt, end: null, value: null, links: [], ...extra, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '')) as Entry['fields']}} as E);

/** A task record as an item of the 할 일 DB. */
export function taskItem(r: AnyRecord): E {
  const b = (r as Rec).body as {routineId?: string | null; title: string; category: string | null; goalIds: string[]; highlight: string | null; props: Record<string, unknown>;
    plan: {start: {value: string; precision: string} | null; end: {value: string} | null; estimateMin: number | null; fixed: boolean}; outcome: {result: string; amount: number | null; reason: string | null; completedAt: string | null}};
  const timed = b.plan.start?.precision === 'minute';
  return item(r as Rec, 'task', {...b.props, title: b.title, day: r.logicalDay, state: name(STATE, b.outcome.result) || '할 일', cat: name(CAT, b.category), start: timed ? zonedClock(b.plan.start!.value) : '',
    end: timed && b.plan.end ? zonedClock(b.plan.end.value) : '', est: b.plan.estimateMin, amount: b.outcome.amount, goal: b.goalIds[0] ?? '', reason: b.outcome.reason,
    hl: name(HL, b.highlight), fixed: b.plan.fixed || null, routine: b.routineId ? true : null},
  {verb: b.outcome.result === 'done' ? 'did' : 'planned', at: timed ? b.plan.start!.value : b.outcome.completedAt ?? r.createdAt, end: timed && b.plan.end ? b.plan.end.value : null,
    links: b.goalIds.map(to => ({rel: 'part_of' as const, to}))});
}
export function goalItem(r: AnyRecord, records?: AnyRecord[]): E {
  const b = (r as Rec).body as {title: string; horizon: string; period: string; status: string; deadline: string | null};
  return item(r as Rec, 'goal', {title: b.title, horizon: name(HORIZON, b.horizon), period: b.period, status: name(GSTATUS, b.status), deadline: b.deadline,
    progress: records ? goalPercent(r.id, records).pct : null});
}
/** Items of a 기본 DB, or null for a DB the user made. */
export function systemItems(records: AnyRecord[], type: string): E[] | null {
  if (type === 'task') return records.filter(r => r.kind === 'task' && !r.deletedAt).map(taskItem);
  if (type === 'goal') return records.filter(r => r.kind === 'goal' && !r.deletedAt).map(r => goalItem(r, records));
  return null;
}
/** Any record a rule may start from, as an item (a task or goal through its 기본 DB). */
export const asItem = (r: AnyRecord): E | null => r.kind === 'entry' ? r as E : r.kind === 'task' ? taskItem(r) : r.kind === 'goal' ? goalItem(r) : null;

export type RecordWrite = {kind: 'entry' | 'task' | 'goal'; logicalDay: string | null; body: unknown; baseRevision?: number};
/** The record write for an item written by a part or a rule: a 할 일/목표 item becomes a change to its task/goal record. */
export function recordWrite(w: Pick<FlowWrite, 'id' | 'logicalDay' | 'body' | 'baseRevision'>, records: AnyRecord[], boundaryHour = 4): RecordWrite {
  const t = w.body.type, fl = w.body.fields as Record<string, unknown>;
  if (t !== 'task' && t !== 'goal') return {kind: 'entry', logicalDay: w.logicalDay, body: w.body, ...(w.baseRevision !== undefined ? {baseRevision: w.baseRevision} : {})};
  const orig = w.id ? records.find(r => r.id === w.id) as Rec | undefined : undefined;
  let day = w.logicalDay ?? orig?.logicalDay ?? '';
  // Only what changed is written: an item carries every property, and rewriting an untouched one could lose detail
  // (a day-only start, a second goal) that the item does not show.
  const before = orig ? (asItem(orig)?.body.fields ?? {}) as Record<string, unknown> : null;
  const norm = (v: unknown) => v === undefined || v === null || v === '' ? '' : JSON.stringify(v);
  const has = (k: string) => Object.prototype.hasOwnProperty.call(fl, k) && (!before || norm(fl[k]) !== norm(before[k]));
  if (t === 'goal') {
    const b = {...(orig?.body ?? {title: '새 목표', horizon: 'month', period: day.slice(0, 7) || new Date().toISOString().slice(0, 7)})} as Record<string, unknown>;
    if (has('title') && fl.title) b.title = String(fl.title);
    if (has('horizon')) b.horizon = code(HORIZON, fl.horizon) ?? b.horizon;
    if (has('period') && fl.period) b.period = String(fl.period);
    if (has('status')) b.status = code(GSTATUS, fl.status) ?? b.status;
    if (has('deadline')) b.deadline = fl.deadline ? String(fl.deadline) : null;
    return {kind: 'goal', logicalDay: orig?.logicalDay ?? null, body: b, ...(orig ? {baseRevision: orig.revision} : {})};
  }
  // 날짜 moves the task to another day (미루기); its clock times move with it.
  const moved = t === 'task' && has('day') && typeof fl.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fl.day) && fl.day !== day;
  if (moved) day = String(fl.day);
  const prev = (orig?.body ?? {title: '', plan: {state: 'committed'}, outcome: {}, props: {}, goalIds: []}) as {title: string; category?: string | null; goalIds?: string[]; highlight?: string | null; props?: Record<string, unknown>; plan: Record<string, unknown>; outcome: Record<string, unknown>};
  const b = {...prev, plan: {...prev.plan}, outcome: {...prev.outcome}, props: {...(prev.props ?? {})}} as typeof prev & {plan: Record<string, unknown>; outcome: Record<string, unknown>; props: Record<string, unknown>};
  if (has('title')) b.title = String(fl.title ?? '').slice(0, 200) || prev.title || '새 할 일';
  if (!b.title) b.title = '새 할 일';
  if (has('state')) { const r = code(STATE, fl.state) ?? 'unknown', now = new Date().toISOString();
    if (r !== prev.outcome.result) b.outcome = {...b.outcome, result: r, reportedAt: r === 'unknown' ? null : now, completedAt: r === 'done' ? now : null}; }
  if (has('cat')) b.category = code(CAT, fl.cat);
  if (has('hl')) b.highlight = code(HL, fl.hl);
  if (has('goal')) b.goalIds = fl.goal ? [String(fl.goal), ...(prev.goalIds ?? []).filter(g => g !== fl.goal)].slice(0, 20) : (prev.goalIds ?? []).slice(1);
  if (has('reason')) b.outcome.reason = fl.reason ? String(fl.reason).slice(0, 500) : null;
  if (has('amount')) b.outcome.amount = fl.amount === '' || fl.amount === null || fl.amount === undefined || Number.isNaN(Number(fl.amount)) ? null : Number(fl.amount);
  if (has('est')) b.plan.estimateMin = fl.est ? Math.min(1440, Math.max(1, Math.round(Number(fl.est)))) || null : null;
  if (has('fixed')) b.plan.fixed = fl.fixed === true || fl.fixed === 'true';
  const re = (k: string) => has(k) || (moved && !!fl[k]);
  if (re('start')) { const s = String(fl.start ?? ''); b.plan.start = s && day ? {value: zonedIso(day, s, boundaryHour), precision: 'minute'} : null; if (!s) b.plan.end = null; }
  if (re('end')) { const s = String(fl.end ?? ''), st = b.plan.start as {value: string} | null;
    if (s && st && day) { let v = zonedIso(day, s, boundaryHour); if (Date.parse(v) <= Date.parse(st.value)) v = new Date(Date.parse(v) + 86400000).toISOString(); b.plan.end = {value: v, precision: 'minute'}; } else b.plan.end = null; }
  for (const [k, v] of Object.entries(fl)) if (!BUILTIN_FIELD_IDS.task!.includes(k) && has(k)) b.props[k] = v === undefined || v === '' ? null : v as never;
  // A property cleared in the item (missing from its fields) is cleared on the task too.
  if (before) for (const k of Object.keys(before)) if (!BUILTIN_FIELD_IDS.task!.includes(k) && !(k in fl)) b.props[k] = null;
  return {kind: 'task', logicalDay: day || null, body: b, ...(orig ? {baseRevision: orig.revision} : {})};
}
