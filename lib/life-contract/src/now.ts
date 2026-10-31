import {CONTRACT_VERSION, shareable, type AnyRecord, type Goal, type LifeRecord, type Routine, type Scope, type Settings, type Task} from './records.ts';
import {localTime, logicalDay, periodContains, routineDue} from './day.ts';

const live = (r: AnyRecord) => !r.deletedAt;
const tasksOf = (records: AnyRecord[]) => records.filter((r): r is LifeRecord<'task'> => r.kind === 'task' && live(r));
const goalsOf = (records: AnyRecord[]) => records.filter((r): r is LifeRecord<'goal'> => r.kind === 'goal' && live(r));
const routinesOf = (records: AnyRecord[]) => records.filter((r): r is LifeRecord<'routine'> => r.kind === 'routine' && live(r));
export const qty = (q: {amount: number; unit: string} | null | undefined) => q ? `${q.amount} ${q.unit}`.trim() : null;

/** A goal and every goal below it (year → month → week). */
export function goalFamily(goalId: string, records: AnyRecord[]) {
  const goals = goalsOf(records), ids = new Set([goalId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const g of goals) if (g.body.parentGoalId && ids.has(g.body.parentGoalId) && !ids.has(g.id)) { ids.add(g.id); grew = true; }
  }
  return ids;
}

/** Tasks that count toward a goal: linked to it or to a goal below it, on a day inside the goal's period. */
export function linkedTasks(goal: LifeRecord<'goal'>, records: AnyRecord[]) {
  const family = goalFamily(goal.id, records);
  return tasksOf(records).filter(t => t.body.goalIds.some(id => family.has(id)) && (!t.logicalDay || periodContains(goal.body.period, t.logicalDay)));
}

/** Progress from linked outcomes. Null without a target: there is nothing to measure against. */
export function goalProgress(goal: LifeRecord<'goal'>, records: AnyRecord[], asOf: string) {
  const target = goal.body.target;
  if (!target) return null;
  const tasks = linkedTasks(goal, records).filter(t => t.body.plan.state !== 'dropped');
  const done = tasks.filter(t => t.body.outcome.result === 'done');
  let amount: number, unit = target.unit;
  if (target.aggregation === 'count') amount = done.length;
  else if (target.aggregation === 'sum') amount = tasks.reduce((sum, t) => {
    const o = t.body.outcome;
    const u = o.unit ?? t.body.plan.target?.unit;
    if (u !== target.unit || !['done', 'partial'].includes(o.result)) return sum;
    return sum + (o.amount ?? (o.result === 'done' ? t.body.plan.target?.amount ?? 0 : 0));
  }, 0);
  else { const committed = tasks.filter(t => t.body.plan.state === 'committed').length; amount = committed ? Math.round(done.length / committed * 100) : 0; unit = '%'; }
  return {amount, unit, asOf, basis: 'linked_outcomes' as const};
}

/** Routine achievement for a day. pick_daily counts only what was picked; fixed_all counts every due routine. */
export function routineRate(records: AnyRecord[], day: string) {
  const routines = routinesOf(records), tasks = tasksOf(records).filter(t => t.logicalDay === day && t.body.routineId);
  let done = 0, of = 0;
  const modes = new Set<Routine['mode']>();
  for (const r of routines) {
    const instances = tasks.filter(t => t.body.routineId === r.id);
    const finished = instances.some(t => t.body.outcome.result === 'done');
    if (r.body.mode === 'pick_daily') {
      if (!instances.some(t => t.body.plan.state === 'committed')) continue;
    } else if (!routineDue(r.body, day)) continue;
    modes.add(r.body.mode); of++; if (finished) done++;
  }
  const basis = modes.size > 1 ? 'mixed' : modes.has('fixed_all') ? 'all_defined' : 'committed_today';
  return {basis, done, of};
}

export type ModuleUse = {sleep: boolean; condition: boolean};
export type NowSnapshot = ReturnType<typeof buildNow>;

/** The small, deterministic "right now" a consumer puts into its chat. No AI. */
export function buildNow(all: AnyRecord[], settings: Settings, at: Date, opts: {revision: number; scopes: Scope[]; modules: ModuleUse; lastActivityAt: string | null}) {
  const records = all.map(r => shareable(r, opts.scopes)).filter((r): r is AnyRecord => !!r);
  const has = (s: Scope) => opts.scopes.includes(s);
  const day = logicalDay(at, settings), asOf = at.toISOString();
  const today = tasksOf(records).filter(t => t.logicalDay === day && t.body.plan.state !== 'dropped');
  const outcome = (t: Task) => (t.outcome as Task['outcome'] | null);
  const count = (result: string) => today.filter(t => outcome(t.body)?.result === result).length;
  const goals = goalsOf(records).filter(g => g.body.status === 'active' && periodContains(g.body.period, day));
  const newest = <R extends AnyRecord>(list: R[]) => list.filter(r => live(r) && r.logicalDay === day).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const condition = newest(records.filter((r): r is LifeRecord<'condition'> => r.kind === 'condition'));
  const sleep = newest(records.filter((r): r is LifeRecord<'sleep'> => r.kind === 'sleep'));
  const touched = all.filter(r => r.logicalDay === day).map(r => r.updatedAt).sort().at(-1) ?? null;
  return {
    contractVersion: CONTRACT_VERSION,
    asOf,
    revision: opts.revision,
    user: {tz: settings.tz, dayBoundary: settings.dayBoundary, logicalDay: day, localTime: localTime(at, settings.tz)},
    lastActivityAt: opts.lastActivityAt,
    today: has('life.read.plan') ? {
      tasks: today.map(t => {
        const o = outcome(t.body);
        return {
          id: t.id, title: t.body.title, category: t.body.category, plan: t.body.plan.state, target: qty(t.body.plan.target),
          result: o?.result ?? 'not_shared',
          amount: o && o.amount !== null ? qty({amount: o.amount, unit: o.unit ?? t.body.plan.target?.unit ?? ''}) : null,
          goalIds: t.body.goalIds, routineId: t.body.routineId,
        };
      }),
      counts: has('life.read.outcome')
        ? {planned: today.length, committed: today.filter(t => t.body.plan.state === 'committed').length, done: count('done'), partial: count('partial'), postponed: count('postponed'), cancelled: count('cancelled'), unknown: count('unknown')}
        : {planned: today.length, committed: today.filter(t => t.body.plan.state === 'committed').length},
      routineRate: has('life.read.outcome') ? routineRate(records, day) : null,
    } : {state: 'not_shared' as const},
    goals: has('life.read.plan') ? goals.map(g => {
      const p = has('life.read.outcome') ? goalProgress(g, records, asOf) : null;
      return {id: g.id, horizon: g.body.horizon, period: g.body.period, title: g.body.title, target: qty(g.body.target), progress: p && g.body.target ? `${p.amount}/${p.unit === '%' ? 100 : g.body.target.amount} ${p.unit}` : null, parentId: g.body.parentGoalId};
    }) : {state: 'not_shared' as const},
    condition: !has('life.read.condition') ? {state: 'not_shared' as const} : !opts.modules.condition ? {state: 'unset' as const} : condition ? {state: 'ok' as const, energy: condition.body.energy, mood: condition.body.mood, at: condition.body.at} : {state: 'empty' as const},
    sleep: !has('life.read.condition') ? {state: 'not_shared' as const} : !opts.modules.sleep ? {state: 'unset' as const} : sleep ? {state: 'ok' as const, start: sleep.body.start, end: sleep.body.end, quality: sleep.body.quality} : {state: 'empty' as const},
    freshness: {todayUpdatedAt: touched, stale: touched === null},
  };
}
