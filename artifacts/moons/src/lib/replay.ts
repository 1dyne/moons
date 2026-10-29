import {apply, type Doc, type Op} from '@workspace/moons-sync';
import {withStats, type Store} from './model.ts';

export type LogEvent = {seq: number; at: string; type: string; op: Op};
export type Frame = {at: string; type: string; store: Store};

// Only changes that show in the universe make frames; chats, settings and drafts do not.
const VISIBLE = /^(entries|planets|links|views|universe)\./;

export async function fetchEvents(limit = 20000): Promise<LogEvent[]> {
  const out: LogEvent[] = [];
  let after = 0;
  while (out.length < limit) {
    const res = await fetch(`${import.meta.env.BASE_URL}api/workspace/events?after=${after}&limit=2000`, {credentials: 'include'});
    if (!res.ok) throw new Error(`Could not read the history (${res.status}).`);
    const page = await res.json() as {events: LogEvent[]; next: number | null};
    out.push(...page.events);
    if (page.next === null) break;
    after = page.next;
  }
  return out;
}

/** Rebuild the space change by change. Baseline events are sorted by the time their items were made. */
export function buildFrames(events: LogEvent[]): Frame[] {
  const ordered = [...events.filter(e => e.type !== 'conflict.kept_newer')].sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
  let doc: Doc = {version: 1, entries: [], planets: []};
  const frames: Frame[] = [];
  for (const e of ordered) {
    doc = apply(doc, [e.op]).store;
    if (VISIBLE.test(e.type)) frames.push({at: e.at, type: e.type, store: withStats(doc as unknown as Store)});
  }
  return frames;
}
