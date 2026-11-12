import {useSyncExternalStore} from 'react';
import {Logic, activeMode, currentEnergy, type Mode, type PlannerSpec} from '@workspace/planner-spec';
import type {AnyRecord} from '@workspace/life-contract';

// Which mode is on for a day: the user's choice for that day (kept on the device), else the energy rule.
const KEY = 'lit.mode', subs = new Set<() => void>();
let picks: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
export function setModePick(day: string, v: string | null) {
  picks = {...picks}; if (v === null) delete picks[day]; else picks[day] = v;
  // Only the last two weeks are kept.
  for (const d of Object.keys(picks).sort().slice(0, -14)) delete picks[d];
  try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch { /* this visit only */ }
  subs.forEach(f => f());
}
const usePicks = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => picks, () => picks);
export function useMode(spec: PlannerSpec | undefined, records: AnyRecord[], day: string): {mode: Mode | null; energy: number | null; pick: string | null; modes: Mode[]} {
  const all = usePicks(), modes = spec?.modes ?? [];
  if (!modes.length) return {mode: null, energy: null, pick: null, modes};
  const energy = currentEnergy(records, Logic.safeParse(spec?.logic ?? {}).data, day)?.score ?? null, pick = all[day] ?? null;
  return {mode: activeMode(modes, energy, pick), energy, pick, modes};
}

/** The mode whose own page 꾸미기 should open next (set from 메뉴 → 모드). */
let editing: string | null = null;
export const editModePage = (id: string | null) => { editing = id; };
export const modePageToEdit = () => editing;
