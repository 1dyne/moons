// v9 4.8: mother planets with parents. Only the chosen planets are stored; parents are worked out.
import type {Planet} from './model.ts';

export type TreePlanet = Planet & {parentId?: string};
const parentOf = (p: Planet) => (p as TreePlanet).parentId;

export function ancestors(id: string, planets: Planet[]): string[] {
  const byId = new Map(planets.map(p => [p.id, p])), out: string[] = [], seen = new Set([id]);
  let cur = byId.get(id), up = cur && parentOf(cur);
  while (up && !seen.has(up) && byId.has(up)) { out.push(up); seen.add(up); cur = byId.get(up); up = cur && parentOf(cur); }
  return out;
}
/** Chosen planets plus every parent above them. */
export function withAncestors(ids: string[], planets: Planet[]): string[] {
  return [...new Set(ids.flatMap(id => [id, ...ancestors(id, planets)]))];
}
/** The top-level planet ("분야") an id belongs to. */
export const rootOf = (id: string, planets: Planet[]) => ancestors(id, planets).at(-1) ?? id;
export const childrenOf = (id: string | undefined, planets: Planet[]) => planets.filter(p => (parentOf(p) ?? undefined) === id);
export const roots = (planets: Planet[]) => planets.filter(p => !parentOf(p) || !planets.some(q => q.id === parentOf(p)));

/** Planets in tree order with depth. */
export function planetTree(planets: Planet[]) {
  const out: (TreePlanet & {depth: number})[] = [], seen = new Set<string>();
  const walk = (list: Planet[], depth: number) => { for (const p of list) { if (seen.has(p.id)) continue; seen.add(p.id); out.push({...p, depth}); walk(childrenOf(p.id, planets), depth + 1); } };
  walk(roots(planets), 0);
  return out;
}

/** Removing a parent lifts its children one level (v9 4.8). Pages keep their own choices. */
export function removePlanet(planets: Planet[], id: string): Planet[] {
  const gone = planets.find(p => p.id === id); const up = gone ? parentOf(gone) : undefined;
  return planets.filter(p => p.id !== id).map(p => parentOf(p) === id ? ({...p, parentId: up} as Planet) : p);
}

/** A child's colour stays in its parent's hue unless the user picked one (v9 4.8). */
export function shade(hex: string, step: number) {
  const n = parseInt(hex.replace('#', ''), 16); if (!Number.isFinite(n)) return hex;
  const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, t = Math.min(.7, .18 * step);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return '#' + [mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function colorOf(p: Planet, planets: Planet[]) {
  if ((p as {colorBy?: string}).colorBy === 'user' || !parentOf(p)) return p.color;
  const up = ancestors(p.id, planets), root = planets.find(x => x.id === up.at(-1));
  return root ? shade(root.color, up.length) : p.color;
}
