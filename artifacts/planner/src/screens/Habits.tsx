import {addDays, routineDue, type LifeRecord} from '@workspace/life-contract';
import {ofKind, type Planner} from '../data.ts';

// Monthly habit grid: routine × day. With "pick today's routines", only picked days open a cell;
// a cell becomes × only when the user said "못 했어요". Tapping a past or today's cell cycles it.
export function HabitGrid({p, month, today}: {p: Planner; month: string; today: string}) {
  const routines = ofKind(p.records, 'routine').filter(r => r.body.active);
  if (!routines.length) return null;
  const first = `${month}-01`, n = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const days = Array.from({length: n}, (_, i) => addDays(first, i));
  const inst = ofKind(p.records, 'task').filter(t => t.body.routineId);
  const find = (r: LifeRecord<'routine'>, d: string) => inst.find(t => t.body.routineId === r.id && t.logicalDay === d);
  const tap = async (r: LifeRecord<'routine'>, d: string) => {
    if (d > today) return;
    const t = find(r, d), now = new Date().toISOString();
    if (!t) { await p.write(null, {kind: 'task', logicalDay: d, body: {title: r.body.title, routineId: r.id, plan: {state: 'committed'}, outcome: {result: 'done', completedAt: now, reportedAt: now}}}); return; }
    const res = t.body.outcome.result;
    if (res === 'done') await p.write(t.id, {kind: 'task', logicalDay: d, body: {...t.body, outcome: {...t.body.outcome, result: 'missed', completedAt: null, reportedAt: now}}, baseRevision: t.revision});
    else if (res === 'missed') await p.remove(t.id);
    else await p.write(t.id, {kind: 'task', logicalDay: d, body: {...t.body, outcome: {...t.body.outcome, result: 'done', completedAt: now, reportedAt: now}}, baseRevision: t.revision});
  };
  const streak = (r: LifeRecord<'routine'>) => { let s = 0; for (let d = today; ; d = addDays(d, -1)) { if (find(r, d)?.body.outcome.result === 'done') s++; else if (d !== today) break; if (s > 365) break; } return s; };
  return <section className="part habits"><h3>습관 트래커 <span className="muted small">● 함 · × 못 함 · ○ 고름 · 칸을 누르면 바뀌어요</span></h3>
    <div className="hb-grid" style={{gridTemplateColumns: `minmax(90px,1.2fr) repeat(${n},minmax(14px,1fr)) auto`}}>
      <span />{days.map(d => <span key={d} className={`hb-d ${d === today ? 'today' : ''}`}>{Number(d.slice(8))}</span>)}<span className="hb-d">연속</span>
      {routines.map(r => {
        const picked = days.filter(d => find(r, d)), done = picked.filter(d => find(r, d)!.body.outcome.result === 'done').length;
        return [<span key={r.id} className="hb-name" title={`${done}/${picked.length || 0} (고른 날 기준)`}>{r.body.title}<small>{picked.length ? Math.round(done / picked.length * 100) : 0}%</small></span>,
          ...days.map(d => { const t = find(r, d), res = t?.body.outcome.result;
            return <button key={d} className={`hb ${res === 'done' ? 'done' : res === 'missed' ? 'missed' : t ? 'picked' : r.body.mode === 'fixed_all' && routineDue(r.body, d) && d <= today ? 'due' : ''} ${d > today ? 'future' : ''}`}
              onClick={() => tap(r, d)} disabled={d > today} aria-label={`${r.body.title} ${d} ${res === 'done' ? '함' : res === 'missed' ? '못 함' : t ? '고름' : '비어 있음'}`}>{res === 'done' ? '●' : res === 'missed' ? '×' : t ? '○' : ''}</button>; }),
          <span key={`${r.id}-s`} className="hb-streak">{streak(r)}일</span>];
      })}
    </div>
  </section>;
}
