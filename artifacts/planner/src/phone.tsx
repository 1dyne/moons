import {useEffect, useState, useSyncExternalStore} from 'react';
import {isDecor, type Widget} from '@workspace/planner-spec';

// Phones get their own arrangement: one column in the user's mobile order, cards folded or open,
// bottom tabs, a week strip and a + button. The PC layout (x/y on the lattice) is not used on phones.
const Q = '(max-width: 700px)';
export function usePhone() {
  const [phone, setPhone] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(Q).matches);
  useEffect(() => { const m = matchMedia(Q), f = () => setPhone(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return phone;
}

/** Shown open on a phone unless the user decided otherwise in 모바일 배치. */
const OPEN = new Set(['focus', 'tasks', 'mission', 'routine', 'energy', 'week-view', 'month-view', 'goals-view', 'insights-view', 'list', 'table', 'wishes', 'custom']);
export const openByDefault = (w: Widget) => typeof w.options.mOpen === 'boolean' ? w.options.mOpen : OPEN.has(w.type);
export const hiddenOnPhone = (w: Widget) => typeof w.options.mHide === 'boolean' ? w.options.mHide : isDecor(w.type);
/** The phone order: the user's own (mOrder), else top-to-bottom, left-to-right of the PC page. */
export function phoneOrder(ws: Widget[]) {
  const pc = [...ws].sort((a, b) => a.y - b.y || a.x - b.x);
  return pc.map((w, i) => ({w, k: typeof w.options.mOrder === 'number' ? w.options.mOrder : 1000 + i})).sort((a, b) => a.k - b.k).map(x => x.w);
}

// Folding a card on the phone is remembered on the device (it is a view choice, not a planner change).
const KEY = 'lit.mfold', subs = new Set<() => void>();
let fold: Record<string, boolean> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
export const useFold = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => fold, () => fold);
export function setFold(id: string, open: boolean) {
  fold = {...fold, [id]: open};
  try { localStorage.setItem(KEY, JSON.stringify(fold)); } catch { /* this visit only */ }
  subs.forEach(f => f());
}
