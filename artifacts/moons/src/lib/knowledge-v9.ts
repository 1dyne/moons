// v9 6장: one function turns concepts into the numbers the moon, the cross-section and the summary draw.
// Same input → same output (sorting and hashing are fixed). Nothing here is stored; it is all derived.
import type {Entry, Store} from './model.ts';
import type {Concept} from './concepts.ts';
import {unfamiliar} from './concepts.ts';
import {rootOf} from './planets.ts';
import {currentEntries} from './pages.ts';

export const STAGE_SCORE = {seen: 25, organized: 50, checked: 75, explainable: 100} as const;
export const CRATER_GAP = 50, STAR_GAP = 25;
/** v9 5.3: a field opens with 6 concepts of which 3 have evidence (settings constant, tuned after real use). */
export const KNOWLEDGE_REVEAL = {concepts: 6, evidence: 3};
export const NO_FIELD = 'none';

export type Evidence = {entryId: string; kind: 'compare' | 'attempt' | 'explain'; sentences?: number[]};
export type ConceptKnowledge = {
  conceptId: string; name: string; fields: string[];
  stage: 1 | 2 | 3 | 4; score: number; unexplained: boolean;
  confidence: {value: number; by: 'concept' | 'page'} | null;
  recordCount: number; side: 'front' | 'back';
  terrain: 'highland' | 'crater' | 'fog' | 'sea'; star: boolean;
  evidence: Evidence[]; entryIds: string[];
  lat: number; lon: number;
};
export type FieldSummary = {field: string; concepts: number; evidence: number; understanding: number | null; open: boolean; backPages: string[]};

