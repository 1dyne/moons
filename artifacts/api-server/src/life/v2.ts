import {logicalDay, ulid, v2, type AnyRecord} from '@workspace/life-contract';
import {applyValues, buildWorkspace, instantiate, missingRequirements, inferDatabase, mergeProperty, onItemWrite, onMoment, parseCapture, preview, roleValue, suggestions, withItem, type Ctx, type Effect, type Item, type Plan, type Workspace, type Write} from '@workspace/lit-core';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';
import {deleteRecord, getSettings, listRecords, writeRecordOnly} from './store.ts';

// lit v2 on the server (docs/lit/V2_DESIGN.md): the same records store, six new kinds, and the rules run here
// after every write so the app, Claude and other devices get the same result. Auto rules write; suggest rules
// are computed on request and never stored.

const MAX_DEPTH = 3;
export async function v2Records(owner: string): Promise<AnyRecord[]> {
  const out: AnyRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await listRecords(owner, {kinds: v2.V2_KINDS, limit: 1000, cursor});
    out.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return out;
}
export const loadWorkspace = async (owner: string) => buildWorkspace(await v2Records(owner));
export async function ctxOf(owner: string, now = new Date()): Promise<Ctx> {
  return {today: logicalDay(now, await getSettings(owner)), now};
}

type Input = {kind: string; body: unknown; baseRevision?: number; id?: string};
type Opts = {depth?: number; rule?: string; ctx?: Ctx; ws?: Workspace};
export type Saved = {record: AnyRecord; effects: Effect[]; ran: string[]};

/** Create or update one v2 record. Items get their planner day from their day role; rules run afterwards. */
export async function saveV2(owner: string, id: string | null, input: Input, o: Opts = {}): Promise<Saved> {
  if (!v2.isV2Kind(input.kind)) throw new WorkspaceError(400, 'Unknown kind.');
  const parsed = v2.V2_BODIES[input.kind].safeParse(input.body);
  if (!parsed.success) throw new WorkspaceError(400, parsed.error.issues[0]?.message ?? `Invalid ${input.kind}.`);
  const ctx = o.ctx ?? await ctxOf(owner), ws = o.ws ?? await loadWorkspace(owner);
  const prior = id ? ws.items.get(id) ?? null : null;
  let day: string | null = null;
  if (input.kind === 'item') {
    const probe = {...(prior ?? {id: '', kind: 'item', logicalDay: null, createdAt: ctx.now.toISOString()}), body: parsed.data} as unknown as Item;
    const d = roleValue(ws, probe, 'day');
    day = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : prior?.logicalDay ?? ctx.today;
  }
  const record = await writeRecordOnly(owner, id, {kind: input.kind, id: input.id, logicalDay: day, body: parsed.data, baseRevision: input.baseRevision,
    source: o.rule ? {type: 'planner', ref: `rule:${o.rule}`, confirmed: true} : undefined});
  if (record.kind !== 'item') return {record, effects: [], ran: []};
  const after = withItem(ws, record as Item);
  return {record, ...await runPlans(owner, after, onItemWrite(ws, after, prior, record as Item, ctx), ctx, o.depth ?? 0)};
}

/** Apply the auto plans (writes, then their own follow-ups up to a small depth) and collect what the screen shows. */
async function runPlans(owner: string, ws: Workspace, plans: Plan[], ctx: Ctx, depth: number, only?: 'all') {
  const effects: Effect[] = [], ran: string[] = [];
  let cur = ws;
  for (const p of plans) {
    if (p.mode !== 'auto' && only !== 'all') continue;
    ran.push(p.rule); effects.push(...p.effects);
    if (depth >= MAX_DEPTH) continue;
    for (const w of p.writes) {
      const out = await applyWrite(owner, w, p.rule, ctx, depth + 1, cur);
      if (out) { cur = withItem(cur, out.record as Item); effects.push(...out.effects); ran.push(...out.ran); }
    }
  }
  return {effects, ran};
}
async function applyWrite(owner: string, w: Write, rule: string, ctx: Ctx, depth: number, ws: Workspace) {
  const o = {depth, rule, ctx, ws};
  if (w.op === 'create') return saveV2(owner, null, {kind: 'item', body: {dbs: w.dbs, values: Object.fromEntries(Object.entries(w.values).filter(([, v]) => v !== null))}}, o);
  const item = ws.items.get(w.id);
  if (!item) return null;
  const body = w.op === 'archive' ? {...item.body, archived: true} : applyValues(item.body, w.values);
  return saveV2(owner, item.id, {kind: 'item', body}, o);
}

export async function deleteV2(owner: string, id: string) {
  const ws = await loadWorkspace(owner), rec = ws.items.get(id) ?? ws.properties.get(id) ?? ws.databases.get(id) ?? ws.lenses.get(id) ?? ws.rules.get(id) ?? ws.signals.get(id);
  if (!rec) throw new WorkspaceError(404, 'Record not found.');
  return deleteRecord(owner, id);
}

