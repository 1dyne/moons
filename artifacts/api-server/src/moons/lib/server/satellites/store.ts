// v8 Satellites on the server: intake tokens, records a Satellite sends, and the inbox of drafts waiting for the user.
// The Satellite list itself lives in the workspace store (`satellites` collection); tokens never do.
import {createHash, randomBytes} from 'node:crypto';
import {json, newId, q} from '../db.ts';
import {splitSentences} from '../../thought.ts';
import {loadWorkspace, locked, persistWorkspace, validateStore} from '../v5/workspace-store.ts';
import {nameKey, type Concept} from '../v5/concepts.ts';
import {alignSentences, mergeTerm, type Correction, type RevisionRow, type TermInfo} from '@workspace/moons-sync/terms';
import {WorkspaceError, now, type Entry, type Store} from '../v5/types.ts';

export const SATELLITE_TABLES = [
  `create table if not exists satellite_tokens(owner_id text not null,satellite_id text not null,token_hash text not null unique,created_at timestamptz not null default now(),primary key(owner_id,satellite_id))`,
  `create table if not exists satellite_records(owner_id text not null,satellite_id text not null,id text not null,data jsonb not null,at timestamptz not null,received_at timestamptz not null default now(),drafted_in text,primary key(owner_id,satellite_id,id))`,
  `create index if not exists satellite_records_time on satellite_records(owner_id,satellite_id,received_at desc)`,
  `create table if not exists inbox_items(owner_id text not null,id text not null,source jsonb not null,kind text not null,data jsonb not null,status text not null default 'open',created_at timestamptz not null default now(),decided_at timestamptz,entry_id text,primary key(owner_id,id))`,
  `create index if not exists inbox_open on inbox_items(owner_id,status,created_at desc)`,
  // v8.1: proposals sent together (one study day) stay one card.
  `alter table inbox_items add column if not exists batch_id text`,
  `alter table inbox_items add column if not exists batch_title text`,
  `create index if not exists inbox_batch on inbox_items(owner_id,batch_id)`,
];

export type Satellite = {id: string; name: string; icon: string; description: string; kind: 'builtin' | 'external'; url?: string; embed: 'auto' | 'tab';
  madeBy: {type: 'user' | 'ai' | 'moons'; name?: string}; planetIds: string[]; show: boolean;
  agent: {mode: 'off' | 'manual' | 'on_open'; lastRunAt?: string}; intake?: {connected: boolean; lastEventAt?: string}; createdAt: string; updatedAt: string};
export type RecordItem = {label: string; result?: string; answer?: string; note?: string};
export type SatelliteRecord = {id: string; at: string; kind: 'attempt' | 'artifact' | 'note' | 'event'; title: string; summary: string;
  items: RecordItem[]; userText: string[]; concepts: string[]; link?: string; apply?: 'request'; feedback?: {text: string; at: string; by: string}[]};
/** What becomes a note: the user's own lines, the facts the Satellite reported, and MOONS's reading (AI layer, outside the original). */
export type RecordDraft = {title: string; userText: string[]; activity: string[]; moons?: {summary: string; patterns: string[]}; concepts: string[]; missed: string[]; recordIds: string[]; satelliteId: string};
export type InboxItem = {id: string; source: {type: 'satellite' | 'claude'; id?: string; name?: string}; kind: string; data: Record<string, unknown>; status: 'open' | 'applied' | 'dismissed'; createdAt: string; decidedAt?: string; entryId?: string; batch?: {id: string; title: string}};
/** A note's corrected version as proposed: the AI's corrections and the sentences paired with the original, before the user chooses. */
export type RevisionDraft = {text: string; corrections: Correction[]; orig: string[]; rev: string[]; rows: RevisionRow[]};
/** The approved version kept beside the original. Each sentence is the user's original or a correction the user approved. */
export type Revision = {text: string; sentences: string[]; by: ('user' | 'user_approved')[]; corrections: Correction[]; approvedAt: string; from: string};

const satellitesOf = (s: Store) => ((s.satellites as Satellite[] | undefined) ?? []);
const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Runs a change against the stored workspace under the owner's lock (server-side writes: approvals, MCP). */
export async function changeStore<T>(owner: string, work: (store: Store) => T | Promise<T>) {
  return (await changeStoreSaved(owner, work)).result;
}
/** Same, also returning the saved workspace so the browser can take it as its new state. */
export async function changeStoreSaved<T>(owner: string, work: (store: Store) => T | Promise<T>) {
  return locked(owner, async () => {
    const current = await loadWorkspace(owner), store = structuredClone(current.store);
    const result = await work(store);
    const saved = await persistWorkspace(owner, current.revision, validateStore(store, current.store));
    return {result, saved};
  });
}

