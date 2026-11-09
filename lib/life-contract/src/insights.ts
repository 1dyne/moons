import type {AnyRecord, LifeRecord} from './records.ts';
import {addDays} from './day.ts';
import {goalProgress, linkedTasks} from './now.ts';

// Deterministic views over the records: goal roll-up, condition, capacity, estimates, personas, efficiency.
// No AI: the planner shows these every day and consumers may read the same numbers.
const live = (r: AnyRecord) => !r.deletedAt;
const of = <K extends AnyRecord['kind']>(records: AnyRecord[], kind: K) => records.filter(r => r.kind === kind && live(r)) as unknown as LifeRecord<K>[];
const mins = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000);
const round = (n: number) => Math.round(n * 10) / 10;

export type GoalPercent = {pct: number; basis: 'achieved' | 'target' | 'children' | 'tasks' | 'none'};
/** Overall progress of a goal, 0–100. Achieved = 100; a measurable target wins; otherwise the weighted
 *  share of its sub-goals and milestones; otherwise the share of linked tasks done. */
export function goalPercent(goalId: string, records: AnyRecord[], seen = new Set<string>()): GoalPercent {
  const goals = of(records, 'goal'), g = goals.find(x => x.id === goalId);
  if (!g || seen.has(goalId)) return {pct: 0, basis: 'none'};
  seen.add(goalId);
  if (g.body.status === 'achieved') return {pct: 100, basis: 'achieved'};
  if (g.body.target) {
    const p = goalProgress(g, records, '')!;
    return {pct: Math.min(100, Math.round(p.amount / Math.max(1, p.unit === '%' ? 100 : g.body.target.amount) * 100)), basis: 'target'};
  }
  const children = goals.filter(c => c.body.parentGoalId === g.id && c.body.status !== 'dropped');
  if (children.length) {
    const total = children.reduce((s, c) => s + c.body.weight, 0);
    return {pct: Math.round(children.reduce((s, c) => s + goalPercent(c.id, records, seen).pct * c.body.weight, 0) / total), basis: 'children'};
  }
  const tasks = linkedTasks(g, records).filter(t => !['cancelled', 'postponed'].includes(t.body.outcome.result) && t.body.plan.state !== 'dropped');
  // Without a measure, finished tasks can't prove the goal is met: they count up to 90%; "이뤘어요" makes it 100.
  if (tasks.length) return {pct: Math.min(90, Math.round(tasks.filter(t => t.body.outcome.result === 'done').length / tasks.length * 100)), basis: 'tasks'};
  return {pct: 0, basis: 'none'};
}

/** The goals a task moves, from the task up to the top: "오늘 이 일 → 마일스톤 → 연간 목표". */
export function goalChain(task: LifeRecord<'task'>, records: AnyRecord[]) {
  const goals = of(records, 'goal');
  return task.body.goalIds.map(id => {
    const chain: LifeRecord<'goal'>[] = [];
    for (let g = goals.find(x => x.id === id); g && !chain.includes(g); g = goals.find(x => x.id === g!.body.parentGoalId)) chain.push(g);
    return chain;
  }).filter(c => c.length);
}

/** One day's condition: the score on waking, the timer-stop scores (weighted by minutes), the evening score. */
export function dayCondition(records: AnyRecord[], day: string) {
  const checks = of(records, 'condition').filter(c => c.logicalDay === day && c.body.energy !== null);
  const pick = (m: string) => checks.filter(c => c.body.moment === m).sort((a, b) => b.body.at.localeCompare(a.body.at))[0]?.body.energy ?? null;
  const sessions = of(records, 'session').filter(s => s.logicalDay === day && s.body.condition !== null && s.body.end);
  const w = sessions.reduce((sum, s) => sum + mins(s.body.start, s.body.end!), 0);
  const focus = w ? round(sessions.reduce((sum, s) => sum + s.body.condition! * mins(s.body.start, s.body.end!), 0) / w) : null;
  const parts = [pick('wake'), ...checks.filter(c => c.body.moment === 'check').map(c => c.body.energy!), focus, pick('evening')].filter((x): x is number => x !== null);
  return {wake: pick('wake'), focus, evening: pick('evening'), score: parts.length ? round(parts.reduce((a, b) => a + b, 0) / parts.length) : null, samples: parts.length};
}

