import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {logicalDay, ulid, v2, type AnyRecord} from '@workspace/life-contract';
import {buildWorkspace, onOpen, type Ctx, type Effect, type Item, type Workspace} from '@workspace/lit-core';

// The whole workspace lives in the page: every record is loaded once, the shared engine (lit-core) computes
// views, formulas and signals here exactly as the server does. Writes show at once and go to the server, which runs
// the rules; whatever the rules wrote comes back through /changes.

const V2 = 'property,database,item,lens,signal,rule,screen';
async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {credentials: 'include', ...init, headers: {'content-type': 'application/json', ...(init?.headers ?? {})}});
  const out = await res.json().catch(() => null) as {error?: {message?: string}} | null;
  if (!res.ok) throw new Error(out?.error?.message ?? `요청이 실패했어요 (${res.status})`);
  return out as T;
}
export const api = {
  async all() {
    const out: AnyRecord[] = []; let cursor = '';
    do {
      const page = await j<{items: AnyRecord[]; nextCursor: string | null}>(`/api/life/v1/items?kinds=${V2}&limit=1000${cursor ? `&cursor=${cursor}` : ''}`);
      out.push(...page.items); cursor = page.nextCursor ?? '';
    } while (cursor);
    return out;
  },
  changes: (since: number) => j<{items: AnyRecord[]; nextSince: number; hasMore: boolean}>(`/api/life/v1/changes?since=${since}&limit=1000`),
  settings: () => j<{settings: {tz: string; dayBoundary: string; configured: boolean}}>('/api/life/v1/settings'),
  putSettings: (s: {tz: string; dayBoundary: string}) => j('/api/life/v1/settings', {method: 'PUT', body: JSON.stringify(s)}),
  save: (id: string | null, kind: string, body: unknown, clientId?: string) => j<{record: AnyRecord; effects: Effect[]; ran: string[]}>(id ? `/api/life/v2/records/${id}` : '/api/life/v2/records', {method: id ? 'PUT' : 'POST', body: JSON.stringify({kind, body, id: clientId})}),
  remove: (id: string) => j<{record: AnyRecord}>(`/api/life/v2/records/${id}`, {method: 'DELETE'}),
  screen: () => j<{screen: AnyRecord}>('/api/life/v2/screen'),
  putScreen: (body: v2.ScreenBody) => j<{screen: AnyRecord}>('/api/life/v2/screen', {method: 'PUT', body: JSON.stringify({body})}),
  moment: (m: {kind: 'dayStart'} | {kind: 'time'; at: string}) => j<{effects: Effect[]; ran: string[]}>('/api/life/v2/moments', {method: 'POST', body: JSON.stringify(m)}),
  preview: (rule: string) => j<{plans: import('@workspace/lit-core').Plan[]}>(`/api/life/v2/rules/${rule}/preview`),
  suggestions: () => j<{plans: import('@workspace/lit-core').Plan[]}>('/api/life/v2/suggestions'),
  accept: (rule: string, item: string) => j<{effects: Effect[]}>('/api/life/v2/suggestions/accept', {method: 'POST', body: JSON.stringify({rule, item})}),
  merge: (from: string, into: string) => j<{changed: number}>('/api/life/v2/properties/merge', {method: 'POST', body: JSON.stringify({from, into})}),
  install: (template: unknown) => j<{created: number; pages: string[]}>('/api/life/v2/templates/install', {method: 'POST', body: JSON.stringify({template})}),
  history: (id: string) => j<{items: AnyRecord[]}>(`/api/life/v2/records/${id}/history`),
};