// ---------- intake ----------
export async function rotateIntake(owner: string, satelliteId: string, revoke = false) {
  const {store} = await loadWorkspace(owner);
  if (!satellitesOf(store).some(s => s.id === satelliteId)) throw new WorkspaceError(404, 'Satellite not found.');
  await q('delete from satellite_tokens where owner_id=$1 and satellite_id=$2', [owner, satelliteId]);
  if (revoke) return {token: null};
  const token = `msat_${randomBytes(32).toString('base64url')}`;
  await q('insert into satellite_tokens(owner_id,satellite_id,token_hash) values($1,$2,$3)', [owner, satelliteId, hash(token)]);
  return {token};
}
export async function intakeStatus(owner: string) {
  const rows = await q<{satellite_id: string; last: string | null; count: number}>(`select t.satellite_id,(select max(received_at)::text from satellite_records r where r.owner_id=t.owner_id and r.satellite_id=t.satellite_id) last,
    (select count(*)::int from satellite_records r where r.owner_id=t.owner_id and r.satellite_id=t.satellite_id and r.drafted_in is null) count from satellite_tokens t where t.owner_id=$1`, [owner]);
  return Object.fromEntries(rows.map(r => [r.satellite_id, {connected: true, lastEventAt: r.last ?? undefined, pending: r.count}]));
}

