import {useRef, useState} from 'react';

/** Drag to reorder with a finger or a mouse (pointer events, so it works on phones where HTML drag-and-drop does not).
 *  Rows carry data-sort={index}; the ⠿ handle starts the drag. onDrop gets the index in the list without the dragged row. */
export function useDragSort(ids: string[], onDrop: (id: string, to: number) => void) {
  const [drag, setDrag] = useState<{id: string; to: number; line: number} | null>(null);
  const box = useRef<HTMLElement | null>(null);
  const target = (e: React.PointerEvent) => {
    const root = box.current;
    if (!root) return null;
    const rows = [...root.querySelectorAll<HTMLElement>(':scope > [data-sort]')];
    let pos = rows.length, line = rows.at(-1)?.getBoundingClientRect().bottom ?? 0;
    for (const [i, r] of rows.entries()) { const b = r.getBoundingClientRect(); if (e.clientY < b.top + b.height / 2) { pos = i; line = b.top; break; } }
    return {pos, line: line - root.getBoundingClientRect().top};
  };
  const handle = (id: string) => ({
    className: 'drag-handle', 'aria-label': '끌어서 순서 바꾸기', title: '끌어서 순서 바꾸기', role: 'button', tabIndex: -1,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      box.current = e.currentTarget.closest<HTMLElement>('[data-sort-box]');
      const t = target(e); setDrag({id, to: t?.pos ?? 0, line: t?.line ?? 0});
    },
    onPointerMove: (e: React.PointerEvent) => { if (!drag) return; const t = target(e); if (t && (t.pos !== drag.to || t.line !== drag.line)) setDrag({...drag, to: t.pos, line: t.line}); },
    onPointerUp: () => {
      if (!drag) return;
      const from = ids.indexOf(drag.id), to = drag.to > from ? drag.to - 1 : drag.to;
      setDrag(null);
      if (from >= 0 && to !== from) onDrop(drag.id, to);
    },
    onPointerCancel: () => setDrag(null),
  });
  const indicator = drag ? <i className="drop-line" style={{top: drag.line}} aria-hidden="true" /> : null;
  return {handle, dragging: drag?.id ?? null, indicator};
}