export function hash01(s: string, salt = 0) { let h = 2166136261 ^ salt; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
const stageOf = (s: Concept['state']) => (({seen: 1, organized: 2, checked: 3, explainable: 4} as const)[s] ?? 1);

function latestRating(store: Store, type: string, id: string) {
  let best: {value: number; at: string} | null = null;
  for (const c of store.confidence ?? []) if (c.targetType === type && c.targetId === id && (!best || c.at > best.at)) best = c;
  return best?.value ?? null;
}

export function conceptKnowledge(store: Store): ConceptKnowledge[] {
  const entries = currentEntries(store.entries), live = new Map(entries.map(e => [e.id, e]));
  const fieldsOf = (e: Entry) => { const roots = [...new Set(e.planetIds.filter(id => store.planets.some(p => p.id === id)).map(id => rootOf(id, store.planets)))]; return roots.length ? roots : [NO_FIELD]; };
  const fieldOrder = [...new Set(store.planets.map(p => rootOf(p.id, store.planets)))].sort().concat(NO_FIELD);
  const out: ConceptKnowledge[] = [];
  for (const c of [...(store.concepts ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const ms = c.mentions.filter(m => live.has(m.entryId));
    if (!ms.length) continue;
    const entryIds = [...new Set(ms.map(m => m.entryId))].sort();
    const evidence: Evidence[] = [];
    for (const id of entryIds) {
      const e = live.get(id)!;
      if (e.comparison && (e.comparison.items?.length ?? 0) > 0) evidence.push({entryId: id, kind: 'compare', sentences: ms.filter(m => m.entryId === id).map(m => m.sentence)});
      if (e.kind === 'record') evidence.push({entryId: id, kind: 'attempt'});
    }
    for (const m of ms) if (m.by === 'user' && m.explains && !evidence.some(x => x.kind === 'explain' && x.entryId === m.entryId)) evidence.push({entryId: m.entryId, kind: 'explain', sentences: [m.sentence]});
    const fields = [...new Set(entryIds.flatMap(id => fieldsOf(live.get(id)!)))].sort();
    const stage = stageOf(c.state), score = STAGE_SCORE[c.state] ?? 25;
    let confidence: ConceptKnowledge['confidence'] = null;
    const own = latestRating(store, 'concept', c.id);
    if (own !== null) confidence = {value: own, by: 'concept'};
    else {
      const pageIds = [...new Set(entryIds.map(id => live.get(id)!.meta?.pageId).filter((x): x is string => typeof x === 'string'))];
      const vals = pageIds.map(id => latestRating(store, 'page', id)).filter((v): v is number => v !== null);
      if (vals.length) confidence = {value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), by: 'page'};
    }
    const conf = confidence ? confidence.value * 10 : null;
    const crater = conf !== null && conf - score >= CRATER_GAP, star = conf !== null && score - conf >= STAR_GAP;
    const side = evidence.length ? 'front' : 'back', un = unfamiliar(c);
    const terrain = side === 'back' ? 'fog' : crater ? 'crater' : un ? 'sea' : 'highland';
    // v9 6.6: a region per field, the place inside it from the concept id.
    const fi = Math.max(0, fieldOrder.indexOf(fields[0] ?? NO_FIELD)), span = 360 / Math.max(1, fieldOrder.length);
    const lon = ((fi * span + (hash01(c.id, 1) - .5) * span * .7) + (side === 'back' ? 180 : 0) + 540) % 360 - 180;
    const lat = (hash01(c.id, 2) - .5) * 110;
    out.push({conceptId: c.id, name: c.name, fields, stage, score, unexplained: un, confidence, recordCount: entryIds.length, side, terrain, star, evidence, entryIds, lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10});
  }
  return out;
}

/** v9 6.3: understanding from concepts with evidence only, weighted by how often they appear. */
export function understanding(list: ConceptKnowledge[]) {
  const ev = list.filter(k => k.side === 'front');
  const n = ev.reduce((a, k) => a + k.recordCount, 0);
  return n ? Math.round(ev.reduce((a, k) => a + k.recordCount * k.score, 0) / n) : null;
}

export function fieldSummaries(store: Store, list = conceptKnowledge(store)): FieldSummary[] {
  const fields = [...new Set(list.flatMap(k => k.fields))].sort();
  const entries = currentEntries(store.entries);
  return fields.map(f => {
    const mine = list.filter(k => k.fields.includes(f)), ev = mine.filter(k => k.side === 'front');
    const open = mine.length >= KNOWLEDGE_REVEAL.concepts && ev.length >= KNOWLEDGE_REVEAL.evidence;
    const backPages = entries.filter(e => (f === NO_FIELD ? !e.planetIds.length : e.planetIds.some(id => rootOf(id, store.planets) === f)) && !e.analysis && !e.comparison && (e.kind === 'dump' || e.kind === 'media')).map(e => e.id);
    return {field: f, concepts: mine.length, evidence: ev.length, understanding: open ? understanding(mine) : null, open, backPages};
  });
}

export type CheckItem = {kind: 'gap' | 'star' | 'unexplained' | 'low' | 'back'; conceptId?: string; entryId?: string; label: string};
/** v9 6.4: at most three places to look, in a fixed order. Never a backlog. */
export function checkList(store: Store, field: string, list = conceptKnowledge(store), summary = fieldSummaries(store, list)): CheckItem[] {
  const mine = list.filter(k => k.fields.includes(field));
  const many = (k: ConceptKnowledge) => k.recordCount >= 2;
  const order: CheckItem[] = [
    ...mine.filter(k => k.terrain === 'crater').sort((a, b) => b.recordCount - a.recordCount).map(k => ({kind: 'gap' as const, conceptId: k.conceptId, label: k.name})),
    ...mine.filter(k => k.star).sort((a, b) => b.recordCount - a.recordCount).map(k => ({kind: 'star' as const, conceptId: k.conceptId, label: k.name})),
    ...mine.filter(k => many(k) && k.unexplained).sort((a, b) => b.recordCount - a.recordCount).map(k => ({kind: 'unexplained' as const, conceptId: k.conceptId, label: k.name})),
    ...mine.filter(k => many(k) && k.stage <= 2).sort((a, b) => b.recordCount - a.recordCount || a.stage - b.stage).map(k => ({kind: 'low' as const, conceptId: k.conceptId, label: k.name})),
    ...(summary.find(s => s.field === field)?.backPages ?? []).map(id => ({kind: 'back' as const, entryId: id, label: store.entries.find(e => e.id === id)?.title || store.entries.find(e => e.id === id)?.body.slice(0, 30) || ''})),
  ];
  const seen = new Set<string>(), out: CheckItem[] = [];
  for (const it of order) { const key = it.conceptId ?? it.entryId ?? ''; if (seen.has(key)) continue; seen.add(key); out.push(it); if (out.length === 3) break; }
  return out;
}

/** v9 6.5: cross-section order — concepts tied by part/kind sit together, more records first. */
export function crossOrder(list: ConceptKnowledge[], concepts: Concept[]): ConceptKnowledge[] {
  const byId = new Map(concepts.map(c => [c.id, c]));
  const group = new Map<string, string>();
  for (const k of list) {
    const c = byId.get(k.conceptId);
    const up = c?.relations.find(r => (r.rel === 'part_of' || r.rel === 'kind_of') && r.to && list.some(x => x.conceptId === r.to))?.to;
    group.set(k.conceptId, up ?? k.conceptId);
  }
  const weight = new Map<string, number>();
  for (const k of list) weight.set(group.get(k.conceptId)!, (weight.get(group.get(k.conceptId)!) ?? 0) + k.recordCount);
  return [...list].sort((a, b) => {
    const ga = group.get(a.conceptId)!, gb = group.get(b.conceptId)!;
    if (ga !== gb) return (weight.get(gb)! - weight.get(ga)!) || ga.localeCompare(gb);
    return b.recordCount - a.recordCount || a.conceptId.localeCompare(b.conceptId);
  });
}
