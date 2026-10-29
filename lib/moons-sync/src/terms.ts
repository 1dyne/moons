// Words in a note linked to the concepts the user already has, found when the note is drawn (never stored).
// Term concepts (conceptKind "term") match their regular inflections, listed forms, aliases and collocations,
// phrases with a verb that changes form and one word slipped in ("is badly backed up", "pulled me over").
// Other concepts match their name and aliases as written. The longest match wins where two overlap.

export type TermInfo = {headword?: string; pos?: string; meaningKo?: string; forms?: string[]; collocations?: string[]; pitfall?: string; confirmed?: boolean};
export type Linkable = {id: string; name: string; aliases: string[]; kind: string; term?: TermInfo; autoLink?: boolean};
export type Span<C> = {start: number; end: number; concept: C};

const VOWEL = /[aeiou]/;
const BE = ['be', 'is', 'am', 'are', 'was', 'were', 'been', 'being', 's', 're', 'm'];
const DET = ['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'one', 's', 'some', 'any', 'no'];
const WILD = /^(A|B|C|sb|sth|someone|somebody|something|oneself|~|\.\.\.|…)$/;
const FUNCTION = new Set(['to', 'on', 'off', 'up', 'down', 'in', 'out', 'over', 'by', 'of', 'for', 'with', 'at', 'from', 'behind', 'into', 'onto', 'away', 'back', 'and', 'or', 'as', 'than', 'not', 'about', 'through', 'around', 'along', 'across', 'after', 'under']);

const nfc = (s: string) => s.normalize('NFC').toLowerCase();
const latin = (s: string) => /[a-z]/i.test(s);

function verbForms(w: string) {
  const out = [w];
  if (/(s|x|z|ch|sh|o)$/.test(w)) out.push(w + 'es'); else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ies'); else out.push(w + 's');
  if (w.endsWith('e')) out.push(w + 'd'); else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ied'); else out.push(w + 'ed');
  if (w.endsWith('ie')) out.push(w.slice(0, -2) + 'ying'); else if (/[^e]e$/.test(w) && w.length > 2) out.push(w.slice(0, -1) + 'ing'); else out.push(w + 'ing');
  // One vowel between consonants at the end doubles: skid → skidded, skidding.
  if (/[^aeiou][aeiou][bcdfgklmnprstvz]$/.test(w) && !/[aeiou]{2}[^aeiou]$/.test(w) && w.length <= 6) { const d = w + w.at(-1); out.push(d + 'ed', d + 'ing'); }
  // Spoken -in' for -ing (swervin').
  for (const f of [...out]) if (f.endsWith('ing')) out.push(f.slice(0, -1));
  return out;
}
const nounForms = (w: string) => [w, /(s|x|z|ch|sh)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's'];
function adjForms(w: string) {
  if (w.endsWith('y') && w.length > 2) return [w, w.slice(0, -1) + 'ier', w.slice(0, -1) + 'iest', w.slice(0, -1) + 'ily'];
  if (w.endsWith('e')) return [w, w + 'r', w + 'st', w + 'ly'];
  return [w, w + 'er', w + 'est', w + 'ly'];
}
/** Regular forms of one word, by part of speech ("v.", "n.", "adj.", "adv."; anything else gets verb and noun forms). */
export function inflections(word: string, pos?: string): string[] {
  const w = nfc(word.trim());
  if (!/^[a-z]+$/.test(w)) return [w];
  const p = (pos ?? '').toLowerCase();
  const forms = /^adv/.test(p) ? [w] : /^adj/.test(p) ? adjForms(w) : /^n/.test(p) && !/v/.test(p) ? nounForms(w) : /^v/.test(p) ? verbForms(w) : [...verbForms(w), ...nounForms(w)];
  return [...new Set(forms)];
}

type Slot = {wild: true} | {wild?: false; words: Set<string>};
type Pattern<C> = {slots: Slot[]; concept: C};
type Tok = {text: string; start: number; end: number};

// Latin words end where another script starts, so "layered와" is "layered" + "와".
const tokens = (text: string): Tok[] => [...text.matchAll(/[\p{Script=Latin}\p{N}]+|(?:(?!\p{Script=Latin})[\p{L}\p{M}\p{N}])+/gu)].map(m => ({text: nfc(m[0]), start: m.index!, end: m.index! + m[0].length}));
const clean = (s: string) => s.replace(/\([^)]*\)/g, ' ').replace(/[/,;]/g, ' ').trim();

