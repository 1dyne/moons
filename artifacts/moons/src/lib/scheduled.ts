// v9 10.1/14.7: structuring runs on a page's last snapshot of a day, after that day is over, a few at a time.
import {useEffect, useRef} from 'react';
import type {Entry, Store} from './model.ts';
import {currentEntries} from './pages.ts';
import type {WorkspaceApi} from './workspace-client.ts';

const STOP = 'moons.autoStructure.stopped';
const day = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** Snapshots waiting for scheduled structuring: the newest snapshot of each page, from an earlier day, not yet structured. */
export function dueSnapshots(store: Pick<Store, 'entries'>, now = new Date()): Entry[] {
  const today = day(now.toISOString());
  return currentEntries(store.entries).filter(e => typeof e.meta?.pageId === 'string' && e.kind === 'dump' && !e.analysis && e.status === 'saved' && day(e.createdAt) !== today)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useScheduledStructuring(ws: WorkspaceApi, store: Store | null | undefined, ready: boolean, limit = 3) {
  const ran = useRef(false);
  useEffect(() => {
    if (!ready || !store || ran.current || store.settings?.autoStructure === false) return;
    try { if (sessionStorage.getItem(STOP)) return; } catch { /* private mode */ }
    ran.current = true;
    const due = dueSnapshots(store).slice(0, limit);
    if (!due.length) return;
    void (async () => {
      for (const e of due) {
        try { await ws.action('analyze', {entryId: e.id}); }
        catch { try { sessionStorage.setItem(STOP, '1'); } catch { /* private */ } break; }
      }
    })();
  }, [ready]);
}
