import type {Store} from './model.ts';
import {DWARF_ID, spaceStore, type Point, type UniverseState} from './universe.ts';
import type {UniverseDTO, UniverseLink, UniverseThought} from './thought.ts';
import type {Position3} from './live-universe.ts';
import {tr} from './i18n.ts';

// Adapter: personal Store -> upstream UniverseDTO. One entry is one star, nothing is invented.
const SCALE = .18;
function hashDepth(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return -22 + ((h >>> 0) % 1000) / 1000 * 38;
}
const clamp01 = (v: number) => Math.max(.04, Math.min(.96, v));

export function planetPoint3(id: string, state: Pick<UniverseState, 'positions' | 'positions3D'>): Position3 {
  const saved = state.positions3D?.[id];
  if (saved) return saved;
  const p: Point = state.positions[id] ?? {x: 0, y: 0};
  return [p.x * SCALE, -p.y * SCALE, hashDepth(id)];
}

export function placedFor(planetIds: string[], state: UniverseState): Record<string, Position3> {
  return Object.fromEntries(planetIds.map(id => [id, planetPoint3(id, state)]));
}

export function toUniverseDTO(source: Store, state: UniverseState, guestKey: string): UniverseDTO {
  const store = spaceStore(source);
  const shown = new Set(state.planetIds);
  const planets = store.planets.filter(p => shown.has(p.id)).map(p => {
    const pos = state.positions[p.id] ?? {x: 0, y: 0};
    return {id: p.id, name: p.name, color: p.color, x: clamp01(.5 + pos.x / 900), y: clamp01(.5 + pos.y / 560)};
  });
  const entries = store.entries.filter(e => e.planetIds.some(id => shown.has(id)));
  const ids = new Set(entries.map(e => e.id));
  const thoughts: UniverseThought[] = entries.map(e => ({
    id: e.id, kind: e.kind === 'media' ? 'media' : 'spark', status: 'done',
    preview: e.title || e.body.split('\n')[0] || 'Untitled',
    planetIds: e.planetIds.filter(id => shown.has(id)), openSignals: 0, structure: null, createdAt: e.createdAt,
  }));
  const links: UniverseLink[] = entries.flatMap(e => e.parentEntryId && ids.has(e.parentEntryId)
    ? [{a: e.parentEntryId, b: e.id, kind: e.relation === 'contradicts' ? 'contradicts' as const : 'supports' as const}] : []);
  return {
    space: {id: `personal-${guestKey}`, name: tr('My space'), tagline: '', planets, questions: []},
    thoughts, links, stats: {thoughts: thoughts.length, links: links.length, openSignals: 0}, now: '',
  };
}
export {DWARF_ID};
