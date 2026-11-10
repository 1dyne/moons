import type {AnyRecord, Kind, LifeRecord} from '@workspace/life-contract';

// Pure logic behind 에너지 신호등, 오늘의 미션, 페르소나 현황 and 목표 회고 (tested in lifeLogic.test.ts).
const ofKind = <K extends Kind>(records: AnyRecord[], kind: K) => records.filter(r => r.kind === kind && !r.deletedAt) as unknown as LifeRecord<K>[];
const mins = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000);

/** Condition by time of day: timer-stop scores (at the middle of the session) and condition checks. */
export function energyPoints(records: AnyRecord[], day: string) {
  const pts: {at: string; score: number; label: string}[] = [];
  for (const s of ofKind(records, 'session')) if (s.logicalDay === day && s.body.end && s.body.condition !== null) pts.push({at: new Date((Date.parse(s.body.start) + Date.parse(s.body.end)) / 2).toISOString(), score: s.body.condition, label: s.body.label});
  for (const c of ofKind(records, 'condition')) if (c.logicalDay === day && c.body.energy !== null) pts.push({at: c.body.at, score: c.body.energy, label: {wake: '기상', evening: '저녁'}[c.body.moment as string] ?? '점검'});
  return pts.sort((a, b) => a.at.localeCompare(b.at));
}

export const lightOf = (n: number) => n >= 7 ? 'blue' : n >= 4 ? 'amber' : 'red';

/** When cumulative focus on the day first reached the target (or null). */
export function focusReachedAt(records: AnyRecord[], day: string, target: number, now = new Date()) {
  let acc = 0;
  for (const s of ofKind(records, 'session').filter(s => s.logicalDay === day).sort((a, b) => a.body.start.localeCompare(b.body.start))) {
    const len = mins(s.body.start, s.body.end ?? now.toISOString());
    if (acc + len >= target) return new Date(Date.parse(s.body.start) + (target - acc) * 60000).toISOString();
    acc += len;
  }
  return null;
}

export function missionState(records: AnyRecord[], day: string, target: number, now = new Date()) {
  const focus = Math.round(ofKind(records, 'session').filter(s => s.logicalDay === day).reduce((m, s) => m + mins(s.body.start, s.body.end ?? now.toISOString()), 0));
  // Everything planned for the day except 하고 싶은 일 (want): tasks, fixed appointments, picked routines.
  const plan = ofKind(records, 'task').filter(t => t.logicalDay === day && t.body.category !== 'want' && t.body.plan.state !== 'dropped' && !['cancelled', 'postponed'].includes(t.body.outcome.result));
  const done = plan.filter(t => t.body.outcome.result === 'done');
  const planAt = plan.length && done.length === plan.length ? done.map(t => t.body.outcome.completedAt ?? t.updatedAt).sort().at(-1)! : null;
  const focusAt = focusReachedAt(records, day, target, now);
  const winner = focusAt && (!planAt || focusAt <= planAt) ? 'focus' : planAt ? 'plan' : null;
  return {focus, target, plan: plan.length, done: done.length, focusAt, planAt, winner, wonAt: winner === 'focus' ? focusAt : winner === 'plan' ? planAt : null} as const;
}

export function deployedOver(personas: LifeRecord<'persona'>[], month: string, limit: number) {
  const n = personas.filter(p => p.body.active && p.body.months?.[month]?.status === 'deployed').length;
  return {count: n, over: n > limit};
}

export function abilitiesOf(records: AnyRecord[], personaId: string) {
  return ofKind(records, 'goal').filter(g => g.body.status === 'achieved' && (g.body.personaIds ?? []).includes(personaId));
}

/** Focus minutes spent on a goal: sessions of tasks linked to it or to any goal under it. */
export function goalActualMin(records: AnyRecord[], goalId: string) {
  const goals = ofKind(records, 'goal'), ids = new Set([goalId]);
  for (let added = true; added;) { added = false; for (const g of goals) if (g.body.parentGoalId && ids.has(g.body.parentGoalId) && !ids.has(g.id)) { ids.add(g.id); added = true; } }
  const tasks = new Set(ofKind(records, 'task').filter(t => t.body.goalIds.some(id => ids.has(id))).map(t => t.id));
  return Math.round(ofKind(records, 'session').filter(s => s.body.taskId && tasks.has(s.body.taskId) && s.body.end).reduce((m, s) => m + mins(s.body.start, s.body.end!), 0));
}

export const roi = (impact: number | null, actualMin: number | null) => impact && actualMin ? Math.round(impact / Math.max(.1, actualMin / 60) * 100) / 100 : null;
