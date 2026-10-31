import {useCallback, useState} from 'react';
import {parseBody, ulid, type AnyRecord, type Kind, type LifeRecord, type Settings} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';

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
  settings: () => call<{settings: Settings & {configured: boolean}}>('/settings').then(r => r.settings),
  putSettings: (s: Settings) => call<{settings: Settings}>('/settings', {method: 'PUT', body: JSON.stringify(s)}).then(r => r.settings),
  spec: () => call<{planner: {version: number; spec: PlannerSpec} | null}>('/spec').then(r => r.planner),
  putSpec: (spec: PlannerSpec) => call<{planner: {version: number; spec: PlannerSpec}}>('/spec', {method: 'PUT', body: JSON.stringify({spec})}).then(r => r.planner),
  async records() {
    const all: AnyRecord[] = [];
    for (let cursor: string | null = null, first = true; first || cursor; first = false) {
      const page: {items: AnyRecord[]; nextCursor: string | null} = await call(`/items?limit=1000${cursor ? `&cursor=${cursor}` : ''}`);
      all.push(...page.items); cursor = page.nextCursor;
    }
    return all;
  },
};
export const httpBackend: Backend = {
  write: (id, w) => call<{item: AnyRecord}>(id ? `/items/${id}` : '/items', {method: id ? 'PUT' : 'POST', body: JSON.stringify(w)}).then(r => r.item),
  remove: id => call<{item: AnyRecord}>(`/items/${id}`, {method: 'DELETE'}).then(r => r.item),
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
