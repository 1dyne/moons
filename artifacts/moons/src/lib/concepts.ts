// v7 5.2–5.3 on the client: concepts, memos, source layers and the "!" for AI knowledge with no source.
import type {Store} from './model.ts';
import {tr} from './i18n.ts';
import {linkRuns, matcher, type Span, type TermInfo} from '@workspace/moons-sync/terms';

export type Layer = 'user' | 'material' | 'ai';
export type Ref = {entryId: string; sentence: number};
export const conceptKinds = ['theory', 'method', 'tool', 'term', 'entity', 'other'] as const;
export type ConceptKind = typeof conceptKinds[number];
export type ConceptRel = 'kind_of' | 'part_of' | 'implements' | 'contrasts' | 'similar' | 'related';
export type ConceptState = 'seen' | 'organized' | 'checked' | 'explainable';
export type Concept = {
  id: string; name: string; aliases: string[]; kind: ConceptKind;
  definition: {text: string; layer: Layer; ref?: Ref; confirmed?: boolean}[];
  relations: {to?: string; toName: string; rel: ConceptRel; layer: Layer; ref?: Ref; why?: string; confirmed?: boolean}[];
  mentions: {entryId: string; nodeId?: string; sentence: number; by: 'user' | 'material'; explains?: boolean}[];
  state: ConceptState; createdAt: string; updatedAt?: string;
  /** Term concepts: headword, part of speech, meaning, forms, collocations, pitfall (AI layer until confirmed). */
  term?: TermInfo; autoLink?: boolean;
};
/** A note's approved version beside its original (v8.1): each sentence is the user's or a correction the user approved. */
export type Revision = {text: string; sentences: string[]; by: ('user' | 'user_approved')[]; corrections: {sentence?: number; from: string; to: string; reason?: string}[]; approvedAt: string; from: string};
export type Memo = {id: string; target: {type: 'entry' | 'concept' | 'question' | 'none'; id?: string}; text: string; createdAt: string};

export const kindLabel: Record<ConceptKind, string> = {theory: tr('Theory'), method: tr('Method'), tool: tr('Tool'), term: tr('Term'), entity: tr('Person or organisation'), other: tr('Other')};
export const conceptRelLabel: Record<ConceptRel, string> = {kind_of: tr('Kind of'), part_of: tr('Part of'), implements: tr('Implements'), contrasts: tr('Contrasts with'), similar: tr('Similar to'), related: tr('Related to')};
export const stateLabel: Record<ConceptState, string> = {seen: tr('Came in'), organized: tr('Organised'), checked: tr('Checked'), explainable: tr('Can explain')};

export const conceptsOf = (s: Store) => s.concepts ?? [];
export const memosOf = (s: Store) => s.memos ?? [];
/** Never explained in the user's own words (v7 왜소행성). */
export const unfamiliar = (c: Concept) => !c.mentions.some(m => m.by === 'user' && m.explains);
/** AI knowledge with no source in the user's notes or materials, not yet confirmed: shown with "!". */
export const needsCheck = (x: {layer: Layer; ref?: Ref; confirmed?: boolean}) => x.layer === 'ai' && !x.ref && !x.confirmed;

const cache = new WeakMap<Concept[], (text: string) => Span<Concept>[]>();
/** The matcher for one concept list, compiled once per list. */
export function finder(concepts: Concept[]) {
  let f = cache.get(concepts);
  if (!f) { f = matcher(concepts); cache.set(concepts, f); }
  return f;
}
/** Splits text into plain runs and concept mentions (terms with their forms and phrases; longest first), for underlining. */
export const conceptSpans = (text: string, concepts: Concept[]): {text: string; concept?: Concept}[] => concepts.length ? linkRuns(text, finder(concepts)) : [{text}];

/** Concepts linked to this one, in either direction. */
export function neighbours(c: Concept, all: Concept[]) {
  const out = c.relations.map(r => ({rel: r.rel, other: r.to ? all.find(x => x.id === r.to) : undefined, name: r.toName, dir: 'out' as 'out' | 'in', r}));
  for (const x of all) for (const r of x.relations) if (r.to === c.id && !out.some(o => o.other?.id === x.id)) out.push({rel: r.rel, other: x, name: x.name, dir: 'in' as const, r});
  return out;
}
