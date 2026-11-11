import {useState} from 'react';
import {addDays, dayCondition, type Settings} from '@workspace/life-contract';
import {Logic, entryFocusMin, type PlannerSpec, type Widget} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {usePhone} from '../phone.tsx';
import type {Ctx, Nav} from './day.ts';
import {label} from './Today.tsx';
import {DayCanvas} from './Canvas.tsx';
import {hm} from './Focus.tsx';
import {parseEntry} from '../parse.ts';
import {at, fromClock, minuteOf} from '../schedule.ts';

// A day: the date line, then the user's own widget page (the day page, or a page tab's widgets).
// Widgets that show one day; a page without any of them (views, tables of all days, decorations) needs no date line.
const DAILY = new Set(['tasks', 'focus', 'timetable', 'receipt', 'hourly', 'bullet', 'page', 'checkin', 'carry', 'routine', 'condition', 'sleep', 'review', 'personas', 'energy', 'mission', 'goals']);
export function DayPage({spec, settings, p, nav, today, saveSpec, page}: {spec: PlannerSpec; settings: Settings; p: Planner; nav: Nav; today: string; saveSpec?: Ctx['saveSpec']; page?: Widget[]}) {
  const dated = !page || page.some(w => DAILY.has(w.type) || (w.type === 'table' && w.options.scope !== 'all') || (w.type === 'list' && w.options.period === 'today'));
  const phone = usePhone();
  return <div className="sheet">
    {dated && (phone ? <><WeekStrip nav={nav} today={today} /><Summary p={p} day={nav.day} logic={Logic.parse(spec.logic ?? {})} /></> : <div className="day-nav">
      <button onClick={() => nav.setDay(addDays(nav.day, -1))} aria-label="전날">‹</button>
      <h2>{label(nav.day)}</h2>
      <button onClick={() => nav.setDay(addDays(nav.day, 1))} aria-label="다음 날">›</button>
      {nav.day !== today && <button className="ghost small" onClick={() => nav.setDay(today)}>오늘로</button>}
    </div>)}
    {page && page.length === 0 && <p className="muted page-empty">빈 페이지</p>}
    <DayCanvas spec={spec} settings={settings} p={p} today={today} day={nav.day} nav={nav} saveSpec={saveSpec} page={page} />
    {phone && dated && <AddButton p={p} day={nav.day} />}
  </div>;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** Phone: the week as one row of days; tap a day, swipe the arrows for other weeks. */
function WeekStrip({nav, today}: {nav: Nav; today: string}) {
  const d = nav.day, monday = addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
  const days = Array.from({length: 7}, (_, i) => addDays(monday, i));
  return <div className="week-strip">
    <button className="ws-arrow" onClick={() => nav.setDay(addDays(d, -7))} aria-label="지난주">‹</button>
    {days.map(x => <button key={x} className={`ws-day ${x === d ? 'on' : ''} ${x === today ? 'today' : ''}`} onClick={() => nav.setDay(x)} aria-pressed={x === d}>
      <span>{DOW[new Date(`${x}T12:00:00Z`).getUTCDay()]}</span><b>{Number(x.slice(8))}</b></button>)}
    <button className="ws-arrow" onClick={() => nav.setDay(addDays(d, 7))} aria-label="다음 주">›</button>
  </div>;
}

/** Phone: the day in one line — net focus, tasks done (want left out), condition. */
function Summary({p, day, logic}: {p: Planner; day: string; logic: Logic}) {
  const focus = Math.round(ofKind(p.records, 'session').filter(s => s.logicalDay === day).reduce((m, s) => m + Math.max(0, (Date.parse(s.body.end ?? new Date().toISOString()) - Date.parse(s.body.start)) / 60000), 0)) + entryFocusMin(p.records, logic, day);
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && t.body.category !== 'want' && !['cancelled', 'postponed'].includes(t.body.outcome.result));
  const done = tasks.filter(t => t.body.outcome.result === 'done').length, score = dayCondition(p.records, day).score;
  const light = score === null ? '' : score >= 7 ? 'blue' : score <= 3 ? 'red' : 'amber';
  return <div className="m-summary">
    <span><em>순집중</em><b>{hm(focus)}</b></span>
    <span><em>완료</em><b>{done}/{tasks.length}</b></span>
    <span><em>컨디션</em><b>{score ?? '–'}</b>{light && <i className={`m-light ${light}`} aria-hidden="true" />}</span>
  </div>;
}

/** Phone: one + button; adding happens in a sheet from the bottom instead of input boxes inside every card. */
function AddButton({p, day}: {p: Planner; day: string}) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [cat, setCat] = useState('must'), [time, setTime] = useState('');
  const add = async () => {
    const parsed = parseEntry(text, day);
    if (!parsed.title.trim()) return;
    const start = parsed.time?.start ?? (time ? fromClock(day, time) : null);
    const end = parsed.time?.end ?? (start && parsed.estimateMin ? at(day, minuteOf(day, start.value) + parsed.estimateMin) : null);
    await p.write(null, {kind: 'task', logicalDay: day, body: {title: parsed.title, category: cat, plan: {state: 'committed', target: parsed.target, estimateMin: parsed.estimateMin, ...(start ? {start, end} : {})}}});
    setText(''); setTime('');
  };
  return <>
    <button className="fab" onClick={() => setOpen(true)} aria-label="할 일 추가">＋</button>
    {open && <div className="sheet-wrap" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <form className="bottom-sheet" onSubmit={e => { e.preventDefault(); void add(); }}>
        <div className="inline sheet-row"><input type="time" className="time-in" value={time} onChange={e => setTime(e.target.value)} aria-label="시작 시각" />
          <input value={text} onChange={e => setText(e.target.value)} placeholder="할 일" aria-label="할 일" autoFocus /></div>
        <div className="seg" role="radiogroup" aria-label="분류">{([['must', '꼭'], ['want', '하고 싶은'], ['leisure', '여가']] as const).map(([k, v]) =>
          <button key={k} type="button" role="radio" aria-checked={cat === k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{v}</button>)}</div>
        <div className="inline"><button className="primary" disabled={!text.trim()}>추가</button><button type="button" className="ghost" onClick={() => setOpen(false)}>닫기</button></div>
      </form>
    </div>}
  </>;
}
