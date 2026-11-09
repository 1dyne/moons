// v9 7.1 우주 보기: a flat graph. Planets grow with what is stored; zooming in turns dots into cards.
import type {Store} from './model.ts';
import {currentEntries} from './pages.ts';
import {ancestors, childrenOf, colorOf, roots, withAncestors} from './planets.ts';
import {hash01} from './knowledge-v9.ts';

export const WORLD = {w: 1600, h: 1060};
export type GPlanet = {id: string; name: string; x: number; y: number; r: number; color: string; parent?: string; root: string; depth: number; count: number};
export type GEntry = {id: string; title: string; x: number; y: number; planet?: string; root: string; color: string; kind: string; knowledge?: string};
export type GConcept = {id: string; name: string; x: number; y: number; root: string; definition?: string};
export type GSat = {id: string; name: string; url?: string; x: number; y: number; root: string};
export type GEdge = {a: string; b: string; kind: 'planet' | 'child' | 'entry' | 'link'; weight: number; label?: string};
export type Graph = {planets: GPlanet[]; entries: GEntry[]; concepts: GConcept[]; sats: GSat[]; edges: GEdge[]; pos: Map<string, {x: number; y: number}>};
export const DWARF = '__dwarf';

export function buildGraph(store: Store, extraLinks: {from: string; to: string; label: string}[] = []): Graph {
  const entries = currentEntries(store.entries).filter(e => e.kind !== 'media' || !e.meta?.pageId);
  const ps = store.planets, pos = new Map<string, {x: number; y: number}>();
  const count = new Map<string, number>();
  for (const e of entries) for (const id of withAncestors(e.planetIds, ps)) count.set(id, (count.get(id) ?? 0) + 1);
  const planets: GPlanet[] = [];
  const place = (id: string, x: number, y: number) => { pos.set(id, {x, y}); };
  for (const p of roots(ps)) {
    const n = count.get(p.id) ?? 0, r = Math.round(18 + Math.sqrt(n) * 9);
    const x = 120 + (p.position.x / 100) * (WORLD.w - 240), y = 100 + (p.position.y / 100) * (WORLD.h - 200);
    planets.push({id: p.id, name: p.name, x, y, r, color: p.color, root: p.id, depth: 0, count: n}); place(p.id, x, y);
    const walk = (parent: string, depth: number, px: number, py: number, pr: number) => {
      const kids = childrenOf(parent, ps);
      kids.forEach((k, i) => {
        const a = (i / Math.max(1, kids.length)) * Math.PI * 2 + hash01(k.id) * .6, dist = pr + 46 + depth * 8;
        const kx = px + Math.cos(a) * dist, ky = py + Math.sin(a) * dist, kn = count.get(k.id) ?? 0, kr = Math.round(8 + Math.sqrt(kn) * 5);
        planets.push({id: k.id, name: k.name, x: kx, y: ky, r: kr, color: colorOf(k, ps), parent, root: p.id, depth, count: kn}); place(k.id, kx, ky);
        if (depth < 4) walk(k.id, depth + 1, kx, ky, kr);
      });
    };
    walk(p.id, 1, x, y, r);
  }
  const dwarf = {x: 110, y: WORLD.h - 90};
  const deepest = (ids: string[]) => ids.filter(id => ps.some(p => p.id === id)).sort((a, b) => ancestors(b, ps).length - ancestors(a, ps).length)[0];
  const out: GEntry[] = [];
  for (const e of entries) {
    const home = deepest(e.planetIds), hp = home ? pos.get(home) : dwarf, hr = home ? planets.find(p => p.id === home)?.r ?? 20 : 12;
    const a = hash01(e.id, 3) * Math.PI * 2, d = hr + 26 + hash01(e.id, 4) * 40;
    const x = hp!.x + Math.cos(a) * d, y = hp!.y + Math.sin(a) * d;
    const root = home ? (ancestors(home, ps).at(-1) ?? home) : DWARF;
    const planet = home ? ps.find(p => p.id === home) : undefined;
    out.push({id: e.id, title: e.title || e.body.slice(0, 40), x, y, planet: home, root, color: planet ? colorOf(planet, ps) : '#8a8b84', kind: e.kind, knowledge: e.knowledge}); place(e.id, x, y);
  }
  const concepts: GConcept[] = [];
  for (const c of store.concepts ?? []) {
    const ent = out.find(x => c.mentions.some(m => m.entryId === x.id)); if (!ent) continue;
    const a = hash01(c.id, 5) * Math.PI * 2, d = 34 + hash01(c.id, 6) * 30;
    const x = ent.x + Math.cos(a) * d, y = ent.y + Math.sin(a) * d;
    concepts.push({id: c.id, name: c.name, x, y, root: ent.root, definition: c.definition[0]?.text}); place('c:' + c.id, x, y);
  }
  const sats: GSat[] = [];
  for (const s of store.satellites ?? []) {
    if (s.kind !== 'external' || s.show === false) continue;
    const home = s.planetIds.find(id => pos.has(id)); const hp = home ? pos.get(home)! : {x: WORLD.w - 120, y: 80 + sats.length * 40};
    const pr = planets.find(p => p.id === home)?.r ?? 0, a = -Math.PI / 4 + hash01(s.id) * .6;
    sats.push({id: s.id, name: s.name, url: s.url, x: hp.x + Math.cos(a) * (pr + 30), y: hp.y + Math.sin(a) * (pr + 30), root: home ? (ancestors(home, ps).at(-1) ?? home) : ''});
  }
  const edges: GEdge[] = [];
  const pairs = new Map<string, number>();
  for (const e of entries) { const r = [...new Set(withAncestors(e.planetIds, ps).filter(id => !ps.find(p => p.id === id)?.parentId))].sort(); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const k = r[i] + '|' + r[j]; pairs.set(k, (pairs.get(k) ?? 0) + 1); } }
  for (const [k, w] of pairs) { const [a, b] = k.split('|'); edges.push({a: a!, b: b!, kind: 'planet', weight: w}); }
  for (const p of planets) if (p.parent) edges.push({a: p.parent, b: p.id, kind: 'child', weight: 1});
  for (const e of out) if (e.planet) edges.push({a: e.planet, b: e.id, kind: 'entry', weight: 1});
  for (const l of store.links ?? []) if (pos.has(l.from) && pos.has(l.to)) edges.push({a: l.from, b: l.to, kind: 'link', weight: 1, label: l.reason || undefined});
  for (const l of extraLinks) if (pos.has(l.from) && pos.has(l.to)) edges.push({a: l.from, b: l.to, kind: 'link', weight: 1, label: l.label || undefined});
  return {planets, entries: out, concepts, sats, edges, pos};
}
