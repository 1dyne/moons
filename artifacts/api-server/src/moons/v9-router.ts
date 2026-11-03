import {Router, json as body, type Request, type Response} from 'express';
import multer from 'multer';
import {guest, initV5} from './lib/server/v5/workspace-store.ts';
import {WorkspaceError} from './lib/server/v5/types.ts';
import {limited} from './lib/server/http.ts';
import {q, newId} from './lib/server/db.ts';
import {saveObject, readObject} from './lib/server/v5/storage.ts';
import {storeRecord} from './lib/server/satellites/store.ts';

// v9 10.3/14.6: pages, my structures, folders and stored files live outside the workspace snapshot,
// so typing in a page does not grow the change log. Snapshots for analysis stay ordinary entries.
const TABLES = [
  `create table if not exists pages(id text not null,owner_id text not null,title text,blocks jsonb not null default '[]',planet_ids jsonb not null default '[]',structure_id text,asset_id text,latest_entry_id text,snapshot_hash text,confidence int,revision int not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,primary key(owner_id,id))`,
  `create index if not exists pages_owner_updated on pages(owner_id,updated_at desc)`,
  `create table if not exists structures(id text not null,owner_id text not null,name text not null,level text not null,body jsonb not null,source text not null default 'manual',favorite boolean not null default false,position int not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(owner_id,id))`,
  `create table if not exists folders(id text not null,owner_id text not null,name text not null,parent_id text,created_at timestamptz not null default now(),primary key(owner_id,id))`,
  `create table if not exists assets(id text not null,owner_id text not null,folder_id text,name text not null,mime text not null,size bigint not null default 0,storage_key text,url text,created_at timestamptz not null default now(),deleted_at timestamptz,primary key(owner_id,id))`,
  `create table if not exists satellite_store(owner_id text not null,satellite_id text not null,key text not null,value jsonb not null,updated_at timestamptz not null default now(),primary key(owner_id,satellite_id,key))`,
];
let ready: Promise<void> | null = null;
export function initV9() { return ready ??= (async () => { await initV5(); for (const t of TABLES) await q(t); })().catch(e => { ready = null; throw e; }); }

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const id = (v: unknown) => { const s = String(v ?? ''); if (!ID.test(s)) throw new WorkspaceError(400, 'Invalid id.'); return s; };
const text = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : null;
const ids = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, 50) : [];
const BLOCK_KINDS = /^[a-z][a-z0-9_-]{0,31}$/;

/** Blocks are kept as the user wrote them; only the shape is checked (v9 4.3: new kinds never change the page model). */
export function cleanBlocks(v: unknown) {
  if (!Array.isArray(v)) throw new WorkspaceError(400, 'Blocks must be a list.');
  if (v.length > 2000) throw new WorkspaceError(400, 'Too many blocks on one page.');
  return v.map((b, i) => {
    if (!b || typeof b !== 'object') throw new WorkspaceError(400, 'Invalid block.');
    const x = b as Record<string, unknown>;
    if (typeof x.kind !== 'string' || !BLOCK_KINDS.test(x.kind)) throw new WorkspaceError(400, 'Invalid block kind.');
    const by = x.by === 'source' || x.by === 'ai' ? x.by : 'user';
    const out: Record<string, unknown> = {id: typeof x.id === 'string' && ID.test(x.id) ? x.id : newId(), kind: x.kind, by, order: Number.isFinite(x.order) ? Number(x.order) : i, value: x.value ?? null};
    const c = x.canvas as Record<string, unknown> | undefined;
    if (c && typeof c === 'object') out.canvas = {x: Number(c.x) || 0, y: Number(c.y) || 0, w: Number(c.w) || 160, h: Number(c.h) || 80};
    return out;
  });
}

