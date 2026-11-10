import {useCallback, useState} from 'react';
import {parseBody, ulid, type AnyRecord, type Availability, type Kind, type LifeRecord, type Settings} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import {enqueue, flush, isNetworkError, pending, queued} from './offline.ts';

export type Write = {kind: Kind; logicalDay?: string | null; body: unknown; privateFields?: string[]; baseRevision?: number};
/** Where records go. The real planner writes to the life hub; the mockup writes to memory. */
export type Backend = {write: (id: string | null, w: Write) => Promise<AnyRecord>; remove: (id: string) => Promise<AnyRecord>};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/life/v1${path}`, {credentials: 'include', ...init, headers: {'content-type': 'application/json', ...init?.headers}});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? '저장하지 못했어요. 다시 시도해 주세요.');
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
const optimistic = (id: string, w: Write) => ({id, kind: w.kind, revision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null, logicalDay: w.logicalDay ?? null,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', source: {type: 'planner', confirmed: true}, ...(w.privateFields ? {privateFields: w.privateFields} : {}), body: parseBody(w.kind, w.body)}) as AnyRecord;
/** The hub, with an offline fallback: when the network is gone (or writes are already waiting), the write is queued
 *  and an optimistic record is returned so the day keeps working. */
export const httpBackend: Backend = {
  async write(id, w) {
    const queue = () => {
      const rid = id ?? ulid(), {baseRevision: _drop, ...rest} = w;
      enqueue(id ? {method: 'PUT', path: `/items/${id}`, body: rest} : {method: 'POST', path: '/items', body: {...rest, id: rid}});
      return optimistic(rid, w);
    };
    if (queued() > 0) { const r = queue(); void flushQueue(); return r; }
    try {
      return await call<{item: AnyRecord}>(id ? `/items/${id}` : '/items', {method: id ? 'PUT' : 'POST', body: JSON.stringify(w)}).then(r => r.item);
    } catch (e) { if (isNetworkError(e)) return queue(); throw e; }
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
        source: {type: 'planner', confirmed: true}, ...(w.privateFields ? {privateFields: w.privateFields} : {}), body: parseBody(w.kind, w.body)} as AnyRecord;
      known.set(r.id, r); return r;
    },
    async remove(id) { const r = {...known.get(id)!, deletedAt: new Date().toISOString(), revision: ++revision} as AnyRecord; known.set(id, r); return r; },
  };
}

export function usePlanner(backend: Backend, initial: AnyRecord[]) {
  const [records, setRecords] = useState(initial);
  const [error, setError] = useState('');
  const put = (r: AnyRecord) => setRecords(list => r.deletedAt ? list.filter(x => x.id !== r.id) : [...list.filter(x => x.id !== r.id), r]);
  const write = useCallback(async (id: string | null, w: Write) => {
    try { setError(''); const r = await backend.write(id, w); put(r); return r; } catch (e) { setError((e as Error).message); return null; }
  }, [backend]);
  const remove = useCallback(async (id: string) => {
    try { setError(''); put(await backend.remove(id)); } catch (e) { setError((e as Error).message); }
  }, [backend]);
  return {records, write, remove, error, setRecords};
}
export type Planner = ReturnType<typeof usePlanner>;
export const ofKind = <K extends Kind>(records: AnyRecord[], kind: K) => records.filter(r => r.kind === kind && !r.deletedAt) as unknown as LifeRecord<K>[];