/** A moment the open screen reports (the planner day opened, a clock time). createEach keeps it idempotent. */
export async function runMoment(owner: string, moment: {kind: 'dayStart'} | {kind: 'time'; at: string}) {
  const ctx = await ctxOf(owner), ws = await loadWorkspace(owner);
  return runPlans(owner, ws, onMoment(ws, moment, ctx), ctx, 0);
}
export async function previewRule(owner: string, ruleId: string) {
  const ws = await loadWorkspace(owner);
  if (!ws.rules.has(ruleId)) throw new WorkspaceError(404, 'Rule not found.');
  return preview(ws, ruleId, await ctxOf(owner));
}
export async function listSuggestions(owner: string) { return suggestions(await loadWorkspace(owner), await ctxOf(owner)); }
/** Accept one suggestion: the rule's plan for that item, applied now. */
export async function acceptSuggestion(owner: string, ruleId: string, itemId: string) {
  const ws = await loadWorkspace(owner), ctx = await ctxOf(owner);
  const plan = preview(ws, ruleId, ctx).find(p => p.item === itemId);
  if (!plan) throw new WorkspaceError(409, 'There is nothing to change any more.');
  return runPlans(owner, ws, [plan], ctx, 0, 'all');
}
export async function mergeProperties(owner: string, from: string, into: string) {
  const ws = await loadWorkspace(owner);
  let plan;
  try { plan = mergeProperty(ws, from, into); } catch (e) { throw new WorkspaceError(400, (e as Error).message); }
  for (const r of plan.writes) await writeRecordOnly(owner, r.id, {kind: r.kind, logicalDay: r.logicalDay, body: r.body});
  await deleteRecord(owner, plan.remove);
  return {changed: plan.writes.length, removed: plan.remove};
}
export async function suggestDatabase(owner: string, items: string[]) { return inferDatabase(await loadWorkspace(owner), items); }
export async function understand(owner: string, line: string) { return parseCapture(await loadWorkspace(owner), line); }

// ── Screen: one record; each save is a revision (the versions). ───────────────────────────────────
export const localId = () => Math.random().toString(36).slice(2, 10);
const EMPTY = () => v2.ScreenBody.parse({pages: [{id: localId(), name: '홈', widgets: []}]});
export async function getScreen(owner: string) {
  const ws = await loadWorkspace(owner);
  return ws.screen ?? (await saveV2(owner, null, {kind: 'screen', body: EMPTY()}, {ws})).record;
}
export async function putScreen(owner: string, body: unknown, baseRevision?: number) {
  const cur = await getScreen(owner);
  return (await saveV2(owner, cur.id, {kind: 'screen', body, baseRevision})).record;
}
/** Install a template: its records (validated before anything is written) and its pages, appended to the screen. */
export async function installTemplate(owner: string, raw: unknown) {
  const screen = await getScreen(owner), ws = await loadWorkspace(owner);
  const t = v2.Template.safeParse(raw);
  if (!t.success) throw new WorkspaceError(400, 'Invalid template.');
  const missing = missingRequirements(ws, t.data);
  if (missing.length) throw new WorkspaceError(409, `먼저 설치할 템플릿: ${missing.join(', ')}`);
  let out;
  try { out = instantiate(ws, t.data, () => ulid(), localId); } catch (e) { throw new WorkspaceError(400, (e as Error).message); }
  for (const r of out.records) await writeRecordOnly(owner, null, {kind: r.kind, id: r.id, logicalDay: r.kind === 'item' ? (await ctxOf(owner)).today : null, body: r.body, source: {type: 'kit', ref: `template:${t.data.id}`, confirmed: true}});
  const body = screen.body as v2.ScreenBody;
  const next = {...body, pages: [...body.pages, ...out.pages], installed: {...body.installed, [t.data.id]: Object.fromEntries(Object.entries(out.refs).filter(([k]) => t.data.records.some(r => r.ref === k)))}};
  const saved = await putScreen(owner, next);
  return {screen: saved, created: out.records.length, reused: out.reused, pages: out.pages.map(p => p.id)};
}

// ── The old planner's records (v1 kinds). The user clears them from lit's settings when ready; tombstones keep history.
const LEGACY = ['goal', 'project', 'task', 'routine', 'sleep', 'condition', 'review', 'session', 'persona', 'note', 'entry'] as const;
export async function legacyCount(owner: string) {
  let n = 0, cursor: string | undefined;
  do { const page = await listRecords(owner, {kinds: [...LEGACY], limit: 1000, cursor}); n += page.items.length; cursor = page.nextCursor ?? undefined; } while (cursor);
  return n;
}
export async function clearLegacy(owner: string) {
  let n = 0;
  for (;;) {
    const page = await listRecords(owner, {kinds: [...LEGACY], limit: 500});
    if (!page.items.length) break;
    for (const r of page.items) { await deleteRecord(owner, r.id); n++; }
  }
  return {cleared: n};
}
