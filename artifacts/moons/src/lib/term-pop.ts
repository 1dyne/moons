// The "show word links" switch (per device) and the one popover a tapped word opens.
import {useSyncExternalStore} from 'react';

const LINKS = 'moons.links';
const linkListeners = new Set<() => void>();
const readLinks = () => { try { return localStorage.getItem(LINKS) !== 'off'; } catch { return true; } };
export function useLinks(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(f => { linkListeners.add(f); return () => { linkListeners.delete(f); }; }, readLinks, () => true);
  return [on, v => { try { localStorage.setItem(LINKS, v ? 'on' : 'off'); } catch { /* private window: this page only */ } linkListeners.forEach(f => f()); }];
}

export type Pop = {id: string; rect: {left: number; top: number; bottom: number; width: number}; open?: (id: string) => void} | null;
let pop: Pop = null;
const popListeners = new Set<() => void>();
export function showConcept(p: Pop) { pop = p; popListeners.forEach(f => f()); }
export const usePop = () => useSyncExternalStore(f => { popListeners.add(f); return () => { popListeners.delete(f); }; }, () => pop, () => null);
