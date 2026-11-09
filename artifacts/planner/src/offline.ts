// Writes made without a connection wait here (in this browser) and go up in order when the planner is back online.
// Creates carry a client ULID so a replay never duplicates; queued updates replay without a revision check (last write wins).
export type Op = {method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; at: string};
const KEY = 'planner.queue.v1';
const listeners = new Set<() => void>();

function load(): Op[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Op[]; } catch { return []; } }
function save(ops: Op[]) { try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch { /* storage full or blocked: keep in memory only */ memory = ops; } listeners.forEach(f => f()); }
let memory: Op[] | null = null;
const read = () => memory ?? load();

export const queued = () => read().length;
export function enqueue(op: Omit<Op, 'at'>) { save([...read(), {...op, at: new Date().toISOString()}]); }
export function onQueue(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export const isNetworkError = (e: unknown) => e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);

let flushing: Promise<number> | null = null;
/** Send queued writes in order. Stops at the first network failure; a request the server refuses is dropped. */
export function flush(send: (op: Op) => Promise<Response>) {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (let ops = read(); ops.length; ops = read()) {
        let res: Response;
        try { res = await send(ops[0]!); } catch { break; }
        if (!res.ok && res.status >= 500) break;
        save(read().slice(1)); sent++;
      }
    } finally { flushing = null; }
    return sent;
  })();
  return flushing;
}

/** Ops still waiting, for showing them on top of the last records the page could load. */
export const pending = () => read();
