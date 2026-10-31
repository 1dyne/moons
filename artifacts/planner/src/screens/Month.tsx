import {addDays, focusOf, periodContains, weekday} from '@workspace/life-contract';
import {ofKind, type Planner} from '../data.ts';
import {GoalBar, horizonLabel, type Nav} from './Today.tsx';
import {hm} from './Focus.tsx';

export function Month({p, nav, month, setMonth, today}: {p: Planner; nav: Nav; month: string; setMonth: (m: string) => void; today: string}) {
  const first = `${month}-01`, start = addDays(first, -((weekday(first) + 6) % 7));
  const cells = Array.from({length: 42}, (_, i) => addDays(start, i));
  const tasks = ofKind(p.records, 'task');
  const shift = (n: number) => { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const goals = ofKind(p.records, 'goal').filter(g => g.body.horizon === 'month' && g.body.period === month);
  return <div className="month">
    <div className="day-nav"><button onClick={() => shift(-1)} aria-label="전달">‹</button><h2>{Number(month.slice(5))}월 <span className="muted">{month.slice(0, 4)}</span></h2><button onClick={() => shift(1)} aria-label="다음 달">›</button></div>
    {goals.length > 0 && <section className="module"><h3>이달의 목표</h3><ul className="rows">{goals.map(g => <li key={g.id} className="row goal-row"><button className="link" onClick={() => nav.openGoal(g.id)}><span className="horizon">{horizonLabel(g.body.horizon)}</span>{g.body.title}</button><GoalBar g={g} records={p.records} /></li>)}</ul></section>}
    <div className="calendar" role="grid">
      {['월', '화', '수', '목', '금', '토', '일'].map(d => <span key={d} className="dow">{d}</span>)}
      {cells.map(d => {
        const list = tasks.filter(t => t.logicalDay === d && t.body.plan.state !== 'dropped'), done = list.filter(t => t.body.outcome.result === 'done').length;
        const focus = focusOf(p.records, d, new Date()).todayMinutes;
        return <button key={d} className={`cell ${periodContains(month, d) ? '' : 'out'} ${d === today ? 'today' : ''}`} onClick={() => nav.setDay(d)}>
          <span className="date">{Number(d.slice(8))}</span>
          {focus > 0 && <span className="focus-min">{hm(focus)}</span>}
          {list.length > 0 && <span className="count">{done}/{list.length}</span>}
          {list.length > 0 && <i className="fill" style={{height: `${Math.round(done / list.length * 100)}%`}} />}
        </button>;
      })}
    </div>
  </div>;
}
