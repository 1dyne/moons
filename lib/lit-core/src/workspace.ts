import {addDays, isoWeek, weekday, type AnyRecord, type LifeRecord, type v2} from '@workspace/life-contract';

// lit v2 engine (docs/lit/V2_DESIGN.md §2): one pure module that the screen, the server and Claude share.
// It reads the six record kinds, answers "which items match", computes formulas and aggregates, and never stores a
// computed value. It knows no template: every meaning comes from property roles and the user's own records.

export type Prop = LifeRecord<'property'>; export type Db = LifeRecord<'database'>; export type Item = LifeRecord<'item'>;
export type Lens = LifeRecord<'lens'>; export type Sig = LifeRecord<'signal'>; export type Rule = LifeRecord<'rule'>;
export type Workspace = {
  properties: Map<string, Prop>; databases: Map<string, Db>; items: Map<string, Item>;
  lenses: Map<string, Lens>; signals: Map<string, Sig>; rules: Map<string, Rule>;
  /** role → the ids of properties that hold it (several databases may each have their own). */
  byRole: Map<v2.Role, string[]>;
};
/** The planner day and the moment the engine works in (the server passes the account's day boundary). */
export type Ctx = {today: string; now: Date};

const live = <T extends AnyRecord>(r: T) => !r.deletedAt;
export function buildWorkspace(records: AnyRecord[]): Workspace {
  const ws: Workspace = {properties: new Map(), databases: new Map(), items: new Map(), lenses: new Map(), signals: new Map(), rules: new Map(), byRole: new Map()};
  for (const r of records) {
    if (!live(r)) continue;
    if (r.kind === 'property') ws.properties.set(r.id, r as Prop);
    else if (r.kind === 'database') ws.databases.set(r.id, r as Db);
    else if (r.kind === 'item') ws.items.set(r.id, r as Item);
    else if (r.kind === 'lens') ws.lenses.set(r.id, r as Lens);
    else if (r.kind === 'signal') ws.signals.set(r.id, r as Sig);
    else if (r.kind === 'rule') ws.rules.set(r.id, r as Rule);
  }
  for (const p of ws.properties.values()) if (p.body.role) ws.byRole.set(p.body.role, [...(ws.byRole.get(p.body.role) ?? []), p.id]);
  return ws;
}
/** The same workspace with one item replaced (what a write would make), for before/after checks. */
export function withItem(ws: Workspace, item: Item): Workspace {
  const items = new Map(ws.items); if (item.deletedAt) items.delete(item.id); else items.set(item.id, item);
  return {...ws, items};
}

// ── Values ────────────────────────────────────────────────────────────────────────────────────────
type V = v2.CellValue;
const roleProps = (ws: Workspace, role: v2.Role) => ws.byRole.get(role) ?? [];
/** The first value an item has for a role (its day, its start…), or null. */
export function roleValue(ws: Workspace, item: Item, role: v2.Role): V {
  for (const id of roleProps(ws, role)) { const v = item.body.values[id]; if (v !== undefined && v !== null && v !== '') return v; }
  return null;
}
export function title(ws: Workspace, item: Item): string {
  const t = roleValue(ws, item, 'title');
  return typeof t === 'string' && t ? t : item.body.text;
}
/** Which planner day an item belongs to: its day role, else the day it was written. Every item lands on a day. */
export function itemDay(ws: Workspace, item: Item): string {
  const d = roleValue(ws, item, 'day');
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : item.logicalDay ?? item.createdAt.slice(0, 10);
}
/** When an item happened, for ordering ("the latest earlier one"): its start, else its day, else when it was written. */
export function itemTime(ws: Workspace, item: Item): string {
  const s = roleValue(ws, item, 'start');
  return typeof s === 'string' && s ? s : roleValue(ws, item, 'day') ? `${itemDay(ws, item)}T00:00:00Z` : item.createdAt;
}
/** done · open · skip for one done property's value. */
export function meaningOf(p: Prop | undefined, v: V): v2.Meaning | null {
  if (!p) return null;
  if (p.body.kind === 'checkbox') return v === true ? 'done' : 'open';
  if (typeof v !== 'string') return null;
  return p.body.options.find(o => o.id === v)?.meaning ?? null;
}
/** Whether an item is finished, by its done role. null: the item has no done property (not counted). */
export function doneMeaning(ws: Workspace, item: Item): v2.Meaning | null {
  for (const id of roleProps(ws, 'done')) {
    const p = ws.properties.get(id)!, v = item.body.values[id];
    if (v === undefined) { if (p.body.kind === 'checkbox' && item.body.dbs.some(d => ws.databases.get(d)?.body.properties.includes(id))) return 'open'; continue; }
    const m = meaningOf(p, v); if (m) return m;
  }
  return null;
}

