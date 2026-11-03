import {useEffect, useState} from 'react';
import {addDays, focusOf, logicalDay, type LifeRecord, type Settings} from '@workspace/life-contract';
import type {ModuleSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';

// Time tracker: one running session at a time, painted on a 10-minute timetable and summed into a receipt.
const PALETTE = ['#8aaaf8', '#2f9585', '#e9b949', '#b05a57', '#00838f', '#3a66b8', '#3f9a8a', '#c9a98a'];
export function useClock(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
export const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit', hour12: false});

/** Stable colour per task (or free label) for the day: the order the day first saw it. */
export function colors(p: Planner, day: string) {
  const keys: string[] = [];
  for (const t of ofKind(p.records, 'task').filter(t => t.logicalDay === day).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) keys.push(t.id);
  for (const s of ofKind(p.records, 'session').filter(s => s.logicalDay === day)) { const k = s.body.taskId ?? `label:${s.body.label}`; if (!keys.includes(k)) keys.push(k); }
  return (key: string) => PALETTE[Math.max(0, keys.indexOf(key)) % PALETTE.length]!;
}
export const sessionKey = (s: LifeRecord<'session'>) => s.body.taskId ?? `label:${s.body.label}`;

export function useTimer(p: Planner, settings: Settings) {
  const running = ofKind(p.records, 'session').find(s => !s.body.end);
  const stop = async () => {
    if (!running) return;
    const end = new Date();
    // Under a minute is a mis-tap: drop it rather than record noise.
    if (end.getTime() - new Date(running.body.start).getTime() < 60_000) await p.remove(running.id);
    else await p.write(running.id, {kind: 'session', logicalDay: running.logicalDay, body: {...running.body, end: end.toISOString()}, baseRevision: running.revision});
  };
  const start = async (target: {task?: LifeRecord<'task'>; label?: string}) => {
    await stop();
    const at = new Date().toISOString(), t = target.task;
    await p.write(null, {kind: 'session', logicalDay: logicalDay(at, settings), body: {taskId: t?.id ?? null, label: t?.body.title ?? target.label ?? '집중', start: at, source: 'timer'}});
    if (t && t.body.outcome.result === 'unknown') await p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, outcome: {...t.body.outcome, result: 'in_progress', actualStart: t.body.outcome.actualStart ?? at}}, baseRevision: t.revision});
  };
  return {running, start, stop};
}
export type Timer = ReturnType<typeof useTimer>;

export function FocusBar({p, day, timer, color}: {p: Planner; day: string; timer: Timer; color: (k: string) => string}) {
  const now = useClock();
  const [label, setLabel] = useState('');
  const focus = focusOf(p.records, day, now);
  const r = timer.running;
  const todo = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !['done', 'cancelled', 'postponed'].includes(t.body.outcome.result)).slice(0, 6);
  return <div className={`focus-bar ${r ? 'on' : ''}`} style={r ? {'--focus': color(sessionKey(r))} as React.CSSProperties : undefined}>
    {r ? <>
      <span className="focus-dot" />
      <div className="focus-what"><span className="muted small">지금 집중 중</span><strong>{r.body.label}</strong></div>
      <span className="focus-time" aria-live="off">{hms(now.getTime() - new Date(r.body.start).getTime())}</span>
      <button className="stop" onClick={timer.stop} aria-label="멈추기">■</button>
    </> : <>
      <div className="focus-what"><span className="muted small">지금 무엇에 집중하나요?</span>
        <div className="chips">
          {todo.map(t => <button key={t.id} className="chip" onClick={() => timer.start({task: t})}>▶ {t.body.title}</button>)}
          <form className="inline" onSubmit={e => { e.preventDefault(); if (label.trim()) { void timer.start({label: label.trim()}); setLabel(''); } }}>
            <input className="label-in" value={label} onChange={e => setLabel(e.target.value)} placeholder="다른 일" aria-label="집중할 일" />
          </form>
        </div>
      </div>
    </>}
    <div className="focus-total"><span className="muted small">오늘 순집중</span><strong>{hm(focus.todayMinutes)}</strong></div>
  </div>;
}

/** Local wall-clock instant for a logical day; hours past 24 belong to the next calendar date. */
const cellStart = (day: string, minuteOfDay: number) => {
  const d = minuteOfDay >= 1440 ? addDays(day, 1) : day, m = minuteOfDay % 1440;
  return new Date(`${d}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`);
};

