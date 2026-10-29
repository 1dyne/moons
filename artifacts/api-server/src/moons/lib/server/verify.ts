import {asEdgeRelation, shapes, type Planet, type Shape, type ThoughtAnalysis, type ThoughtEdge, type ThoughtNode, type ThoughtSignal} from '../thought.ts';
import {nodeCap, validChecklistBasis} from './prompts.ts';

export type RawStructure = {
  title?: string;
  structure: string;
  structure_reason: string;
  nodes: {id: string; text: string; role: string; group: string | null; source: number[]; empty: boolean; hesitant: boolean}[];
  edges: {from: string; to: string; label: string | null; rel?: string | null}[];
  signals: {node: string; kind: 'misunderstanding' | 'study'; reason: string; basis: string}[];
  planets: string[];
  frame?: string; solo?: string; text_kind?: string | null;
};

export const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const PAIRS: Record<string, string> = {'(': ')', '[': ']', '{': '}', '<': '>'};
const count = (s: string, c: string) => s.split(c).length - 1;
/** Trims quotes and stray punctuation at the edges; a bracket goes only when its partner is missing,
 *  so the user's own marks like "[ctrl+F]" or "<평가>" stay whole. */
export const trimEdges = (s: string) => {
  let t = s.replace(/^[\s"'“”‘’…·,.!?~-]+|[\s"'“”‘’…·,.!?~-]+$/g, '');
  for (let changed = true; changed && t;) {
    changed = false;
    const first = t[0]!, last = t[t.length - 1]!;
    if (PAIRS[first] && count(t, PAIRS[first]!) < count(t, first)) { t = t.slice(1).trimStart(); changed = true; }
    const open = Object.keys(PAIRS).find(o => PAIRS[o] === last);
    if (open && count(t, open) < count(t, last)) { t = t.slice(0, -1).trimEnd(); changed = true; }
  }
  return t;
};

// "No correction" is enforced here: every written node must be a verbatim slice of the original.
export function verifyStructure(raw: RawStructure, sentences: string[], planets: Planet[], skip: Set<number> = new Set(), backfill = sentences.length - skip.size > 12):
  {ok: true; value: Omit<ThoughtAnalysis, 'id' | 'model' | 'promptVersion' | 'createdAt' | 'fallback'> & {aliases: Map<string, string>}} | {ok: false; issues: string[]} {
  const issues: string[] = [];
  if (!(shapes as readonly string[]).includes(raw.structure)) issues.push(`structure "${raw.structure}"는 목록에 없음`);
  const body = norm(sentences.join(' '));
  const seen = new Set<string>();
  const nodes: ThoughtNode[] = [];
  const cap = nodeCap(sentences.length - skip.size), alias = new Map<string, string>();
  for (const n of raw.nodes.slice(0, cap)) {
    let id = n.id || `n${nodes.length + 1}`;
    if (seen.has(id)) id = `${id}_${nodes.length}`;
    seen.add(id);
    const text = n.empty ? '' : trimEdges(norm(n.text));
    let source = (n.source ?? []).filter(i => Number.isInteger(i) && i >= 0 && i < sentences.length);
    if (!n.empty) {
      if (!text) { issues.push(`노드 ${id}: 내용이 비었는데 empty=false`); continue; }
      const inSource = source.length > 0 && norm(source.map(i => sentences[i]).join(' ')).includes(text);
      if (!inSource) {
        if (body.includes(text)) source = sentences.map((s, i) => norm(s).includes(text) || text.includes(trimEdges(norm(s))) ? i : -1).filter(i => i >= 0);
        else { issues.push(`노드 ${id}의 text "${n.text}"가 원문에 글자 그대로 없음. 원문 일부를 그대로 복사할 것`); continue; }
      }
    } else source = [];
    // Built only from symbol explanations (notes to MOONS): not content, so not drawn.
    if (!n.empty && source.length && source.every(i => skip.has(i))) continue;
    source = source.filter(i => !skip.has(i));
    // The same words twice would draw the same thought twice; keep one and point edges at it.
    const twin = !n.empty ? nodes.find(m => !m.empty && m.text === text) : undefined;
    if (twin) { alias.set(id, twin.id); twin.source = [...new Set([...twin.source, ...source])]; continue; }
    nodes.push({id, text, role: n.role || 'idea', group: n.group || null, source, empty: !!n.empty, hesitant: !!n.hesitant && !n.empty});
  }
  // Long notes: a line the model skipped still lands, as its own fragment, so nothing written disappears.
  if (backfill) {
    const covered = new Set(nodes.flatMap(n => n.source));
    sentences.forEach((s, i) => {
      const text = trimEdges(norm(s));
      if (covered.has(i) || skip.has(i) || !text || nodes.some(n => n.text === text)) return;
      nodes.push({id: `u${i}`, text, role: 'fragment', group: null, source: [i], empty: false, hesitant: false});
    });
  }
  if (!nodes.some(n => !n.empty)) issues.push('원문에서 나온 노드가 하나도 없음');
  const ids = new Set(nodes.map(n => n.id));
  const real = (id: string) => alias.get(id) ?? id;
  const edges: ThoughtEdge[] = raw.edges.map(e => ({...e, from: real(e.from), to: real(e.to)})).filter(e => ids.has(e.from) && ids.has(e.to) && e.from !== e.to).map(e => ({from: e.from, to: e.to, label: e.label || null, rel: asEdgeRelation(e.rel)}));
  const signals: ThoughtSignal[] = raw.signals.map(s => ({...s, node: real(s.node)}))
    .filter(s => ids.has(s.node) && s.reason?.trim())
    .map((s, i) => ({id: `s${i + 1}`, node: s.node, kind: s.kind, reason: s.reason.trim().slice(0, 120), basis: validChecklistBasis(s.basis) ? s.basis : 'gap', state: 'open' as const}))
    // a misunderstanding without a valid basis is downgraded rather than shown as a claim
    .map(s => s.kind === 'misunderstanding' && !(s.basis === 'logic' || s.basis.startsWith('checklist:')) ? {...s, kind: 'study' as const} : s);
  const planetIds = [...new Set(raw.planets.filter(p => planets.some(pl => pl.id === p)))].slice(0, 2);
  if (issues.length) return {ok: false, issues};
  return {ok: true, value: {structure: raw.structure as Shape, structureReason: (raw.structure_reason || '').trim(), nodes, edges, signals, planetIds, aliases: alias}};
}

// Used when the model fails twice: the thought still lands, as its own sentences.
export function fragmentsFallback(sentences: string[], planetIds: string[] = [], skip: Set<number> = new Set()) {
  const nodes: ThoughtNode[] = sentences.flatMap((s, i) => skip.has(i) ? [] : [{id: `n${i + 1}`, text: s, role: 'fragment', group: null, source: [i], empty: false, hesitant: false}]).slice(0, nodeCap(sentences.length - skip.size));
  return {structure: '파편' as Shape, structureReason: '구조화에 실패해 문장을 그대로 놓았어요.', nodes, edges: [], signals: [], planetIds};
}

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
