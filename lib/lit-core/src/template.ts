import {v2} from '@workspace/life-contract';
import type {Workspace} from './workspace.ts';

// Installing a template (V2_DESIGN §4): a template is data. Its "$ref" strings become new ids, "@<template>:$ref"
// finds what an installed template made, and properties holding a shared role (title, day, start, end, fixed)
// reuse the one the user already has, so every template's items land on the same time grid and day.
const SHARED_ROLES = new Set<v2.Role>(['title', 'day', 'start', 'end', 'fixed']);
export type Installed = {records: {id: string; kind: v2.Template['records'][number]['kind']; body: unknown}[]; pages: v2.Page[]; refs: Record<string, string>; reused: string[]};
const ORDER = ['property', 'database', 'item', 'lens', 'signal', 'rule'] as const;

export function missingRequirements(ws: Workspace, t: v2.Template) {
  const have = ws.screen?.body.installed ?? {};
  return t.requires.filter(id => !have[id]);
}
export function instantiate(ws: Workspace, raw: unknown, newId: () => string, localId: () => string): Installed {
  const t = v2.Template.parse(raw), installed = ws.screen?.body.installed ?? {};
  const missing = missingRequirements(ws, t);
  if (missing.length) throw new Error(`Install first: ${missing.join(', ')}`);
  const refs: Record<string, string> = {}, reused: string[] = [];
  for (const r of t.records) {
    if (refs[r.ref]) throw new Error(`Duplicate ref ${r.ref}`);
    const b = r.body as {role?: v2.Role; kind?: v2.PropertyKind};
    const same = r.kind === 'property' && b.role && SHARED_ROLES.has(b.role) ? [...ws.properties.values()].find(p => p.body.role === b.role && p.body.kind === b.kind) : undefined;
    refs[r.ref] = same?.id ?? newId();
    if (same) reused.push(r.ref);
  }
  const pageRefs: Record<string, string> = {};
  for (const p of t.pages as {id?: string}[]) if (typeof p?.id === 'string' && p.id.startsWith('$')) pageRefs[p.id] = localId();
  const lookup = (s: string): string | undefined => {
    if (refs[s]) return refs[s];
    if (pageRefs[s]) return pageRefs[s];
    const ext = /^@([a-z0-9.-]+):(\$[a-zA-Z0-9_]+)$/.exec(s);
    if (ext) { const id = installed[ext[1]!]?.[ext[2]!]; if (!id) throw new Error(`Unknown ${s}`); return id; }
    return undefined;
  };
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = lookup(v); if (whole) return whole;
      return v.replace(/\{(@[a-z0-9.-]+:)?(\$[a-zA-Z0-9_]+)\}/g, (m, ext: string | undefined, ref: string) => `{${lookup((ext ?? '') + ref) ?? m.slice(1, -1)}}`);
    }
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [lookup(k) ?? k, swap(x)]));
    return v;
  };
  const records: Installed['records'] = [];
  for (const kind of ORDER) for (const r of t.records.filter(x => x.kind === kind)) {
    if (reused.includes(r.ref)) continue;
    let body = swap(r.body) as Record<string, unknown>;
    if (kind === 'database') body = {...body, from: {template: t.id, ref: r.ref, version: t.version}};
    records.push({id: refs[r.ref]!, kind, body: v2.V2_BODIES[kind].parse(body)});
  }
  const fresh = (p: unknown) => {
    const page = swap(p) as v2.Page;
    return v2.Page.parse({...page, id: /^[a-z0-9]{1,16}$/.test(page.id) ? page.id : localId(), widgets: (page.widgets ?? []).map(w => ({...w, id: localId(), parts: (w.parts ?? []).map(x => ({...x, id: localId()}))}))});
  };
  return {records, pages: t.pages.map(fresh), refs: {...refs, ...pageRefs}, reused};
}
