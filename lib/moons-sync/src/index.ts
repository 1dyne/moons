// Workspace changes as per-item operations, shared by the web app and the API.
//
// A workspace is a JSON object. Arrays of objects with a string `id` are treated as
// collections (entries, planets, chats, views, tiles, notifications, ...); every other
// top-level key is a plain field. The client diffs its last server copy against its
// current copy, the server applies the operations onto the latest store, and each
// applied operation becomes one row in the event log.
//
// Concurrency is optimistic per item: an operation carries the hash of the value it was
// based on. If another device changed that same item since, the operation conflicts and
// the server keeps the newer value. Edits to different items always merge.

export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export type Doc = Record<string, unknown>;

export type Op =
  | {kind: 'upsert'; col: string; id: string; value: unknown; base: string | null}
  | {kind: 'remove'; col: string; id: string; base: string}
  | {kind: 'order'; col: string; ids: string[]}
  | {kind: 'set'; field: string; value: unknown; base: string | null};

export type ApplyResult = {store: Doc; applied: Op[]; conflicts: Op[]};

// Values recomputed from other data on both sides. They never travel as changes.
const DERIVED: Record<string, string[]> = {planets: ['entryCount', 'openSignalRatio']};
const SKIP_FIELDS = new Set(['version']);

export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

// cyrb53: fast 53-bit string hash. Used to detect "changed since", not for security.
export function hash(value: unknown): string {
  const str = stableStringify(value);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

type Item = {id: string} & Record<string, unknown>;
const isItem = (v: unknown): v is Item => !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Item).id === 'string';
export const isCollection = (v: unknown): v is Item[] => Array.isArray(v) && v.every(isItem);

function comparable(col: string, item: unknown): unknown {
  const drop = DERIVED[col];
  if (!drop || !isItem(item)) return item;
  const copy: Record<string, unknown> = {...item};
  for (const k of drop) delete copy[k];
  return copy;
}
const itemHash = (col: string, item: unknown) => hash(comparable(col, item));

export function diff(base: Doc, next: Doc): Op[] {
  const ops: Op[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
  for (const key of [...keys].sort()) {
    if (SKIP_FIELDS.has(key)) continue;
    const a = base[key], b = next[key];
    if ((a === undefined || isCollection(a)) && isCollection(b) || isCollection(a) && b === undefined) {
      const before = new Map((a as Item[] | undefined ?? []).map(i => [i.id, i]));
      const after = (b as Item[] | undefined) ?? [];
      const afterIds = new Set(after.map(i => i.id));
      for (const item of after) {
        const old = before.get(item.id);
        if (!old) ops.push({kind: 'upsert', col: key, id: item.id, value: item, base: null});
        else if (itemHash(key, old) !== itemHash(key, item)) ops.push({kind: 'upsert', col: key, id: item.id, value: item, base: itemHash(key, old)});
      }
      for (const [id, old] of before) if (!afterIds.has(id)) ops.push({kind: 'remove', col: key, id, base: itemHash(key, old)});
      const kept = [...before.keys()].filter(id => afterIds.has(id));
      const keptAfter = after.map(i => i.id).filter(id => before.has(id));
      if (kept.join('\u0000') !== keptAfter.join('\u0000')) ops.push({kind: 'order', col: key, ids: after.map(i => i.id)});
      continue;
    }
    if (hash(a) !== hash(b)) ops.push({kind: 'set', field: key, value: b, base: a === undefined ? null : hash(a)});
  }
  return ops;
}

export function apply(store: Doc, ops: Op[]): ApplyResult {
  const next: Doc = {...store};
  const applied: Op[] = [], conflicts: Op[] = [];
  for (const op of ops) {
    if (op.kind === 'set') {
      const cur = next[op.field];
      const curHash = cur === undefined ? null : hash(cur);
      if (curHash === op.base || hash(cur) === hash(op.value)) {next[op.field] = op.value; applied.push(op);}
      else conflicts.push(op);
      continue;
    }
    const list = isCollection(next[op.col]) ? [...(next[op.col] as Item[])] : [];
    if (op.kind === 'order') {
      const pos = new Map(op.ids.map((id, i) => [id, i]));
      const ranked = list.filter(i => pos.has(i.id)).sort((x, y) => pos.get(x.id)! - pos.get(y.id)!);
      let r = 0;
      next[op.col] = list.map(i => pos.has(i.id) ? ranked[r++]! : i);
      applied.push(op);
      continue;
    }
    const at = list.findIndex(i => i.id === op.id);
    const cur = at >= 0 ? list[at] : undefined;
    if (op.kind === 'remove') {
      if (!cur) {applied.push(op); continue;}
      if (itemHash(op.col, cur) !== op.base) {conflicts.push(op); continue;}
      list.splice(at, 1);
      next[op.col] = list;
      applied.push(op);
      continue;
    }
    const same = cur !== undefined && itemHash(op.col, cur) === itemHash(op.col, op.value);
    const fresh = op.base === null ? cur === undefined : cur !== undefined && itemHash(op.col, cur) === op.base;
    if (!same && !fresh) {conflicts.push(op); continue;}
    if (at >= 0) list[at] = op.value as Item; else list.push(op.value as Item);
    next[op.col] = list;
    applied.push(op);
  }
  return {store: next, applied, conflicts};
}

/** Point each op's base at the server's raw copy. A client that normalises what it reads (fills in
 *  defaults, drops bad rows) diffs its normalised copies, but the server compares against raw values. */
export function rebase(ops: Op[], raw: Doc): Op[] {
  return ops.map(op => {
    if (op.kind === 'order') return op;
    if (op.kind === 'set') return {...op, base: raw[op.field] === undefined ? null : hash(raw[op.field])};
    const cur = isCollection(raw[op.col]) ? (raw[op.col] as Item[]).find(i => i.id === op.id) : undefined;
    if (op.kind === 'remove') return cur ? {...op, base: itemHash(op.col, cur)} : op;
    return {...op, base: cur ? itemHash(op.col, cur) : null};
  });
}

// Event-log type for an applied op, e.g. "entries.created", "planets.updated", "settings.set".
export function eventType(op: Op): string {
  if (op.kind === 'set') return `${op.field}.set`;
  if (op.kind === 'order') return `${op.col}.reordered`;
  if (op.kind === 'remove') return `${op.col}.removed`;
  return `${op.col}.${op.base === null ? 'created' : 'updated'}`;
}