/** A realistic day: hours awake minus fixed appointments, scaled by the waking energy (1–10). */
export function capacity(records: AnyRecord[], day: string, opts: {wake: string; sleep: string; energy: number | null}) {
  const [wh, wm] = opts.wake.split(':').map(Number), [sh, sm] = opts.sleep.split(':').map(Number);
  let awake = (sh! * 60 + sm!) - (wh! * 60 + wm!); if (awake <= 0) awake += 1440;
  const tasks = of(records, 'task').filter(t => t.logicalDay === day && t.body.plan.state !== 'dropped' && !['cancelled', 'postponed'].includes(t.body.outcome.result));
  const fixed = tasks.filter(t => t.body.plan.fixed);
  const fixedMin = fixed.reduce((sum, t) => sum + (t.body.plan.start?.precision === 'minute' && t.body.plan.end?.precision === 'minute' ? mins(t.body.plan.start.value, t.body.plan.end.value) : t.body.plan.estimateMin ?? 0), 0);
  const free = Math.max(0, awake - fixedMin);
  // Even at full energy a day holds about 70% focused work; at 1/10 about a quarter.
  const factor = opts.energy === null ? .5 : .2 + opts.energy * .05;
  const realistic = Math.round(free * factor);
  const open = tasks.filter(t => !t.body.plan.fixed && t.body.outcome.result !== 'done');
  const planned = open.reduce((sum, t) => sum + (t.body.plan.estimateMin ?? 0), 0);
  return {awake, fixedMin: Math.round(fixedMin), free: Math.round(free), factor, realistic, planned, unestimated: open.filter(t => !t.body.plan.estimateMin).length, over: Math.max(0, planned - realistic)};
}

/** Minutes actually focused on a task (closed sessions, plus a running one up to `at`). */
export function actualMin(records: AnyRecord[], taskId: string, at = new Date()) {
  return Math.round(of(records, 'session').filter(s => s.body.taskId === taskId).reduce((sum, s) => sum + mins(s.body.start, s.body.end ?? at.toISOString()), 0));
}
/** Estimated vs actual over finished tasks in a range: per task and the overall ratio (1.3 = takes 30% longer). */
export function estimateAccuracy(records: AnyRecord[], from: string, to: string) {
  const rows = of(records, 'task').filter(t => t.logicalDay && t.logicalDay >= from && t.logicalDay <= to && t.body.plan.estimateMin && t.body.outcome.result === 'done')
    .map(t => ({id: t.id, title: t.body.title, day: t.logicalDay!, estimate: t.body.plan.estimateMin!, actual: actualMin(records, t.id)})).filter(r => r.actual > 0);
  const est = rows.reduce((s, r) => s + r.estimate, 0), act = rows.reduce((s, r) => s + r.actual, 0);
  return {rows, ratio: est ? round(act / est) : null};
}

const personasOf = (records: AnyRecord[], s: LifeRecord<'session'>) => {
  if (s.body.personaIds.length) return s.body.personaIds;
  const t = s.body.taskId ? of(records, 'task').find(x => x.id === s.body.taskId) : undefined;
  return t?.body.personaIds ?? [];
};
/** How the user has been living: focus minutes and tasks per persona over the last `days` days. */
export function personaShare(records: AnyRecord[], day: string, days = 14) {
  const from = addDays(day, -(days - 1));
  const personas = of(records, 'persona');
  const inRange = (d: string | null) => !!d && d >= from && d <= day;
  const rows = personas.map(p => ({id: p.id, name: p.body.name, color: p.body.color, minutes: 0, tasks: 0, done: 0}));
  const row = (id: string) => rows.find(r => r.id === id);
  for (const s of of(records, 'session').filter(s => inRange(s.logicalDay) && s.body.end)) for (const id of personasOf(records, s)) { const r = row(id); if (r) r.minutes += mins(s.body.start, s.body.end!); }
  for (const t of of(records, 'task').filter(t => inRange(t.logicalDay))) for (const id of t.body.personaIds) { const r = row(id); if (r) { r.tasks++; if (t.body.outcome.result === 'done') r.done++; } }
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  return {from, to: day, total: Math.round(total), rows: rows.map(r => ({...r, minutes: Math.round(r.minutes), share: total ? Math.round(r.minutes / total * 100) : 0})).sort((a, b) => b.minutes - a.minutes)};
}

