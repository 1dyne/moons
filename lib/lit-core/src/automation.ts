import type {v2} from '@workspace/life-contract';
import {aggregate, emptySource, inSource, itemDay, matchesAll, periodRange, query, title, value, withItem, type Ctx, type Item, type Workspace} from './workspace.ts';

type V = v2.CellValue;

// ── Signals (상황): a named measurement compared with a number or another signal ─────────────────────
export function measure(ws: Workspace, signalId: string, ctx: Ctx, depth = 0): V {
  const s = ws.signals.get(signalId);
  if (!s || depth > 4) return null;
  const m = s.body.measure, [from, to] = periodRange(m.period, ctx.today);
  const items = query(ws, m, ctx).filter(x => { const d = itemDay(ws, x); return d >= from && d <= to; });
  return aggregate(ws, items, m.agg, m.of, 0, ctx);
}
export function evalSignal(ws: Workspace, signalId: string, ctx: Ctx, depth = 0): {met: boolean; value: V; target: V} {
  const s = ws.signals.get(signalId);
  if (!s) return {met: false, value: null, target: null};
  const v = measure(ws, signalId, ctx, depth), t = 'n' in s.body.compare ? s.body.compare.n : measure(ws, s.body.compare.signal, ctx, depth + 1);
  if (typeof v !== 'number' || typeof t !== 'number') return {met: false, value: v, target: t};
  const op = s.body.op, met = op === 'lt' ? v < t : op === 'lte' ? v <= t : op === 'gt' ? v > t : op === 'gte' ? v >= t : op === 'is' ? v === t : v !== t;
  return {met, value: v, target: t};
}

// ── Rules: what a rule would do, as plain data. The server applies writes; the open screen shows effects. ──
export type Write =
  | {op: 'update'; id: string; values: Record<string, V>}
  | {op: 'create'; dbs: string[]; values: Record<string, V>}
  | {op: 'archive'; id: string};
export type Effect =
  | {kind: 'notify'; text: string; item: string | null}
  | {kind: 'effect'; name: string; item: string | null}
  | {kind: 'openForm'; dbs: string[]; props: string[]; values: Record<string, V>; title: string; item: string | null}
  | {kind: 'goTo'; page: string; item: string | null};
export type Plan = {rule: string; mode: 'auto' | 'suggest'; item: string | null; writes: Write[]; effects: Effect[]};

function resolve(ws: Workspace, e: v2.ValueExpr, item: Item | null, ctx: Ctx): V {
  if ('set' in e) return e.set;
  if ('now' in e) return ctx.now.toISOString();
  if ('today' in e) return ctx.today;
  if ('link' in e) return item ? [item.id] : null;
  return item ? value(ws, item, e.copy) : null;
}
const resolveAll = (ws: Workspace, vals: Record<string, v2.ValueExpr>, item: Item | null, ctx: Ctx) => Object.fromEntries(Object.entries(vals).map(([k, e]) => [k, resolve(ws, e, item, ctx)]));
const fill = (ws: Workspace, text: string, item: Item | null) => text.replaceAll('{title}', item ? title(ws, item) : '');

/** One rule run on one item (or on nothing, for a rule without a source). Writes that change nothing are dropped. */
export function planRule(ws: Workspace, ruleId: string, item: Item | null, ctx: Ctx): Plan {
  const r = ws.rules.get(ruleId)!, writes: Write[] = [], effects: Effect[] = [];
  for (const a of r.body.do) {
    if (a.do === 'set' && item) {
      const vals = resolveAll(ws, a.values, item, ctx), changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => JSON.stringify(item.body.values[k] ?? null) !== JSON.stringify(v)));
      if (Object.keys(changed).length) writes.push({op: 'update', id: item.id, values: changed});
    } else if (a.do === 'create') writes.push({op: 'create', dbs: a.dbs, values: resolveAll(ws, a.values, item, ctx)});
    else if (a.do === 'createEach' && item) {
      // Once a day per source item: skip when today already has an item in these databases linked back to it.
      const exists = [...ws.items.values()].some(x => a.dbs.every(d => x.body.dbs.includes(d)) && itemDay(ws, x) === ctx.today && (Array.isArray(x.body.values[a.link]) ? (x.body.values[a.link] as string[]).includes(item.id) : x.body.values[a.link] === item.id));
      if (!exists) writes.push({op: 'create', dbs: a.dbs, values: {...resolveAll(ws, a.values, item, ctx), [a.link]: [item.id]}});
    } else if (a.do === 'archive' && item && !item.body.archived) writes.push({op: 'archive', id: item.id});
    else if (a.do === 'notify') effects.push({kind: 'notify', text: fill(ws, a.text, item), item: item?.id ?? null});
    else if (a.do === 'effect') effects.push({kind: 'effect', name: a.name, item: item?.id ?? null});
    else if (a.do === 'openForm') effects.push({kind: 'openForm', dbs: a.dbs, props: a.props, values: a.link && item ? {[a.link]: [item.id]} : {}, title: fill(ws, a.title, item), item: item?.id ?? null});
    else if (a.do === 'goTo') effects.push({kind: 'goTo', page: a.page, item: a.carry ? item?.id ?? null : null});
  }
  return {rule: r.id, mode: r.body.mode, item: item?.id ?? null, writes, effects};
}
const ruleHolds = (ws: Workspace, r: Workspace['rules'] extends Map<string, infer R> ? R : never, item: Item, ctx: Ctx) => inSource(ws, item, r.body.source, ctx) && matchesAll(ws, item, r.body.if, ctx);
const nonEmpty = (p: Plan) => p.writes.length > 0 || p.effects.length > 0;

