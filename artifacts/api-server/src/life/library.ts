import {createHash, randomBytes} from 'node:crypto';
import {LIBRARY_KINDS, LibraryData, codeHash, isCode, packCode, type MadePack, type LibraryItem, type LibraryKind, type WidgetManifest} from '@workspace/planner-spec';
import {q, json} from '../moons/lib/server/db.ts';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';

// 내 라이브러리 (docs/lit/WIDGET_PLATFORM.md): saved widgets, templates, skins and manifest widgets, per account.
// Kept apart from the planner spec so saving a widget never makes a new planner version.
const SCHEMA = [
  `create table if not exists lit_library(owner_id text not null,id text not null,kind text not null,name text not null,data jsonb not null,enabled boolean not null default true,approved text,source text not null default 'user',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(owner_id,id))`,
  // Developer tokens publish widgets from the command line into the owner's library (never approved automatically).
  `create table if not exists lit_dev_tokens(token_hash text primary key,owner_id text not null,label text not null,created_at timestamptz not null default now(),last_used_at timestamptz,revoked boolean not null default false)`,
];
let ready: Promise<void> | undefined;
const init = () => (ready ??= (async () => { for (const s of SCHEMA) await q(s); })().catch(e => { ready = undefined; throw e; }));

type Row = {id: string; kind: LibraryKind; name: string; data: unknown; enabled: boolean; approved: string | null; source: LibraryItem['source']; created_at: string; updated_at: string};
const item = (r: Row): LibraryItem => ({id: r.id, kind: r.kind, name: r.name, data: r.data as never, enabled: r.enabled, approved: r.approved, source: r.source, createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString()});
const MAX_ITEMS = 300;

/** The code a library item runs (a code widget, or a made widget drawn in the developer console), which needs approval. */
function codeOf(kind: LibraryKind, data: Record<string, unknown>) {
  if (kind === 'custom') { const m = data.manifest as WidgetManifest; return isCode(m) ? m : null; }
  if (kind === 'made') return packCode(data.pack as MadePack);
  return null;
}

export async function listLibrary(owner: string): Promise<LibraryItem[]> {
  await init();
  return (await q<Row>('select id,kind,name,data,enabled,approved,source,created_at,updated_at from lit_library where owner_id=$1 order by kind,updated_at desc', [owner])).map(item);
}

/** Save (create or replace) one item. A custom widget keyed by its manifest id; changed code drops the approval. */
export async function saveLibrary(owner: string, raw: {id?: string; kind: string; name?: string; data: unknown; enabled?: boolean}, source: LibraryItem['source'] = 'user'): Promise<LibraryItem> {
  await init();
  if (!LIBRARY_KINDS.includes(raw.kind as LibraryKind)) throw new WorkspaceError(400, 'Unknown library kind.');
  const kind = raw.kind as LibraryKind;
  const parsed = LibraryData[kind].safeParse(raw.data);
  if (!parsed.success) throw new WorkspaceError(400, `내용을 읽지 못했어요: ${parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const data = parsed.data as Record<string, unknown>;
  const manifest = kind === 'custom' ? (data.manifest as WidgetManifest) : null;
  const id = manifest ? `w-${manifest.id}` : raw.id && /^[a-z0-9-]{1,60}$/.test(raw.id) ? raw.id : `${kind}-${randomBytes(5).toString('hex')}`;
  const name = (manifest?.name ?? raw.name ?? (kind === 'made' ? (data.pack as MadePack).title : '')).trim().slice(0, 40) || '이름 없음';
  const before = (await q<{data: {manifest?: WidgetManifest}; approved: string | null}>('select data,approved from lit_library where owner_id=$1 and id=$2', [owner, id]))[0];
  if (!before && Number((await q<{n: string}>('select count(*)::text n from lit_library where owner_id=$1', [owner]))[0]!.n) >= MAX_ITEMS) throw new WorkspaceError(400, '라이브러리가 가득 찼어요.');
  // Approval survives an update only when code and permissions are unchanged.
  const code = codeOf(kind, data);
  const approved = code && before?.approved && before.approved === codeHash(code) ? before.approved : null;
  await q(`insert into lit_library(owner_id,id,kind,name,data,enabled,approved,source) values($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict(owner_id,id) do update set kind=excluded.kind,name=excluded.name,data=excluded.data,enabled=excluded.enabled,approved=excluded.approved,source=excluded.source,updated_at=now()`,
    [owner, id, kind, name, json(data), raw.enabled ?? true, approved, source]);
  return (await listLibrary(owner)).find(x => x.id === id)!;
}

export async function setLibraryState(owner: string, id: string, patch: {enabled?: boolean; approve?: boolean; name?: string}) {
  await init();
  const row = (await q<Row>('select id,kind,name,data,enabled,approved,source,created_at,updated_at from lit_library where owner_id=$1 and id=$2', [owner, id]))[0];
  if (!row) throw new WorkspaceError(404, 'Not in your library.');
  const m = codeOf(row.kind, row.data as Record<string, unknown>);
  const approved = patch.approve === undefined ? row.approved : patch.approve && m ? codeHash(m) : null;
  await q('update lit_library set enabled=$3,approved=$4,name=$5,updated_at=now() where owner_id=$1 and id=$2',
    [owner, id, patch.enabled ?? row.enabled, approved, (patch.name ?? row.name).trim().slice(0, 40) || row.name]);
  return (await listLibrary(owner)).find(x => x.id === id)!;
}

export async function deleteLibrary(owner: string, id: string) {
  await init();
  await q('delete from lit_library where owner_id=$1 and id=$2', [owner, id]);
  return {deleted: id};
}

// Developer tokens: shown once, stored hashed.
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
export async function createDevToken(owner: string, label: string) {
  await init();
  const token = `litdev_${randomBytes(24).toString('base64url')}`;
  await q('insert into lit_dev_tokens(token_hash,owner_id,label) values($1,$2,$3)', [hash(token), owner, label.trim().slice(0, 40) || '개발 도구']);
  return {token, label};
}
export async function listDevTokens(owner: string) {
  await init();
  return (await q<{token_hash: string; label: string; created_at: string; last_used_at: string | null}>('select token_hash,label,created_at,last_used_at from lit_dev_tokens where owner_id=$1 and revoked=false order by created_at desc', [owner]))
    .map(r => ({id: r.token_hash.slice(0, 12), label: r.label, createdAt: new Date(r.created_at).toISOString(), lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null}));
}
export async function revokeDevToken(owner: string, id: string) {
  await init();
  await q(`update lit_dev_tokens set revoked=true where owner_id=$1 and left(token_hash,12)=$2`, [owner, id]);
  return {revoked: id};
}
export async function ownerOfDevToken(token: string): Promise<string> {
  await init();
  const row = (await q<{owner_id: string}>('update lit_dev_tokens set last_used_at=now() where token_hash=$1 and revoked=false returning owner_id', [hash(token)]))[0];
  if (!row) throw new WorkspaceError(401, '개발자 토큰이 맞지 않거나 취소됐어요. lit 메뉴 → 개발자에서 새로 만들어요.');
  return row.owner_id;
}