/** When does focus go well? Focus minutes and timer-stop condition by hour of day and by persona, plus plain tips. */
export function efficiency(records: AnyRecord[], from: string, to: string, tz: string) {
  const sessions = of(records, 'session').filter(s => s.logicalDay && s.logicalDay >= from && s.logicalDay <= to && s.body.end);
  const hourOf = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', {timeZone: tz, hour: '2-digit', hourCycle: 'h23'}).format(new Date(iso)));
  const buckets = [{id: 'dawn', label: '새벽 (0–6시)', from: 0, to: 6}, {id: 'morning', label: '오전 (6–12시)', from: 6, to: 12}, {id: 'afternoon', label: '오후 (12–18시)', from: 12, to: 18}, {id: 'evening', label: '저녁 (18–24시)', from: 18, to: 24}]
    .map(b => ({...b, minutes: 0, sessions: 0, condSum: 0, condMin: 0}));
  for (const s of sessions) {
    const b = buckets.find(x => { const h = hourOf(s.body.start); return h >= x.from && h < x.to; })!, m = mins(s.body.start, s.body.end!);
    b.minutes += m; b.sessions++;
    if (s.body.condition !== null) { b.condSum += s.body.condition * m; b.condMin += m; }
  }
  const byTime = buckets.map(b => ({id: b.id, label: b.label, minutes: Math.round(b.minutes), sessions: b.sessions, avgSession: b.sessions ? Math.round(b.minutes / b.sessions) : 0, condition: b.condMin ? round(b.condSum / b.condMin) : null}));
  const days: {day: string; score: number | null; focus: number}[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({day: d, score: dayCondition(records, d).score, focus: Math.round(sessions.filter(s => s.logicalDay === d).reduce((sum, s) => sum + mins(s.body.start, s.body.end!), 0))});
  // Condition vs focus: on days scored low, how much focus happened compared with high days.
  const scored = days.filter(d => d.score !== null);
  const low = scored.filter(d => d.score! <= 4), high = scored.filter(d => d.score! >= 7);
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const tips: string[] = [];
  const best = [...byTime].filter(b => b.condition !== null && b.minutes >= 30).sort((a, b) => b.condition! - a.condition!)[0];
  const most = [...byTime].sort((a, b) => b.minutes - a.minutes)[0];
  if (best) tips.push(`컨디션이 가장 좋게 기록된 시간대는 ${best.label}예요. 가장 어려운 일을 이때 두면 좋아요.`);
  if (most && most.minutes > 0 && best && most.id !== best.id) tips.push(`집중을 가장 많이 한 시간대(${most.label})와 컨디션이 좋은 시간대가 달라요. 쉬운 일은 ${most.label}로, 무거운 일은 ${best.label}로 옮겨 보세요.`);
  const lowAvg = avg(low.map(d => d.focus)), highAvg = avg(high.map(d => d.focus));
  if (lowAvg !== null && highAvg !== null && highAvg > 0) tips.push(`컨디션 4점 이하인 날은 집중 시간이 평균 ${lowAvg}분, 7점 이상인 날은 ${highAvg}분이었어요. 낮은 날엔 계획을 ${Math.max(10, Math.round((1 - lowAvg / highAvg) * 100))}% 줄여 잡는 게 현실적이에요.`);
  const shortLow = byTime.filter(b => b.condition !== null && b.condition <= 4 && b.avgSession > 50);
  for (const b of shortLow) tips.push(`${b.label}엔 컨디션이 낮은데 한 번에 ${b.avgSession}분씩 이어 했어요. 25분 집중 + 5분 쉬기로 끊어 보세요.`);
  return {byTime, days, tips};
}

const endOfMonth = (m: string) => { const [y, mo] = m.slice(0, 7).split('-').map(Number); return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10); };
const dueDate = (d: string) => d.length === 10 ? d : d.length === 7 ? endOfMonth(d) : `${d}-12-31`;
const monthsBetween = (from: string, to: string) => { const out: string[] = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7);) { out.push(m); const [y, mo] = m.split('-').map(Number); m = mo === 12 ? `${y! + 1}-01` : `${y}-${String(mo! + 1).padStart(2, '0')}`; } return out; };