/** After an item is written: enter rules (it came to match), change rules (it matches and was written),
 * and signal rules whose signal became true because of this write. */
export function onItemWrite(before: Workspace, after: Workspace, prior: Item | null, next: Item, ctx: Ctx): Plan[] {
  const plans: Plan[] = [];
  for (const r of after.rules.values()) {
    if (!r.body.enabled) continue;
    if (r.body.on.kind === 'enter' || r.body.on.kind === 'change') {
      if (next.deletedAt || !ruleHolds(after, r, next, ctx)) continue;
      if (r.body.on.kind === 'enter' && prior && !prior.deletedAt && ruleHolds(before, r, prior, ctx)) continue;
      plans.push(planRule(after, r.id, next, ctx));
    } else if (r.body.on.kind === 'signal' && r.body.on.signal) {
      if (evalSignal(before, r.body.on.signal, ctx).met || !evalSignal(after, r.body.on.signal, ctx).met) continue;
      plans.push(...runOver(after, r.id, ctx));
    }
  }
  return plans.filter(nonEmpty);
}
/** A rule that runs for a moment (day start, a time, a signal): once, or once per item of its source. */
function runOver(ws: Workspace, ruleId: string, ctx: Ctx): Plan[] {
  const r = ws.rules.get(ruleId)!;
  if (emptySource(r.body.source) && !r.body.if.length) return [planRule(ws, ruleId, null, ctx)];
  return query(ws, r.body.source, ctx).filter(x => matchesAll(ws, x, r.body.if, ctx)).map(x => planRule(ws, ruleId, x, ctx));
}
export function onMoment(ws: Workspace, moment: {kind: 'dayStart'} | {kind: 'time'; at: string}, ctx: Ctx): Plan[] {
  return [...ws.rules.values()].filter(r => r.body.enabled && r.body.on.kind === moment.kind && (moment.kind !== 'time' || r.body.on.at === moment.at))
    .flatMap(r => runOver(ws, r.id, ctx)).filter(nonEmpty);
}
/** The user opened an item on the screen: open rules that cover it give their screen actions (go to a page…). */
export function onOpen(ws: Workspace, item: Item, ctx: Ctx): Effect[] {
  return [...ws.rules.values()].filter(r => r.body.enabled && r.body.on.kind === 'open' && ruleHolds(ws, r, item, ctx)).flatMap(r => planRule(ws, r.id, item, ctx).effects);
}
/** What a rule would do right now to the items it covers — shown before turning it on, and as suggestions. */
export function preview(ws: Workspace, ruleId: string, ctx: Ctx): Plan[] {
  const r = ws.rules.get(ruleId);
  if (!r) return [];
  if (r.body.on.kind === 'enter' || r.body.on.kind === 'change') return query(ws, r.body.source, ctx).filter(x => matchesAll(ws, x, r.body.if, ctx)).map(x => planRule(ws, r.id, x, ctx)).filter(p => p.writes.length > 0);
  return runOver(ws, r.id, ctx).filter(nonEmpty);
}
/** Suggestions: what suggest-mode rules would change now. Computed, never stored; the user accepts one by one. */
export function suggestions(ws: Workspace, ctx: Ctx): Plan[] {
  return [...ws.rules.values()].filter(r => r.body.enabled && r.body.mode === 'suggest' && (r.body.on.kind === 'enter' || r.body.on.kind === 'change')).flatMap(r => preview(ws, r.id, ctx));
}
/** Apply an update to an item body (pure). */
export function applyValues(body: v2.ItemBody, values: Record<string, V>): v2.ItemBody {
  const next = {...body.values};
  for (const [k, v] of Object.entries(values)) { if (v === null) delete next[k]; else next[k] = v; }
  return {...body, values: next};
}
export {withItem};
