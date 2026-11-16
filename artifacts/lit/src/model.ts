import type {v2} from '@workspace/life-contract';
import {doneMeaning, type Item, type Prop, type Workspace} from '@workspace/lit-core';

// Helpers that read the user's structure by role, so the screen never needs to know what a database is for.

/** The properties an item shows: its databases' properties, then any it has on its own. */
export function propsForItem(ws: Workspace, item: {body: v2.ItemBody}) {
  const ids = [...item.body.dbs.flatMap(d => ws.databases.get(d)?.body.properties ?? []), ...Object.keys(item.body.values)];
  return [...new Set(ids)].map(id => ws.properties.get(id)).filter((p): p is Prop => !!p);
}
/** The property with a role among these databases (or anywhere, when the databases have none). */
export function roleProp(ws: Workspace, role: v2.Role, dbs: string[] = []): Prop | undefined {
  const inDbs = dbs.flatMap(d => ws.databases.get(d)?.body.properties ?? []).map(id => ws.properties.get(id)).find(p => p?.body.role === role);
  if (inDbs || dbs.length) return inDbs;
  const id = ws.byRole.get(role)?.[0];
  return id ? ws.properties.get(id) : undefined;
}
/** A new item for these databases: its title, its day (when the database has a day), the first open step. */
export function newItemBody(ws: Workspace, dbs: string[], text: string, day: string | null, extra: Record<string, v2.CellValue> = {}): v2.ItemBody {
  const values: Record<string, v2.CellValue> = {};
  const t = roleProp(ws, 'title', dbs), d = roleProp(ws, 'day', dbs), done = roleProp(ws, 'done', dbs);
  if (t && dbs.length) values[t.id] = text;
  if (d && day && dbs.length) values[d.id] = day;
  if (done?.body.kind === 'select') { const open = done.body.options.find(o => o.meaning === 'open'); if (open) values[done.id] = open.id; }
  return {dbs, text: t && dbs.length ? '' : text, values: {...values, ...extra}, order: null, archived: false};
}
/** The next step of an item's done property (tapping the check). */
export function nextDone(ws: Workspace, item: Item): Record<string, v2.CellValue> | null {
  const p = roleProp(ws, 'done', item.body.dbs) ?? (ws.byRole.get('done') ?? []).map(id => ws.properties.get(id)).find(x => x && x.id in item.body.values);
  if (!p) return null;
  if (p.body.kind === 'checkbox') return {[p.id]: item.body.values[p.id] !== true};
  const opts = p.body.options;
  if (!opts.length) return null;
  const i = opts.findIndex(o => o.id === item.body.values[p.id]);
  return {[p.id]: opts[(i + 1) % opts.length]!.id};
}
export const checkGlyph = (ws: Workspace, item: Item) => { const m = doneMeaning(ws, item); return m === 'done' ? '●' : m === 'skip' ? '×' : m === 'open' ? '○' : ''; };
export const newOptionId = () => Math.random().toString(36).slice(2, 8);
