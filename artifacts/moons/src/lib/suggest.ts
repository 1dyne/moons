// v9 8장: MOONS suggestions for the page being written — a format, a mother planet, a connection.
// Shown only to people who turned suggestions on; the same suggestion is not shown again for 7 days.
import {useSyncExternalStore} from 'react';
import {blockLines, newBlock, type Block, type Page} from './pages.ts';
import {currentEntries} from './pages.ts';
import {rootOf} from './planets.ts';
import type {Store} from './model.ts';
import {tr} from './i18n.ts';

export type Suggestion = {key: string; kind: 'format' | 'planet' | 'link'; title: string; detail?: string; planetId?: string; entryId?: string};
const DAY = 864e5;

function seen(key: string) { try { const t = Number(localStorage.getItem('moons.sug.' + key)); return Number.isFinite(t) && Date.now() - t < 7 * DAY; } catch { return false; } }
export function dismiss(key: string) { try { localStorage.setItem('moons.sug.' + key, String(Date.now())); } catch { /* private */ } }

const ERR = {problem: /\d{2,4}\s*(학년도|년)?.*\d+\s*번|문항|\d+번/, situation: /상황|때문에|시간|압박|풀 때|할 때/, error: /틀|착각|오독|실수|헷갈|섞/, reason: /원인|이유|때문|탓/, fix: /다음엔|다음에|해볼|하기로|하자|시도/};

/** Lines of plain text blocks written by the user. */
const plainLines = (p: Page) => p.blocks.filter(b => b.kind === 'text' && b.by === 'user').flatMap(b => blockLines(b));

export function suggestFor(p: Page, store: Store): Suggestion[] {
  const out: Suggestion[] = [];
  const lines = plainLines(p), text = lines.join('\n');
  if (!text) return out;
  const hits = Object.values(ERR).filter(r => r.test(text)).length;
  if (hits >= 3 && !p.blocks.some(b => b.kind === 'fields')) out.push({key: `format:error:${p.id}`, kind: 'format', title: tr('Make it an error note?'), detail: tr('Problem · situation · reason · next try are already here.')});
  const words = text.toLowerCase();
  for (const pl of store.planets) {
    if (p.planetIds.includes(pl.id) || pl.name.trim().length < 2) continue;
    if (words.includes(pl.name.trim().toLowerCase())) { out.push({key: `planet:${pl.id}:${p.id}`, kind: 'planet', title: tr('Put it on {name}?', {name: pl.name}), planetId: pl.id}); break; }
  }
  const mine = new Set(p.planetIds.map(id => rootOf(id, store.planets)));
  const names = (store.concepts ?? []).filter(c => c.name.length >= 2 && words.includes(c.name.toLowerCase()));
  for (const c of names) {
    const other = currentEntries(store.entries).find(e => e.meta?.pageId !== p.id && c.mentions.some(m => m.entryId === e.id) && e.planetIds.length && !e.planetIds.some(id => mine.has(rootOf(id, store.planets))));
    if (other) { out.push({key: `link:${c.id}:${p.id}`, kind: 'link', title: tr('Related planets to connect?'), detail: `${other.title || other.body.slice(0, 30)} · ${store.planets.find(x => x.id === other.planetIds[0])?.name ?? ''}`, entryId: other.id}); break; }
  }
  return out.filter(s => !seen(s.key));
}

/** Moves the user's plain lines into an error note's fields, by what each line says (words unchanged). */
export function toErrorNote(p: Page): Block[] {
  const fields = [{label: tr('Problem'), re: ERR.problem}, {label: tr('Situation'), re: ERR.situation}, {label: tr('Error'), re: ERR.error}, {label: tr('Reason'), re: ERR.reason}, {label: tr('Fix'), re: ERR.fix}];
  const filled = fields.map(f => ({label: f.label, text: [] as string[]}));
  for (const line of plainLines(p)) {
    const i = fields.findIndex(f => f.re.test(line));
    filled[i >= 0 ? i : 2]!.text.push(line);
  }
  const keep = p.blocks.filter(b => !(b.kind === 'text' && b.by === 'user'));
  return [...keep, newBlock('fields', {fields: filled.map(f => ({label: f.label, text: f.text.join('\n')}))}), newBlock('status', {value: 'open'}), newBlock('log', {items: []}), newBlock('text')];
}

// The page in view publishes its suggestions; the floating moon shows them.
type Live = {list: Suggestion[]; apply?: (s: Suggestion) => void};
let live: Live = {list: []}; const subs = new Set<() => void>();
export function publishSuggestions(next: Live) { live = next; subs.forEach(f => f()); }
export const useSuggestions = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => live, () => live);
