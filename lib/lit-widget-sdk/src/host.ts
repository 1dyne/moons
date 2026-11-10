import {METHODS, isRequest, isResize, type Method, type Push, type WidgetPermission} from './protocol.ts';

// The host side of the widget API, shared by lit and the developer harness (lit-widget dev).
// Answers only the frame it was attached to, and only for methods the approved permissions allow.
export type Handlers = {[M in Method]?: (params: Record<string, unknown>) => Promise<unknown> | unknown};

export function attachHost(frame: HTMLIFrameElement, opts: {permissions: WidgetPermission[]; handlers: Handlers; onResize?: (height: number) => void}) {
  const allowed = new Set(opts.permissions);
  const listener = async (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const m = e.data;
    if (isResize(m)) { opts.onResize?.(Math.max(0, Math.min(m.resize, 4000))); return; }
    if (!isRequest(m)) return;
    const reply = (body: {result?: unknown; error?: string}) => frame.contentWindow?.postMessage({lit: 1, id: m.id, ...body}, '*');
    if (!(m.method in METHODS)) { reply({error: `알 수 없는 기능: ${m.method}`}); return; }
    const need = METHODS[m.method];
    if (need && !allowed.has(need)) { reply({error: `권한이 없어요: ${need}. 위젯 설명서의 permissions에 넣고 lit에서 다시 승인받아요.`}); return; }
    const h = opts.handlers[m.method];
    if (!h) { reply({error: `지원하지 않는 기능: ${m.method}`}); return; }
    try { reply({result: await h(m.params && typeof m.params === 'object' ? m.params : {})}); }
    catch (err) { reply({error: (err as Error).message || '실패했어요.'}); }
  };
  window.addEventListener('message', listener);
  return {
    push: (event: Push['event'], data?: unknown) => frame.contentWindow?.postMessage({lit: 1, event, data} satisfies Push, '*'),
    dispose: () => window.removeEventListener('message', listener),
  };
}
