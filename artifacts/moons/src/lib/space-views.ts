// v9 7.1: saved views in Space — the graph, boards, tables — with their filters. Kept in the workspace (synced).
import type {Store} from './model.ts';

export type BoardItem = {id: string; ref?: {type: 'entry' | 'concept' | 'asset'; id: string}; text?: string; kind: 'ref' | 'sticky' | 'image'; x: number; y: number; w: number; color?: string; assetId?: string};
export type BoardLink = {id: string; from: string; to: string; label: string; scope: 'all' | 'board'};
export type SpaceViewDef = {
  id: string; name: string; type: 'graph' | 'board' | 'table';
  filter?: {planetId?: string; entered?: string};
  board?: {style: 'pin' | 'mood'; items: BoardItem[]; links: BoardLink[]};
  table?: {columns: {id: string; name: string}[]; cells: Record<string, Record<string, string>>; planetId?: string};
  createdAt: string; updatedAt: string;
};
export const spaceViewsOf = (s: Store) => ((s as {spaceViews?: SpaceViewDef[]}).spaceViews ?? []);
export function putView(s: Store, v: SpaceViewDef): Store {
  const list = spaceViewsOf(s), next = {...v, updatedAt: new Date().toISOString()};
  return {...s, spaceViews: list.some(x => x.id === v.id) ? list.map(x => x.id === v.id ? next : x) : [...list, next]} as Store;
}
export const dropView = (s: Store, id: string): Store => ({...s, spaceViews: spaceViewsOf(s).filter(v => v.id !== id)} as Store);

/** Board lines meant for the whole Space (scope 'all') that join two notes also show in the graph. */
export const boardLinksForGraph = (s: Store) => spaceViewsOf(s).flatMap(v => (v.board?.links ?? []).filter(l => l.scope === 'all').map(l => {
  const it = (id: string) => v.board!.items.find(i => i.id === id)?.ref;
  const a = it(l.from), b = it(l.to);
  return a?.type === 'entry' && b?.type === 'entry' ? {from: a.id, to: b.id, label: l.label} : null;
}).filter((x): x is {from: string; to: string; label: string} => !!x));

/** v9 7.1: a column's kind read from its values (number / date / text). */
export function columnKind(values: string[]): 'number' | 'date' | 'text' {
  const v = values.map(x => x.trim()).filter(Boolean); if (!v.length) return 'text';
  if (v.every(x => /^-?\d+(\.\d+)?$/.test(x))) return 'number';
  if (v.every(x => /^\d{4}-\d{1,2}-\d{1,2}$/.test(x) || !Number.isNaN(Date.parse(x)) && /\d{4}/.test(x))) return 'date';
  return 'text';
}
