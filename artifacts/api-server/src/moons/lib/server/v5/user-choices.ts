import type {Entry} from './types.ts';

type Analysis = NonNullable<Entry['analysis']>;

/** Restructuring reads the note afresh, but a frame, relation or text kind the user chose stays theirs.
 *  Sections are matched by their heading line (or, without one, a shared node text); lines by the texts they join. */
export function carryUserChoices(old: Analysis | undefined, next: Analysis): Analysis {
  if (!old) return next;
  if (old.textKindBy === 'user') { next.textKind = old.textKind ?? null; next.textKindBy = 'user'; }
  if (old.frameBy === 'user' && old.frame) { next.frame = old.frame; next.frameBy = 'user'; }
  const text = (a: Analysis, id: string) => a.nodes.find(n => n.id === id)?.text ?? '';
  for (const s of old.sections ?? []) {
    if (s.frameBy !== 'user' || !s.frame) continue;
    const texts = new Set(s.nodeIds.map(id => text(old, id)).filter(Boolean));
    const target = s.heading !== null ? next.sections?.find(x => x.heading === s.heading)
      : next.sections?.find(x => x.heading === null && x.nodeIds.some(id => texts.has(text(next, id))));
    if (target) { target.frame = s.frame; target.frameBy = 'user'; }
  }
  // A node the user renamed keeps its new wording when the same quote comes back.
  const renamed = new Map(old.nodes.filter(n => n.edited).map(n => [n.text, n.edited!]));
  for (const n of next.nodes) if (renamed.has(n.text)) n.edited = renamed.get(n.text);
  const key = (a: Analysis, e: {from: string; to: string}) => `${text(a, e.from)}\u0000${text(a, e.to)}`;
  const chosen = new Map(old.edges.filter(e => e.relBy === 'user').map(e => [key(old, e), e.rel ?? null]));
  for (const e of next.edges) if (chosen.has(key(next, e))) { e.rel = chosen.get(key(next, e))!; e.relBy = 'user'; }
  return next;
}