type PageRow = {id: string; title: string | null; blocks: unknown; planet_ids: unknown; structure_id: string | null; asset_id: string | null; latest_entry_id: string | null; snapshot_hash: string | null; confidence: number | null; revision: number; created_at: Date | string; updated_at: Date | string};
const iso = (v: Date | string) => v instanceof Date ? v.toISOString() : new Date(v).toISOString();
const parseJson = (v: unknown) => typeof v === 'string' ? JSON.parse(v) : v;
export function pageOut(r: PageRow, full = true) {
  const blocks = (parseJson(r.blocks) ?? []) as {kind: string; value: unknown}[];
  const preview = blocks.map(b => typeof b.value === 'string' ? b.value : typeof (b.value as {text?: unknown})?.text === 'string' ? (b.value as {text: string}).text : '').filter(Boolean).join(' ').slice(0, 160);
  return {id: r.id, title: r.title ?? undefined, planetIds: parseJson(r.planet_ids) ?? [], structureId: r.structure_id ?? undefined, assetId: r.asset_id ?? undefined, latestEntryId: r.latest_entry_id ?? undefined, snapshotHash: r.snapshot_hash ?? undefined,
    confidence: r.confidence ?? undefined, revision: r.revision, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), preview, ...(full ? {blocks} : {blockCount: blocks.length})};
}

