import {WriteInput, parseBody, ulid, type AnyRecord, type Kind, type Settings} from '@workspace/life-contract';
import {PlannerSpec} from '@workspace/planner-spec';
import {q, transaction, json, type Driver} from '../moons/lib/server/db.ts';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';

// Life data hub (docs/LIFE_DATA_CONTRACT_v0.md). Separate tables from MOONS notes; the planner's only store.
// Each write takes the account's next revision, so consumers can order, dedupe and resume by it.
const SCHEMA = `
create table if not exists life_accounts (
  owner_id text primary key,
  tz text not null,
  day_boundary text not null,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists life_records (
  owner_id text not null,
  id text not null,
  kind text not null,
  revision integer not null,
  logical_day text,
  deleted boolean not null default false,
  data jsonb not null,
  primary key (owner_id, id)
);
create index if not exists life_records_rev on life_records(owner_id, revision);
create index if not exists life_records_day on life_records(owner_id, logical_day);
create table if not exists life_revisions (
  owner_id text not null,
  revision integer not null,
  record_id text not null,
  data jsonb not null,
  at timestamptz not null default now(),
  primary key (owner_id, revision)
);
create table if not exists planner_specs (
  owner_id text not null,
  version integer not null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, version)
)`;
let ready: Promise<void> | undefined;
export function initLife() {
  ready ??= (async () => { for (const s of SCHEMA.split(';').map(x => x.trim()).filter(Boolean)) await q(s); })().catch(e => { ready = undefined; throw e; });
  return ready;
}

const DEFAULT: Settings = {tz: 'UTC', dayBoundary: '04:00'};
export async function getSettings(owner: string): Promise<Settings & {configured: boolean; revision: number}> {
  await initLife();
  const row = (await q<{tz: string; day_boundary: string; revision: number}>('select tz,day_boundary,revision from life_accounts where owner_id=$1', [owner]))[0];
  return row ? {tz: row.tz, dayBoundary: row.day_boundary, configured: true, revision: row.revision} : {...DEFAULT, configured: false, revision: 0};
}
export async function putSettings(owner: string, s: Settings) {
  await initLife();
  try { new Intl.DateTimeFormat('en', {timeZone: s.tz}); } catch { throw new WorkspaceError(400, 'Unknown time zone.'); }
  await q(`insert into life_accounts(owner_id,tz,day_boundary) values($1,$2,$3) on conflict(owner_id) do update set tz=excluded.tz,day_boundary=excluded.day_boundary,updated_at=now()`, [owner, s.tz, s.dayBoundary]);
  return getSettings(owner);
}

async function nextRevision(db: Driver, owner: string) {
  await db.query(`insert into life_accounts(owner_id,tz,day_boundary) values($1,$2,$3) on conflict(owner_id) do nothing`, [owner, DEFAULT.tz, DEFAULT.dayBoundary]);
  const row = (await db.query('update life_accounts set revision=revision+1 where owner_id=$1 returning revision,tz', [owner])).rows[0] as {revision: number; tz: string};
  return row;
}
async function save(db: Driver, owner: string, record: AnyRecord) {
  await db.query(`insert into life_records(owner_id,id,kind,revision,logical_day,deleted,data) values($1,$2,$3,$4,$5,$6,$7)
    on conflict(owner_id,id) do update set revision=excluded.revision,logical_day=excluded.logical_day,deleted=excluded.deleted,data=excluded.data`,
    [owner, record.id, record.kind, record.revision, record.logicalDay, !!record.deletedAt, json(record)]);
  await db.query('insert into life_revisions(owner_id,revision,record_id,data) values($1,$2,$3,$4)', [owner, record.revision, record.id, json(record)]);
}

