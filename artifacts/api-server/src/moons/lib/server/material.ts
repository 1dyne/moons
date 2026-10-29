// Uploaded originals (recordings) and answer-vs-original comparisons.
// The recording is kept byte for byte in material_parts; its transcript becomes a 'media' entry
// that goes through the same structure pipeline as any other record.
import {q, json, newId} from './db.ts';
import {ai} from './ai/index.ts';
import {redact} from './redact.ts';
import {cleanTranscript} from './text.ts';
import {compareSystem, compareUser, compareSchema} from './prompts.ts';
import {splitSentences, MATERIAL_PART_BYTES, type CompareItem, type CompareVerdict, type Comparison, type MaterialInfo} from '../thought.ts';
import {saveObject,readObject} from './v5/storage.ts';
import {compareTexts} from './v5/analysis.ts';
import {logger} from '../../../lib/logger';

const log = (...args: unknown[]) => logger.info({details:args}, 'MOONS material');

type MaterialRow = {id: string; space_id: string; entry_id: string | null; title: string; filename: string; mime: string; bytes: string | number; duration: number; status: string; sentence_times: number[]};

export async function createMaterial(input: {spaceId: string; title: string; filename: string; mime: string; bytes: number; duration: number}) {
  const id = newId();
  await q('insert into materials (id, space_id, title, filename, mime, bytes, duration) values ($1,$2,$3,$4,$5,$6,$7)',
    [id, input.spaceId, input.title, input.filename, input.mime, input.bytes, input.duration]);
  return id;
}

export async function material(id: string) { return (await q<MaterialRow>('select * from materials where id = $1', [id]))[0] ?? null; }

export async function putPart(id: string, seq: number, data: Uint8Array) {
  const m=await material(id);
  if(!m)throw Error('Material not found.');
  const objectPath=await saveObject('event-originals',`${id}/${seq}`,Buffer.from(data),m.mime);
  await q('insert into material_parts (material_id, seq, object_path) values ($1,$2,$3) on conflict (material_id, seq) do update set object_path = excluded.object_path', [id, seq, objectPath]);
}

// One stretch of the recording (16kHz mono WAV from the browser) to text.
export async function putChunk(id: string, seq: number, start: number, end: number, audio: Blob) {
  const raw = await ai().transcribe(audio, `chunk-${seq}.wav`, {language: null});
  const text = redact(cleanTranscript(raw.trim())).text;
  await q(`insert into material_chunks (material_id, seq, start_sec, end_sec, text) values ($1,$2,$3,$4,$5)
    on conflict (material_id, seq) do update set start_sec = excluded.start_sec, end_sec = excluded.end_sec, text = excluded.text`, [id, seq, start, end, text]);
  return text.length;
}

// Joins the stretches into the original transcript and gives every sentence a time in the recording.
export function assemble(chunks: {start_sec: number; end_sec: number; text: string}[]) {
  const parts = chunks.filter(c => c.text.trim());
  const body = parts.map(c => c.text.trim()).join('\n');
  const ranges: {from: number; to: number; start: number; end: number}[] = [];
  let at = 0;
  for (const c of parts) { const t = c.text.trim(); ranges.push({from: at, to: at + t.length, start: c.start_sec, end: c.end_sec}); at += t.length + 1; }
  const sentences = splitSentences(body);
  let cursor = 0;
  const times = sentences.map(s => {
    const pos = Math.max(cursor, body.indexOf(s, cursor));
    cursor = pos + s.length;
    const r = ranges.find(x => pos >= x.from && pos <= x.to) ?? ranges[ranges.length - 1];
    if (!r) return 0;
    const ratio = r.to > r.from ? (pos - r.from) / (r.to - r.from) : 0;
    return Math.round((r.start + ratio * (r.end - r.start)) * 10) / 10;
  });
  return {body, sentences, times};
}

export async function finishMaterial(id: string, create: (body: string) => Promise<string>) {
  const m = await material(id);
  if (!m) return null;
  const chunks = await q<{start_sec: number; end_sec: number; text: string}>('select start_sec, end_sec, text from material_chunks where material_id = $1 order by seq', [id]);
  const {body, times} = assemble(chunks);
  if (!body) return {entryId: null};
  const entryId = await create(body);
  await q('update materials set entry_id = $2, status = $3, sentence_times = $4::jsonb where id = $1', [id, entryId, 'structuring', json(times)]);
  log('material ready', id, `${times.length} sentences`);
  return {entryId};
}

