import {useState} from 'react';
import {addDays, focusOf, periodContains, periodSummary, weekday, yearSummary} from '@workspace/life-contract';
import {ofKind, type Planner} from '../data.ts';
import {GoalBar, horizonLabel, type Nav} from './Today.tsx';
import {hm} from './Focus.tsx';
import {HabitGrid} from './Habits.tsx';
import {Gauge} from '../Gauge.tsx';

// Month and year pages fill themselves from the daily page: nothing is entered here, it is all read from what was checked.
export function Month({p, nav, month, setMonth, today}: {p: Planner; nav: Nav; month: string; setMonth: (m: string) => void; today: string}) {
  const [view, setView] = useState<'month' | 'year'>('month');
  if (view === 'year') return <Year p={p} year={month.slice(0, 4)} today={today} open={m => { setMonth(m); setView('month'); }} back={() => setView('month')} />;
  return <MonthView p={p} nav={nav} month={month} setMonth={setMonth} today={today} toYear={() => setView('year')} />;
}

function MonthView({p, nav, month, setMonth, today, toYear}: {p: Planner; nav: Nav; month: string; setMonth: (m: string) => void; today: string; toYear: () => void}) {
  const first = `${month}-01`, start = addDays(first, -((weekday(first) + 6) % 7));
  const cells = Array.from({length: 42}, (_, i) => addDays(start, i));
  const tasks = ofKind(p.records, 'task');
  const shift = (n: number) => { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const goals = ofKind(p.records, 'goal').filter(g => g.body.horizon === 'month' && g.body.period === month);
  return <div className="month">
    <div className="day-nav"><button onClick={() => shift(-1)} aria-label="전달">‹</button><h2>{Number(month.slice(5))}월 <span className="muted">{month.slice(0, 4)}</span></h2><button onClick={() => shift(1)} aria-label="다음 달">›</button>
      <button className="ghost small" onClick={toYear}>{month.slice(0, 4)}년 한눈에 →</button></div>
    <Summary p={p} from={first} to={addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10), -1)} openGoal={nav.openGoal} />
    {goals.length > 0 && <section className="module"><h3>이달의 목표</h3><ul className="rows">{goals.map(g => <li key={g.id} className="row goal-row"><button className="link" onClick={() => nav.openGoal(g.id)}><span className="horizon">{horizonLabel(g.body.horizon)}</span>{g.body.title}</button><GoalBar g={g} records={p.records} /></li>)}</ul></section>}
    <HabitGrid p={p} month={month} today={today} />
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

const hrs = (min: number) => min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`;
/** The month at a glance, read from the daily records. */
function Summary({p, from, to, openGoal}: {p: Planner; from: string; to: string; openGoal: (id: string) => void}) {
  const s = periodSummary(p.records, from, to);
  const tile = (label: string, value: string, sub?: string, pct?: number | null) => <div className="sum-tile"><span className="k">{label}</span>{pct !== undefined ? <Gauge pct={pct} size="md" label={label} /> : <strong>{value}</strong>}{sub && <span className="muted small">{sub}</span>}</div>;
  return <section className="part summary"><h3>이달 한눈에 <span className="muted small">데일리에서 체크한 것만으로 채워져요</span></h3>
    <div className="sum-tiles">
      {tile('할 일 완료', s.tasks.rate === null ? '–' : `${s.tasks.rate}%`, `${s.tasks.done}/${s.tasks.planned}${s.tasks.missed ? ` · 못 함 ${s.tasks.missed}` : ''}`, s.tasks.rate)}
      {tile('루틴', s.routines.rate === null ? '–' : `${s.routines.rate}%`, `${s.routines.done}/${s.routines.picked} (고른 날 기준)`, s.routines.rate)}
      {tile('순집중', hrs(s.focusMin))}
      {tile('평균 컨디션', s.condition === null ? '–' : `${s.condition}/10`)}
      {tile('평균 수면', s.sleepMin === null ? '–' : hrs(s.sleepMin))}
      {tile('기록한 날', `${s.writtenDays}/${s.days}일`)}
    </div>
    {s.goals.length > 0 && <ul className="prows">{s.goals.map(g => <li key={g.id} className="prow">
      <button className="link ptitle" onClick={() => openGoal(g.id)}><span className="pname">{g.title}</span><span className="psub">이달 이 목표로 끝낸 일 {g.done}/{g.planned}</span></button>
      <Gauge pct={g.percent} size="sm" label={g.title} />
    </li>)}</ul>}
  </section>;
}

/** Twelve months, each filled from its days. */
function Year({p, year, today, open, back}: {p: Planner; year: string; today: string; open: (month: string) => void; back: () => void}) {
  const [y, setY] = useState(year);
  const months = yearSummary(p.records, y), maxFocus = Math.max(60, ...months.map(m => m.focusMin));
  const total = months.reduce((a, m) => ({done: a.done + m.tasks.done, planned: a.planned + m.tasks.planned, focus: a.focus + m.focusMin}), {done: 0, planned: 0, focus: 0});
  return <div className="year">
    <div className="day-nav"><button className="ghost small" onClick={back}>‹ 달력</button><button onClick={() => setY(String(Number(y) - 1))} aria-label="이전 해">‹</button><h2>{y}년</h2><button onClick={() => setY(String(Number(y) + 1))} aria-label="다음 해">›</button></div>
    <p className="muted">한 해 동안 끝낸 할 일 <strong>{total.done}</strong>/{total.planned} · 순집중 <strong>{hrs(total.focus)}</strong></p>
    <div className="year-grid">
      <span className="yg-h">달</span><span className="yg-h">할 일 완료</span><span className="yg-h">루틴</span><span className="yg-h">순집중</span><span className="yg-h">컨디션</span>
      {months.map(m => <button key={m.month} className={`yg-row ${m.month === today.slice(0, 7) ? 'now' : ''}`} onClick={() => open(m.month)} disabled={m.tasks.planned === 0 && m.focusMin === 0 && m.writtenDays === 0}>
        <span>{Number(m.month.slice(5))}월</span>
        <span className="yg-rate"><Gauge pct={m.tasks.rate} size="sm" label={`${Number(m.month.slice(5))}월 할 일`} />{m.tasks.planned > 0 && <em className="g-detail">{m.tasks.done}/{m.tasks.planned}</em>}</span>
        <span>{m.routines.rate !== null ? `${m.routines.rate}%` : '–'}</span>
        <span className="yg-focus"><i style={{width: `${Math.round(m.focusMin / maxFocus * 100)}%`}} /><em>{m.focusMin ? hrs(m.focusMin) : '–'}</em></span>
        <span>{m.condition ?? '–'}</span>
      </button>)}
    </div>
  </div>;
}
