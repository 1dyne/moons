import {addDays, parseBody, periodsOf, type AnyRecord, type Kind} from '@workspace/life-contract';
import {uses, type PlannerSpec} from '@workspace/planner-spec';

// Example data for the mockup, so the user judges a planner that looks lived in.
export function sampleRecords(spec: PlannerSpec, today: string, tz: string): AnyRecord[] {
  let n = 0;
  const p = periodsOf(today), at = new Date().toISOString();
  const rec = (kind: Kind, body: unknown, logicalDay: string | null = null) => ({
    id: `SAMPLE${String(++n).padStart(20, '0')}`, kind, revision: n, createdAt: at, updatedAt: at, deletedAt: null, logicalDay, tz,
    source: {type: 'planner', confirmed: true}, body: parseBody(kind, body),
  }) as AnyRecord;
  const year = rec('goal', {title: '영어로 일하기', horizon: 'year', period: p.year});
  const month = rec('goal', {title: '단어 600개', horizon: 'month', period: p.month, parentGoalId: year.id, target: {amount: 600, unit: '단어', aggregation: 'sum'}});
  const week = rec('goal', {title: '운동 4번', horizon: 'week', period: p.week, target: {amount: 4, unit: '번', aggregation: 'count'}});
  const out: AnyRecord[] = [year, month, week];
  const ms1 = rec('goal', {title: '토익 900 달성', horizon: 'milestone', period: p.month, parentGoalId: year.id, weight: 2, status: 'achieved'});
  const ms2 = rec('goal', {title: '영어 회의 1회 진행', horizon: 'milestone', period: `${p.year}-12`, parentGoalId: year.id, weight: 3});
  out.push(ms1, ms2);
  const personas = uses(spec, 'personas') ? [rec('persona', {name: '직장인', color: '#3a66b8'}), rec('persona', {name: '공부하는 나', color: '#2f9585'})] : [];
  out.push(...personas);
  const pid = (i: number) => personas[i] ? [personas[i]!.id] : [];
  for (let i = 1; i <= 6; i++) out.push(rec('task', {title: '단어 외우기', category: 'must', goalIds: [month.id], plan: {state: 'committed', target: {amount: 40, unit: '단어'}}, outcome: {result: i === 3 ? 'partial' : 'done', amount: i === 3 ? 15 : 40}}, addDays(today, -i)));
  for (const d of [-1, -3]) out.push(rec('task', {title: '헬스 40분', category: 'want', goalIds: [week.id], plan: {state: 'committed', target: {amount: 40, unit: '분'}}, outcome: {result: 'done'}}, addDays(today, d)));
  const words = rec('task', {title: '단어 40개', category: 'must', goalIds: [month.id], personaIds: pid(1), plan: {state: 'committed', target: {amount: 40, unit: '단어'}, estimateMin: 40}, outcome: {result: 'done', amount: 40, unit: '단어'}}, today);
  const report = rec('task', {title: '영어 회의 자료', category: 'must', priority: 1, goalIds: [ms2.id], personaIds: pid(0), plan: {state: 'committed', estimateMin: 90}, outcome: {result: 'in_progress'}}, today);
  if (uses(spec, 'checkin')) out.push(
    rec('condition', {at, energy: 6, moment: 'wake'}, today),
    rec('task', {title: '팀 회의', personaIds: pid(0), plan: {state: 'committed', fixed: true, start: {value: new Date(`${today}T14:00:00`).toISOString(), precision: 'minute'}, end: {value: new Date(`${today}T15:00:00`).toISOString(), precision: 'minute'}}}, today));
  out.push(words, report,
    rec('task', {title: '헬스 40분', category: 'want', goalIds: [week.id], plan: {state: 'committed', target: {amount: 40, unit: '분'}}}, today),
    rec('task', {title: '영화 보기', category: 'leisure', plan: {state: 'planned'}}, today),
  );
  // Focus sessions: two finished blocks and one running now, so the timer, timetable and receipt look alive.
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  out.push(
    rec('session', {taskId: words.id, label: '단어 40개', start: ago(200), end: ago(150), source: 'timer', condition: 7, personaIds: pid(1)}, today),
    rec('session', {taskId: report.id, label: '영어 회의 자료', start: ago(130), end: ago(70), source: 'manual', condition: 5, note: '점심 먹고 졸림', personaIds: pid(0)}, today),
    rec('session', {taskId: report.id, label: '영어 회의 자료', start: ago(25), source: 'timer', personaIds: pid(0)}, today),
  );
  for (let i = 1; i <= 6; i++) out.push(rec('session', {taskId: null, label: '단어 외우기', start: `${addDays(today, -i)}T${i % 2 ? '00' : '09'}:00:00.000Z`, end: `${addDays(today, -i)}T${i % 2 ? '01:10' : '10:30'}:00.000Z`, condition: i % 2 ? 8 : 4, personaIds: pid(i % 2)}, addDays(today, -i)));
  if (uses(spec, 'routine')) {
    const mode = spec.modules.find(m => m.type === 'routine')!.options.mode === 'fixed_all' ? 'fixed_all' : 'pick_daily';
    const titles = ['아침 스트레칭', '물 2L', '명상 10분', '일기'], rs = titles.map(title => rec('routine', {title, recurrence: {freq: 'daily'}, mode}));
    out.push(...rs, rec('task', {title: titles[0], routineId: rs[0]!.id, plan: {state: 'committed'}, outcome: {result: 'done'}}, today), rec('task', {title: titles[2], routineId: rs[2]!.id, plan: {state: 'committed'}}, today));
  }
  if (uses(spec, 'condition')) out.push(rec('condition', {at, energy: 3, mood: '조금 피곤'}, today));
  if (uses(spec, 'review')) out.push(rec('review', {horizon: 'day', period: addDays(today, -1), text: '오전 집중이 잘 됐다. 저녁엔 일찍 쉬기.'}, addDays(today, -1)));
  return out;
}