export function v9Router(checkOrigin: (req: Request) => void) {
  const router = Router();
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 20 * 1024 * 1024, files: 1, fields: 4}});
  const wrap = (fn: (req: Request, res: Response, owner: string) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store');
      if (req.method !== 'GET') checkOrigin(req);
      await initV9();
      const owner = await guest(req, res);
      if (req.method !== 'GET' && limited(`v9:${owner}`, 240)) throw new WorkspaceError(429, 'Please wait a minute.');
      await fn(req, res, owner);
    } catch (e) {
      const status = e instanceof WorkspaceError ? e.status : 500;
      if (status === 500) req.log?.error({message: (e as Error).message}, 'v9 request failed');
      res.status(status).json({error: {message: e instanceof WorkspaceError ? e.message : 'The request failed. Please retry.'}});
    }
  };
  router.use(['/pages', '/structures', '/folders', '/sat-store'], body({limit: '3mb'}));

  // Pages
  router.get('/pages', wrap(async (req, res, owner) => {
    const rows = await q<PageRow>(`select * from pages where owner_id=$1 and deleted_at is null order by updated_at desc limit $2`, [owner, Math.min(500, Number(req.query.limit) || 300)]);
    res.json({pages: rows.map(r => pageOut(r, req.query.full === '1'))});
  }));
  router.get('/pages/:id', wrap(async (req, res, owner) => {
    const [r] = await q<PageRow>(`select * from pages where owner_id=$1 and id=$2 and deleted_at is null`, [owner, id(req.params.id)]);
    if (!r) throw new WorkspaceError(404, 'Page not found.');
    res.json(pageOut(r));
  }));
  router.put('/pages/:id', wrap(async (req, res, owner) => {
    const pid = id(req.params.id), b = req.body ?? {};
    const blocks = cleanBlocks(b.blocks ?? []);
    const conf = b.confidence == null ? null : Math.max(1, Math.min(10, Math.round(Number(b.confidence)))) || null;
    const [cur] = await q<PageRow>(`select * from pages where owner_id=$1 and id=$2`, [owner, pid]);
    if (cur && Number.isFinite(b.revision) && Number(b.revision) !== cur.revision) { res.status(409).json({error: {message: 'This page changed on another device.'}, page: pageOut(cur)}); return; }
    const vals = [owner, pid, text(b.title, 200), JSON.stringify(blocks), JSON.stringify(ids(b.planetIds)), b.structureId ? id(b.structureId) : null, b.assetId ? id(b.assetId) : null, b.latestEntryId ? id(b.latestEntryId) : (cur?.latest_entry_id ?? null), typeof b.snapshotHash === 'string' ? b.snapshotHash.slice(0, 80) : (cur?.snapshot_hash ?? null), conf];
    const [r] = cur
      ? await q<PageRow>(`update pages set title=$3,blocks=$4,planet_ids=$5,structure_id=$6,asset_id=$7,latest_entry_id=$8,snapshot_hash=$9,confidence=$10,revision=revision+1,updated_at=now(),deleted_at=null where owner_id=$1 and id=$2 returning *`, vals)
      : await q<PageRow>(`insert into pages(owner_id,id,title,blocks,planet_ids,structure_id,asset_id,latest_entry_id,snapshot_hash,confidence) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`, vals);
    res.json(pageOut(r!));
  }));
  router.delete('/pages/:id', wrap(async (req, res, owner) => { await q(`update pages set deleted_at=now() where owner_id=$1 and id=$2`, [owner, id(req.params.id)]); res.json({ok: true}); }));

  // My structures (v9 4.5): only the shape, never the user's content.
  router.get('/structures', wrap(async (_req, res, owner) => {
    const rows = await q<{id: string; name: string; level: string; body: unknown; source: string; favorite: boolean; position: number; updated_at: Date | string}>(`select * from structures where owner_id=$1 order by position,updated_at desc`, [owner]);
    res.json({structures: rows.map(r => ({id: r.id, name: r.name, level: r.level, ...(parseJson(r.body) as object), source: r.source, favorite: r.favorite, position: r.position, updatedAt: iso(r.updated_at)}))});
  }));
  router.put('/structures/:id', wrap(async (req, res, owner) => {
    const b = req.body ?? {}, sid = id(req.params.id);
    const level = ['block', 'page', 'view'].includes(b.level) ? b.level : 'page';
    const name = text(b.name, 80)?.trim(); if (!name) throw new WorkspaceError(400, 'Name the structure.');
    const shape = {kind: text(b.kind, 32) ?? undefined, icon: text(b.icon, 32) ?? undefined, blocks: cleanBlocks(b.blocks ?? []).map(x => ({...x, by: 'user'})), moonPrompts: Array.isArray(b.moonPrompts) ? b.moonPrompts.filter((x: unknown) => typeof x === 'string').slice(0, 20) : [], view: b.view && typeof b.view === 'object' ? b.view : undefined};
    await q(`insert into structures(owner_id,id,name,level,body,source,favorite,position) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(owner_id,id) do update set name=$3,level=$4,body=$5,source=$6,favorite=$7,position=$8,updated_at=now()`,
      [owner, sid, name, level, JSON.stringify(shape), ['builtin', 'manual', 'photo', 'market'].includes(b.source) ? b.source : 'manual', b.favorite === true, Number.isFinite(b.position) ? Number(b.position) : 0]);
    res.json({ok: true});
  }));
  router.delete('/structures/:id', wrap(async (req, res, owner) => { await q(`delete from structures where owner_id=$1 and id=$2`, [owner, id(req.params.id)]); res.json({ok: true}); }));

  // Storage (v9 4.7): folders and files kept as they are.
  router.get('/folders', wrap(async (_req, res, owner) => {
    const folders = await q<{id: string; name: string; parent_id: string | null}>(`select id,name,parent_id from folders where owner_id=$1 order by name`, [owner]);
    const assets = await q<{id: string; folder_id: string | null; name: string; mime: string; size: string | number; url: string | null; storage_key: string | null; created_at: Date | string}>(`select * from assets where owner_id=$1 and deleted_at is null order by created_at desc`, [owner]);
    res.json({folders: folders.map(f => ({id: f.id, name: f.name, parentId: f.parent_id})), assets: assets.map(a => ({id: a.id, folderId: a.folder_id, name: a.name, mime: a.mime, size: Number(a.size), url: a.url ?? undefined, stored: !!a.storage_key, createdAt: iso(a.created_at)}))});
  }));
  router.put('/folders/:id', wrap(async (req, res, owner) => {
    const name = text(req.body?.name, 80)?.trim(); if (!name) throw new WorkspaceError(400, 'Name the folder.');
    await q(`insert into folders(owner_id,id,name,parent_id) values($1,$2,$3,$4) on conflict(owner_id,id) do update set name=$3,parent_id=$4`, [owner, id(req.params.id), name, req.body?.parentId ? id(req.body.parentId) : null]);
    res.json({ok: true});
  }));
  router.delete('/folders/:id', wrap(async (req, res, owner) => {
    const fid = id(req.params.id);
    const [f] = await q<{parent_id: string | null}>(`select parent_id from folders where owner_id=$1 and id=$2`, [owner, fid]);
    await q(`update folders set parent_id=$3 where owner_id=$1 and parent_id=$2`, [owner, fid, f?.parent_id ?? null]);
    await q(`update assets set folder_id=$3 where owner_id=$1 and folder_id=$2`, [owner, fid, f?.parent_id ?? null]);
    await q(`delete from folders where owner_id=$1 and id=$2`, [owner, fid]);
    res.json({ok: true});
  }));
  router.post('/assets', body({limit: '16kb'}), upload.single('file'), wrap(async (req, res, owner) => {
    if (limited(`asset:${owner}`, 30)) throw new WorkspaceError(429, 'Please wait before uploading more files.');
    const folderId = req.body?.folderId ? id(req.body.folderId) : null, aid = newId();
    if (req.file) {
      const key = await saveObject(owner, aid, req.file.buffer, req.file.mimetype || 'application/octet-stream');
      const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
      await q(`insert into assets(owner_id,id,folder_id,name,mime,size,storage_key) values($1,$2,$3,$4,$5,$6,$7)`, [owner, aid, folderId, name, req.file.mimetype || 'application/octet-stream', req.file.size, key]);
    } else {
      const url = text(req.body?.url, 2000) ?? '';
      try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { throw new WorkspaceError(400, 'Choose a file or a web link.'); }
      await q(`insert into assets(owner_id,id,folder_id,name,mime,size,url) values($1,$2,$3,$4,'text/uri-list',0,$5)`, [owner, aid, folderId, text(req.body?.name, 200) || url, url]);
    }
    res.json({id: aid});
  }));
  router.patch('/assets/:id', body({limit: '8kb'}), wrap(async (req, res, owner) => {
    const b = req.body ?? {};
    await q(`update assets set name=coalesce($3,name),folder_id=case when $4::boolean then $5 else folder_id end where owner_id=$1 and id=$2`, [owner, id(req.params.id), text(b.name, 200), 'folderId' in b, b.folderId ? id(b.folderId) : null]);
    res.json({ok: true});
  }));
  router.delete('/assets/:id', wrap(async (req, res, owner) => { await q(`update assets set deleted_at=now() where owner_id=$1 and id=$2`, [owner, id(req.params.id)]); res.json({ok: true}); }));
  router.get('/assets/:id/file', wrap(async (req, res, owner) => {
    const [a] = await q<{storage_key: string | null; mime: string; name: string; url: string | null}>(`select storage_key,mime,name,url from assets where owner_id=$1 and id=$2 and deleted_at is null`, [owner, id(req.params.id)]);
    if (!a) throw new WorkspaceError(404, 'File not found.');
    if (!a.storage_key) { res.redirect(302, a.url ?? '/'); return; }
    const data = await readObject(a.storage_key);
    res.set({'Content-Type': a.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`}).send(data);
  }));

  // v9 9.3: each Satellite opened inside MOONS keeps its own small store, reached only through postMessage in the browser.
  router.get('/sat-store/:sat', wrap(async (req, res, owner) => {
    const rows = await q<{key: string; value: unknown}>(`select key,value from satellite_store where owner_id=$1 and satellite_id=$2`, [owner, id(req.params.sat)]);
    res.json({items: Object.fromEntries(rows.map(r => [r.key, parseJson(r.value)]))});
  }));
  router.put('/sat-store/:sat/:key', wrap(async (req, res, owner) => {
    const key = String(req.params.key).slice(0, 120);
    const value = JSON.stringify(req.body?.value ?? null);
    if (value.length > 256 * 1024) throw new WorkspaceError(413, 'Too large for a Satellite store.');
    const [{n}] = await q<{n: number}>(`select count(*)::int n from satellite_store where owner_id=$1 and satellite_id=$2`, [owner, id(req.params.sat)]);
    if (n >= 500) throw new WorkspaceError(413, 'This Satellite store is full.');
    await q(`insert into satellite_store(owner_id,satellite_id,key,value) values($1,$2,$3,$4) on conflict(owner_id,satellite_id,key) do update set value=$4,updated_at=now()`, [owner, id(req.params.sat), key, value]);
    res.json({ok: true});
  }));
  // A Satellite opened inside MOONS sends records the same way as with its token (v8 3.1); notes still wait in the inbox.
  router.post('/sat-store/:sat/record', wrap(async (req, res, owner) => { res.status(202).json(await storeRecord(owner, id(req.params.sat), req.body)); }));
  router.delete('/sat-store/:sat/:key', wrap(async (req, res, owner) => { await q(`delete from satellite_store where owner_id=$1 and satellite_id=$2 and key=$3`, [owner, id(req.params.sat), String(req.params.key)]); res.json({ok: true}); }));
  return router;
}
