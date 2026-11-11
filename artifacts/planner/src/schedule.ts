import type {LifeRecord, Task} from '@workspace/life-contract';

// A day's tasks as a planner page: tasks with a start time first, in time order; the rest in the order the user dragged them.
type T = LifeRecord<'task'>;
type When = Task['plan']['start'];
const dayStart = (day: string) => new Date(`${day}T00:00:00`).getTime();
/** Minutes after the local midnight that opens the day (a 01:00 task of a late day is 1500). */
export const minuteOf = (day: string, iso: string) => Math.round((Date.parse(iso) - dayStart(day)) / 60000);
export const isoAt = (day: string, minute: number) => new Date(dayStart(day) + minute * 60000).toISOString();
export const at = (day: string, minute: number): NonNullable<When> => ({value: isoAt(day, minute), precision: 'minute'});
export const clockOf = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** "HH:MM" typed on the day → that instant (hours before the day boundary count as the next calendar date). */
export const fromClock = (day: string, hhmm: string, boundaryHour = 4) => {
  const [h, m] = hhmm.split(':').map(Number);
  const minute = h! * 60 + m!;
  return at(day, minute < boundaryHour * 60 ? minute + 1440 : minute);
};

export const timed = (t: T) => !!t.body.plan.start && t.body.plan.start.precision === 'minute';
const startOf = (t: T) => Date.parse(t.body.plan.start!.value);
const lengthOf = (t: T) => t.body.plan.end ? Math.max(5, (Date.parse(t.body.plan.end.value) - startOf(t)) / 60000) : null;

export function sortDay(tasks: T[]) {
  const a = tasks.filter(timed).sort((x, y) => startOf(x) - startOf(y) || x.createdAt.localeCompare(y.createdAt));
  const b = tasks.filter(t => !timed(t)).sort((x, y) => (x.body.order ?? 1e9) - (y.body.order ?? 1e9) || (x.body.priority ?? 9) - (y.body.priority ?? 9) || x.createdAt.localeCompare(y.createdAt));
  return [...a, ...b];
}

export type Patch = {id: string; plan?: Partial<Task['plan']>; order?: number};
/** Drag result. `list` is shown order (sortDay), the task `id` is dropped at index `to` of the list without it.
 *  - Among timed tasks: the time slots stay where they are and the tasks take them in their new order (each keeps its length).
 *  - An untimed task dropped among timed ones takes the start of the one it lands on; later ones move only if they would overlap.
 *  - A timed task dropped among untimed ones loses its time.
 *  - Untimed tasks get their new order. */
export function reorder(list: T[], id: string, to: number, defaultMin = 30): Patch[] {
  const moved = list.find(t => t.id === id);
  if (!moved) return [];
  const rest = list.filter(t => t.id !== id), nTimed = rest.filter(timed).length;
  const i = Math.max(0, Math.min(to, rest.length));
  const wasTimed = timed(moved), intoTimed = wasTimed ? i <= nTimed : i < nTimed;
  const out: Patch[] = [];
  const seq = [...rest]; seq.splice(i, 0, moved);
  if (intoTimed) {
    const row = seq.filter(t => t === moved || timed(t));
    if (wasTimed) {
      const slots = row.map(startOf).sort((a, b) => a - b);
      row.forEach((t, k) => {
        if (slots[k] === startOf(t)) return;
        const len = lengthOf(t);
        out.push({id: t.id, plan: {start: {value: new Date(slots[k]!).toISOString(), precision: 'minute'}, end: len === null ? null : {value: new Date(slots[k]! + len * 60000).toISOString(), precision: 'minute'}}});
      });
    } else {
      const k = row.indexOf(moved), next = row[k + 1]!;
      let s = startOf(next), e = s + (moved.body.plan.estimateMin ?? defaultMin) * 60000;
      out.push({id: moved.id, plan: {start: {value: new Date(s).toISOString(), precision: 'minute'}, end: {value: new Date(e).toISOString(), precision: 'minute'}}});
      for (const t of row.slice(k + 1)) {
        if (startOf(t) >= e) break;
        const len = lengthOf(t) ?? defaultMin;
        s = e; e = s + len * 60000;
        out.push({id: t.id, plan: {start: {value: new Date(s).toISOString(), precision: 'minute'}, end: t.body.plan.end ? {value: new Date(e).toISOString(), precision: 'minute'} : null}});
      }
    }
  } else if (wasTimed) out.push({id: moved.id, plan: {start: null, end: null}});
  seq.filter(t => t === moved ? !intoTimed : !timed(t)).forEach((t, k) => { if (t.body.order !== k * 10) { const p = out.find(x => x.id === t.id); if (p) p.order = k * 10; else out.push({id: t.id, order: k * 10}); } });
  return out;
}