/** A property's value on an item; formulas are computed here, every time. */
export function value(ws: Workspace, item: Item, propId: string, depth = 0): V {
  const p = ws.properties.get(propId);
  if (!p) return null;
  if (p.body.kind !== 'formula') return item.body.values[propId] ?? (p.body.kind === 'title' ? item.body.text || null : null);
  if (depth > 8 || !p.body.formula) return null;
  return formula(ws, item, p.body.formula, depth + 1);
}

const isTime = (v: V): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
const isDay = (v: V): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: V) => typeof v === 'number' ? v : null;
function formula(ws: Workspace, item: Item, f: v2.Formula, depth: number): V {
  switch (f.op) {
    case 'diff': {
      const a = value(ws, item, f.a, depth), b = value(ws, item, f.b, depth);
      if (isTime(a) && isTime(b)) return Math.round((Date.parse(a) - Date.parse(b)) / 60000);
      if (isDay(a) && isDay(b)) return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
      const x = num(a), y = num(b);
      return x === null || y === null ? null : x - y;
    }
    case 'rollup': return aggregate(ws, related(ws, item, f.via, f.back), f.agg, f.of, depth);
    case 'latest': {
      const key = JSON.stringify(value(ws, item, f.match, depth)), at = itemTime(ws, item);
      if (key === 'null') return null;
      const prior = [...ws.items.values()].filter(x => x.id !== item.id && !x.body.archived && JSON.stringify(value(ws, x, f.match, depth)) === key && itemTime(ws, x) < at)
        .sort((x, y) => itemTime(ws, y).localeCompare(itemTime(ws, x)));
      for (const x of prior) { const v = value(ws, x, f.of, depth); if (v !== null && v !== '') return v; }
      return null;
    }
    case 'ifThen': return matchesAll(ws, item, f.when, undefined, depth) ? f.then : f.else;
    case 'expr': return expr(f.expr, id => num(value(ws, item, id, depth)));
  }
}
/** The items a relation joins: the ones this item lists, or (back) the ones that list this item. */
export function related(ws: Workspace, item: Item, via: string, back: boolean): Item[] {
  if (!back) {
    const ids = item.body.values[via], list = Array.isArray(ids) ? ids : typeof ids === 'string' ? [ids] : [];
    return list.map(id => ws.items.get(id)).filter((x): x is Item => !!x && !x.body.archived);
  }
  return [...ws.items.values()].filter(x => !x.body.archived && x.id !== item.id && linksTo(x.body.values[via], item.id));
}
const linksTo = (v: V | undefined, id: string) => Array.isArray(v) ? v.includes(id) : v === id;

/** Many items → one number (or the last value). doneRatio is a percentage of finished among counted items. */
export function aggregate(ws: Workspace, items: Item[], agg: v2.Aggregate, of: string | null, depth = 0, ctx?: Ctx): V {
  if (agg === 'count') return items.length;
  if (agg === 'doneRatio') {
    const m = items.map(x => doneMeaning(ws, x)).filter(x => x === 'done' || x === 'open');
    return m.length ? Math.round(m.filter(x => x === 'done').length / m.length * 100) : null;
  }
  if (agg === 'days' || agg === 'streak') {
    const days = new Set(items.map(x => itemDay(ws, x)));
    if (agg === 'days') return days.size;
    let d = ctx?.today ?? [...days].sort().at(-1) ?? '', n = 0;
    if (ctx && !days.has(d)) d = addDays(d, -1); // today not done yet does not break a streak
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }
  if (!of) return null;
  if (agg === 'last') {
    const sorted = [...items].sort((a, b) => itemTime(ws, b).localeCompare(itemTime(ws, a)));
    for (const x of sorted) { const v = value(ws, x, of, depth); if (v !== null && v !== '') return v; }
    return null;
  }
  const ns = items.map(x => num(value(ws, x, of, depth))).filter((x): x is number => x !== null);
  if (!ns.length) return agg === 'sum' ? 0 : null;
  if (agg === 'sum') return ns.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return Math.round(ns.reduce((a, b) => a + b, 0) / ns.length * 100) / 100;
  return agg === 'max' ? Math.max(...ns) : Math.min(...ns);
}

