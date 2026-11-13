import {useSyncExternalStore} from 'react';

// 맥락 공유: the goal tapped in a goal widget. Made widgets whose DB links to goals narrow to it (and new items
// written there are linked to it), until the chip is cleared. Kept for this tab only (not saved).
let focus: string | null = null;
const subs = new Set<() => void>();
export const setGoalFocus = (id: string | null) => { focus = id; subs.forEach(f => f()); };
export const useGoalFocus = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => focus);
