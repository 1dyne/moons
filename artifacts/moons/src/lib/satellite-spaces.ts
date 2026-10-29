// v8 Satellites on the client: the spaces the user added (kept in the store), and the server parts
// (records, intake tokens, the inbox, connected AIs) reached over the API.
import type {Store} from './model.ts';

export type Space = {id: string; name: string; icon: string; description: string; kind: 'builtin' | 'external'; url?: string; embed: 'auto' | 'tab';
  madeBy: {type: 'user' | 'ai' | 'moons'; name?: string}; planetIds: string[]; show: boolean;
  agent: {mode: 'off' | 'manual' | 'on_open'; lastRunAt?: string}; createdAt: string; updatedAt: string};
export type RecordItem = {label: string; result?: string; answer?: string; note?: string};
export type SpaceRecord = {id: string; at: string; kind: string; title: string; summary: string; items: RecordItem[]; userText: string[]; concepts: string[]; link?: string;
  feedback?: {text: string; at: string; by: string}[]; drafted: boolean; receivedAt: string};
export type RecordDraft = {title: string; userText: string[]; activity: string[]; moons?: {summary: string; patterns: string[]}; concepts: string[]; missed: string[]; recordIds: string[]; satelliteId: string};
export type InboxItem = {id: string; source: {type: 'satellite' | 'claude'; id?: string; name?: string}; kind: string; data: Record<string, unknown>; status: 'open' | 'applied' | 'dismissed'; createdAt: string; entryId?: string; batch?: {id: string; title: string}};
export type RevisionDraft = {text: string; corrections: {sentence?: number; from: string; to: string; reason?: string}[]; orig: string[]; rev: string[]; rows: {orig?: number; rev?: number; reasons: string[]}[]};
/** Whether "approve all" in a batch also takes notes with a corrected version (off by default: those are checked one by one). */
export const batchTakesRevisions = (s: Store) => (s.settings as {batchTakesRevisions?: boolean} | undefined)?.batchTakesRevisions === true;
export const hasRevision = (it: InboxItem) => it.kind === 'note' && !!(it.data.revision as RevisionDraft | undefined)?.rows?.length;

/** What approving a concept proposal would change in the concept the user already has (none → a new concept). */
export function conceptUpdate(s: Store, d: Record<string, unknown>) {
  const key = (x: string) => x.normalize('NFC').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/[\s\-_.·,'"`]/g, '');
  const names = [d.name, d.headword].filter((x): x is string => typeof x === 'string' && !!x.trim()).map(key);
  const c = (s.concepts ?? []).find(x => [x.name, ...x.aliases, x.term?.headword ?? ''].some(n => n && names.includes(key(n))));
  if (!c) return null;
  const changes: {field: string; from?: string; to: string}[] = [];
  for (const f of ['pos', 'meaningKo', 'pitfall', 'headword'] as const) { const v = typeof d[f] === 'string' ? (d[f] as string).trim() : ''; if (v && v !== c.term?.[f]) changes.push({field: f, from: c.term?.[f], to: v}); }
  for (const f of ['forms', 'collocations'] as const) { const have = c.term?.[f] ?? [], add = (Array.isArray(d[f]) ? d[f] as string[] : []).filter(x => !have.some(h => key(h) === key(x))); if (add.length) changes.push({field: f, to: add.join(', ')}); }
  const def = typeof d.definition === 'string' ? d.definition.trim() : '';
  if (def && !c.definition.some(x => x.text === def)) changes.push({field: 'definition', to: def});
  for (const r of (Array.isArray(d.relations) ? d.relations : []) as {to: string; rel: string}[]) if (!c.relations.some(x => key(x.toName) === key(r.to) && x.rel === r.rel)) changes.push({field: r.rel, to: r.to});
  if (typeof d.autoLink === 'boolean' && d.autoLink !== (c.autoLink !== false)) changes.push({field: 'autoLink', to: String(d.autoLink)});
  return {concept: c, changes};
}
export type AgentSettings = {minHours: number; maxRecords: number};

export const spacesOf = (s: Store) => s.satellites ?? [];
export const agentSettings = (s: Store): AgentSettings => ({minHours: 6, maxRecords: 50, ...(s.settings as {satelliteAgent?: Partial<AgentSettings>} | undefined)?.satelliteAgent});
/** Whether My Space shows Satellites at all (one switch, besides each Satellite's own). */
export const spacesShown = (s: Store) => (s.settings as {showSatellites?: boolean} | undefined)?.showSatellites !== false;

export function newSpace(name: string, url: string, extra: Partial<Space> = {}): Space {
  const at = new Date().toISOString();
  return {id: crypto.randomUUID(), name: name.trim().slice(0, 60), icon: 'Orbit', description: '', kind: 'external', url, embed: 'auto', madeBy: {type: 'user'}, planetIds: [], show: true, agent: {mode: 'off'}, createdAt: at, updatedAt: at, ...extra};
}
export const validUrl = (u: string) => /^https:\/\/[^\s]+$/.test(u.trim());
/** Topics a Satellite's approved notes landed in, most used first — offered, never set by itself. */
export function suggestedPlanets(s: Store, id: string) {
  const count = new Map<string, number>();
  for (const e of s.entries) if ((e.meta?.satellite as {id?: string} | undefined)?.id === id) for (const p of e.planetIds) count.set(p, (count.get(p) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

const base = () => `${import.meta.env.BASE_URL}api`;
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(base() + path, {credentials: 'same-origin', ...init, headers: {'content-type': 'application/json', ...(init.headers ?? {})}});
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.error?.message ?? `Request failed (${res.status})`), {status: res.status});
  return body as T;
}
const post = <T>(path: string, data: unknown = {}) => call<T>(path, {method: 'POST', body: JSON.stringify(data)});
export const spaceApi = {
  status: () => call<{intake: Record<string, {connected: boolean; lastEventAt?: string; pending: number}>; agent: {calls: number; cost: number | null}; inbox: number}>('/satellites/status'),
  records: (id: string) => call<{records: SpaceRecord[]}>(`/satellites/${id}/records`),
  token: (id: string, revoke = false) => post<{token: string | null}>(`/satellites/${id}/token`, {revoke}),
  digest: (id: string, trigger: 'open' | 'manual') => post<{ran: boolean; pending?: number; inboxId?: string}>(`/satellites/${id}/digest`, {trigger}),
  feedback: (id: string, record: string, text: string) => post(`/satellites/${id}/records/${encodeURIComponent(record)}/feedback`, {text}),
  inbox: (status = 'open') => call<{items: InboxItem[]}>(`/inbox?status=${status}`),
  decideBatch: (batch: string, action: 'approve' | 'dismiss', ids: string[], data?: Record<string, unknown>) => post<{result: {status: string; count: number; entryIds?: string[]}}>(`/inbox/batch/${encodeURIComponent(batch)}`, {action, ids, ...(data ? {data} : {})}),
  decide: (id: string, action: 'approve' | 'dismiss', data?: unknown) => post<{result: {status: string; entryId?: string}; store?: Store; revision?: number}>(`/inbox/${id}`, {action, ...(data ? {data} : {})}),
  clients: () => call<{clients: {clientId: string; name: string; lastUsedAt: string | null; connectedAt: string}[]; endpoint: string}>('/oauth/clients'),
  disconnect: (id: string) => post(`/oauth/clients/${id}/disconnect`),
  request: (id: string) => call<{clientName: string; clientUri?: string; redirectHost: string; scopes: string[]}>(`/oauth/requests/${id}`),
  answer: (id: string, approve: boolean) => post<{redirect: string}>(`/oauth/requests/${id}`, {approve}),
};
