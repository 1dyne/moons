// v9 9.3: a Satellite opened inside MOONS saves through postMessage. MOONS answers only its own frame,
// only from the registered origin, and keeps the data in that Satellite's own store. No token reaches the page.
import {useEffect, type RefObject} from 'react';
import {v9Api} from './pages.ts';

export type BridgeRequest = {moons: 'v1'; id: string; op: 'get' | 'set' | 'delete' | 'list' | 'record'; key?: string; value?: unknown};
export const isBridgeRequest = (d: unknown): d is BridgeRequest => !!d && typeof d === 'object' && (d as BridgeRequest).moons === 'v1' && typeof (d as BridgeRequest).id === 'string' && ['get', 'set', 'delete', 'list', 'record'].includes((d as BridgeRequest).op);
export const originOf = (url: string) => { try { return new URL(url).origin; } catch { return null; } };

export async function handleBridge(sat: string, r: BridgeRequest): Promise<unknown> {
  const key = r.key ? encodeURIComponent(r.key.slice(0, 120)) : '';
  switch (r.op) {
    case 'list': return (await v9Api.call<{items: Record<string, unknown>}>(`/sat-store/${sat}`)).items;
    case 'get': return (await v9Api.call<{items: Record<string, unknown>}>(`/sat-store/${sat}`)).items[r.key ?? ''] ?? null;
    case 'set': if (!key) throw new Error('key required'); await v9Api.call(`/sat-store/${sat}/${key}`, {method: 'PUT', body: JSON.stringify({value: r.value ?? null})}); return true;
    case 'delete': if (!key) throw new Error('key required'); await v9Api.call(`/sat-store/${sat}/${key}`, {method: 'DELETE'}); return true;
    case 'record': return v9Api.call(`/sat-store/${sat}/record`, {method: 'POST', body: JSON.stringify(r.value ?? {})});
  }
}

export function useSatelliteBridge(sat: string, url: string | undefined, frame: RefObject<HTMLIFrameElement | null>) {
  useEffect(() => {
    const origin = url ? originOf(url) : null; if (!origin) return;
    const on = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow || !isBridgeRequest(e.data)) return;
      const req = e.data;
      handleBridge(sat, req).then(value => frame.current?.contentWindow?.postMessage({moons: 'v1', id: req.id, ok: true, value}, origin),
        err => frame.current?.contentWindow?.postMessage({moons: 'v1', id: req.id, ok: false, error: (err as Error).message}, origin));
    };
    window.addEventListener('message', on);
    // Tell the page it is inside MOONS so it can use the bridge instead of its own login.
    const hello = () => frame.current?.contentWindow?.postMessage({moons: 'v1', hello: true, satellite: sat}, origin);
    frame.current?.addEventListener('load', hello);
    const f = frame.current;
    return () => { window.removeEventListener('message', on); f?.removeEventListener('load', hello); };
  }, [sat, url]);
}