export function Timetable({m, p, day, settings, color}: {m: ModuleSpec; p: Planner; day: string; settings: Settings; color: (k: string) => string}) {
  const now = useClock(30_000);
  const startHour = Number(m.options.startHour ?? 6), endHour = Number(settings.dayBoundary.slice(0, 2)) + 24;
  const manual = m.options.input !== 'timer';
  const rangeFrom = cellStart(day, startHour * 60), rangeTo = cellStart(day, endHour * 60);
  const sessions = ofKind(p.records, 'session').filter(s => new Date(s.body.start) < rangeTo && (s.body.end ? new Date(s.body.end) : now) > rangeFrom);
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !['cancelled', 'postponed'].includes(t.body.outcome.result));
  const [pick, setPick] = useState<{at: number; session?: LifeRecord<'session'>} | null>(null);
  const [label, setLabel] = useState('');
  const owner = (from: Date, to: Date) => {
    let best: LifeRecord<'session'> | undefined, overlap = 0;
    for (const s of sessions) {
      const a = Math.max(from.getTime(), new Date(s.body.start).getTime()), b = Math.min(to.getTime(), s.body.end ? new Date(s.body.end).getTime() : now.getTime());
      if (b - a > overlap) { overlap = b - a; best = s; }
    }
    return overlap >= 4 * 60_000 ? best : undefined; // a cell is painted when it was mostly spent on one thing
  };
  const paint = async (minute: number, target: {task?: LifeRecord<'task'>; label?: string}) => {
    setPick(null); setLabel('');
    const from = cellStart(day, minute), to = cellStart(day, minute + 10);
    const key = target.task?.id ?? `label:${target.label}`;
    // Extend a neighbouring painted block of the same thing instead of leaving 10-minute crumbs.
    const touching = sessions.find(s => s.body.source === 'manual' && s.body.end && sessionKey(s) === key && (s.body.end === from.toISOString() || s.body.start === to.toISOString()));
    if (touching) await p.write(touching.id, {kind: 'session', logicalDay: touching.logicalDay, body: {...touching.body, start: touching.body.start < from.toISOString() ? touching.body.start : from.toISOString(), end: touching.body.end! > to.toISOString() ? touching.body.end : to.toISOString()}, baseRevision: touching.revision});
    else await p.write(null, {kind: 'session', logicalDay: day, body: {taskId: target.task?.id ?? null, label: target.task?.body.title ?? target.label!, start: from.toISOString(), end: to.toISOString(), source: 'manual'}});
  };
  const hours = Array.from({length: Math.max(1, endHour - startHour)}, (_, i) => startHour + i);
  return <div className="timetable">
    <div className="tt-grid" role="grid" aria-label="10분 타임테이블">
      {hours.map(h => <div key={h} className="tt-row" role="row">
        <span className="tt-hour">{String(h % 24).padStart(2, '0')}</span>
        {[0, 1, 2, 3, 4, 5].map(i => {
          const minute = h * 60 + i * 10, from = cellStart(day, minute), to = cellStart(day, minute + 10);
          const s = owner(from, to), live = now >= from && now < to;
          return <button key={i} role="gridcell" className={`tt-cell ${s ? 'filled' : ''} ${live ? 'now' : ''} ${s && !s.body.end ? 'running' : ''}`}
            style={s ? {background: color(sessionKey(s))} : undefined}
            title={s ? `${s.body.label} · ${clock(s.body.start)}–${s.body.end ? clock(s.body.end) : '지금'}` : `${clock(from.toISOString())}`}
            aria-label={`${clock(from.toISOString())} ${s ? s.body.label : '비어 있음'}`}
            onClick={() => (s || manual) && setPick({at: minute, session: s})} />;
        })}
      </div>)}
    </div>
    {pick && <div className="tt-pop" role="dialog" aria-label="칸 기록">
      <div className="tt-pop-head"><strong>{clock(cellStart(day, pick.at).toISOString())}–{clock(cellStart(day, pick.at + 10).toISOString())}</strong><button className="ghost small" onClick={() => setPick(null)} aria-label="닫기">✕</button></div>
      {pick.session ? <>
        <p>{pick.session.body.label} <span className="muted">{clock(pick.session.body.start)}–{pick.session.body.end ? clock(pick.session.body.end) : '지금'} · {pick.session.body.source === 'timer' ? '스톱워치' : '직접 칠함'}</span></p>
        <button className="small danger" onClick={async () => { await p.remove(pick.session!.id); setPick(null); }}>이 기록 지우기</button>
      </> : <>
        <p className="muted small">이 10분을 무엇에 썼나요?</p>
        <div className="chips">{tasks.map(t => <button key={t.id} className="chip" onClick={() => paint(pick.at, {task: t})}><i className="dot" style={{background: color(t.id)}} />{t.body.title}</button>)}</div>
        <form className="inline" onSubmit={e => { e.preventDefault(); if (label.trim()) void paint(pick.at, {label: label.trim()}); }}><input value={label} onChange={e => setLabel(e.target.value)} placeholder="다른 일" aria-label="다른 일" /><button className="small">칠하기</button></form>
      </>}
    </div>}
  </div>;
}

export function Receipt({p, day, routineRate}: {p: Planner; day: string; routineRate: {done: number; of: number} | null}) {
  const now = useClock(60_000);
  const f = focusOf(p.records, day, now);
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !['cancelled', 'postponed'].includes(t.body.outcome.result) && t.body.plan.state !== 'dropped');
  const done = tasks.filter(t => t.body.outcome.result === 'done').length;
  const date = new Intl.DateTimeFormat('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', timeZone: 'UTC'}).format(new Date(`${day}T00:00:00Z`));
  return <figure className="receipt" aria-label="하루 영수증">
    <figcaption>하루 영수증</figcaption>
    <p className="r-date">{date}</p>
    <hr />
    <p className="r-line"><span>시작</span><span>{f.firstStart ? clock(f.firstStart) : '--:--'}</span></p>
    <p className="r-line"><span>마지막</span><span>{f.lastEnd ? (f.active ? '진행 중' : clock(f.lastEnd)) : '--:--'}</span></p>
    <hr />
    {f.byTask.length === 0 && <p className="r-empty">아직 잰 시간이 없어요</p>}
    {f.byTask.map(r => <p key={r.taskId ?? r.title} className="r-line item"><span>{r.title}</span><i /><span>{hm(r.minutes)}</span></p>)}
    <hr />
    <p className="r-line total"><span>순집중 합계</span><span>{hm(f.todayMinutes)}</span></p>
    <p className="r-line"><span>할 일 완료</span><span>{done}/{tasks.length}</span></p>
    {routineRate && routineRate.of > 0 && <p className="r-line"><span>루틴</span><span>{routineRate.done}/{routineRate.of}</span></p>}
    <hr />
    <p className="r-foot">{f.todayMinutes >= 1 ? '오늘도 수고했어요' : '첫 집중을 시작해 보세요'}</p>
  </figure>;
}
