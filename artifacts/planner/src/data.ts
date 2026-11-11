import {useCallback, useRef, useState} from 'react';
import {parseBody, ulid, type AnyRecord, type Availability, type Kind, type LifeRecord, type Settings} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import {enqueue, flush, isNetworkError, pending, queued} from './offline.ts';

export type Write = {kind: Kind; logicalDay?: string | null; body: unknown; privateFields?: string[]; baseRevision?: number; id?: string; ext?: Record<string, unknown>};
/** Where records go. The real planner writes to the life hub; the mockup writes to memory. */
export type Backend = {write: (id: string | null, w: Write) => Promise<AnyRecord>; remove: (id: string) => Promise<AnyRecord>};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/life/v1${path}`, {credentials: 'include', ...init, headers: {'content-type': 'application/json', ...init?.headers}});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? '저장하지 못했어요. 다시 시도해 주세요.'), {status: res.status});
  return data as T;
}
export const api = {
  settings: () => call<{settings: Settings & {configured: boolean; availability: Availability | null}}>('/settings').then(r => r.settings),
  putAvailability: (availability: Availability | null) => call<{availability: Availability | null}>('/availability', {method: 'PUT', body: JSON.stringify({availability})}).then(r => r.availability),
  putSettings: (s: Settings) => call<{settings: Settings}>('/settings', {method: 'PUT', body: JSON.stringify(s)}).then(r => r.settings),
  spec: () => call<{planner: {version: number; spec: PlannerSpec} | null}>('/spec').then(r => r.planner),
  putSpec: (spec: PlannerSpec) => call<{planner: {version: number; spec: PlannerSpec}}>('/spec', {method: 'PUT', body: JSON.stringify({spec})}).then(r => r.planner),
  planGoal: (input: Parameters<typeof planGoalApi>[0]) => planGoalApi(input),
  /** Records as the user last saw them: the hub's copy (or the offline cache) with waiting writes applied on top. */
  async recordsWithQueue() {
    let list = await api.records();
    for (const op of pending()) {
      const id = op.path.split('/')[2];
      if (op.method === 'DELETE') list = list.filter(r => r.id !== id);
      else {
        const w = op.body as Write & {id?: string}, rid = id ?? w.id!;
        try { list = [...list.filter(r => r.id !== rid), optimistic(rid, w)]; } catch { /* a malformed queued write is skipped */ }
      }
    }
    return list;
  },
  async records() {
    const all: AnyRecord[] = [];
    for (let cursor: string | null = null, first = true; first || cursor; first = false) {
      const page: {items: AnyRecord[]; nextCursor: string | null} = await call(`/items?limit=1000${cursor ? `&cursor=${cursor}` : ''}`);
      all.push(...page.items); cursor = page.nextCursor;
    }
    return all;
  },
};
export type MilestoneDraft = {title: string; due: string; measure: {amount: number; unit: string} | null; weight: number; effortHours: number | null; why: string; firstTask: string};
export type GoalPlanResult =
  | {status: 'ask'; questions: {id: string; text: string; choices: string[]}[]}
  | {status: 'ready'; refined: {title: string; success: string; deadline: string | null}; milestones: MilestoneDraft[]; assumptions: string[]};
/** The one AI call in the planner: asks until the goal is concrete, then drafts milestones with effort. */
const planGoalApi = (input: {goal: string; deadline: string; context: string; today: string; round: number; weeklyHours?: number; answers: {q: string; a: string}[]}) =>
  call<GoalPlanResult>('/ai/goal', {method: 'POST', body: JSON.stringify(input)});
const send = (op: {method: string; path: string; body?: unknown}) => fetch(`/api/life/v1${op.path}`, {method: op.method, credentials: 'include', headers: {'content-type': 'application/json'}, body: op.body === undefined ? undefined : JSON.stringify(op.body)});
/** Push waiting offline writes; returns how many went up. */
export const flushQueue = () => flush(send);
const optimistic = (id: string, w: Write, at = new Date().toISOString()) => ({id, kind: w.kind, revision: 0, createdAt: at, updatedAt: at, deletedAt: null, logicalDay: w.logicalDay ?? null,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', source: {type: 'planner', confirmed: true}, ...(w.privateFields ? {privateFields: w.privateFields} : {}), ...(w.ext ? {ext: w.ext} : {}), body: parseBody(w.kind, w.body)}) as AnyRecord;
/** The hub, with an offline fallback: when the network is gone (or writes are already waiting), the write is queued
 *  and an optimistic record is returned so the day keeps working. */
export const httpBackend: Backend = {
  async write(id, w) {
    const queue = () => {
      const rid = id ?? w.id ?? ulid(), {baseRevision: _drop, ...rest} = w;
      enqueue(id ? {method: 'PUT', path: `/items/${id}`, body: rest} : {method: 'POST', path: '/items', body: {...rest, id: rid}});
      return optimistic(rid, w);
    };
    if (queued() > 0) { const r = queue(); void flushQueue(); return r; }
    try {
      return await call<{item: AnyRecord}>(id ? `/items/${id}` : '/items', {method: id ? 'PUT' : 'POST', body: JSON.stringify(w)}).then(r => r.item);
    } catch (e) {
      if (isNetworkError(e)) return queue();
      // The record moved on elsewhere (Claude, another device, the timer): this is the user's own planner, so what they
      // just did wins. Write again on top of the latest instead of showing an error.
      if ((e as {status?: number}).status === 409 && id && w.baseRevision !== undefined && !/deleted/i.test((e as Error).message)) {
        const {baseRevision: _stale, ...latest} = w;
        return call<{item: AnyRecord}>(`/items/${id}`, {method: 'PUT', body: JSON.stringify(latest)}).then(r => r.item);
      }
      throw e;
    }
  },
  async remove(id) {
    const gone = {id, deletedAt: new Date().toISOString()} as AnyRecord;
    if (queued() > 0) { enqueue({method: 'DELETE', path: `/items/${id}`}); void flushQueue(); return gone; }
    try { return await call<{item: AnyRecord}>(`/items/${id}`, {method: 'DELETE'}).then(r => r.item); }
    catch (e) { if (isNetworkError(e)) { enqueue({method: 'DELETE', path: `/items/${id}`}); return gone; } throw e; }
  },
};
/** The mockup's store: same validation as the hub, nothing leaves the page. */
export function memoryBackend(tz: string): Backend {
  let revision = 1000;
  const known = new Map<string, AnyRecord>();
  return {
    async write(id, w) {
      const at = new Date().toISOString(), prior = id ? known.get(id) : undefined;
      const r = {id: id ?? ulid(), kind: w.kind, revision: ++revision, createdAt: prior?.createdAt ?? at, updatedAt: at, deletedAt: null, logicalDay: w.logicalDay ?? null, tz,
        source: {type: 'planner', confirmed: true}, ...(w.privateFields ? {privateFields: w.privateFields} : {}), ...(w.ext ?? prior?.ext ? {ext: w.ext ?? prior?.ext} : {}), body: parseBody(w.kind, w.body)} as AnyRecord;
      known.set(r.id, r); return r;
    },
    async remove(id) { const r = {...known.get(id)!, deletedAt: new Date().toISOString(), revision: ++revision} as AnyRecord; known.set(id, r); return r; },
  };
}

export function usePlanner(backend: Backend, initial: AnyRecord[]) {
  const [records, setRecords] = useState(initial);
  const [error, setError] = useState('');
  const put = (r: AnyRecord) => setRecords(list => r.deletedAt ? list.filter(x => x.id !== r.id) : [...list.filter(x => x.id !== r.id), r]);
  // The screen changes the moment the user taps; the server's copy replaces it when it answers (or the change is
  // undone with a message if it fails). New records get their id here, so the optimistic one and the saved one match.
  // Writes to one record go out one after another (a check right after creating waits for the create), each on the
  // latest saved revision, and only the newest answer is shown.
  const chains = useRef(new Map<string, Promise<AnyRecord | null>>()), seq = useRef(new Map<string, number>());
  const write = useCallback(async (id: string | null, w: Write) => {
    setError('');
    const live = backend === httpBackend, rid = id ?? w.id ?? ulid(), n = (seq.current.get(rid) ?? 0) + 1;
    seq.current.set(rid, n);
    let before: AnyRecord | undefined;
    if (live) setRecords(list => {
      before = list.find(x => x.id === rid);
      try { const o = {...optimistic(rid, w), ...(before ? {createdAt: before.createdAt, revision: before.revision, source: before.source, privateFields: w.privateFields ?? before.privateFields, ...(w.ext ?? before.ext ? {ext: w.ext ?? before.ext} : {})} : {})} as AnyRecord; return [...list.filter(x => x.id !== rid), o]; }
      catch { return list; }
    });
    const run = (chains.current.get(rid) ?? Promise.resolve(null)).then(last => {
      let sent: Write = id ? w : {...w, id: rid};
      if (last && sent.baseRevision !== undefined && last.revision > sent.baseRevision) sent = {...sent, baseRevision: last.revision};
      // A record created just before (in this chain) now exists on the server: update it by id.
      return backend.write(id ?? (last ? rid : null), sent);
    });
    chains.current.set(rid, run.catch(() => null));
    try { const r = await run; if (seq.current.get(rid) === n) put(r); return r; }
    catch (e) {
      setError((e as Error).message);
      if (live && seq.current.get(rid) === n) setRecords(list => before ? [...list.filter(x => x.id !== rid), before] : list.filter(x => x.id !== rid));
      return null;
    }
  }, [backend]);
  const remove = useCallback(async (id: string) => {
    setError('');
    let before: AnyRecord | undefined;
    if (backend === httpBackend) setRecords(list => { before = list.find(x => x.id === id); return list.filter(x => x.id !== id); });
    try { put(await backend.remove(id)); } catch (e) { setError((e as Error).message); if (before) { const b = before; setRecords(list => [...list, b]); } }
  }, [backend]);
  // Rows the server adds by itself (log tables) after a session or goal write: pull them in (real planner only).
  const refresh = useCallback(async () => { if (backend === httpBackend) { try { setRecords(await api.recordsWithQueue()); } catch { /* offline: next sync */ } } }, [backend]);
  return {records, write, remove, error, setRecords, refresh};
}
export type Planner = ReturnType<typeof usePlanner>;
export const ofKind = <K extends Kind>(records: AnyRecord[], kind: K) => records.filter(r => r.kind === kind && !r.deletedAt) as unknown as LifeRecord<K>[];
