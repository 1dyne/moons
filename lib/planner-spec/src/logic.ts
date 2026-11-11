import {z} from 'zod';
import {VERBS, type AnyRecord, type Entry, type LifeRecord, type Verb} from '@workspace/life-contract';

// lit's logic layer (docs/lit/LOGIC_BLOCKS.md). Three layers: records (entries) → logic (types, blocks, automations) → design.
// Everything here is plain data checked by zod, so the screen, the server and Claude read the same definitions:
// a setting that is not in these schemas cannot exist, and every block or action listed here has code that runs it.

// ── Types: the user's own collections (수면, 집중, 기분…) ────────────────────────────────────────────
export const FIELD_KINDS = [
  {id: 'number', name: '숫자'}, {id: 'score', name: '점수'}, {id: 'text', name: '짧은 글'}, {id: 'longtext', name: '긴 글'},
  {id: 'choice', name: '선택'}, {id: 'multi', name: '여러 개 선택'}, {id: 'check', name: '체크'}, {id: 'date', name: '날짜'},
  {id: 'time', name: '시각'}, {id: 'duration', name: '걸린 시간(분)'}, {id: 'link', name: '연결'},
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number]['id'];
const id24 = z.string().regex(/^[a-z0-9]{1,24}$/);
export const FieldDef = z.object({
  id: id24,
  name: z.string().trim().min(1).max(30),
  kind: z.enum(FIELD_KINDS.map(k => k.id) as [FieldKind, ...FieldKind[]]),
  // One line that tells people and AI what goes here (like a Notion property description).
  desc: z.string().max(200).default(''),
  unit: z.string().max(12).default(''),
  options: z.array(z.string().trim().min(1).max(30)).max(60).default([]),
  max: z.number().int().min(2).max(100).default(10),
  // link: what it points to: 'goal', 'task', 'persona' or a type id.
  to: z.string().max(24).default('goal'),
});
export type FieldDef = z.infer<typeof FieldDef>;
export const TypeDef = z.object({
  id: id24,
  name: z.string().trim().min(1).max(30),
  desc: z.string().max(300).default(''),
  icon: z.string().max(24).default(''),
  // The unit of an entry's value (h, 잔, 쪽…); a duration entry (start → end) has its length as value when unit is 'min'.
  unit: z.string().max(12).default(''),
  fields: z.array(FieldDef).max(30).default([]),
  // Time in this type counts as focus (순집중, 영수증) — not, say, sleep.
  focus: z.boolean().default(false),
  // Records lit kept before blocks existed that can be copied into this type (메뉴 → 로직 → 예전 기록 가져오기).
  from: z.enum(['', 'session', 'sleep', 'condition']).default(''),
});
export type TypeDef = z.infer<typeof TypeDef>;
export const VERB_NAMES: Record<Verb, string> = {planned: '계획함', started: '시작함', ended: '끝냄', did: '했음', measured: '쟀음', felt: '느꼈음', wished: '바람', noted: '적음'};
export const newLogicId = () => Math.random().toString(36).slice(2, 10);

// ── Filters (a view's conditions; also the 조건 of automations) ───────────────────────────────────
export const OPS = [{id: 'eq', name: '='}, {id: 'ne', name: '≠'}, {id: 'lt', name: '<'}, {id: 'lte', name: '≤'}, {id: 'gt', name: '>'}, {id: 'gte', name: '≥'},
  {id: 'has', name: '포함'}, {id: 'empty', name: '비어 있음'}, {id: 'filled', name: '값 있음'}] as const;
