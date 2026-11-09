import type {LifeRecord, Task} from '@workspace/life-contract';
import type {Planner} from '../data.ts';
import type {Timer} from './Focus.tsx';

// Shared by every day layout (no JSX, no imports back into the screens: keeps module init order safe).
export type Nav = {day: string; setDay: (d: string) => void; openGoal: (id: string) => void};
export type Ctx = {p: Planner; day: string; nav: Nav; now: () => string; timer: Timer | null; color: (k: string) => string};
export const MARK: Record<string, string> = {done: '○', partial: '△', missed: '×', in_progress: '◐', postponed: '→', cancelled: '–', unknown: ''};
export const NEXT: Record<string, Task['outcome']['result']> = {unknown: 'done', in_progress: 'done', done: 'partial', partial: 'missed', missed: 'unknown'};
export const saveTask = (ctx: Ctx, t: LifeRecord<'task'>, patch: Partial<Task>) => ctx.p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, ...patch}, baseRevision: t.revision});
export const outcome = (t: LifeRecord<'task'>, o: Partial<Task['outcome']>): Partial<Task> => ({outcome: {...t.body.outcome, ...o}});
/** Moving a task keeps history: the original says "postponed to X", X starts fresh on the new day. */
export async function moveTo(ctx: Ctx, t: LifeRecord<'task'>, day: string) {
  const next = await ctx.p.write(null, {kind: 'task', logicalDay: day, body: {...t.body, outcome: {}}});
  if (next) await saveTask(ctx, t, outcome(t, {result: 'postponed', postponedTo: next.id, reportedAt: ctx.now()}));
}

