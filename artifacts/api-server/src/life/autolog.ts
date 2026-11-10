import type {AnyRecord, LifeRecord} from '@workspace/life-contract';
import type {PlannerSpec, PropDef, Widget} from '@workspace/planner-spec';
import {allRecords, getSettings, getSpec, onAfterWrite, writeRecordOnly} from './store.ts';

// Log tables (docs/lit/ARCHITECTURE.md §2): a table widget with options.autoLog fills itself.
//   'sessions'     — one row per focus session (written when the timer stops, updated when the condition is rated)
//   'achievements' — one row when a goal is achieved with a retro (성취 기록지)
//   'adjustments'  — one row when a goal is dropped with a retro (조정·포기 기록지)
// Columns are matched by name, so the user names them the way they like (see COLS). A row remembers its source
// record in the hidden cell __src, so later edits of the same session or goal update that row instead of adding one.
export type AutoLog = 'sessions' | 'achievements' | 'adjustments';
const COLS: Record<AutoLog, Record<string, string[]>> = {
  sessions: {date: ['날짜', 'date'], task: ['할 일', '할일', '일', 'task'], persona: ['페르소나', 'persona'], start: ['시작', 'start'], end: ['끝', '종료', 'end'],
    minutes: ['분', '시간(분)', '집중(분)', '집중 시간', 'minutes'], hours: ['시간', '시간(h)', 'hours'], condition: ['컨디션', 'condition'], note: ['메모', 'note'], goal: ['목표', 'goal']},
  achievements: {goal: ['목표', 'goal'], date: ['완료일', '날짜', 'date'], minutes: ['실제 시간(분)', '실제(분)', '분', 'minutes'], hours: ['실제 시간', '실제 시간(시간)', '시간', 'hours'],
    impact: ['임팩트', 'impact'], roi: ['roi'], next: ['다음엔 누가', '다음엔', '담당', 'next'], note: ['메모', '회고', 'note'], persona: ['페르소나', 'persona']},
  adjustments: {goal: ['목표', 'goal'], date: ['날짜', '포기일', 'date'], note: ['메모', '조정 메모', 'note'], status: ['상태', 'status'], persona: ['페르소나', 'persona']},
};
const NEXT = {me: '나', ai: 'AI', outsource: '외주'} as const;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export const logTables = (spec: PlannerSpec, kind: AutoLog): Widget[] =>
  [...(spec.canvas?.day ?? []), ...(spec.tabs ?? []).flatMap(t => t.widgets ?? [])].filter(w => w.type === 'table' && w.options.autoLog === kind);

const clock = (iso: string, tz: string) => new Intl.DateTimeFormat('en-GB', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(iso));
const minutes = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));

/** The values one source record gives, by meaning; task properties (Role…) by their own names. */
function valuesFor(kind: AutoLog, r: AnyRecord, records: AnyRecord[], tz: string): {title: string; meaning: Record<string, string | number | null>; props: Record<string, unknown>} {
  const personaNames = (ids: string[]) => ids.map(id => records.find(x => x.id === id && x.kind === 'persona')?.body as {name?: string} | undefined).map(p => p?.name).filter(Boolean).join(', ') || null;
  if (kind === 'sessions') {
    const s = r as LifeRecord<'session'>, t = records.find(x => x.id === s.body.taskId && x.kind === 'task') as LifeRecord<'task'> | undefined;
    const m = s.body.end ? minutes(s.body.start, s.body.end) : null;
    const goals = (t?.body.goalIds ?? []).map(id => (records.find(x => x.id === id)?.body as {title?: string} | undefined)?.title).filter(Boolean).join(', ') || null;
    return {title: t?.body.title ?? s.body.label, props: t?.body.props ?? {}, meaning: {
      date: s.logicalDay, task: t?.body.title ?? s.body.label, persona: personaNames(s.body.personaIds.length ? s.body.personaIds : t?.body.personaIds ?? []),
      start: clock(s.body.start, tz), end: s.body.end ? clock(s.body.end, tz) : null, minutes: m, hours: m === null ? null : Math.round(m / 6) / 10,
      condition: s.body.condition, note: s.body.note, goal: goals}};
  }
  const g = r as LifeRecord<'goal'>, x = g.body.retro!;
  const base = {goal: g.body.title, date: x.at.slice(0, 10), note: x.note, persona: personaNames(g.body.personaIds ?? [])};
  return {title: g.body.title, props: {}, meaning: kind === 'achievements'
    ? {...base, minutes: x.actualMin, hours: x.actualMin === null ? null : Math.round(x.actualMin / 6) / 10, impact: x.impact, roi: x.roi, next: x.nextOwner ? NEXT[x.nextOwner] : null}
    : {...base, status: '포기'}};
}

/** Rows for one source record, into every table flagged for it. */
export async function logInto(owner: string, kind: AutoLog, r: AnyRecord) {
  const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
  if (!spec) return 0;
  const tables = logTables(spec, kind);
  if (!tables.length) return 0;
  const [records, settings] = await Promise.all([allRecords(owner), getSettings(owner)]);
  const v = valuesFor(kind, r, records, settings.tz);
  const propDefs = spec.props?.task ?? [];
  let n = 0;
  for (const w of tables) {
    const cols = (w.options.columns as PropDef[] | undefined) ?? [];
    const cells: Record<string, string | number | boolean | null> = {__src: r.id};
    for (const c of cols) {
      const name = norm(c.name);
      const meaning = Object.entries(COLS[kind]).find(([, names]) => names.some(x => norm(x) === name))?.[0];
      if (meaning) { cells[c.id] = v.meaning[meaning] ?? null; continue; }
      const prop = propDefs.find(p => norm(p.name) === name);
      if (prop) { const val = v.props[prop.id]; cells[c.id] = val === undefined ? null : val as string | number | boolean | null; }
    }
    const existing = records.find(x => x.kind === 'note' && !x.deletedAt && (x.body as {table?: string}).table === w.id && (x.body as {cells?: Record<string, unknown>}).cells?.__src === r.id) as LifeRecord<'note'> | undefined;
    const day = (kind === 'sessions' ? r.logicalDay : (r as LifeRecord<'goal'>).body.retro!.at.slice(0, 10)) ?? null;
    const body = {text: v.title.slice(0, 5000), signifier: 'row' as const, table: w.id, cells};
    if (existing) await writeRecordOnly(owner, existing.id, {kind: 'note', logicalDay: existing.logicalDay, body: {...existing.body, ...body, cells: {...existing.body.cells, ...cells}}});
    else await writeRecordOnly(owner, null, {kind: 'note', logicalDay: day, body, source: {type: 'planner', ref: `autolog:${kind}`, confirmed: true}});
    n++;
  }
  return n;
}

onAfterWrite(async (owner, r) => {
  if (r.kind === 'session' && (r as LifeRecord<'session'>).body.end) await logInto(owner, 'sessions', r);
  if (r.kind === 'goal') {
    const retro = (r as LifeRecord<'goal'>).body.retro;
    if (retro?.kind === 'achieved' && r.body.status === 'achieved') await logInto(owner, 'achievements', r);
    if (retro?.kind === 'dropped' && r.body.status === 'dropped') await logInto(owner, 'adjustments', r);
  }
});
