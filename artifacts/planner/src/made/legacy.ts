import type {AnyRecord, Entry} from '@workspace/life-contract';
import type {TypeDef} from '@workspace/planner-spec';
import type {Planner} from '../data.ts';

// Records lit kept before blocks existed, copied into a block type so the block widget shows the history.
// The originals stay (old widgets, goal progress and insights keep reading them); each copy remembers its source (ext.src),
// so importing twice adds nothing, and the 10-minute grid and receipts never count the same time twice.
const live = (r: AnyRecord) => !r.deletedAt;
function sources(records: AnyRecord[], t: TypeDef) {
  const done = new Set(records.filter(r => r.kind === 'entry' && live(r)).map(r => (r.ext as {src?: string} | undefined)?.src).filter(Boolean));
  const kind = t.from === 'session' ? 'session' : t.from === 'sleep' ? 'sleep' : t.from === 'condition' ? 'condition' : null;
  return kind ? records.filter(r => r.kind === kind && live(r) && !done.has(r.id)) : [];
}
export const legacyCount = (records: AnyRecord[], t: TypeDef) => sources(records, t).filter(r => toEntry(r, t)).length;

const fieldBy = (t: TypeDef, kind: string, names: RegExp) => t.fields.find(f => f.kind === kind && names.test(f.name))?.id ?? t.fields.find(f => f.kind === kind)?.id;
function toEntry(r: AnyRecord, t: TypeDef): Entry | null {
  const b = r.body as Record<string, unknown>;
  if (r.kind === 'session') {
    if (!b.end) return null;
    const subj = fieldBy(t, 'choice', /과목|활동|subject/), cond = fieldBy(t, 'score', /컨디션/), note = fieldBy(t, 'text', /메모/);
    return {type: t.id, verb: 'did', at: b.start as string, end: b.end as string, value: null, links: b.taskId ? [{rel: 'about', to: b.taskId as string}] : [],
      fields: {...(subj ? {[subj]: b.label as string} : {}), ...(cond && b.condition ? {[cond]: b.condition as number} : {}), ...(note && b.note ? {[note]: b.note as string} : {})}};
  }
  if (r.kind === 'sleep') {
    if (!b.start || !b.end) return null;
    const q = fieldBy(t, 'score', /질/);
    return {type: t.id, verb: 'did', at: b.start as string, end: b.end as string, value: null, links: [], fields: q && b.quality ? {[q]: b.quality as number} : {}};
  }
  if (r.kind === 'condition') {
    if (b.energy === null || b.energy === undefined) return null;
    const score = fieldBy(t, 'score', /점수|컨디션/), why = fieldBy(t, 'multi', /저하/), deep = fieldBy(t, 'multi', /심층/), reason = fieldBy(t, 'text', /이유/);
    const memo = (b.memo ?? {}) as {event?: string | null; body?: string | null; thought?: string | null};
    const long = (re: RegExp) => t.fields.find(f => f.kind === 'longtext' && re.test(f.name))?.id;
    const kinds = ((b.factorKinds as string[] | undefined) ?? []).map(k => k === 'control' ? '통제 요인' : '상수 요인');
    const fields: Entry['fields'] = {};
    if (score) fields[score] = b.energy as number;
    if (why && (b.factors as string[] | undefined)?.length) fields[why] = b.factors as string[];
    if (deep && kinds.length) fields[deep] = kinds;
    if (reason && b.reason) fields[reason] = b.reason as string;
    for (const [re, v] of [[/사건/, memo.event], [/몸/, memo.body], [/생각/, memo.thought]] as const) { const id = long(re); if (id && v) fields[id] = v; }
    return {type: t.id, verb: 'felt', at: b.at as string, end: null, value: null, links: [], fields};
  }
  return null;
}
export async function importLegacy(p: Planner, t: TypeDef, progress: (n: number) => void) {
  let n = 0;
  for (const r of sources(p.records, t)) {
    const body = toEntry(r, t);
    if (!body) continue;
    await p.write(null, {kind: 'entry', logicalDay: r.logicalDay, body, ext: {src: r.id}});
    progress(++n);
  }
  void p.refresh();
  return n;
}