/** Weekly minutes the user really focuses: the last four weeks of sessions, or a fallback when there is little history. */
export function weeklyFocus(records: AnyRecord[], day: string, fallback = 600) {
  const from = addDays(day, -27);
  const total = of(records, 'session').filter(s => s.logicalDay && s.logicalDay >= from && s.logicalDay <= day && s.body.end).reduce((sum, s) => sum + mins(s.body.start, s.body.end!), 0);
  return total >= 120 ? Math.round(total / 4) : fallback;
}

export type ScheduleRow = {id: string; topId: string; title: string; due: string; effortMin: number; remainingMin: number; start: string; finish: string; late: boolean};
/** When can things really be done? Open milestones across ALL goals share one weekly focus budget, earliest due first.
 *  Gives each milestone a projected finish, each top goal a feasible date vs its deadline, and the months where
 *  demand exceeds capacity (bottlenecks) with the goals competing in them. Milestones without an effort estimate are skipped and counted. */
export function goalSchedule(records: AnyRecord[], today: string, weeklyMin: number) {
  const goals = of(records, 'goal');
  const top = (g: LifeRecord<'goal'>): LifeRecord<'goal'> => { let x = g; for (let i = 0; i < 10; i++) { const p = goals.find(y => y.id === x.body.parentGoalId); if (!p) break; x = p; } return x; };
  const open = goals.filter(g => g.body.status === 'active' && (g.body.horizon === 'milestone' || (!goals.some(c => c.body.parentGoalId === g.id) && g.body.effortHours)));
  const estimated = open.filter(g => g.body.effortHours).sort((a, b) => dueDate(a.body.deadline ?? a.body.period).localeCompare(dueDate(b.body.deadline ?? b.body.period)) || b.body.weight - a.body.weight);
  const daily = Math.max(1, weeklyMin / 7);
  let cursor = today;
  const rows: ScheduleRow[] = estimated.map(g => {
    const effort = g.body.effortHours! * 60, remaining = Math.round(effort * (1 - goalPercent(g.id, records).pct / 100));
    const start = cursor, finish = addDays(cursor, Math.ceil(remaining / daily));
    cursor = finish;
    const due = dueDate(g.body.deadline ?? g.body.period);
    return {id: g.id, topId: top(g).id, title: g.body.title, due, effortMin: effort, remainingMin: remaining, start, finish, late: finish > due};
  });
  const tops = [...new Set(rows.map(r => r.topId))].map(id => {
    const g = goals.find(x => x.id === id)!, mine = rows.filter(r => r.topId === id);
    const projected = mine.map(r => r.finish).sort().at(-1)!;
    const deadline = g.body.deadline ? dueDate(g.body.deadline) : g.body.horizon === 'year' ? `${g.body.period}-12-31` : null;
    const lateDays = deadline && projected > deadline ? Math.round((Date.parse(projected) - Date.parse(deadline)) / 86_400_000) : 0;
    return {id, title: g.body.title, deadline, projected, lateDays, remainingMin: mine.reduce((s, r) => s + r.remainingMin, 0)};
  });
  // Demand per month: each milestone's remaining work spread evenly from today to its due date.
  const demand = new Map<string, {min: number; goals: Set<string>}>();
  for (const r of rows) {
    const ms = monthsBetween(today, r.due < today ? today : r.due), per = r.remainingMin / ms.length;
    for (const m of ms) { const d = demand.get(m) ?? {min: 0, goals: new Set()}; d.min += per; d.goals.add(goals.find(x => x.id === r.topId)!.body.title); demand.set(m, d); }
  }
  const monthCap = Math.round(weeklyMin * 4.35);
  const months = [...demand.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => ({month, demandMin: Math.round(d.min), capacityMin: monthCap, over: d.min > monthCap, goals: [...d.goals]}));
  return {weeklyMin, rows, goals: tops, months, bottlenecks: months.filter(m => m.over && m.goals.length > 1), overloaded: months.filter(m => m.over), unestimated: open.length - estimated.length};
}