function compile<C extends Linkable>(c: C): Pattern<C>[] {
  const t = c.term ?? {}, pos = t.pos;
  const out: Pattern<C>[] = [];
  const add = (surface: string, inflect: boolean) => {
    if (!latin(surface)) return;
    const words = clean(surface).split(/\s+/).filter(Boolean);
    let slots: Slot[] = words.map((raw, i): Slot => {
      if (WILD.test(raw)) return {wild: true};
      const w = nfc(raw).replace(/[’']s$/, '').replace(/[^\p{L}\p{M}\p{N}]/gu, '');
      if (!w) return {wild: true};
      if (w === 'be') return {words: new Set(BE)};
      if (/^one[’']?s$/.test(nfc(raw)) || DET.includes(w) && words.length > 1) return {words: new Set(DET)};
      if (!inflect) return {words: new Set([w])};
      if (words.length === 1) return {words: new Set(inflections(w, pos))};
      return {words: new Set(FUNCTION.has(w) ? [w] : inflections(w, i === 0 ? 'v' : undefined))};
    });
    while (slots[0]?.wild) slots = slots.slice(1);
    while (slots.at(-1)?.wild) slots = slots.slice(0, -1);
    if (slots.length) out.push({slots, concept: c});
  };
  for (const s of [c.name, t.headword ?? '', ...c.aliases]) if (s.trim()) add(s, true);
  for (const s of t.forms ?? []) if (s.trim()) add(s, false);
  for (const s of t.collocations ?? []) if (s.trim()) add(s, true);
  return out;
}

const joinable = (text: string, a: Tok, b: Tok) => /^[\s'’"“”-]*$/.test(text.slice(a.end, b.start));

/** Compiles the concepts once; the returned function finds their spans in a text, longest first, never overlapping. */
export function matcher<C extends Linkable>(concepts: C[]): (text: string) => Span<C>[] {
  const linkable = concepts.filter(c => c.autoLink !== false);
  // Terms: word by word.
  const index = new Map<string, Pattern<C>[]>();
  const plain: {f: string; c: C}[] = [];
  for (const c of linkable) {
    if (c.kind === 'term') for (const p of compile(c)) { const first = p.slots[0] as {words: Set<string>}; for (const w of first.words) index.set(w, [...(index.get(w) ?? []), p]); }
    // Names in other scripts (and every non-term concept) match as written.
    for (const f of [c.name, ...c.aliases]) {
      if (c.kind === 'term' && latin(f)) continue; const k = nfc(f).replace(/\s*\([^)]*\)\s*$/, ''); if (k.length >= 2) plain.push({f: k, c});
    }
  }
  return (text: string) => {
    if (!text) return [];
    const cand: Span<C>[] = [];
    if (index.size) {
      const toks = tokens(text);
      for (let i = 0; i < toks.length; i++) for (const p of index.get(toks[i].text) ?? []) {
        const end = matchAt(text, toks, i, p.slots);
        if (end !== null) cand.push({start: toks[i].start, end: toks[end].end, concept: p.concept});
      }
    }
    // Everything else: as written (works for Korean, where particles follow the word).
    if (plain.length) {
      const lower = nfc(text);
      for (const {f, c} of plain) for (let at = lower.indexOf(f); at >= 0; at = lower.indexOf(f, at + 1)) {
        if (/[a-z0-9]/i.test(text[at - 1] ?? '') && latin(f[0]) || /[a-z0-9]/i.test(text[at + f.length] ?? '') && latin(f.at(-1)!)) continue;
        cand.push({start: at, end: at + f.length, concept: c});
      }
    }
    cand.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const out: Span<C>[] = [];
    let last = 0;
    for (const s of cand) if (s.start >= last) { out.push(s); last = s.end; }
    return out;
  };
}
export const findSpans = <C extends Linkable>(text: string, concepts: C[]) => matcher(concepts)(text);

/** Index of the last token of a match starting at token i, or null. One extra word may sit between two parts once; a wildcard takes 1–3 words. */
function matchAt(text: string, toks: Tok[], i: number, slots: Slot[]): number | null {
  const go = (ti: number, si: number, gap: boolean): number | null => {
    if (si === slots.length) return ti - 1;
    const prev = toks[ti - 1], tok = toks[ti];
    if (!tok || !joinable(text, prev, tok)) return null;
    const slot = slots[si];
    if (slot.wild) {
      for (let n = 1; n <= 3 && ti + n - 1 < toks.length; n++) {
        if (n > 1 && !joinable(text, toks[ti + n - 2], toks[ti + n - 1])) break;
        const r = go(ti + n, si + 1, gap); if (r !== null) return r;
      }
      return null;
    }
    if (slot.words.has(tok.text)) { const r = go(ti + 1, si + 1, gap); if (r !== null) return r; }
    if (!gap && toks[ti + 1] && joinable(text, tok, toks[ti + 1]) && slot.words.has(toks[ti + 1].text)) return go(ti + 2, si + 1, true);
    return null;
  };
  return slots.length === 1 ? i : go(i + 1, 1, false);
}

/** Text cut into plain runs and linked runs, for drawing. */
export function linkRuns<C extends Linkable>(text: string, find: (text: string) => Span<C>[]): {text: string; concept?: C}[] {
  const spans = find(text), out: {text: string; concept?: C}[] = [];
  let at = 0;
  for (const s of spans) { if (s.start > at) out.push({text: text.slice(at, s.start)}); out.push({text: text.slice(s.start, s.end), concept: s.concept}); at = s.end; }
  if (at < text.length || !out.length) out.push({text: text.slice(at)});
  return out;
}

/** Merges a term proposal into what a concept already has: lists are joined, single fields are replaced only when given. */
export function mergeTerm(old: TermInfo | undefined, next: TermInfo): {term: TermInfo; changed: (keyof TermInfo)[]} {
  const term: TermInfo = {...(old ?? {})}, changed: (keyof TermInfo)[] = [];
  for (const k of ['headword', 'pos', 'meaningKo', 'pitfall'] as const) { const v = next[k]?.trim(); if (v && v !== old?.[k]) { term[k] = v; changed.push(k); } }
  for (const k of ['forms', 'collocations'] as const) {
    const have = old?.[k] ?? [], add = (next[k] ?? []).map(x => x.trim()).filter(x => x && !have.some(h => nfc(h) === nfc(x)));
    if (add.length) { term[k] = [...have, ...add]; changed.push(k); }
  }
  if (changed.length) delete term.confirmed;
  return {term, changed};
}

// ---------- revisions: the user's original beside a corrected version ----------
export type Correction = {sentence?: number; from: string; to: string; reason?: string};
export type RevisionRow = {orig?: number; rev?: number; reasons: string[]};

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function similarity(a: string, b: string) {
  const x = words(a), y = new Set(words(b));
  if (!x.length || !y.size) return 0;
  return x.filter(w => y.has(w)).length / Math.max(x.length, y.size);
}
/** Pairs each original sentence with its corrected sentence (in order), leaving additions and removals unpaired. */
export function alignSentences(orig: string[], rev: string[], corrections: Correction[] = []): RevisionRow[] {
  const n = orig.length, m = rev.length, score: number[][] = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
  const sim = orig.map(a => rev.map(b => a === b ? 1 : similarity(a, b)));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    score[i][j] = Math.max(score[i + 1][j], score[i][j + 1], sim[i][j] >= 0.3 ? sim[i][j] + score[i + 1][j + 1] : -1);
  const rows: RevisionRow[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && sim[i][j] >= 0.3 && score[i][j] === sim[i][j] + score[i + 1][j + 1]) { rows.push({orig: i, rev: j, reasons: []}); i++; j++; }
    else if (j < m && (i >= n || score[i][j + 1] >= score[i + 1]?.[j])) { rows.push({rev: j, reasons: []}); j++; }
    else { rows.push({orig: i, reasons: []}); i++; }
  }
  for (const c of corrections) {
    const from = nfc(c.from ?? '');
    const row = rows.find(r => r.orig !== undefined && from && nfc(orig[r.orig]).includes(from)) ?? (typeof c.sentence === 'number' ? rows.find(r => r.orig === c.sentence) : undefined);
    if (row) row.reasons.push(`${c.from} → ${c.to}${c.reason ? ` · ${c.reason}` : ''}`);
  }
  return rows;
}

/** Word-level difference between two sentences, for highlighting what changed. */
export function wordDiff(a: string, b: string): {text: string; op: 'same' | 'del' | 'add'}[] {
  const x = a.split(/(\s+)/), y = b.split(/(\s+)/), n = x.length, m = y.length;
  const L: number[][] = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: {text: string; op: 'same' | 'del' | 'add'}[] = [];
  const push = (text: string, op: 'same' | 'del' | 'add') => { const last = out.at(-1); if (last?.op === op) last.text += text; else out.push({text, op}); };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { push(x[i], 'same'); i++; j++; }
    else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { push(x[i], 'del'); i++; }
    else { push(y[j], 'add'); j++; }
  }
  // A changed phrase reads as one deletion then one insertion, not word by word ("poilce was running" → "the police were chasing").
  const merged: typeof out = [];
  for (let k = 0; k < out.length; k++) {
    if (out[k].op === 'same') { merged.push(out[k]); continue; }
    let del = '', add = '';
    while (k < out.length && (out[k].op !== 'same' || (/^\s+$/.test(out[k].text) && out[k + 1] && out[k + 1].op !== 'same'))) {
      const p = out[k];
      if (p.op === 'del') del += p.text; else if (p.op === 'add') add += p.text; else { del += p.text; add += p.text; }
      k++;
    }
    k--;
    if (del) merged.push({text: del, op: 'del'});
    if (add) merged.push({text: add, op: 'add'});
  }
  return merged;
}

// ---------- example sentences: where a concept is used, and who wrote each sentence ----------
export type Author = 'user_approved' | 'user' | 'material' | 'ai';
export const authorOrder: Author[] = ['user_approved', 'user', 'material', 'ai'];
export type ExampleEntry = {id: string; kind: string; title?: string; body: string; sentences: string[]; createdAt: string; meta?: Record<string, unknown> | null;
  revision?: {sentences: string[]; by: string[]; approvedAt: string}};
export type Example = {entryId: string; sentence: number; layer: 'original' | 'revision'; author: Author; text: string; at: string; ranges: [number, number][]};

/** Who wrote each sentence of a note's original. */
export function sentenceAuthors(e: ExampleEntry): Author[] {
  const meta = e.meta ?? {}, lineBy = (meta.lineBy as string[] | undefined) ?? [];
  const aiSource = typeof meta.source === 'string' && /claude|\bai\b|moons/i.test(meta.source);
  return e.sentences.map((_, i) => e.kind === 'record' ? (lineBy[i] === 'user' ? 'user' : 'material')
    : e.kind === 'media' ? (aiSource || meta.relayedBy ? 'ai' : 'material')
    : e.kind === 'question' && meta.relayedBy ? 'ai' : 'user');
}
/** Every sentence a concept appears in (by the same matching the notes use), approved versions first, then the user's, then materials; newest first within each. */
export function examplesOf<C extends Linkable>(entries: ExampleEntry[], concept: C, find: (text: string) => Span<C>[]): Example[] {
  const out: Example[] = [];
  for (const e of entries) {
    const authors = sentenceAuthors(e);
    const look = (text: string, i: number, layer: Example['layer'], author: Author, at: string) => {
      const ranges = find(text).filter(s => s.concept.id === concept.id).map(s => [s.start, s.end] as [number, number]);
      if (ranges.length) out.push({entryId: e.id, sentence: i, layer, author, text, at, ranges});
    };
    e.sentences.forEach((t, i) => look(t, i, 'original', authors[i], e.createdAt));
    // In the approved version only the corrected sentences are new; unchanged ones are already listed from the original.
    e.revision?.sentences.forEach((t, i) => { if (e.revision!.by[i] === 'user_approved') look(t, i, 'revision', 'user_approved', e.revision!.approvedAt); });
  }
  return out.sort((a, b) => authorOrder.indexOf(a.author) - authorOrder.indexOf(b.author) || b.at.localeCompare(a.at));
}
/** How often the user used the concept in a sentence of their own (original or approved). Recorded, not counted as explaining. */
export const ownUses = (examples: Example[]) => examples.filter(x => x.author === 'user' || x.author === 'user_approved').length;
