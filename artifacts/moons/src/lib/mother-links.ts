// Mother-planet connections. weight = shared node count + inter-node link count. Pure and deterministic.
export type LinkInput = {a: string; b: string};
export type ThoughtInput = {id: string; planetIds: string[]};
export type PlanetEdge = {a: string; b: string; shared: number; links: number; weight: number};

export function aggregatePlanetEdges(thoughts: ThoughtInput[], links: LinkInput[], planetIds?: string[]): PlanetEdge[] {
  const allowed = planetIds ? new Set(planetIds) : null;
  const memberships = new Map<string, Set<string>>();
  for (const t of thoughts) memberships.set(t.id, new Set(t.planetIds.filter(id => !allowed || allowed.has(id))));
  const table = new Map<string, PlanetEdge>();
  const slot = (x: string, y: string) => {
    const [a, b] = x < y ? [x, y] : [y, x], key = `${a}\u0000${b}`;
    let edge = table.get(key);
    if (!edge) table.set(key, edge = {a, b, shared: 0, links: 0, weight: 0});
    return edge;
  };
  for (const set of memberships.values()) {
    const ids = [...set].sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) slot(ids[i], ids[j]).shared++;
  }
  const seen = new Set<string>();
  for (const link of links) {
    const key = [link.a, link.b].sort().join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    const A = memberships.get(link.a), B = memberships.get(link.b);
    if (!A || !B) continue;
    const pairs = new Set<string>();
    for (const x of A) for (const y of B) if (x !== y) pairs.add(x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`);
    for (const pair of pairs) { const [x, y] = pair.split('\u0000'); slot(x, y).links++; }
  }
  const out = [...table.values()].filter(e => e.shared + e.links > 0);
  for (const e of out) e.weight = e.shared + e.links;
  return out.sort((p, q) => q.weight - p.weight || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}
export const edgeLabel = (e: PlanetEdge, nameOf: (id: string) => string) =>
  `${nameOf(e.a)} and ${nameOf(e.b)}: ${e.shared} shared ${e.shared === 1 ? 'node' : 'nodes'}, ${e.links} ${e.links === 1 ? 'link' : 'links'}, width ${e.weight}`;