/** Checks a record against the contract (v8 3.1). Unknown fields are dropped, sizes are capped. */
export function parseRecord(body: unknown): SatelliteRecord {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const id = str(b.id, 120);
  if (!id) throw new WorkspaceError(400, 'A record needs an id.');
  const kind = (['attempt', 'artifact', 'note', 'event'].includes(String(b.kind)) ? b.kind : 'event') as SatelliteRecord['kind'];
  const at = str(b.at, 40);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map(x => {
    const i = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return {label: str(i.label, 200), ...(str(i.result, 40) ? {result: str(i.result, 40)} : {}), ...(str(i.answer, 400) ? {answer: str(i.answer, 400)} : {}), ...(str(i.note, 600) ? {note: str(i.note, 600)} : {})};
  }).filter(i => i.label);
  const userText = (Array.isArray(b.userText) ? b.userText : []).map(t => str(t, 4000)).filter(Boolean).slice(0, 50);
  const concepts = [...new Set((Array.isArray(b.concepts) ? b.concepts : []).map(t => str(t, 80)).filter(Boolean))].slice(0, 50);
  const link = str(b.link, 2000);
  return {id, kind, at: at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : now(), title: str(b.title, 200), summary: str(b.summary, 2000),
    items, userText, concepts, ...(/^https:\/\//.test(link) ? {link} : {}), ...(b.apply === 'request' ? {apply: 'request' as const} : {})};
}

export async function acceptRecord(token: string, body: unknown) {
  const row = (await q<{owner_id: string; satellite_id: string}>('select owner_id,satellite_id from satellite_tokens where token_hash=$1', [hash(token)]))[0];
  if (!row) throw new WorkspaceError(401, 'Invalid Satellite token.');
  return storeRecord(row.owner_id, row.satellite_id, body);
}
/** Keeps one record for a Satellite the owner has (HTTP with its token, or MCP as the signed-in user). Same id → kept once. */
export async function storeRecord(owner: string, satelliteId: string, body: unknown) {
  if (JSON.stringify(body ?? null).length > 64_000) throw new WorkspaceError(413, 'A record can be at most 64KB.');
  const {store} = await loadWorkspace(owner);
  const sat = satellitesOf(store).find(s => s.id === satelliteId);
  if (!sat) throw new WorkspaceError(404, 'Satellite not found.');
  const record = parseRecord(body);
  const saved = await q('insert into satellite_records(owner_id,satellite_id,id,data,at) values($1,$2,$3,$4::jsonb,$5) on conflict do nothing returning id', [owner, satelliteId, record.id, json(record), record.at]);
  // The "Add to MOONS" button: the record as it is, as a draft in the inbox (no AI).
  if (saved.length && record.apply === 'request') {
    await addInbox(owner, {type: 'satellite', id: satelliteId, name: sat.name}, 'record_note', draftFromRecords(satelliteId, [record]));
    await q('update satellite_records set drafted_in=$4 where owner_id=$1 and satellite_id=$2 and id=$3', [owner, satelliteId, record.id, 'button']);
  }
  return {accepted: saved.length > 0, duplicate: saved.length === 0, id: record.id};
}

export async function listRecords(owner: string, satelliteId: string, opts: {limit?: number; undrafted?: boolean} = {}) {
  const rows = await q<{data: SatelliteRecord; drafted_in: string | null; received_at: string}>(`select data,drafted_in,received_at::text from satellite_records where owner_id=$1 and satellite_id=$2${opts.undrafted ? ' and drafted_in is null' : ''} order by at desc limit $3`, [owner, satelliteId, Math.min(500, opts.limit ?? 100)]);
  return rows.map(r => ({...r.data, drafted: !!r.drafted_in, receivedAt: r.received_at}));
}
export async function addFeedback(owner: string, satelliteId: string, recordId: string, text: string, by: string) {
  const t = str(text, 4000);
  if (!t) throw new WorkspaceError(400, 'Write the feedback first.');
  const rows = await q(`update satellite_records set data=jsonb_set(data,'{feedback}',coalesce(data->'feedback','[]'::jsonb)||$4::jsonb) where owner_id=$1 and satellite_id=$2 and id=$3 returning id`,
    [owner, satelliteId, recordId, json([{text: t, at: now(), by}])]);
  if (!rows.length) throw new WorkspaceError(404, 'Record not found.');
  return {ok: true};
}

export const MISSED = /^(wrong|x|fail|incorrect|miss|fixed|오답|틀림|고침)$/i;
/** A plain draft from records: the user's lines verbatim and the reported facts. MOONS's reading is added by the agent only. */
export function draftFromRecords(satelliteId: string, records: SatelliteRecord[]): RecordDraft {
  const activity: string[] = [], missed = new Set<string>();
  for (const r of records) {
    const head = [r.title, r.summary].filter(Boolean).join(' — ');
    if (head) activity.push(head);
    for (const i of r.items) {
      activity.push([i.label, i.result, i.answer ? `→ ${i.answer}` : '', i.note ? `(${i.note})` : ''].filter(Boolean).join(' '));
      // "fixed": wrong first, right on the retry. Still a word that was missed.
      if (MISSED.test(i.result ?? '')) missed.add(i.label);
    }
  }
  return {title: records[0]?.title || 'Satellite', userText: records.flatMap(r => r.userText), activity: activity.slice(0, 300), concepts: [...new Set(records.flatMap(r => r.concepts))], missed: [...missed],
    recordIds: records.map(r => r.id), satelliteId};
}

// ---------- inbox ----------
export async function addInbox(owner: string, source: InboxItem['source'], kind: string, data: unknown, batch?: {id: string; title: string}) {
  const id = newId();
  await q('insert into inbox_items(owner_id,id,source,kind,data,batch_id,batch_title) values($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7)', [owner, id, json(source), kind, json(data), batch?.id ?? null, batch?.title ?? null]);
  return id;
}
/** Whether a batch with this id already waits (sending the same day twice leaves one card). */
export async function openBatch(owner: string, batchId: string) {
  return (await q<{id: string}>(`select id from inbox_items where owner_id=$1 and batch_id=$2 and status='open'`, [owner, batchId])).map(r => r.id);
}
export async function listInbox(owner: string, status = 'open') {
  const rows = await q<{id: string; source: InboxItem['source']; kind: string; data: Record<string, unknown>; status: InboxItem['status']; created_at: string; decided_at: string | null; entry_id: string | null; batch_id: string | null; batch_title: string | null}>(
    `select id,source,kind,data,status,created_at::text,decided_at::text,entry_id,batch_id,batch_title from inbox_items where owner_id=$1${status === 'all' ? '' : ' and status=$2'} order by created_at desc limit 500`, status === 'all' ? [owner] : [owner, status]);
  return rows.map((r): InboxItem => ({id: r.id, source: r.source, kind: r.kind, data: r.data, status: r.status, createdAt: r.created_at, ...(r.decided_at ? {decidedAt: r.decided_at} : {}), ...(r.entry_id ? {entryId: r.entry_id} : {}),
    ...(r.batch_id ? {batch: {id: r.batch_id, title: r.batch_title ?? ''}} : {})}));
}

/** Builds the note an approved record draft becomes. Only the user's lines and the reported facts form its original. */
export function recordEntry(d: RecordDraft): Entry {
  const user = d.userText.map(t => t.trim()).filter(Boolean), act = d.activity.map(t => t.trim()).filter(Boolean);
  const body = [...user, ...act].join('\n');
  if (!body) throw new WorkspaceError(400, 'This draft has nothing to keep.');
  const sentences = splitSentences(body);
  // Which part of the body each sentence came from: the user's own words, or what the Satellite reported.
  const userEnd = user.join('\n').length;
  let cursor = 0;
  const lineBy = sentences.map(s => { const i = body.indexOf(s, cursor); if (i >= 0) cursor = i + s.length; return (i >= 0 ? i : cursor) < userEnd && user.length ? 'user' : 'satellite'; });
  return {id: newId(), kind: 'record', body, sentences, locked: true, createdAt: now(), status: 'saved', planetIds: [], title: d.title.slice(0, 120),
    meta: {source: 'Satellite record', satellite: {id: d.satelliteId, recordIds: d.recordIds}, lineBy, record: {missed: d.missed, ...(d.moons ? {moons: d.moons} : {})}}} as Entry;
}

/** Concepts named by the record, found verbatim in its sentences, joined without AI. User lines count as the user's own mentions. */
export function linkRecordConcepts(store: Store, entry: Entry, names: string[]) {
  const list = (store.concepts as Concept[] | undefined) ?? [];
  const lineBy = (entry.meta?.lineBy as string[] | undefined) ?? [];
  for (const raw of names) {
    const k = nameKey(raw);
    const hits = entry.sentences.flatMap((s, i) => nameKey(s).includes(k) ? [i] : []);
    if (!k || !hits.length) continue;
    let c = list.find(x => [x.name, ...x.aliases].some(n => nameKey(n) === k));
    if (!c) { c = {id: newId(), name: raw, aliases: [], kind: 'term', definition: [], relations: [], mentions: [], state: 'seen', createdAt: now()}; list.push(c); }
    c.mentions = [...c.mentions.filter(m => m.entryId !== entry.id), ...hits.map(i => ({entryId: entry.id, sentence: i, by: lineBy[i] === 'user' ? 'user' as const : 'material' as const}))];
    c.updatedAt = now();
  }
  store.concepts = list;
}

/** Approving an inbox item writes it into the space. Editing in the approval screen replaces the draft first. */
export async function decideInbox(owner: string, id: string, input: {action?: unknown; data?: unknown}) {
  const item = (await listInbox(owner, 'all')).find(x => x.id === id);
  if (!item) throw new WorkspaceError(404, 'Inbox item not found.');
  if (item.status !== 'open') throw new WorkspaceError(409, 'Already decided.');
  if (input.action === 'dismiss') {
    await q(`update inbox_items set status='dismissed',decided_at=now() where owner_id=$1 and id=$2`, [owner, id]);
    return {status: 'dismissed', workspace: null};
  }
  if (input.action !== 'approve') throw new WorkspaceError(400, 'Approve or dismiss.');
  const data = (input.data && typeof input.data === 'object' ? {...item.data, ...(input.data as Record<string, unknown>)} : item.data);
  const {result: entryId, saved} = await changeStoreSaved(owner, store => applyItem(store, item.kind, data, item.source));
  await q(`update inbox_items set status='applied',decided_at=now(),entry_id=$3,data=$4::jsonb where owner_id=$1 and id=$2`, [owner, id, entryId ?? null, json(data)]);
  return {status: 'applied', entryId, workspace: saved};
}

/** A batch decided at once. Approval writes every chosen item in one save: if one fails, nothing is written and the error names it. */
export async function decideBatch(owner: string, batchId: string, input: {action?: unknown; ids?: unknown; data?: unknown}) {
  const open = (await listInbox(owner, 'open')).filter(x => x.batch?.id === batchId);
  if (!open.length) throw new WorkspaceError(404, 'Nothing waiting in this batch.');
  const ids = Array.isArray(input.ids) ? new Set(input.ids.map(String)) : null;
  const chosen = open.filter(x => !ids || ids.has(x.id));
  if (!chosen.length) throw new WorkspaceError(400, 'Choose what to decide.');
  if (input.action === 'dismiss') {
    await q(`update inbox_items set status='dismissed',decided_at=now() where owner_id=$1 and id = any($2::text[]) and status='open'`, [owner, chosen.map(x => x.id)]);
    return {status: 'dismissed', count: chosen.length, workspace: null};
  }
  if (input.action !== 'approve') throw new WorkspaceError(400, 'Approve or dismiss.');
  const edits = (input.data && typeof input.data === 'object' ? input.data : {}) as Record<string, Record<string, unknown>>;
  // Concepts first, so notes and relations in the same batch find them.
  const order = [...chosen].sort((a, b) => Number(b.kind === 'concept') - Number(a.kind === 'concept'));
  const {result, saved} = await changeStoreSaved(owner, store => order.map(it => {
    const data = edits[it.id] && typeof edits[it.id] === 'object' ? {...it.data, ...edits[it.id]} : it.data;
    try { return {id: it.id, data, entryId: applyItem(store, it.kind, data, it.source)}; }
    catch (e) { throw new WorkspaceError(e instanceof WorkspaceError ? e.status : 400, `${String(it.data.title ?? it.data.name ?? it.kind)}: ${(e as Error).message}`); }
  }));
  for (const r of result) await q(`update inbox_items set status='applied',decided_at=now(),entry_id=$3,data=$4::jsonb where owner_id=$1 and id=$2`, [owner, r.id, r.entryId ?? null, json(r.data)]);
  return {status: 'applied', count: result.length, entryIds: result.flatMap(r => r.entryId ? [r.entryId] : []), workspace: saved};
}

const CONCEPT_KINDS = ['theory', 'method', 'tool', 'term', 'entity', 'other'];
const REL = ['kind_of', 'part_of', 'implements', 'contrasts', 'similar', 'related'];
/** The concept a proposal names: by name, alias or headword. */
export function findConcept(list: Concept[], name: string, headword = '') {
  const keys = [name, headword].filter(Boolean).map(nameKey);
  return list.find(x => [x.name, ...x.aliases, x.term?.headword ?? ''].some(n => n && keys.includes(nameKey(n))));
}
const list = (v: unknown, n: number, max: number) => Array.isArray(v) ? [...new Set(v.map(x => str(x, max)).filter(Boolean))].slice(0, n) : [];
/** The term fields of a proposal, checked and capped. */
export function termInput(d: Record<string, unknown>): TermInfo {
  const t: TermInfo = {};
  for (const [k, max] of [['headword', 80], ['pos', 16], ['meaningKo', 200], ['pitfall', 400]] as const) { const v = str(d[k], max); if (v) t[k] = v; }
  const forms = list(d.forms, 30, 60), coll = list(d.collocations, 20, 120);
  if (forms.length) t.forms = forms;
  if (coll.length) t.collocations = coll;
  return t;
}
/** A note's original and corrected version, paired sentence by sentence, as the approval screen shows them. */
export function revisionDraft(original: string, revised: string, corrections: unknown): RevisionDraft | undefined {
  const text = str(revised, 40000);
  if (!text) return undefined;
  const fixes = (Array.isArray(corrections) ? corrections : []).slice(0, 100).map(x => {
    const c = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return {from: str(c.from, 300), to: str(c.to, 300), ...(str(c.reason, 300) ? {reason: str(c.reason, 300)} : {}), ...(Number.isInteger(c.sentence) ? {sentence: Number(c.sentence)} : {})};
  }).filter(c => c.from || c.to);
  const orig = splitSentences(original), rev = splitSentences(text);
  return {text, corrections: fixes, orig, rev, rows: alignSentences(orig, rev, fixes)};
}
/** Builds the approved version from the user's choice per row: "rev" (the correction, default where there is one), "orig" (keep my sentence), "none" (leave out). */
export function approvedRevision(d: RevisionDraft, choices: string[], from: string): Revision {
  const sentences: string[] = [], byList: Revision['by'] = [];
  let out = '', cursor = 0;
  d.rows.forEach((r, i) => {
    const want = choices[i] ?? (r.rev !== undefined ? 'rev' : 'none');
    const orig = r.orig !== undefined ? d.orig[r.orig] : undefined, rev = r.rev !== undefined ? d.rev[r.rev] : undefined;
    const pick = want === 'orig' && orig !== undefined ? orig : want === 'none' ? undefined : rev ?? (want === 'orig' ? orig : undefined);
    if (rev !== undefined) {
      const at = d.text.indexOf(rev, cursor);
      if (at >= 0) { out += d.text.slice(cursor, at); cursor = at + rev.length; }
    } else if (pick !== undefined && out && !/\s$/.test(out)) out += ' ';
    if (pick === undefined) return;
    out += pick; sentences.push(pick); byList.push(pick === orig ? 'user' : 'user_approved');
  });
  out += d.text.slice(cursor);
  const text = out.replace(/[ \t]+\n/g, '\n').trim();
  if (!sentences.length) throw new WorkspaceError(400, 'The corrected version is empty.');
  return {text, sentences, by: byList, corrections: d.corrections, approvedAt: now(), from};
}

const by = (source: InboxItem['source']) => source.type === 'claude' ? 'claude' : `satellite:${source.id ?? ''}`;
/** Writes one approved item into the store. Returns the note it created, if any. */
export function applyItem(store: Store, kind: string, data: Record<string, unknown>, source: InboxItem['source']): string | undefined {
  const text = (v: unknown, max = 20000) => str(v, max);
  if (kind === 'record_note') {
    const d = data as unknown as RecordDraft;
    const entry = recordEntry({...d, userText: (d.userText ?? []).map(t => String(t)), activity: (d.activity ?? []).map(t => String(t)), concepts: d.concepts ?? [], missed: d.missed ?? [], recordIds: d.recordIds ?? [], satelliteId: d.satelliteId ?? source.id ?? '', title: String(d.title ?? '')});
    const sat = satellitesOf(store).find(s => s.id === d.satelliteId);
    if (sat?.planetIds.length) entry.planetIds = sat.planetIds.filter(p => store.planets.some(x => x.id === p));
    store.entries.unshift(entry);
    linkRecordConcepts(store, entry, [...(d.concepts ?? []), ...(d.missed ?? [])]);
    return entry.id;
  }
  if (kind === 'note') {
    // A note Claude proposes: the user's own words relayed by Claude become a spark marked as relayed; anything else is AI material.
    const body = text(data.text);
    if (!body) throw new WorkspaceError(400, 'The note is empty.');
    const mine = data.words === 'user';
    const entry: Entry = {id: newId(), kind: mine ? 'dump' : 'media', ...(mine ? {} : {mediaType: 'custom'}), body, sentences: splitSentences(body), locked: true, createdAt: now(), status: 'saved', planetIds: [],
      title: text(data.title, 120) || undefined, meta: {source: mine ? 'Your words, relayed by Claude' : 'Claude (AI material, not your words)', relayedBy: by(source)}} as Entry;
    // The corrected version exists only from this approval, and only beside the user's own words.
    const draft = data.revision as RevisionDraft | undefined;
    if (mine && draft?.rows?.length) (entry as Entry & {revision?: Revision}).revision = approvedRevision(draft, Array.isArray(data.choices) ? data.choices.map(String) : [], by(source));
    store.entries.unshift(entry);
    return entry.id;
  }
  if (kind === 'concept') {
    const name = text(data.name, 80);
    if (!name) throw new WorkspaceError(400, 'Name the concept.');
    const list = (store.concepts as Concept[] | undefined) ?? [];
    const proposedKind = (CONCEPT_KINDS.includes(String(data.kind)) ? data.kind : 'term') as Concept['kind'];
    let c = findConcept(list, name, text(data.headword, 80));
    if (!c) { c = {id: newId(), name, aliases: [], kind: proposedKind, definition: [], relations: [], mentions: [], state: 'seen', createdAt: now()}; list.push(c); }
    else if (proposedKind === 'term' && c.kind !== 'term' && data.kind === 'term') c.kind = 'term';
    const def = text(data.definition, 400);
    if (def && !c.definition.some(d => d.text === def)) c.definition.push({text: def, layer: 'ai'});
    if (c.kind === 'term') { const info = termInput(data); if (Object.keys(info).length) c.term = mergeTerm(c.term, info).term; }
    if (typeof data.autoLink === 'boolean') c.autoLink = data.autoLink;
    for (const r of (Array.isArray(data.relations) ? data.relations : []).slice(0, 12) as {to?: unknown; rel?: unknown; note?: unknown}[]) {
      const to = text(r.to, 80), rel = String(r.rel), why = text(r.note, 300);
      if (!to || !REL.includes(rel) || nameKey(to) === nameKey(c.name)) continue;
      const target = findConcept(list, to);
      const same = c.relations.find(x => nameKey(x.toName) === nameKey(to) && x.rel === rel);
      if (same) { if (why && !same.why) same.why = why; continue; }
      c.relations.push({to: target?.id, toName: target?.name ?? to, rel: rel as Concept['relations'][number]['rel'], layer: 'ai', ...(why ? {why} : {})});
    }
    // Relations sent before this concept existed now point at it.
    for (const x of list) for (const r of x.relations) if (!r.to && x.id !== c.id && nameKey(r.toName) === nameKey(c.name)) r.to = c.id;
    c.updatedAt = now();
    store.concepts = list;
    return undefined;
  }
  if (kind === 'memo') {
    const t = text(data.text, 2000);
    if (!t) throw new WorkspaceError(400, 'The memo is empty.');
    const target = (data.target && typeof data.target === 'object' ? data.target : {type: 'none'}) as {type?: string; id?: string};
    store.memos = [...((store.memos as unknown[]) ?? []), {id: newId(), target: {type: ['entry', 'concept', 'question'].includes(String(target.type)) ? target.type : 'none', ...(target.id ? {id: String(target.id).slice(0, 80)} : {})}, text: t, createdAt: now(), by: by(source)}];
    return undefined;
  }
  if (kind === 'question') {
    const title = text(data.title, 200);
    if (!title) throw new WorkspaceError(400, 'Write the question.');
    const why = text(data.why, 2000);
    const subs = (Array.isArray(data.subQuestions) ? data.subQuestions : []).slice(0, 10).map(s => ({id: newId(), text: text(s, 200), status: 'open', materials: {entryIds: [], conceptIds: []}, layer: 'ai'})).filter(s => s.text);
    const entry = {id: newId(), kind: 'question', body: why || title, sentences: splitSentences(why || title), locked: true, createdAt: now(), status: 'saved', planetIds: [], title,
      meta: {relayedBy: by(source)}, question: {why, status: 'open', subQuestions: subs}} as unknown as Entry;
    store.entries.unshift(entry);
    return entry.id;
  }
  if (kind === 'session') {
    // A conversation held in Claude: its summary is the AI layer; the user's utterances (relayed by Claude) are the original.
    const said = (Array.isArray(data.userUtterances) ? data.userUtterances : []).map(t => text(t, 4000)).filter(Boolean).slice(0, 80);
    const summary = text(data.summary, 2000);
    const body = said.join('\n') || summary;
    if (!body) throw new WorkspaceError(400, 'Nothing to keep from this conversation.');
    const conceptIds: string[] = [];
    const list = (store.concepts as Concept[] | undefined) ?? [];
    for (const n of (Array.isArray(data.studyConcepts) ? data.studyConcepts : []).map(t => text(t, 60)).filter(Boolean).slice(0, 20)) {
      let c = list.find(x => [x.name, ...x.aliases].some(a => nameKey(a) === nameKey(n)));
      if (!c) { c = {id: newId(), name: n, aliases: [], kind: 'other', definition: [], relations: [], mentions: [], state: 'seen', createdAt: now()}; list.push(c); }
      conceptIds.push(c.id);
    }
    store.concepts = list;
    // Without the user's own utterances only Claude's summary is left, so it is kept as AI material.
    const entry = {id: newId(), kind: said.length ? 'chat' : 'media', ...(said.length ? {} : {mediaType: 'custom'}), body, sentences: splitSentences(body), locked: true, createdAt: now(), status: 'saved', planetIds: [], title: text(data.title, 120) || 'Claude',
      meta: {source: said.length ? 'Your words in Claude, relayed by Claude' : 'Claude summary', relayedBy: by(source)},
      chat: {chatId: '', summary, revisit: (Array.isArray(data.revisit) ? data.revisit : []).map(t => ({text: text(t, 300)})).filter(x => x.text).slice(0, 12),
        study: {conceptIds, questions: (Array.isArray(data.questions) ? data.questions : []).map(t => text(t, 200)).filter(Boolean).slice(0, 10)}, artifacts: []}} as unknown as Entry;
    store.entries.unshift(entry);
    return entry.id;
  }
  throw new WorkspaceError(400, 'Unknown inbox item.');
}
