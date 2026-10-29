export const COMPARE_MAX = 3;
export function toggleCompare(ids: string[], id: string): {ids: string[]; full: boolean} {
  if (ids.includes(id)) return {ids: ids.filter(x => x !== id), full: false};
  if (ids.length >= COMPARE_MAX) return {ids, full: true};
  return {ids: [...ids, id], full: false};
}
// Original content only: resolves ids to the untouched source entries.
export function compareEntries<T extends {id: string}>(ids: string[], entries: T[]): T[] {
  return ids.map(id => entries.find(e => e.id === id)).filter((e): e is T => !!e);
}