// A tiny arithmetic language for developers: numbers, + - * /, parentheses and {property id}. No names, no calls.
export function expr(src: string, get: (id: string) => number | null): number | null {
  const toks = src.match(/\{[0-9A-Z]{26}\}|\d+(?:\.\d+)?|[-+*/()]|\S/g) ?? [];
  let i = 0, bad = false;
  const atom = (): number | null => {
    const t = toks[i++];
    if (t === undefined) { bad = true; return null; }
    if (t === '(') { const v = sum(); if (toks[i++] !== ')') bad = true; return v; }
    if (t === '-') { const v = atom(); return v === null ? null : -v; }
    if (/^\d/.test(t)) return Number(t);
    if (t.startsWith('{')) return get(t.slice(1, -1));
    bad = true; return null;
  };
  const prod = (): number | null => {
    let v = atom();
    while (toks[i] === '*' || toks[i] === '/') { const op = toks[i++], w = atom(); v = v === null || w === null ? null : op === '*' ? v * w : w === 0 ? null : v / w; }
    return v;
  };
  const sum = (): number | null => {
    let v = prod();
    while (toks[i] === '+' || toks[i] === '-') { const op = toks[i++], w = prod(); v = v === null || w === null ? null : op === '+' ? v + w : v - w; }
    return v;
  };
  const out = sum();
  return bad || i !== toks.length || out === null || !Number.isFinite(out) ? null : Math.round(out * 100) / 100;
}

// ── Conditions and queries ────────────────────────────────────────────────────────────────────────
const MEANING_TOKENS: Record<string, v2.Meaning> = {'@done': 'done', '@open': 'open', '@skip': 'skip'};
export function resolveToken(v: V, ctx?: Ctx): V {
  if (typeof v !== 'string' || !v.startsWith('@') || !ctx) return v;
  if (v === '@today') return ctx.today;
  if (v === '@yesterday') return addDays(ctx.today, -1);
  if (v === '@tomorrow') return addDays(ctx.today, 1);
  if (v === '@weekday') return String(weekday(ctx.today));
  if (v === '@now') return ctx.now.toISOString();
  return v;
}
const lower = (v: V) => typeof v === 'string' ? v.toLowerCase() : v;
function compare(op: v2.Op, have: V, want: V, ctx?: Ctx): boolean {
  if (op === 'empty') return have === null || have === '' || (Array.isArray(have) && !have.length);
  if (op === 'filled') return !compare('empty', have, want);
  if (want === '@thisWeek' && ctx) { const ok = isDay(have) && isoWeek(have) === isoWeek(ctx.today); return op === 'isNot' ? !ok : ok; }
  const w = resolveToken(want, ctx);
  if (op === 'is' || op === 'isNot') {
    const ok = Array.isArray(have) ? (Array.isArray(w) ? w.length === have.length && w.every(x => have.includes(x)) : have.includes(String(w))) : have === w || (isTime(have) && isDay(w) && have.slice(0, 10) === w);
    return op === 'is' ? ok : !ok;
  }
  if (op === 'contains') return Array.isArray(have) ? have.includes(String(w)) : typeof have === 'string' && typeof w === 'string' && (lower(have) as string).includes(lower(w) as string);
  if (have === null || w === null) return false;
  const a = typeof have === 'number' ? have : String(have), b = typeof w === 'number' ? w : String(w);
  if (typeof a !== typeof b) return false;
  return op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : a >= b;
}
export function matches(ws: Workspace, item: Item, c: v2.Cond, ctx?: Ctx, depth = 0): boolean {
  if (c.on === 'db') {
    const want = resolveToken(c.value, ctx), has = want === '@none' ? item.body.dbs.length === 0 : typeof want === 'string' && item.body.dbs.includes(want);
    return c.op === 'isNot' ? !has : has;
  }
  if (c.on === 'text') return compare(c.op, `${title(ws, item)} ${item.body.text}`.trim(), c.value, ctx);
  const ids = c.prop ? [c.prop] : c.role ? roleProps(ws, c.role) : [];
  const token = typeof c.value === 'string' ? MEANING_TOKENS[c.value] : undefined;
  if (token) {
    const m = c.prop ? meaningOf(ws.properties.get(c.prop), item.body.values[c.prop] ?? null) : doneMeaning(ws, item);
    return c.op === 'isNot' ? m !== token : m === token;
  }
  // The day role always has a value: the day the item landed on.
  if (c.role === 'day' && !c.prop) return compare(c.op, itemDay(ws, item), c.value, ctx);
  const vals = ids.map(id => value(ws, item, id, depth));
  if (!vals.length || vals.every(v => v === null)) return compare(c.op, null, c.value, ctx);
  return c.op === 'isNot' ? vals.every(v => compare('isNot', v, c.value, ctx)) : vals.some(v => compare(c.op, v, c.value, ctx));
}
export const matchesAll = (ws: Workspace, item: Item, conds: v2.Cond[], ctx?: Ctx, depth = 0) => conds.every(c => matches(ws, item, c, ctx, depth));

