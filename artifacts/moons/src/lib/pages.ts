// v9 4장·10장: pages the user edits freely, and the locked snapshots (entries) analysis reads.
import {splitSentences, uid, type Entry, type Store} from './model.ts';

export type Mark = {start: number; end: number; type: 'hl' | 'b' | 'link'; href?: string};
export type By = 'user' | 'source' | 'ai';
export type BlockValues = {
  heading: {text: string; level: 1 | 2};
  text: {text: string; marks?: Mark[]};
  chat: {messages: {by: 'user' | 'ai'; text: string; at: string}[]; steps?: string[]; step?: number};
  table: {columns: string[]; rows: string[][]};
  fields: {fields: {label: string; text: string}[]};
  status: {value: 'open' | 'doing' | 'done'};
  log: {items: {at: string; text: string}[]};
  checklist: {items: {text: string; done: boolean}[]};
  steps: {items: string[]};
  timeline: {items: {date: string; text: string}[]};
  card: {front: string; back: string};
  cloze: {text: string};
  qcards: {cards: {q: string; a: string}[]};
  file: {assetId?: string; name: string; mime: string; url?: string};
  link: {url: string; title?: string};
  canvas: {items: {id: string; text: string; x: number; y: number; w: number; color?: string}[]; links: {from: string; to: string; label: string}[]};
  gallery: {assetIds: string[]};
};
export type BlockKind = keyof BlockValues;
export type Block<K extends BlockKind = BlockKind> = {id: string; kind: K; by: By; order: number; value: BlockValues[K]};
export type Page = {id: string; title?: string; blocks: Block[]; planetIds: string[]; structureId?: string; assetId?: string; latestEntryId?: string; snapshotHash?: string; confidence?: number; revision?: number; createdAt: string; updatedAt: string; preview?: string};

export const emptyValue: {[K in BlockKind]: () => BlockValues[K]} = {
  heading: () => ({text: '', level: 1}), text: () => ({text: ''}), chat: () => ({messages: []}),
  table: () => ({columns: ['', ''], rows: [['', '']]}), fields: () => ({fields: [{label: '', text: ''}]}), status: () => ({value: 'open'}),
  log: () => ({items: []}), checklist: () => ({items: [{text: '', done: false}]}), steps: () => ({items: ['']}), timeline: () => ({items: [{date: '', text: ''}]}),
  card: () => ({front: '', back: ''}), cloze: () => ({text: ''}), qcards: () => ({cards: [{q: '', a: ''}]}),
  file: () => ({name: '', mime: ''}), link: () => ({url: ''}), canvas: () => ({items: [], links: []}), gallery: () => ({assetIds: []}),
};
export function newBlock<K extends BlockKind>(kind: K, value?: Partial<BlockValues[K]>, by: By = 'user'): Block<K> {
  return {id: uid(), kind, by, order: 0, value: {...emptyValue[kind](), ...(value ?? {})} as BlockValues[K]};
}
export function newPage(extra: Partial<Page> = {}): Page {
  const at = new Date().toISOString();
  return {id: uid(), blocks: [newBlock('text')], planetIds: [], createdAt: at, updatedAt: at, ...extra};
}
export const ordered = (p: Page) => p.blocks.map((b, i) => ({...b, order: i}));

/** The user's words in a block, line by line, in reading order (what a snapshot keeps as sentences). */
export function blockLines(b: Block): string[] {
  const v = b.value as unknown as Record<string, unknown>;
  const t = (x: unknown) => typeof x === 'string' ? x.trim() : '';
  switch (b.kind) {
    case 'heading': case 'text': case 'cloze': return t(v.text) ? t(v.text).split('\n').map(s => s.trim()).filter(Boolean) : [];
    case 'chat': return (b.value as BlockValues['chat']).messages.filter(m => m.by === 'user').map(m => m.text.trim()).filter(Boolean);
    case 'fields': return (b.value as BlockValues['fields']).fields.flatMap(f => t(f.text) ? [t(f.label), t(f.text)].filter(Boolean) : []);
    case 'table': { const tv = b.value as BlockValues['table']; return tv.rows.map(r => r.map((c, i) => c.trim() ? `${tv.columns[i]?.trim() || ''}${tv.columns[i]?.trim() ? ': ' : ''}${c.trim()}` : '').filter(Boolean).join(' · ')).filter(Boolean); }
    case 'checklist': return (b.value as BlockValues['checklist']).items.map(i => i.text.trim()).filter(Boolean);
    case 'steps': return (b.value as BlockValues['steps']).items.map(i => i.trim()).filter(Boolean);
    case 'timeline': return (b.value as BlockValues['timeline']).items.map(i => [i.date, i.text].filter(x => x.trim()).join(' ')).filter(Boolean);
    case 'log': return (b.value as BlockValues['log']).items.map(i => i.text.trim()).filter(Boolean);
    case 'card': { const c = b.value as BlockValues['card']; return [t(c.front), t(c.back)].filter(Boolean); }
    case 'qcards': return (b.value as BlockValues['qcards']).cards.flatMap(c => [t(c.q), t(c.a)].filter(Boolean));
    case 'canvas': return (b.value as BlockValues['canvas']).items.map(i => i.text.trim()).filter(Boolean);
    default: return [];
  }
}

