// Client caches for the v9 server collections (pages, structures). One fetch per session, local updates after saves.
import {useEffect, useSyncExternalStore} from 'react';
import {pagesApi, v9Api, type Page} from './pages.ts';
import type {Structure} from './tools.ts';

type State = {pages: Page[]; structures: Structure[]; loaded: boolean; error?: string};
let state: State = {pages: [], structures: [], loaded: false};
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => { state = {...state, ...patch}; subs.forEach(f => f()); };
let loading: Promise<void> | null = null;

export function loadV9(force = false) {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const [pages, structures] = await Promise.all([pagesApi.list(), v9Api.call<{structures: Structure[]}>('/structures').then(r => r.structures)]);
      set({pages, structures, loaded: true, error: undefined});
    } catch (e) { set({loaded: true, error: (e as Error).message}); loading = null; }
  })();
  return loading;
}
export function usePages() {
  const s = useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
  useEffect(() => { void loadV9(); }, []);
  return s;
}
export const getV9 = () => state;
export function upsertPage(p: Page) { const rest = state.pages.filter(x => x.id !== p.id); set({pages: [p, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}); }
export function dropPage(id: string) { set({pages: state.pages.filter(p => p.id !== id)}); }
export async function saveStructure(s: Structure) {
  await v9Api.call(`/structures/${s.id}`, {method: 'PUT', body: JSON.stringify(s)});
  set({structures: [s, ...state.structures.filter(x => x.id !== s.id)].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))});
}
export async function removeStructure(id: string) { await v9Api.call(`/structures/${id}`, {method: 'DELETE'}); set({structures: state.structures.filter(s => s.id !== id)}); }
