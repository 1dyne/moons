import {useEffect, useRef} from 'react';

// The phone's back button (and the browser's): it closes whatever is open on top — a sheet, a popup, a row's ⋯ menu,
// the 되돌리기 bar (which undoes) — before it leaves the page.
// One extra history entry stands in for everything open ("armed"). Back closes the top thing and re-arms if more is
// open. When the last open thing closes in the app, the entry is taken back once; anything opening meanwhile waits
// for that to finish, so history is never moved twice at once.
const stack: {id: number; close: () => void}[] = [];
let seq = 0, armed = false, pendingBack = false;
const arm = () => { if (!armed && !pendingBack && stack.length) { history.pushState({litBack: true}, ''); armed = true; } };
if (typeof window !== 'undefined') addEventListener('popstate', () => {
  if (pendingBack) { pendingBack = false; armed = false; arm(); return; }
  if (!armed) return;
  armed = false;
  stack.pop()?.close();
  arm();
});
/** While `open`, the back button calls `close` instead of leaving. */
export function useBack(open: boolean, close: () => void) {
  const fn = useRef(close); fn.current = close;
  useEffect(() => {
    if (!open) return;
    const id = ++seq;
    stack.push({id, close: () => fn.current()});
    arm();
    return () => {
      const i = stack.findIndex(x => x.id === id);
      if (i < 0) return; // closed by back: already taken off
      stack.splice(i, 1);
      if (!stack.length && armed && !pendingBack) { pendingBack = true; history.back(); }
    };
  }, [open]);
}
