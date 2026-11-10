import {createContext, useCallback, useContext, useEffect, useState} from 'react';
import type {LibraryItem, LibraryKind} from '@workspace/planner-spec';

// 내 라이브러리 on the client: one list per account, shared by the menu drawer, the editor and the canvas.
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/life/v1${path}`, {credentials: 'include', ...init, headers: {'content-type': 'application/json', ...init?.headers}});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? '저장하지 못했어요. 다시 시도해 주세요.');
  return data as T;
}
export const libraryApi = {
  list: () => call<{items: LibraryItem[]}>('/library').then(r => r.items),
  save: (item: {id?: string; kind: LibraryKind; name?: string; data: unknown; enabled?: boolean}) => call<{item: LibraryItem}>('/library', {method: 'POST', body: JSON.stringify(item)}).then(r => r.item),
  patch: (id: string, patch: {enabled?: boolean; approve?: boolean; name?: string}) => call<{item: LibraryItem}>(`/library/${encodeURIComponent(id)}`, {method: 'PATCH', body: JSON.stringify(patch)}).then(r => r.item),
  remove: (id: string) => call<{deleted: string}>(`/library/${encodeURIComponent(id)}`, {method: 'DELETE'}),
  tokens: () => call<{tokens: {id: string; label: string; createdAt: string; lastUsedAt: string | null}[]}>('/dev/tokens').then(r => r.tokens),
  newToken: (label: string) => call<{token: string; label: string}>('/dev/tokens', {method: 'POST', body: JSON.stringify({label})}),
  revokeToken: (id: string) => call<{revoked: string}>(`/dev/tokens/${encodeURIComponent(id)}`, {method: 'DELETE'}),
};

export type Library = {items: LibraryItem[]; ready: boolean; error: string; reload: () => Promise<void>;
  save: typeof libraryApi.save; patch: typeof libraryApi.patch; remove: (id: string) => Promise<void>};
const Ctx = createContext<Library | null>(null);
export const LibraryProvider = Ctx.Provider;
/** Null in the builder mockup and anywhere outside a signed-in planner. */
export const useLibrary = () => useContext(Ctx);

export function useLibraryState(): Library {
  const [items, setItems] = useState<LibraryItem[]>([]), [ready, setReady] = useState(false), [error, setError] = useState('');
  const reload = useCallback(async () => { try { setItems(await libraryApi.list()); setError(''); } catch (e) { setError((e as Error).message); } finally { setReady(true); } }, []);
  useEffect(() => { void reload(); const back = () => { if (document.visibilityState === 'visible') void reload(); }; document.addEventListener('visibilitychange', back); return () => document.removeEventListener('visibilitychange', back); }, [reload]);
  const put = (it: LibraryItem) => setItems(list => [it, ...list.filter(x => x.id !== it.id)]);
  return {items, ready, error, reload,
    save: async item => { const it = await libraryApi.save(item); put(it); return it; },
    patch: async (id, p) => { const it = await libraryApi.patch(id, p); put(it); return it; },
    remove: async id => { await libraryApi.remove(id); setItems(list => list.filter(x => x.id !== id)); }};
}
