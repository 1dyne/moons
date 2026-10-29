import type {Planet, UniverseDTO, UniverseLink, UniverseThought} from './thought.ts';

export type Position3 = [number, number, number];
export type UniverseSelection = {kind: 'planet' | 'thought'; id: string} | null;
export type Cluster3 = Planet & {position: Position3; count: number};
export type Star3 = UniverseThought & {position: Position3; color: string; pending: boolean; degree: number};
export type UniverseLayout3 = {clusters: Cluster3[]; stars: Star3[]; links: UniverseLink[]};

export function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function seedFor(text: string) {
  let result = 2166136261;
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  return result >>> 0;
}

// Identity-based positions do not jump when polling adds, removes, or reorders other thoughts.
// `placed` holds planets someone moved by hand; their thoughts move with them.
export function layoutUniverse(data: UniverseDTO, placed: Record<string, Position3> = {}): UniverseLayout3 {
  const visible = data.thoughts.filter(thought => thought.status !== 'held');
  const clusters = data.space.planets.map(planet => ({
    ...planet,
    position: placed[planet.id] ?? [(planet.x - .5) * 130, (.5 - planet.y) * 85, -22 + seededRandom(seedFor(planet.id))() * 38] as Position3,
    count: visible.filter(thought => thought.status === 'done' && thought.planetIds.includes(planet.id)).length,
  }));
  const byPlanet = new Map(clusters.map(planet => [planet.id, planet]));
  const ready = new Set(visible.filter(thought => thought.status !== 'saved' && thought.status !== 'analyzing').map(thought => thought.id));
  const links = data.links.filter(link => ready.has(link.a) && ready.has(link.b));
  const degrees = new Map<string, number>();
  for (const link of links) {
    degrees.set(link.a, (degrees.get(link.a) ?? 0) + 1);
    degrees.set(link.b, (degrees.get(link.b) ?? 0) + 1);
  }
  const stars = visible.map(thought => {
    const random = seededRandom(seedFor(thought.id));
    const planets = [...new Set(thought.planetIds)].sort().map(id => byPlanet.get(id)).filter((p): p is Cluster3 => !!p).slice(0, 2);
    const pending = thought.status === 'saved' || thought.status === 'analyzing';
    const center: Position3 = planets.length
      ? [0, 1, 2].map(axis => planets.reduce((sum, planet) => sum + planet.position[axis], 0) / planets.length) as Position3
      : pending ? [0, 28, -3] : [-43, -1, 0];
    const angle = random() * Math.PI * 2;
    const radius = 5 + Math.sqrt(random()) * (planets.length === 2 ? 5 : 11);
    const position: Position3 = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius * .66, center[2] + (random() - .5) * 20];
    return {...thought, position, pending, degree: degrees.get(thought.id) ?? 0,
      color: pending ? '#9AA3B5' : thought.kind === 'decision' ? '#B48CFF' : thought.kind === 'media' ? '#FFE3A3' : planets[0]?.color ?? '#B6C7DA'};
  });
  return {clusters, stars, links};
}

export function selectionPosition(layout: UniverseLayout3, selection: UniverseSelection) {
  if (!selection) return null;
  return (selection.kind === 'planet' ? layout.clusters : layout.stars).find(item => item.id === selection.id)?.position ?? null;
}