/** Create (id absent) or update a record. A stale baseRevision is refused instead of overwriting. */
export async function writeRecord(owner: string, id: string | null, raw: unknown) {
  await initLife();
  const input = WriteInput.parse(raw);
  let body;
  try { body = parseBody(input.kind, input.body); } catch { throw new WorkspaceError(400, `Invalid ${input.kind} record.`); }
  if (id !== null && !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new WorkspaceError(400, 'Invalid record id.');
  return transaction(async db => {
    const prior = id ? (await db.query('select data from life_records where owner_id=$1 and id=$2 for update', [owner, id])).rows[0]?.data as AnyRecord | undefined : undefined;
    if (id && !prior) throw new WorkspaceError(404, 'Record not found.');
    if (prior && prior.kind !== input.kind) throw new WorkspaceError(400, 'A record cannot change its kind.');
    if (prior && input.baseRevision !== undefined && input.baseRevision !== prior.revision) throw new WorkspaceError(409, 'This record changed elsewhere. Reload to see the latest.');
    if (prior?.deletedAt) throw new WorkspaceError(409, 'This record was deleted.');
    const {revision, tz} = await nextRevision(db, owner);
    const at = new Date().toISOString();
    const record = {
      id: prior?.id ?? ulid(), kind: input.kind, revision, createdAt: prior?.createdAt ?? at, updatedAt: at, deletedAt: null,
      logicalDay: input.logicalDay, tz: prior?.tz ?? tz,
      source: input.source ?? prior?.source ?? {type: 'planner', confirmed: true},
      ...(input.privateFields ? {privateFields: input.privateFields} : prior?.privateFields ? {privateFields: prior.privateFields} : {}),
      body, ...(input.ext ? {ext: input.ext} : prior?.ext ? {ext: prior.ext} : {}),
    } as AnyRecord;
    await save(db, owner, record);
    return record;
  });
}

/** Deleting leaves a tombstone so consumers learn about it; history stays. */
export async function deleteRecord(owner: string, id: string) {
  await initLife();
  return transaction(async db => {
    const prior = (await db.query('select data from life_records where owner_id=$1 and id=$2 for update', [owner, id])).rows[0]?.data as AnyRecord | undefined;
    if (!prior) throw new WorkspaceError(404, 'Record not found.');
    if (prior.deletedAt) return prior;
    const {revision} = await nextRevision(db, owner);
    const at = new Date().toISOString();
    const record = {...prior, revision, updatedAt: at, deletedAt: at} as AnyRecord;
    await save(db, owner, record);
    return record;
  });
}

export type ListQuery = {from?: string; to?: string; basis?: 'logical_day' | 'due' | 'occurred'; kinds?: Kind[]; includeDeleted?: boolean; cursor?: string; limit?: number};
/** Range reads. Undated kinds (goals, projects, routines) are always included unless kinds narrows them out. */
export async function listRecords(owner: string, o: ListQuery = {}) {
  await initLife();
  const limit = Math.min(1000, Math.max(1, o.limit ?? 500));
  const params: unknown[] = [owner];
  const where = ['owner_id=$1'];
  if (!o.includeDeleted) where.push('not deleted');
  if (o.kinds?.length) { params.push(o.kinds); where.push(`kind = any($${params.length})`); }
  if (o.from || o.to) {
    const expr = o.basis === 'due' ? `substr(data->'body'->'plan'->'due'->>'value',1,10)` : o.basis === 'occurred' ? `substr(data->'body'->'outcome'->>'completedAt',1,10)` : 'logical_day';
    params.push(o.from ?? '0000-00-00', o.to ?? '9999-99-99');
    where.push(`((${expr} between $${params.length - 1} and $${params.length}) or (logical_day is null and kind in ('goal','project','routine')))`);
  }
  if (o.cursor) { params.push(o.cursor); where.push(`id > $${params.length}`); }
  params.push(limit + 1);
  const rows = (await q<{data: AnyRecord}>(`select data from life_records where ${where.join(' and ')} order by id limit $${params.length}`, params)).map(r => r.data);
  const more = rows.length > limit;
  return {items: rows.slice(0, limit), nextCursor: more ? rows[limit - 1]!.id : null};
}

/** Changes after a revision, oldest first: the latest state of each changed record, tombstones included. */
export async function changesSince(owner: string, since: number, limit = 500) {
  await initLife();
  const n = Math.min(1000, Math.max(1, limit));
  const rows = (await q<{data: AnyRecord}>('select data from life_records where owner_id=$1 and revision>$2 order by revision limit $3', [owner, since, n + 1])).map(r => r.data);
  const page = rows.slice(0, n);
  return {items: page, nextSince: page.at(-1)?.revision ?? since, hasMore: rows.length > n};
}

export async function recordHistory(owner: string, id: string) {
  await initLife();
  return (await q<{data: AnyRecord}>('select data from life_revisions where owner_id=$1 and record_id=$2 order by revision', [owner, id])).map(r => r.data);
}
export async function allRecords(owner: string) { return (await listRecords(owner, {limit: 1000})).items; }
export async function lastActivity(owner: string) {
  await initLife();
  return (await q<{at: string | null}>(`select max(data->>'updatedAt') at from life_records where owner_id=$1`, [owner]))[0]?.at ?? null;
}

export async function getSpec(owner: string) {
  await initLife();
  const row = (await q<{version: number; spec: PlannerSpec; created_at: string}>('select version,spec,created_at::text from planner_specs where owner_id=$1 order by version desc limit 1', [owner]))[0];
  return row ? {version: row.version, spec: row.spec, savedAt: row.created_at} : null;
}
/** Each save is a new version; records never move when the spec changes. */
export async function saveSpec(owner: string, raw: unknown) {
  await initLife();
  const parsed = PlannerSpec.safeParse(raw);
  if (!parsed.success) throw new WorkspaceError(400, `Invalid planner spec: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  return transaction(async db => {
    const v = ((await db.query('select coalesce(max(version),0)::int v from planner_specs where owner_id=$1', [owner])).rows[0] as {v: number}).v + 1;
    await db.query('insert into planner_specs(owner_id,version,spec) values($1,$2,$3)', [owner, v, json(parsed.data)]);
    return {version: v, spec: parsed.data};
  });
}