/** What a page contributes to analysis: the user's words (one dump entry) and each pasted source (one material entry). */
export function snapshotParts(p: Page) {
  const mine: string[] = [], sources: {id: string; text: string}[] = [];
  for (const b of p.blocks) {
    if (b.by === 'ai') continue;
    const lines = blockLines(b);
    if (!lines.length) continue;
    if (b.by === 'source') sources.push({id: b.id, text: lines.join('\n')});
    else mine.push(...lines);
  }
  const text = mine.join('\n');
  return {text, sources, hash: hashText(JSON.stringify([p.title ?? '', text, sources.map(s => s.text), p.planetIds]))};
}
export function hashText(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/** v9 10.1: a new locked entry only when the words changed; it points back at the previous snapshot. */
export function snapshotEntries(p: Page, store: Pick<Store, 'entries'>): {entries: Entry[]; latestId?: string; hash: string} | null {
  const {text, sources, hash} = snapshotParts(p);
  if (hash === p.snapshotHash || (!text && !sources.length)) return null;
  const now = new Date().toISOString(), prev = p.latestEntryId ? store.entries.find(e => e.id === p.latestEntryId) : undefined;
  const meta = {pageId: p.id, source: 'page'};
  const out: Entry[] = [];
  const dump: Entry | null = text ? {id: uid(), kind: 'dump', title: p.title?.trim() || undefined, body: text, sentences: splitSentences(text), locked: true, createdAt: now, status: 'saved', planetIds: [...p.planetIds], meta,
    ...(prev ? {parentEntryId: prev.id, relation: 'updates' as const} : {})} : null;
  if (dump) out.push(dump);
  for (const s of sources) out.push({id: uid(), kind: 'media', mediaType: 'custom', title: (p.title?.trim() || 'Source') + ' · ' + s.text.slice(0, 24), body: s.text, sentences: splitSentences(s.text), locked: true, createdAt: now, status: 'saved', planetIds: [...p.planetIds], meta: {...meta, blockId: s.id}});
  return {entries: out, latestId: dump?.id ?? out[0]?.id, hash};
}

/** Entries other snapshots replaced: hidden from lists so a page shows once. */
export function supersededIds(entries: Entry[]) {
  const out = new Set<string>();
  for (const e of entries) if (e.meta?.pageId && e.parentEntryId) out.add(e.parentEntryId);
  return out;
}
export const currentEntries = (entries: Entry[]) => { const old = supersededIds(entries); return entries.filter(e => !old.has(e.id)); };

/** The page's title shown in lists. */
export const pageTitle = (p: Pick<Page, 'title' | 'preview' | 'blocks'>) => p.title?.trim() || p.preview?.slice(0, 40) || (p.blocks ? blockLines(p.blocks[0] ?? newBlock('text')).join(' ').slice(0, 40) : '') || '';

// ---- server
const base = () => `${(import.meta as {env?: {BASE_URL?: string}}).env?.BASE_URL ?? '/'}api`;
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base() + path, {credentials: 'include', cache: 'no-store', ...init, headers: init?.body && !(init.body instanceof FormData) ? {'content-type': 'application/json', ...init.headers} : init?.headers});
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.error?.message ?? 'Request failed'), {status: res.status, body});
  return body as T;
}
export const pagesApi = {
  list: () => call<{pages: Page[]}>('/pages').then(r => r.pages),
  get: (id: string) => call<Page>(`/pages/${id}`),
  save: (p: Page) => call<Page>(`/pages/${p.id}`, {method: 'PUT', body: JSON.stringify({...p, blocks: ordered(p)})}),
  remove: (id: string) => call(`/pages/${id}`, {method: 'DELETE'}),
};
export const v9Api = {call};
