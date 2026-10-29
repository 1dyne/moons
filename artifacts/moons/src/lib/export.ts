import {type Entry, type Store} from './model.ts';
import {ratingsFor} from './planner.ts';
import {tr} from './i18n.ts';
import {shiftTag, verdictTag} from './verdicts.ts';

// What a note export (PDF, Markdown, share link) can contain. The same names are used by the server.
export const parts = ['original', 'quotes', 'comparison', 'emotions', 'history', 'confidence', 'links', 'memos'] as const;
export type Part = typeof parts[number];
export const partLabel: Record<Part, string> = {
  original: tr('Original words'), quotes: tr('Quotes from the original'), comparison: tr('Comparison'), emotions: tr('Emotions MOONS heard'),
  history: tr('What I knew first → what I corrected'), confidence: tr('Confidence history'), links: tr('Connections'), memos: tr('Memos'),
};
export const defaultParts: Part[] = ['original', 'quotes', 'comparison', 'emotions', 'history', 'confidence', 'links', 'memos'];

export const noteTitle = (e: Entry) => e.title || e.body.slice(0, 60) || tr('Untitled');
const verdictLabel: Record<string, string> = Object.fromEntries(Object.entries(verdictTag).map(([k, t]) => [k, `${t.symbol} ${t.label}`]));
const day = (iso: string) => new Date(iso).toLocaleDateString();
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'note';

/** Everything an export needs for one note, already filtered by the chosen parts. */
export function noteSections(store: Store, e: Entry, include: Set<Part>, scope: Set<string>) {
  const children = store.entries.filter(x => x.parentEntryId === e.id);
  return {
    title: noteTitle(e), created: e.createdAt,
    planets: e.planetIds.map(id => store.planets.find(p => p.id === id)?.name).filter((x): x is string => !!x),
    body: include.has('original') ? e.body : null,
    quotes: include.has('quotes') && e.comparison ? {from: e.comparison.materialTitle, items: e.comparison.quotes} : null,
    comparison: include.has('comparison') && e.comparison ? {summary: e.comparison.summary, items: e.comparison.items.map(i => ({verdict: `${verdictLabel[i.verdict] ?? i.verdict}${i.shiftType && shiftTag[i.shiftType] ? ` · ${shiftTag[i.shiftType]!.label}` : ''}`, note: i.note, answer: typeof i.answer === 'number' ? e.sentences[i.answer] ?? '' : i.answer}))} : null,
    emotions: include.has('emotions') ? (e.analysis?.nodes ?? []).flatMap(n => (n as {emotions?: {word: string; family: string; intensity: number}[]}).emotions ?? []) : [],
    history: include.has('history') ? children.filter(c => c.relation === 'updates').map(c => ({body: c.body, at: c.createdAt})) : [],
    memos: include.has('memos') ? children.filter(c => c.meta?.memo).map(c => ({body: c.body, at: c.createdAt})) : [],
    confidence: include.has('confidence') ? ratingsFor(store, e.id).map(r => ({value: r.value, at: r.at})) : [],
    links: include.has('links') ? (store.links ?? []).filter(l => l.from === e.id || l.to === e.id).map(l => {
      const other = store.entries.find(x => x.id === (l.from === e.id ? l.to : l.from));
      return other ? {title: noteTitle(other), relation: l.relation, reason: l.reason, inScope: scope.has(other.id)} : null;
    }).filter((x): x is NonNullable<typeof x> => !!x) : [],
  };
}

/** Obsidian-friendly Markdown: frontmatter, [[links]] to other exported notes. */
export function noteMarkdown(store: Store, e: Entry, include: Set<Part>, scope: Set<string>) {
  const s = noteSections(store, e, include, scope);
  const out: string[] = ['---', `title: ${JSON.stringify(s.title)}`, `created: ${s.created}`];
  if (s.planets.length) out.push(`planets: [${s.planets.map(p => JSON.stringify(p)).join(', ')}]`);
  out.push('source: MOONS', '---', '', `# ${s.title}`, '');
  if (s.body) out.push(s.body, '');
  if (s.quotes?.items.length) {out.push(`## ${tr('Quotes from the original')} — ${s.quotes.from}`, ''); for (const q of s.quotes.items) out.push(`> ${q.text}`, ''); }
  if (s.comparison) {out.push(`## ${tr('Comparison')}`, '', s.comparison.summary, ''); for (const i of s.comparison.items) out.push(`- **${i.verdict}** ${i.answer ? `“${i.answer}” — ` : ''}${i.note}`); out.push('');}
  if (s.emotions.length) out.push(`## ${tr('Emotions MOONS heard')}`, '', s.emotions.map(x => `${x.word} (${x.family}, ${x.intensity})`).join(' · '), '');
  if (s.history.length) {out.push(`## ${tr('What I knew first → what I corrected')}`, ''); for (const h of s.history) out.push(`- ${day(h.at)} ${h.body}`); out.push('');}
  if (s.memos.length) {out.push(`## ${tr('Memos')}`, ''); for (const m of s.memos) out.push(`- ${m.body}`); out.push('');}
  if (s.confidence.length) out.push(`## ${tr('Confidence history')}`, '', s.confidence.map(c => `${day(c.at)} ${c.value}/10`).join(' → '), '');
  if (s.links.length) {out.push(`## ${tr('Connections')}`, ''); for (const l of s.links) out.push(`- ${l.relation}: ${l.inScope ? `[[${fileSafe(l.title)}]]` : l.title}${l.reason ? ` — ${l.reason}` : ''}`); out.push('');}
  return out.join('\n');
}
export const noteFileName = (e: Entry) => `${fileSafe(noteTitle(e))}.md`;

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One note → .md; several → .zip with one file per note and an index. */
export async function downloadMarkdown(store: Store, ids: string[], include: Set<Part>, bundleName: string) {
  const notes = ids.map(id => store.entries.find(e => e.id === id)).filter((e): e is Entry => !!e);
  const scope = new Set(notes.map(n => n.id));
  if (notes.length === 1) {download(noteFileName(notes[0]!), new Blob([noteMarkdown(store, notes[0]!, include, scope)], {type: 'text/markdown;charset=utf-8'})); return;}
  const {zipSync, strToU8} = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const n of notes) {
    let name = noteFileName(n), i = 2;
    while (used.has(name)) name = noteFileName(n).replace(/\.md$/, ` ${i++}.md`);
    used.add(name); files[name] = strToU8(noteMarkdown(store, n, include, scope));
  }
  files['index.md'] = strToU8([`# ${bundleName}`, '', ...[...used].map(f => `- [[${f.replace(/\.md$/, '')}]]`)].join('\n'));
  download(`${fileSafe(bundleName)}.zip`, new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], {type: 'application/zip'}));
}
export const printUrl = (ids: string[], include: Set<Part>, title: string) => `/print?ids=${ids.join(',')}&inc=${[...include].join(',')}&title=${encodeURIComponent(title)}`;
