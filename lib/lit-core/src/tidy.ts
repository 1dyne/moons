import type {AnyRecord, v2} from '@workspace/life-contract';
import type {Workspace} from './workspace.ts';

// Keeping a growing workspace tidy (docs/lit/V2_DESIGN.md §2-10): lit points things out, the user decides.

const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/[\s\p{P}\p{S}_]/gu, '');
function close(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a))) return true;
  if (Math.min(a.length, b.length) < 3 || Math.abs(a.length - b.length) > 1) return false;
  // one edit apart
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
/** Properties whose names look like the same thing ("read time" / "readtime" / "read times"). */
export function similarProperties(ws: Workspace, nameOrId?: string) {
  const props = [...ws.properties.values()];
  if (nameOrId !== undefined) {
    const n = norm(ws.properties.get(nameOrId)?.body.name ?? nameOrId);
    return props.filter(p => p.id !== nameOrId && close(norm(p.body.name), n)).map(p => p.id);
  }
  const pairs: [string, string][] = [];
  for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) if (close(norm(props[i]!.body.name), norm(props[j]!.body.name))) pairs.push([props[i]!.id, props[j]!.id]);
  return pairs;
}
const mentions = (body: unknown, id: string) => JSON.stringify(body).includes(id);
export function tidyReport(ws: Workspace) {
  const items = [...ws.items.values()], defs = [...ws.databases.values(), ...ws.lenses.values(), ...ws.rules.values(), ...ws.signals.values(), ...ws.properties.values()];
  const unused = [...ws.properties.values()].filter(p => !items.some(x => p.id in x.body.values) && !defs.some(d => d.id !== p.id && mentions(d.body, p.id))).map(p => p.id);
  const untagged = items.filter(x => !x.body.archived && !x.body.dbs.length).map(x => x.id);
  const emptyDbs = [...ws.databases.values()].filter(d => !items.some(x => x.body.dbs.includes(d.id))).map(d => d.id);
  return {similar: similarProperties(ws) as [string, string][], unusedProperties: unused, untaggedItems: untagged, emptyDatabases: emptyDbs};
}

/** Merge one property into another: values move, and every database, lens, rule, signal and formula that
 * pointed at the old one points at the new one. Returns the records to write (and the property to delete). */
export function mergeProperty(ws: Workspace, from: string, into: string): {writes: AnyRecord[]; remove: string} {
  const a = ws.properties.get(from), b = ws.properties.get(into);
  if (!a || !b) throw new Error('Unknown property.');
  if (from === into) throw new Error('A property cannot merge into itself.');
  const textish = (k: v2.PropertyKind) => ['title', 'text', 'longtext'].includes(k), numeric = (k: v2.PropertyKind) => ['number', 'rating', 'duration'].includes(k);
  if (a.body.kind !== b.body.kind && !(textish(a.body.kind) && textish(b.body.kind)) && !(numeric(a.body.kind) && numeric(b.body.kind))) throw new Error('These properties hold different kinds of values.');
  const writes: AnyRecord[] = [];
  for (const x of ws.items.values()) {
    if (!(from in x.body.values)) continue;
    const values = {...x.body.values}, v = values[from]!;
    delete values[from];
    if (values[into] === undefined || values[into] === null || values[into] === '') values[into] = v;
    writes.push({...x, body: {...x.body, values}} as AnyRecord);
  }
  for (const d of [...ws.databases.values(), ...ws.lenses.values(), ...ws.rules.values(), ...ws.signals.values(), ...ws.properties.values()]) {
    if (d.id === from || !mentions(d.body, from)) continue;
    let body = JSON.parse(JSON.stringify(d.body).replaceAll(from, into));
    if (d.kind === 'database') body = {...body, properties: [...new Set(body.properties as string[])]};
    writes.push({...d, body} as AnyRecord);
  }
  // Options of a select move over too, so values keep their names.
  if ((a.body.kind === 'select' || a.body.kind === 'multi') && a.body.kind === b.body.kind) {
    const extra = a.body.options.filter(o => !b.body.options.some(x => x.id === o.id));
    if (extra.length) {
      const i = writes.findIndex(w => w.id === into), base = (i >= 0 ? writes[i]!.body : b.body) as v2.PropertyBody;
      const next = {...b, body: {...base, options: [...base.options, ...extra]}} as AnyRecord;
      if (i >= 0) writes[i] = next; else writes.push(next);
    }
  }
  return {writes, remove: from};
}

/** "DB로 묶기": from items picked by the user, the properties most of them use (lit suggests; the user decides). */
export function inferDatabase(ws: Workspace, itemIds: string[]) {
  const items = itemIds.map(id => ws.items.get(id)).filter(x => !!x);
  const counts = new Map<string, number>();
  for (const x of items) for (const k of Object.keys(x!.body.values)) if (ws.properties.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const properties = [...counts].map(([id, n]) => ({id, share: Math.round(n / Math.max(1, items.length) * 100)})).sort((a, b) => b.share - a.share);
  return {items: items.length, properties, suggested: properties.filter(p => p.share >= 50).map(p => p.id)};
}

/** Quick capture: "#tag words key: value" → what lit understood, as a suggestion. Nothing is created here. */
export function parseCapture(ws: Workspace, line: string) {
  const tags: {name: string; db: string | null}[] = [], pairs: {key: string; raw: string; prop: string | null; value: v2.CellValue}[] = [];
  let rest = line.replace(/(^|\s)#([^\s#:]+)/g, (_m, sp: string, t: string) => { tags.push({name: t, db: [...ws.databases.values()].find(d => norm(d.body.name) === norm(t))?.id ?? null}); return sp; });
  rest = rest.replace(/(^|\s)([^\s:]+):\s*([^\s]+)/g, (_m, sp: string, k: string, raw: string) => {
    const p = [...ws.properties.values()].find(x => norm(x.body.name) === norm(k));
    const n = Number(raw.replace(/[^\d.-]/g, ''));
    const value = p && ['number', 'rating', 'duration'].includes(p.body.kind) && raw.match(/\d/) ? n
      : p && (p.body.kind === 'select' || p.body.kind === 'multi') ? (p.body.options.find(o => norm(o.name) === norm(raw))?.id ?? raw) : raw;
    pairs.push({key: k, raw, prop: p?.id ?? null, value: p?.body.kind === 'multi' && typeof value === 'string' ? [value] : value});
    return sp;
  });
  return {text: rest.replace(/\s+/g, ' ').trim(), tags, pairs};
}