export type Toast = {id: number; text: string; tone?: 'error'};
export type FormAsk = Extract<Effect, {kind: 'openForm'}>;
type Lit = {
  ws: Workspace; ctx: Ctx; today: string; screen: v2.ScreenBody; settings: {tz: string; dayBoundary: string};
  save: (kind: v2.V2Kind, body: unknown, id?: string) => Promise<AnyRecord | null>;
  setValues: (item: Item, values: Record<string, v2.CellValue>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  saveScreen: (next: v2.ScreenBody) => Promise<void>;
  reload: () => Promise<void>; pull: () => Promise<void>;
  toasts: Toast[]; toast: (text: string, tone?: 'error') => void;
  flash: Record<string, string>; form: FormAsk | null; closeForm: () => void;
  page: string; setPage: (id: string, carried?: string | null) => void; carried: string | null;
  open: (item: Item) => Effect[]; runEffects: (e: Effect[]) => void;
  editing: boolean; setEditing: (b: boolean) => void;
};
const LitCtx = createContext<Lit | null>(null);
export const useLit = () => useContext(LitCtx)!;

export function LitProvider({children, fallback}: {children: ReactNode; fallback: (error: string, retry: () => void) => ReactNode}) {
  const [records, setRecords] = useState<Map<string, AnyRecord> | null>(null), [error, setError] = useState('');
  const [settings, setSettings] = useState({tz: 'UTC', dayBoundary: '04:00'});
  const rev = useRef(0), [now, setNow] = useState(() => new Date());
  const [toasts, setToasts] = useState<Toast[]>([]), [flash, setFlash] = useState<Record<string, string>>({}), [form, setForm] = useState<FormAsk | null>(null);
  const [page, setPageId] = useState(() => { try { return localStorage.getItem('lit2.page') ?? ''; } catch { return ''; } });
  const [carried, setCarried] = useState<string | null>(null), [editing, setEditing] = useState(false);

  const merge = useCallback((list: AnyRecord[]) => setRecords(cur => {
    const m = new Map(cur ?? []);
    for (const r of list) { m.set(r.id, r); rev.current = Math.max(rev.current, r.revision); }
    return m;
  }), []);
  const reload = useCallback(async () => {
    try {
      const s = (await api.settings()).settings;
      if (!s.configured) await api.putSettings({tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', dayBoundary: '04:00'});
      setSettings(s.configured ? s : {tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', dayBoundary: '04:00'});
      await api.screen(); // makes the first screen when there is none
      const all = await api.all();
      rev.current = 0; setRecords(null); merge(all); setError('');
    } catch (e) { setError((e as Error).message); }
  }, [merge]);
  const pull = useCallback(async () => {
    try { for (let i = 0; i < 5; i++) { const c = await api.changes(rev.current); merge(c.items); if (!c.hasMore) break; } } catch { /* offline: try next time */ }
  }, [merge]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const vis = () => { if (document.visibilityState === 'visible') { setNow(new Date()); void pull(); } };
    document.addEventListener('visibilitychange', vis);
    const sync = setInterval(() => void pull(), 60_000);
    return () => { clearInterval(tick); clearInterval(sync); document.removeEventListener('visibilitychange', vis); };
  }, [pull]);

  const toast = useCallback((text: string, tone?: 'error') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, {id, text, tone}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  const setPage = useCallback((id: string, c: string | null = null) => { setPageId(id); setCarried(c); try { localStorage.setItem('lit2.page', id); } catch { /* */ } }, []);
  const runEffects = useCallback((effects: Effect[]) => {
    for (const e of effects) {
      if (e.kind === 'notify') toast(e.text);
      else if (e.kind === 'effect' && e.item) { const k = e.item, n = e.name; setFlash(f => ({...f, [k]: n})); setTimeout(() => setFlash(f => { const x = {...f}; delete x[k]; return x; }), 1600); }
      else if (e.kind === 'effect') { setFlash(f => ({...f, __screen: e.name})); setTimeout(() => setFlash(f => { const x = {...f}; delete x.__screen; return x; }), 1800); }
      else if (e.kind === 'openForm') setForm(e);
      else if (e.kind === 'goTo') setPage(e.page, e.item);
    }
  }, [toast, setPage]);

  const ws = useMemo(() => buildWorkspace([...(records?.values() ?? [])]), [records]);
  const today = logicalDay(now, settings);
  const ctx = useMemo<Ctx>(() => ({today, now, carried}), [today, now, carried]);
  // A new planner day: day-start rules (once per device per day; the server keeps them idempotent anyway).
  useEffect(() => {
    if (!records) return;
    let last = ''; try { last = localStorage.getItem('lit2.dayStart') ?? ''; } catch { /* */ }
    if (last === today) return;
    try { localStorage.setItem('lit2.dayStart', today); } catch { /* */ }
    void api.moment({kind: 'dayStart'}).then(r => { runEffects(r.effects); if (r.ran.length) void pull(); }).catch(() => {});
  }, [today, !!records]); // eslint-disable-line react-hooks/exhaustive-deps
  // Clock-time rules, while the page is open.
  useEffect(() => {
    if (!records) return;
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if ([...ws.rules.values()].some(r => r.body.enabled && r.body.on.kind === 'time' && r.body.on.at === hm)) {
      let done = ''; try { done = sessionStorage.getItem('lit2.time') ?? ''; } catch { /* */ }
      if (done === `${today} ${hm}`) return;
      try { sessionStorage.setItem('lit2.time', `${today} ${hm}`); } catch { /* */ }
      void api.moment({kind: 'time', at: hm}).then(r => { runEffects(r.effects); if (r.ran.length) void pull(); }).catch(() => {});
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (kind: v2.V2Kind, body: unknown, id?: string) => {
    const prior = id ? records?.get(id) : undefined, clientId = id ?? ulid(), at = new Date().toISOString();
    const parsed = v2.V2_BODIES[kind].safeParse(body);
    if (!parsed.success) { toast(parsed.error.issues[0]?.message ?? '저장할 수 없어요', 'error'); return null; }
    const optimistic = {...(prior ?? {id: clientId, kind, revision: 0, createdAt: at, deletedAt: null, logicalDay: kind === 'item' ? today : null, tz: settings.tz, source: {type: 'planner', confirmed: true}}), updatedAt: at, body: parsed.data} as AnyRecord;
    setRecords(cur => new Map(cur ?? []).set(clientId, optimistic));
    try {
      const out = await api.save(id ?? null, kind, parsed.data, id ? undefined : clientId);
      merge([out.record]); runEffects(out.effects);
      if (out.ran.length) await pull();
      return out.record;
    } catch (e) {
      setRecords(cur => { const m = new Map(cur ?? []); if (prior) m.set(prior.id, prior); else m.delete(clientId); return m; });
      toast((e as Error).message, 'error'); return null;
    }
  }, [records, today, settings.tz, merge, runEffects, pull, toast]);
  const setValues = useCallback(async (item: Item, values: Record<string, v2.CellValue>) => {
    const next = {...item.body.values};
    for (const [k, v] of Object.entries(values)) { if (v === null || v === '' || (Array.isArray(v) && !v.length)) delete next[k]; else next[k] = v; }
    await save('item', {...item.body, values: next}, item.id);
  }, [save]);
  const remove = useCallback(async (id: string) => {
    const prior = records?.get(id);
    if (prior) setRecords(cur => new Map(cur ?? []).set(id, {...prior, deletedAt: new Date().toISOString()} as AnyRecord));
    try { merge([(await api.remove(id)).record]); } catch (e) { if (prior) setRecords(cur => new Map(cur ?? []).set(id, prior)); toast((e as Error).message, 'error'); }
  }, [records, merge, toast]);
  const screen = (ws.screen?.body ?? v2.ScreenBody.parse({})) as v2.ScreenBody;
  // Layout edits come in quick bursts (typing a title, nudging a width): shown at once, sent once things settle.
  const screenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveScreen = useCallback(async (next: v2.ScreenBody) => {
    const cur = ws.screen; if (!cur) return;
    setRecords(m => new Map(m ?? []).set(cur.id, {...cur, body: next, updatedAt: new Date().toISOString()} as AnyRecord));
    if (screenTimer.current) clearTimeout(screenTimer.current);
    screenTimer.current = setTimeout(() => { void api.putScreen(next).then(r => merge([r.screen])).catch(e => toast((e as Error).message, 'error')); }, 700);
  }, [ws.screen, merge, toast]);
  const open = useCallback((item: Item) => onOpen(ws, item, ctx), [ws, ctx]);

  if (!records) return <>{fallback(error, () => void reload())}</>;
  const pageId = screen.pages.some(p => p.id === page) ? page : screen.pages[0]?.id ?? '';
  return <LitCtx.Provider value={{ws, ctx, today, screen, settings, save, setValues, remove, saveScreen, reload, pull, toasts, toast, flash, form, closeForm: () => setForm(null), page: pageId, setPage, carried, open, runEffects, editing, setEditing}}>{children}</LitCtx.Provider>;
}
export const newLocalId = () => Math.random().toString(36).slice(2, 10);