export type Op = (typeof OPS)[number]['id'];
// field: a field id, or 'verb' | 'value' | 'duration' (minutes) | 'hour' (local start hour) | 'link'.
export const Cond = z.object({field: z.string().max(24), op: z.enum(OPS.map(o => o.id) as [Op, ...Op[]]), value: z.union([z.string().max(200), z.number(), z.boolean()]).default('')});
export type Cond = z.infer<typeof Cond>;
export const PERIODS = [{id: 'day', name: '보이는 날'}, {id: 'today', name: '오늘'}, {id: 'week', name: '이번 주'}, {id: 'last7', name: '최근 7일'}, {id: 'month', name: '이번 달'}, {id: 'last30', name: '최근 30일'}, {id: 'all', name: '전체'}] as const;
export type Period = (typeof PERIODS)[number]['id'];
export const SavedFilter = z.object({id: z.string().max(12), name: z.string().trim().min(1).max(20), conds: z.array(Cond).max(8).default([])});
export type SavedFilter = z.infer<typeof SavedFilter>;

// ── Blocks: the pieces a widget is made of ───────────────────────────────────────────────────────
export const BLOCK_GROUPS = {input: '입력', time: '시간', compute: '계산', view: '보기', deco: '꾸미기'} as const;
export type BlockGroup = keyof typeof BLOCK_GROUPS;
export const BLOCK_KINDS = ['button', 'toggle', 'counter', 'check', 'score', 'form', 'stopwatch', 'timer', 'stat', 'list', 'timeline', 'calendar', 'chart', 'gallery', 'table', 'grid10', 'breakdown', 'heading', 'note'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const LOGIC_BLOCKS: {kind: BlockKind; group: BlockGroup; name: string; desc: string}[] = [
  {kind: 'button', group: 'input', name: '버튼', desc: '누르면 그 시각이 한 줄 기록돼요 (기상, 약 먹음, 출근…)'},
  {kind: 'toggle', group: 'input', name: '시작·끝 버튼', desc: '한 번 누르면 시작, 다시 누르면 끝. 걸린 시간이 남아요 (취침→기상, 공부, 운동)'},
  {kind: 'counter', group: 'input', name: '카운터', desc: '+1 할 때마다 한 줄 (물 한 잔, 커피, 푼 문제)'},
  {kind: 'check', group: 'input', name: '오늘 체크', desc: '그날 했는지 안 했는지 하나 (습관)'},
  {kind: 'score', group: 'input', name: '점수', desc: '1~N 중 하나를 누르면 기록 (기분, 컨디션, 집중도)'},
  {kind: 'form', group: 'input', name: '입력 칸 묶음', desc: '고른 속성들을 채우고 저장하면 한 줄 (독서 기록, 지출, 일기)'},
  {kind: 'stopwatch', group: 'time', name: '스톱워치', desc: '흐르는 시간을 보여 주는 시작·끝 버튼'},
  {kind: 'timer', group: 'time', name: '타이머', desc: '정한 시간이 끝나면 기록하고 알려요. 단계를 이어 반복할 수 있어요 (뽀모도로 25→5)'},
  {kind: 'stat', group: 'compute', name: '숫자·게이지', desc: '개수·합계·평균·최대·최소·연속 일수·목표 대비 %'},
  {kind: 'list', group: 'view', name: '목록', desc: '기록을 줄로, 필터와 정렬을 골라서'},
  {kind: 'timeline', group: 'view', name: '시간축', desc: '하루를 시간 순서로 (몇 시부터 몇 시까지)'},
  {kind: 'calendar', group: 'view', name: '달력', desc: '한 달에 기록이 있는 날, 양만큼 진하게'},
  {kind: 'chart', group: 'view', name: '막대 차트', desc: '날마다 합계·개수·평균'},
  {kind: 'gallery', group: 'view', name: '카드', desc: '기록을 카드로'},
  {kind: 'table', group: 'view', name: '표', desc: '속성을 열로'},
  {kind: 'grid10', group: 'view', name: '10분 타임테이블', desc: '하루를 10분 칸으로. 잰 시간이 저절로 칠해지고, 빈 칸을 눌러 직접 칠해요'},
  {kind: 'breakdown', group: 'compute', name: '나눠 보기', desc: '선택 속성별 합계 (과목별 시간, 분류별 지출) — 목록 또는 원형'},
  {kind: 'heading', group: 'deco', name: '제목·문구', desc: '블록 사이의 글'},
  {kind: 'note', group: 'deco', name: '안내 없는 빈 줄', desc: '간격'},
];
export const blockInfo = (k: BlockKind) => LOGIC_BLOCKS.find(b => b.kind === k)!;
export const AGGS = [{id: 'count', name: '개수'}, {id: 'sum', name: '합계'}, {id: 'avg', name: '평균'}, {id: 'max', name: '최대'}, {id: 'min', name: '최소'}, {id: 'streak', name: '연속 일수'}, {id: 'days', name: '기록한 날 수'}, {id: 'last', name: '마지막 값'}] as const;
export type Agg = (typeof AGGS)[number]['id'];
export const Step = z.object({name: z.string().trim().min(1).max(20), min: z.number().min(0.1).max(600)});
export const LogicBlock = z.object({
  id: z.string().regex(/^[a-z0-9]{1,12}$/),
  kind: z.enum(BLOCK_KINDS),
  label: z.string().max(40).default(''),
  // Inputs: what they write.
  verb: z.enum(VERBS).optional(),
  field: z.string().max(24).default(''),
  fields: z.array(z.string().max(24)).max(20).default([]),
  amount: z.number().finite().default(1),
  // Toggle / stopwatch: labels for the two states.
  startLabel: z.string().max(20).default(''),
  endLabel: z.string().max(20).default(''),
  // Timer: steps run one after another; loop repeats them.
  steps: z.array(Step).max(8).default([]),
  loop: z.number().int().min(1).max(20).default(1),
  // Compute and views.
  agg: z.enum(AGGS.map(a => a.id) as [Agg, ...Agg[]]).default('count'),
  of: z.string().max(24).default(''), // 'value' | 'duration' | a number field id
  period: z.enum(PERIODS.map(p => p.id) as [Period, ...Period[]]).default('day'),
  target: z.number().finite().nullable().default(null),
  show: z.enum(['number', 'gauge', 'ring', 'bar', 'light', 'list', 'donut']).default('number'),
  // 'light' (신호등): blue at or above green, red at or below red, amber between; a message per score.
  green: z.number().default(7),
  red: z.number().default(3),
  msgs: z.record(z.string().max(4), z.string().max(160)).default({}),
  // Toggles: a score field asked right after a stretch ends (컨디션 when the timer stops).
  ask: z.string().max(24).default(''),
  // 10-minute grid: this type only, or every measured time (all types and timer sessions).
  scope: z.enum(['type', 'all']).default('type'),
  startHour: z.number().int().min(0).max(23).default(6),
  conds: z.array(Cond).max(8).default([]),
  filters: z.array(SavedFilter).max(8).default([]),
  sort: z.enum(['new', 'old', 'value']).default('new'),
  limit: z.number().int().min(1).max(200).default(20),
  // Display variant the design layer can switch (pill, big, icon…).
  style: z.string().max(20).default(''),
  icon: z.string().max(24).default(''),
  text: z.string().max(500).default(''),
});
export type LogicBlock = z.infer<typeof LogicBlock>;
export const newBlock = (kind: BlockKind, extra: Partial<LogicBlock> = {}): LogicBlock => LogicBlock.parse({id: newLogicId(), kind, ...extra});

// ── Design of a made widget ──────────────────────────────────────────────────────────────────────
export const Design = z.object({
  mode: z.enum(['blocks', 'html']).default('blocks'),
  // Tokens the blocks and any HTML template use as CSS variables (--accent, --bg…).
  accent: z.string().max(20).default(''), bg: z.string().max(20).default(''), ink: z.string().max(20).default(''),
  radius: z.number().min(0).max(40).nullable().default(null), density: z.enum(['compact', 'normal', 'airy']).default('normal'),
  align: z.enum(['left', 'center']).default('left'),
  html: z.string().max(20000).default(''),
  css: z.string().max(20000).default(''),
});
export type Design = z.infer<typeof Design>;
export const MadeOptions = z.object({
  type: z.string().max(24).default(''),
  blocks: z.array(LogicBlock).max(30).default([]),
  design: Design.default({}),
  // Follow the day picked elsewhere on the page (week strip, ‹ ›) instead of always today.
  followDay: z.boolean().default(true),
});
export type MadeOptions = z.infer<typeof MadeOptions>;

// ── Automations: when → if → do ──────────────────────────────────────────────────────────────────
export const AggCond = z.object({type: z.string().max(24), agg: z.enum(AGGS.map(a => a.id) as [Agg, ...Agg[]]), of: z.string().max(24).default(''), period: z.enum(['today', 'week', 'month']).default('today'), op: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']), value: z.number()});
export const ValueExpr = z.union([z.object({set: z.union([z.string().max(500), z.number(), z.boolean()])}), z.object({copy: z.string().max(24)}), z.object({now: z.literal(true)})]);
export const Action = z.discriminatedUnion('do', [
  // Add one entry to a type (the same or another widget's).
  z.object({do: z.literal('create'), type: z.string().max(24), verb: z.enum(VERBS).default('did'), fields: z.record(z.string().max(24), ValueExpr).default({}), link: z.boolean().default(false)}),
  // Change fields of the entry that started this.
  z.object({do: z.literal('update'), fields: z.record(z.string().max(24), ValueExpr).default({})}),
  // Change fields of entries of a type that match conditions (해금: 소원 상태 잠김 → 해금).
  z.object({do: z.literal('updateWhere'), type: z.string().max(24), conds: z.array(Cond).max(8).default([]), fields: z.record(z.string().max(24), ValueExpr).default({}), limit: z.number().int().min(1).max(50).default(1)}),
  // Shown on the screen (and as a notification when allowed).
  z.object({do: z.literal('notify'), text: z.string().trim().min(1).max(200)}),
]);
export type Action = z.infer<typeof Action>;
export const Flow = z.object({
  id: z.string().regex(/^[a-z0-9]{1,12}$/),
  name: z.string().max(60).default(''),
  enabled: z.boolean().default(true),
  on: z.object({type: z.string().max(24), event: z.enum(['created', 'changed', 'any']).default('created'), verbs: z.array(z.enum(VERBS)).max(8).default([])}),
  if: z.array(Cond).max(8).default([]),
  ifAgg: z.array(AggCond).max(4).default([]),
  do: z.array(Action).min(1).max(6),
});
export type Flow = z.infer<typeof Flow>;
export const Logic = z.object({types: z.array(TypeDef).max(60).default([]), flows: z.array(Flow).max(100).default([])});
export type Logic = z.infer<typeof Logic>;

// ── Evaluation (pure; used by the screen, the server and tests) ──────────────────────────────────
export type E = LifeRecord<'entry'>;
export const entriesOf = (records: AnyRecord[], type: string) => records.filter((r): r is E => r.kind === 'entry' && !r.deletedAt && (r.body as Entry).type === type);
export const durationMin = (e: Entry, now = Date.now()) => Math.max(0, ((e.end ? Date.parse(e.end) : now) - Date.parse(e.at)) / 60000);
/** A value a condition or aggregate reads from an entry. */
export function read(e: Entry, field: string, now = Date.now()): unknown {
  if (field === 'verb') return e.verb;
  if (field === 'value') return e.value?.amount ?? null;
  if (field === 'duration') return e.end ? Math.round(durationMin(e, now)) : null;
  if (field === 'hour') return new Date(e.at).getHours();
  if (field === 'link') return e.links.map(l => l.to);
  return e.fields[field] ?? null;
}
export function test(v: unknown, c: Cond): boolean {
  const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
  if (c.op === 'empty') return empty;
  if (c.op === 'filled') return !empty;
  if (c.op === 'has') return Array.isArray(v) ? v.map(String).includes(String(c.value)) : String(v ?? '').includes(String(c.value));
  const a = typeof v === 'number' ? v : typeof v === 'boolean' ? v : String(v ?? ''), b = typeof a === 'number' ? Number(c.value) : typeof a === 'boolean' ? c.value === true || c.value === 'true' : String(c.value);
  switch (c.op) {
    case 'eq': return a === b; case 'ne': return a !== b;
    case 'lt': return a < b; case 'lte': return a <= b; case 'gt': return a > b; case 'gte': return a >= b;
  }
}
export const matches = (e: Entry, conds: Cond[], now = Date.now()) => conds.every(c => test(read(e, c.field, now), c));

const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
/** [from, to] days of a period, seen from `day` (the visible day) and `today`. */
export function periodRange(p: Period, day: string, today: string): [string, string] {
  const base = p === 'day' ? day : today;
  switch (p) {
    case 'day': case 'today': return [base, base];
    case 'week': { const mon = addDays(base, -((new Date(`${base}T12:00:00Z`).getUTCDay() + 6) % 7)); return [mon, addDays(mon, 6)]; }
    case 'last7': return [addDays(base, -6), base];
    case 'month': return [`${base.slice(0, 7)}-01`, `${base.slice(0, 7)}-31`];
    case 'last30': return [addDays(base, -29), base];
    case 'all': return ['0000-01-01', '9999-12-31'];
  }
}
export const inRange = (r: {logicalDay: string | null}, [a, b]: [string, string]) => !!r.logicalDay && r.logicalDay >= a && r.logicalDay <= b;

/** One number from entries: count, sum, average, max, min, streak (days in a row up to `day`), days with any entry, last value. */
export function aggregate(list: E[], agg: Agg, of: string, day: string, now = Date.now()): number | null {
  const nums = () => list.map(e => read(e.body, of || 'value', now)).map(v => typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null).filter((v): v is number => v !== null);
  switch (agg) {
    case 'count': return list.length;
    case 'sum': return round(nums().reduce((a, b) => a + b, 0));
    case 'avg': { const n = nums(); return n.length ? round(n.reduce((a, b) => a + b, 0) / n.length) : null; }
    case 'max': { const n = nums(); return n.length ? Math.max(...n) : null; }
    case 'min': { const n = nums(); return n.length ? Math.min(...n) : null; }
    case 'days': return new Set(list.map(e => e.logicalDay)).size;
    case 'last': { const e = [...list].sort((a, b) => b.body.at.localeCompare(a.body.at))[0]; if (!e) return null; const v = read(e.body, of || 'value', now); return typeof v === 'number' ? v : null; }
    case 'streak': {
      const days = new Set(list.map(e => e.logicalDay));
      let d = days.has(day) ? day : addDays(day, -1), n = 0;
      while (days.has(d)) { n++; d = addDays(d, -1); }
      return n;
    }
  }
}
const round = (n: number) => Math.round(n * 100) / 100;

// ── Running automations ──────────────────────────────────────────────────────────────────────────
export type FlowWrite = {id: string | null; logicalDay: string | null; body: Entry; baseRevision?: number; flow: string};
const cmp = (a: number, op: string, b: number) => op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'eq' ? a === b : a !== b;
function value(x: z.infer<typeof ValueExpr>, src: Entry, nowIso: string) {
  if ('set' in x) return x.set;
  if ('now' in x) return nowIso;
  const v = read(src, x.copy);
  return Array.isArray(v) ? v.map(String) : (v as string | number | boolean | null);
}
/** What the automations do after `changed` was written (created when createdAt equals updatedAt). Pure: the caller writes the result.
 *  Entries written by an automation carry its id in the chain, and a flow never runs twice in one chain (no loops). */
export function runFlows(logic: Logic, records: AnyRecord[], changed: AnyRecord, opts: {day: string; now?: Date; chain?: string[]} = {day: ''}): {writes: FlowWrite[]; notices: string[]} {
  const out = {writes: [] as FlowWrite[], notices: [] as string[]};
  if (changed.kind !== 'entry' || changed.deletedAt) return out;
  const e = changed as E, now = opts.now ?? new Date(), nowIso = now.toISOString(), chain = opts.chain ?? [];
  // Revisions count the whole account, so a new record is the one whose first write is its last.
  const created = e.createdAt === e.updatedAt;
  for (const f of logic.flows) {
    if (!f.enabled || chain.includes(f.id) || f.on.type !== e.body.type) continue;
    if (f.on.event === 'created' && !created) continue;
    if (f.on.event === 'changed' && created) continue;
    if (f.on.verbs.length && !f.on.verbs.includes(e.body.verb)) continue;
    if (!matches(e.body, f.if, now.getTime())) continue;
    const day = e.logicalDay ?? opts.day;
    const aggOk = f.ifAgg.every(c => {
      const list = entriesOf(records, c.type).filter(x => inRange(x, periodRange(c.period, day, day)));
      const v = aggregate(list, c.agg, c.of, day, now.getTime());
      return v !== null && cmp(v, c.op, c.value);
    });
    if (!aggOk) continue;
    for (const a of f.do) {
      if (a.do === 'notify') out.notices.push(a.text);
      if (a.do === 'create') {
        const fields = Object.fromEntries(Object.entries(a.fields).map(([k, x]) => [k, value(x, e.body, nowIso)]));
        out.writes.push({id: null, logicalDay: day, flow: f.id, body: {type: a.type, verb: a.verb, at: nowIso, end: null, value: null, fields: fields as Entry['fields'], links: a.link ? [{rel: 'after', to: e.id}] : []}});
      }
      if (a.do === 'update') out.writes.push({id: e.id, logicalDay: e.logicalDay, baseRevision: e.revision, flow: f.id, body: {...e.body, fields: {...e.body.fields, ...Object.fromEntries(Object.entries(a.fields).map(([k, x]) => [k, value(x, e.body, nowIso)]))} as Entry['fields']}});
      if (a.do === 'updateWhere') for (const t of entriesOf(records, a.type).filter(x => x.id !== e.id && matches(x.body, a.conds, now.getTime())).sort((x, y) => x.body.at.localeCompare(y.body.at)).slice(0, a.limit))
        out.writes.push({id: t.id, logicalDay: t.logicalDay, baseRevision: t.revision, flow: f.id, body: {...t.body, fields: {...t.body.fields, ...Object.fromEntries(Object.entries(a.fields).map(([k, x]) => [k, value(x, e.body, nowIso)]))} as Entry['fields']}});
    }
  }
  return out;
}

/** "수면 기록이 생기면 · 걸린 시간 < 360이면 → 알림" — the sentence a flow reads as. */
export function flowSentence(f: Flow, types: TypeDef[]) {
  const t = (id: string) => types.find(x => x.id === id), fname = (type: string, id: string) => ({verb: '동작', value: '값', duration: '걸린 시간(분)', hour: '시작 시각(시)', link: '연결'} as Record<string, string>)[id] ?? t(type)?.fields.find(x => x.id === id)?.name ?? id;
  const op = (o: string) => OPS.find(x => x.id === o)?.name ?? o;
  const when = `${t(f.on.type)?.name ?? '?'} 기록이 ${{created: '생기면', changed: '바뀌면', any: '생기거나 바뀌면'}[f.on.event]}${f.on.verbs.length ? ` (${f.on.verbs.map(v => VERB_NAMES[v]).join('·')})` : ''}`;
  const conds = [...f.if.map(c => `${fname(f.on.type, c.field)} ${op(c.op)}${['empty', 'filled'].includes(c.op) ? '' : ` ${c.value}`}`),
    ...f.ifAgg.map(c => `${{today: '오늘', week: '이번 주', month: '이번 달'}[c.period]} ${t(c.type)?.name ?? '?'} ${AGGS.find(a => a.id === c.agg)?.name} ${op(c.op)} ${c.value}`)];
  const acts = f.do.map(a => a.do === 'notify' ? `알림 "${a.text}"` : a.do === 'create' ? `${t(a.type)?.name ?? '?'}에 한 줄` : a.do === 'update' ? `이 기록의 ${Object.keys(a.fields).map(k => fname(f.on.type, k)).join('·')} 바꾸기` : `${t(a.type)?.name ?? '?'}의 ${Object.keys(a.fields).map(k => fname(a.type, k)).join('·')} 바꾸기`);
  return `${when}${conds.length ? `, ${conds.join(' 그리고 ')}이면` : ''} → ${acts.join(', ')}`;
}

// ── Link suggestions: what a new entry probably belongs to ───────────────────────────────────────
const grams = (s: string) => { const t = s.replace(/\s+/g, '').toLowerCase(), out = new Set<string>(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
/** Candidates for a link, best first: what similar titles were linked to before (the user's own choices), then shared letters. */
export function suggestLinks(title: string, candidates: {id: string; title: string}[], history: {title: string; to: string}[]) {
  const g = grams(title);
  if (g.size < 2) return [];
  const score = new Map<string, number>();
  for (const h of history) { const s = [...grams(h.title)].filter(x => g.has(x)).length / Math.max(1, g.size); if (s >= 0.5) score.set(h.to, (score.get(h.to) ?? 0) + 2 * s); }
  for (const c of candidates) { const shared = [...grams(c.title)].filter(x => g.has(x)).length; if (shared >= 2) score.set(c.id, (score.get(c.id) ?? 0) + shared / Math.max(1, g.size)); }
  return candidates.filter(c => score.has(c.id)).sort((a, b) => score.get(b.id)! - score.get(a.id)!);
}

// ── Measured time, from every source (the 10-minute grid, receipts) ──────────────────────────────
export type Stretch = {id: string; src: 'session' | 'entry'; type: string; start: string; end: string | null; label: string; key: string};
/** Every stretch of time that overlaps [from, to): timer sessions and entries that have an end (or are running).
 *  Entries copied from a session (ext.src) are not shown twice. */
export function timeStretches(records: AnyRecord[], logic: Logic, from: Date, to: Date, now = new Date()): Stretch[] {
  const out: Stretch[] = [], copied = new Set<string>();
  const overlaps = (a: string, b: string | null) => Date.parse(a) < to.getTime() && (b ? Date.parse(b) : now.getTime()) > from.getTime();
  for (const r of records) {
    if (r.deletedAt || r.kind !== 'entry') continue;
    const e = r as E, ext = e.ext as {open?: boolean; src?: string} | undefined;
    if (ext?.src) copied.add(ext.src);
    if (e.body.verb === 'planned' || !(e.body.end || ext?.open) || !overlaps(e.body.at, e.body.end)) continue;
    const t = logic.types.find(x => x.id === e.body.type);
    const choice = t?.fields.find(f => f.kind === 'choice' && typeof e.body.fields[f.id] === 'string' && e.body.fields[f.id]);
    const sub = choice ? String(e.body.fields[choice.id]) : '';
    out.push({id: e.id, src: 'entry', type: e.body.type, start: e.body.at, end: e.body.end, label: sub || t?.name || e.body.type, key: `${e.body.type}:${sub}`});
  }
  for (const r of records) {
    if (r.deletedAt || r.kind !== 'session' || copied.has(r.id)) continue;
    const s = r.body as {start: string; end: string | null; label: string; taskId: string | null};
    if (!overlaps(s.start, s.end)) continue;
    out.push({id: r.id, src: 'session', type: '', start: s.start, end: s.end, label: s.label, key: s.taskId ?? `label:${s.label}`});
  }
  return out;
}
/** Minutes of focus on a day from entries of focus types (copies of old timer sessions are already counted as sessions). */
export function entryFocusMin(records: AnyRecord[], logic: Logic, day: string, now = Date.now()) {
  const focus = new Set(logic.types.filter(t => t.focus).map(t => t.id));
  return Math.round(records.filter((r): r is E => r.kind === 'entry' && !r.deletedAt && r.logicalDay === day && focus.has((r.body as Entry).type) && !(r.ext as {src?: string} | undefined)?.src && (r.body as Entry).verb !== 'planned' && (!!(r.body as Entry).end || (r.ext as {open?: boolean} | undefined)?.open === true))
    .reduce((m, e) => m + durationMin(e.body, now), 0));
}