// Byte range of the stored recording, at most one part long (function responses are capped near 4.5MB).
export async function readRange(id: string, start: number, endWanted: number | null) {
  const m = await material(id);
  if (!m) return null;
  const total = Number(m.bytes);
  if (start >= total) return {total, mime: m.mime, start, end: start - 1, data: new Uint8Array(0)};
  const end = Math.min(total - 1, endWanted ?? total - 1, start + MATERIAL_PART_BYTES - 1);
  const first = Math.floor(start / MATERIAL_PART_BYTES), last = Math.floor(end / MATERIAL_PART_BYTES);
  const rows = await q<{seq: number; data: Uint8Array|null;object_path:string|null}>('select seq, data, object_path from material_parts where material_id = $1 and seq between $2 and $3 order by seq', [id, first, last]);
  const out = new Uint8Array(end - start + 1);
  let written = 0;
  for (const r of rows) {
    const base = r.seq * MATERIAL_PART_BYTES;
    const data = r.object_path ? new Uint8Array(await readObject(r.object_path)) : r.data instanceof Uint8Array ? r.data : new Uint8Array(r.data as unknown as ArrayBuffer);
    const from = Math.max(start, base) - base, to = Math.min(end, base + data.length - 1) - base;
    if (to < from) continue;
    out.set(data.subarray(from, to + 1), Math.max(start, base) - start);
    written += to - from + 1;
  }
  return {total, mime: m.mime, start, end: start + written - 1, data: out.subarray(0, written)};
}

export async function materialForEntry(entryId: string): Promise<MaterialInfo | null> {
  const m = (await q<MaterialRow>('select * from materials where entry_id = $1', [entryId]))[0];
  return m ? {id: m.id, title: m.title, mime: m.mime, duration: m.duration, sentenceTimes: m.sentence_times ?? []} : null;
}

export async function materialTitles(spaceId: string) {
  const rows = await q<{entry_id: string; title: string}>('select entry_id, title from materials where space_id = $1 and entry_id is not null', [spaceId]);
  return new Map(rows.map(r => [r.entry_id, r.title]));
}

// The latest original in a space that has a transcript.
async function latestOriginal(spaceId: string) {
  return (await q<{entry_id: string; title: string; sentence_times: number[]; sentences: string[]}>(
    `select m.entry_id, m.title, m.sentence_times, e.sentences from materials m join entries e on e.id = m.entry_id
     where m.space_id = $1 and e.hidden = false order by m.created_at desc limit 1`, [spaceId]))[0] ?? null;
}
export async function originalAvailable(spaceId: string) { return !!(await latestOriginal(spaceId)); }

export async function setMaterialStatus(entryId: string, status: string) {
  await q('update materials set status = $2 where entry_id = $1', [entryId, status]);
}

type CompareRow = {entry_id: string; material_entry_id: string; summary: string; items: CompareItem[]};

async function toComparison(row: CompareRow): Promise<Comparison | null> {
  const orig = (await q<{title: string; sentence_times: number[]; sentences: string[]}>(
    'select m.title, m.sentence_times, e.sentences from materials m join entries e on e.id = m.entry_id where m.entry_id = $1', [row.material_entry_id]))[0];
  if (!orig) return null;
  const used = [...new Set(row.items.flatMap(i => i.original))].filter(i => i >= 0 && i < orig.sentences.length).sort((a, b) => a - b);
  return {materialEntryId: row.material_entry_id, materialTitle: orig.title, summary: row.summary, items: row.items,
    quotes: used.map(index => ({index, text: orig.sentences[index], time: orig.sentence_times?.[index] ?? 0}))};
}

export async function comparisonFor(entryId: string) {
  const row = (await q<CompareRow>('select * from comparisons where entry_id = $1', [entryId]))[0];
  return row ? toComparison(row) : null;
}

// Reads one answer against the space's original. Kept once per answer; returns the stored one when it exists.
export async function compareEntry(entryId: string): Promise<Comparison | null> {
  const existing = await comparisonFor(entryId);
  if (existing) return existing;
  const e = (await q<{id: string; space_id: string; kind: string; sentences: string[]; question_id: string | null; hidden: boolean}>('select * from entries where id = $1', [entryId]))[0];
  if (!e || e.hidden || e.kind === 'media' || e.kind === 'decision' || !e.sentences.length) return null;
  const orig = await latestOriginal(e.space_id);
  if (!orig || !orig.sentences.length) return null;
  const res=await compareTexts({id:orig.entry_id,title:orig.title,sentences:orig.sentences,anchors:orig.sentence_times.map(seconds=>({kind:'time',seconds}))},e);
  const items=res.items;
  await q(`insert into comparisons (entry_id, material_entry_id, summary, items, model) values ($1,$2,$3,$4::jsonb,$5)
    on conflict (entry_id) do update set material_entry_id = excluded.material_entry_id, summary = excluded.summary, items = excluded.items, model = excluded.model`,
  [entryId, orig.entry_id, res.summary.slice(0, 300), json(items), 'v5-comparison']);
  log('compared', entryId, items.length, 'items');
  return comparisonFor(entryId);
}

// After a new original lands: read every existing answer against it, a few at a time.
export async function compareAll(spaceId: string) {
  const rows = await q<{id: string}>(`select e.id from entries e left join comparisons c on c.entry_id = e.id
    where e.space_id = $1 and e.hidden = false and e.status = 'done' and e.kind in ('spark','quiz') and c.entry_id is null order by e.created_at`, [spaceId]);
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.all(rows.slice(i, i + 4).map(r => compareEntry(r.id).catch(error => log('compare failed', r.id, (error as Error).message))));
  }
  log('compared all', rows.length);
}

