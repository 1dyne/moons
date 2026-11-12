import {z} from 'zod';
import {focusOf, goalPercent, type AnyRecord} from '@workspace/life-contract';
import {AGGS, aggregate, entriesOf, entryFocusMin, inRange, periodRange, type Logic} from './logic.ts';
import {currentEnergy} from './modes.ts';

import {SIGNALS, Signal} from './signal-schema.ts';
export {SIGNALS, Signal, type SignalKind} from './signal-schema.ts';


const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
type R = AnyRecord & {body: Record<string, unknown>};
const dayTasks = (records: AnyRecord[], day: string) => (records as R[]).filter(r => r.kind === 'task' && !r.deletedAt && r.logicalDay === day && r.body.category !== 'want'
  && !(r.body.plan as {fixed?: boolean}).fixed && !['cancelled', 'postponed'].includes((r.body.outcome as {result: string}).result));
const done = (r: R) => (r.body.outcome as {result: string}).result === 'done';

/** Where the user is on a 상황 right now: met or not, and a progress line (3:20 / 8:00) for cards and the editor. */
export function evalSignal(s: Signal, records: AnyRecord[], logic: Logic | undefined, day: string, now = new Date()): {met: boolean; value: number | null; target: number | null; text: string} {
  const focusMin = () => focusOf(records, day, now).todayMinutes + (logic ? entryFocusMin(records, logic, day, now.getTime()) : 0);
  switch (s.kind) {
    case 'focus': { const v = focusMin(), t = s.n * 60; return {met: v >= t, value: v, target: t, text: `${hm(v)} / ${hm(t)}`}; }
    case 'tasksAll': { const ts = dayTasks(records, day), d = ts.filter(done).length; return {met: ts.length > 0 && d === ts.length, value: d, target: ts.length, text: `${d} / ${ts.length}`}; }
    case 'tasksBy': {
      const ts = dayTasks(records, day), d = ts.filter(done);
      const last = d.map(t => (t.body.outcome as {completedAt: string | null}).completedAt ?? t.updatedAt).sort().at(-1);
      const by = new Date(`${day}T${s.at}:00`).toISOString();
      return {met: ts.length > 0 && d.length === ts.length && !!last && last <= by, value: d.length, target: ts.length, text: `${d.length} / ${ts.length} · ${s.at} 전`};
    }
    case 'tasksDone': { const d = dayTasks(records, day).filter(done).length; return {met: d >= s.n, value: d, target: s.n, text: `${d} / ${s.n}개`}; }
    case 'mission': {
      const v = focusMin(), t = s.n * 60, ts = dayTasks(records, day), d = ts.filter(done).length;
      return {met: v >= t || (ts.length > 0 && d === ts.length), value: v, target: t, text: `순집중 ${hm(v)} / ${hm(t)} · 할 일 ${d}/${ts.length}`};
    }
    case 'goal': { const p = s.goalId ? goalPercent(s.goalId, records).pct : 0; return {met: p >= s.n, value: p, target: s.n, text: `${p}% / ${s.n}%`}; }
    case 'goalDone': { const g = (records as R[]).find(r => r.id === s.goalId && r.kind === 'goal'); const ok = g?.body.status === 'achieved'; return {met: ok, value: ok ? 1 : 0, target: 1, text: ok ? '이룸' : '아직'}; }
    case 'energyHigh': case 'energyLow': {
      const e = currentEnergy(records, logic, day)?.score ?? null;
      return {met: e !== null && (s.kind === 'energyHigh' ? e >= s.n : e <= s.n), value: e, target: s.n, text: `${e ?? '–'}점`};
    }
    case 'db': {
      const v = aggregate(entriesOf(records, s.type).filter(x => inRange(x, periodRange(s.period, day, day))), s.agg, s.of, day, now.getTime()) ?? 0;
      return {met: v >= s.n, value: v, target: s.n, text: `${v} / ${s.n}`};
    }
  }
}
/** "오늘 순집중 8시간 이상" — the 상황 as a short phrase. */
export function signalText(s: Signal, logic?: Logic, goals: {id: string; title: string}[] = []) {
  const goal = goals.find(g => g.id === s.goalId)?.title ?? '목표';
  switch (s.kind) {
    case 'focus': return `오늘 순집중 ${s.n}시간 이상`;
    case 'tasksAll': return '오늘 할 일 다 끝내기';
    case 'tasksBy': return `${s.at} 전에 오늘 할 일 다 끝내기`;
    case 'tasksDone': return `오늘 할 일 ${s.n}개 끝내기`;
    case 'mission': return `오늘의 미션 달성 (순집중 ${s.n}시간 또는 할 일 전부)`;
    case 'goal': return `${goal} ${s.n}% 이상`;
    case 'goalDone': return `${goal} 이루기`;
    case 'energyHigh': return `에너지 ${s.n} 이상`;
    case 'energyLow': return `에너지 ${s.n} 이하`;
    case 'db': return `${{today: '오늘', week: '이번 주', month: '이번 달'}[s.period]} ${logic?.types.find(t => t.id === s.type)?.name ?? 'DB'} ${AGGS.find(a => a.id === s.agg)?.name} ${s.n} 이상`;
  }
}
