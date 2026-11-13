import {z} from 'zod';
import {Flow, Logic, MadeOptions, TypeDef, newLogicId} from './logic.ts';
import type {Signal} from './signal-schema.ts';

// A made widget as one package (docs/lit/BLOCKS.md §8): its DBs, rules and screen, with the version of the
// widget contract it was made for. Saved to the library, shared, sold; installed into anyone's logic.
/** The widget contract: what a package's options, DBs and rules mean. Raise it when their meaning changes. */
export const LOGIC_CONTRACT = 1;
export const MadePack = z.object({
  contract: z.number().int().min(1),
  title: z.string().min(1).max(40),
  desc: z.string().max(300).default(''),
  options: MadeOptions,
  types: z.array(TypeDef).min(1).max(8),
  // Rules written by hand or by an LLM may come without ids; they get one.
  flows: z.preprocess(v => Array.isArray(v) ? v.map(f => f && typeof f === 'object' && !('id' in f) ? {...f, id: newLogicId()} : f) : v, z.array(Flow).max(20)).default([]),
}).refine(p => p.contract <= LOGIC_CONTRACT, {message: '더 새로운 lit에서 만든 위젯이에요. 앱을 새로 고친 뒤 설치해요.'})
  .refine(p => p.types.some(t => t.id === p.options.type), {message: '위젯의 DB가 꾸러미에 없어요.'});
export type MadePack = z.infer<typeof MadePack>;

const touches = (f: Flow, ids: Set<string>) => ids.has(f.on.type) || f.do.some(a => 'type' in a && ids.has(a.type)) || f.ifAgg.some(c => ids.has(c.type));
/** The package for one widget: its DB, the DBs its rules write to, and the rules on them. Goals are the user's own, so they are left out. */
export function packOf(title: string, options: MadeOptions, logic: Logic, desc = ''): MadePack {
  const ids = new Set([options.type]);
  const flows = logic.flows.filter(f => touches(f, ids));
  for (const f of flows) for (const a of f.do) if ('type' in a) ids.add(a.type);
  const clean = (s: Signal): Signal => ({...s, goalId: ''});
  return MadePack.parse({contract: LOGIC_CONTRACT, title, desc, options,
    types: logic.types.filter(t => ids.has(t.id)),
    flows: logic.flows.filter(f => touches(f, ids)).map(f => ({...f, when: f.when.map(clean), on: {...f.on, signal: f.on.signal ? clean(f.on.signal) : null}}))});
}

const sameShape = (a: TypeDef, b: TypeDef) => a.fields.map(f => `${f.id}:${f.kind}`).sort().join() === b.fields.map(f => `${f.id}:${f.kind}`).sort().join();
/** Put a package into the user's logic: a DB already there with the same properties is shared (its records join
 *  the widget); any other clash gets a new id. Rules get new ids, so installing twice never doubles a rule's id. */
export function installPack(logic: Logic, raw: unknown): {logic: Logic; options: MadeOptions; title: string} {
  const pack = MadePack.parse(raw), map = new Map<string, string>();
  const types = [...logic.types];
  for (const t of pack.types) {
    const have = types.find(x => x.id === t.id);
    if (have && sameShape(have, t)) { map.set(t.id, t.id); continue; }
    let id = t.id, n = 2;
    while (types.some(x => x.id === id)) id = `${t.id.slice(0, 20)}${n++}`;
    map.set(t.id, id); types.push({...t, id});
  }
  const m = (id: string) => map.get(id) ?? id;
  const sig = (s: Signal): Signal => ({...s, type: s.type ? m(s.type) : s.type});
  const had = new Set(logic.flows.map(f => f.id));
  // A shared DB may already have this package's rules (installed before): skip a rule that is already there.
  const key = (f: Flow) => JSON.stringify({...f, id: '', name: ''});
  const existing = new Set(logic.flows.map(key));
  const flows = pack.flows.map(f => ({...f, on: {...f.on, type: m(f.on.type), signal: f.on.signal ? sig(f.on.signal) : null}, when: f.when.map(sig),
    ifAgg: f.ifAgg.map(c => ({...c, type: m(c.type)})), do: f.do.map(a => 'type' in a ? {...a, type: m(a.type)} : a)}) as Flow)
    .filter(f => !existing.has(key(f)))
    .map(f => { let id = f.id; while (had.has(id)) id = newLogicId(); had.add(id); return {...f, id}; });
  return {logic: {types, flows: [...logic.flows, ...flows]}, options: {...pack.options, type: m(pack.options.type)}, title: pack.title};
}
/** What a package's code needs approved: only the developer console runs code. */
export const packCode = (p: MadePack) => p.options.design.mode === 'code' ? {code: p.options.design.js, html: p.options.design.html, css: p.options.design.css, permissions: [] as never[]} : null;
