import {parseBody, type AnyRecord, type Kind, type Settings} from './records.ts';
import {addDays} from './day.ts';

// Synthetic examples for consumers (docs/LIFE_DATA_CONTRACT_v0.md §8). No real person's data.
// One week in Asia/Seoul with: goal ladder, pick-daily routines, a postponed task, a corrected task,
// a deleted task, a day with no entries, and an account that never turned sleep/condition on.
export const FIXTURE_SETTINGS: Settings = {tz: 'Asia/Seoul', dayBoundary: '04:00'};
export function weekBasic(start = '2026-10-26') {
  let rev = 0, n = 0;
  const history: AnyRecord[] = [];
  const id = () => `01FIXTURE${String(++n).padStart(17, '0')}`;
  const at = (day: string, hh = '12:00') => `${day}T${hh}:00+09:00`;
  const put = (kind: Kind, body: unknown, logicalDay: string | null, when: string, prior?: AnyRecord, extra: Partial<AnyRecord> = {}) => {
    const r = {id: prior?.id ?? id(), kind, revision: ++rev, createdAt: prior?.createdAt ?? new Date(when).toISOString(), updatedAt: new Date(when).toISOString(), deletedAt: null,
      logicalDay, tz: FIXTURE_SETTINGS.tz, source: {type: 'planner', confirmed: true}, body: parseBody(kind, body), ...extra} as AnyRecord;
    history.push(r); return r;
  };
  const year = put('goal', {title: '영어로 일하기', horizon: 'year', period: '2026'}, null, at(start, '09:00'));
  const month = put('goal', {title: '단어 600개', horizon: 'month', period: '2026-10', parentGoalId: year.id, target: {amount: 600, unit: '단어', aggregation: 'sum'}}, null, at(start, '09:01'));
  const stretch = put('routine', {title: '아침 스트레칭', recurrence: {freq: 'daily'}, mode: 'pick_daily'}, null, at(start, '09:02'));
  const water = put('routine', {title: '물 2L', recurrence: {freq: 'daily'}, mode: 'pick_daily'}, null, at(start, '09:03'));
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    if (i === 3) continue; // a day with no entries: consumers must not read it as "nothing done"
    const words = put('task', {title: '단어 40개', category: 'must', goalIds: [month.id], plan: {state: 'committed', target: {amount: 40, unit: '단어'}},
      outcome: i === 5 ? {result: 'partial', amount: 15, unit: '단어', reason: '야근', reportedAt: at(day, '23:10')} : {result: 'done', amount: 40, unit: '단어', completedAt: at(day, '21:00'), reportedAt: at(day, '21:00')}}, day, at(day, '08:30'));
    put('session', {taskId: words.id, label: '단어 40개', start: at(day, '20:05'), end: at(day, i === 5 ? '20:25' : '20:55'), source: i % 2 ? 'manual' : 'timer'}, day, at(day, '21:00'));
    put('task', {title: '아침 스트레칭', routineId: stretch.id, plan: {state: 'committed'}, outcome: i % 2 ? {result: 'missed', reason: '늦잠', reportedAt: at(day, '22:00')} : {result: 'done', completedAt: at(day, '07:40')}}, day, at(day, '07:30'));
    if (i < 2) put('task', {title: '물 2L', routineId: water.id, plan: {state: 'committed'}}, day, at(day, '07:31')); // picked, never reported → unknown
  }
  // Postponed: the original keeps its history and points at the new task on the next day.
  const report = put('task', {title: '보고서 초안', category: 'must', plan: {state: 'committed', target: {amount: 2, unit: '시간'}}}, addDays(start, 1), at(addDays(start, 1), '09:00'));
  const moved = put('task', {title: '보고서 초안', category: 'must', plan: {state: 'committed', target: {amount: 2, unit: '시간'}}, outcome: {result: 'done', amount: 2, unit: '시간', completedAt: at(addDays(start, 2), '17:00')}}, addDays(start, 2), at(addDays(start, 1), '22:00'));
  put('task', {...report.body, outcome: {result: 'postponed', postponedTo: moved.id, reportedAt: at(addDays(start, 1), '22:00')}}, addDays(start, 1), at(addDays(start, 1), '22:00'), report);
  // Corrected: marked done, then the user fixed it to partial the next morning (two revisions).
  const gym = put('task', {title: '헬스 40분', category: 'want', plan: {state: 'committed', target: {amount: 40, unit: '분'}}, outcome: {result: 'done', amount: 40, unit: '분'}}, addDays(start, 4), at(addDays(start, 4), '20:00'));
  put('task', {...gym.body, outcome: {result: 'partial', amount: 20, unit: '분', reason: '시간 부족'}}, addDays(start, 4), at(addDays(start, 5), '08:00'), gym);
  // Running now: started on the last day and not stopped yet (end null).
  const last = addDays(start, 6);
  put('session', {taskId: null, label: '보고서 검토', start: at(last, '13:30')}, last, at(last, '13:30'));
  // Deleted: a tombstone, not a disappearance.
  const typo = put('task', {title: '잘못 넣은 일', plan: {state: 'planned'}}, addDays(start, 6), at(addDays(start, 6), '10:00'));
  put('task', typo.body, addDays(start, 6), at(addDays(start, 6), '10:05'), typo, {deletedAt: new Date(at(addDays(start, 6), '10:05')).toISOString()});
  put('review', {horizon: 'day', period: addDays(start, 6), text: '주말엔 루틴이 무너진다. 다음 주엔 스트레칭만 고르기.'}, addDays(start, 6), at(addDays(start, 6), '23:00'));
  put('review', {horizon: 'day', period: addDays(start, 5), text: '개인적인 메모'}, addDays(start, 5), at(addDays(start, 5), '23:30'), undefined, {privateFields: ['text']});
  const latest = new Map<string, AnyRecord>();
  for (const r of history) latest.set(r.id, r);
  return {settings: FIXTURE_SETTINGS, modules: {sleep: false, condition: false, timer: true}, records: [...latest.values()].sort((a, b) => a.revision - b.revision), history};
}