export type SourceLike = {lens?: string | null; dbs?: string[]; where?: v2.Cond[]};
export const emptySource = (s: SourceLike) => !s.lens && !s.dbs?.length && !s.where?.length;
/** Whether an item belongs to a source (a lens, databases, conditions — all must hold). Archived items only via a lens that asks. */
export function inSource(ws: Workspace, item: Item, s: SourceLike, ctx?: Ctx): boolean {
  if (item.deletedAt) return false;
  const lens = s.lens ? ws.lenses.get(s.lens) : undefined;
  if (s.lens && !lens) return false;
  if (item.body.archived && !lens?.body.archived) return false;
  if (lens && ((lens.body.dbs.length && !lens.body.dbs.some(d => item.body.dbs.includes(d))) || !matchesAll(ws, item, lens.body.where, ctx))) return false;
  if (s.dbs?.length && !s.dbs.some(d => item.body.dbs.includes(d))) return false;
  return matchesAll(ws, item, s.where ?? [], ctx);
}
export function query(ws: Workspace, s: SourceLike, ctx?: Ctx): Item[] {
  const out = [...ws.items.values()].filter(x => inSource(ws, x, s, ctx));
  const sort = s.lens ? ws.lenses.get(s.lens)?.body.sort ?? [] : [];
  return out.sort((a, b) => {
    for (const k of sort) { const x = value(ws, a, k.prop), y = value(ws, b, k.prop); if (x !== y) return (String(x ?? '') < String(y ?? '') ? -1 : 1) * (k.dir === 'asc' ? 1 : -1); }
    return (a.body.order ?? Infinity) - (b.body.order ?? Infinity) || itemTime(ws, a).localeCompare(itemTime(ws, b));
  });
}

/** The days a period covers, ending on today. */
export function periodRange(period: v2.SignalBody['measure']['period'], today: string): [string, string] {
  switch (period) {
    case 'today': return [today, today];
    case 'yesterday': { const y = addDays(today, -1); return [y, y]; }
    case 'week': { const back = (weekday(today) + 6) % 7, from = addDays(today, -back); return [from, addDays(from, 6)]; }
    case 'last7': return [addDays(today, -6), today];
    case 'month': return [`${today.slice(0, 7)}-01`, `${today.slice(0, 7)}-31`];
    case 'last30': return [addDays(today, -29), today];
    case 'all': return ['0000-01-01', '9999-12-31'];
  }
}

/** Every value of an item, computed ones included, keyed by property id (what a screen or Claude reads). */
export function itemView(ws: Workspace, item: Item, ctx?: Ctx) {
  const ids = new Set([...Object.keys(item.body.values), ...item.body.dbs.flatMap(d => ws.databases.get(d)?.body.properties ?? [])]);
  const values: Record<string, V> = {};
  for (const id of ids) if (ws.properties.has(id)) values[id] = value(ws, item, id);
  return {id: item.id, revision: item.revision, dbs: item.body.dbs, title: title(ws, item), day: itemDay(ws, item), done: doneMeaning(ws, item), archived: item.body.archived, order: item.body.order, values, today: ctx ? itemDay(ws, item) === ctx.today : undefined};
}
