import {useEffect, useState} from 'react';
import {actualMin, addDays, goalPercent, dayCondition, focusOf, logicalDay, personaShare, type LifeRecord, type Settings} from '@workspace/life-contract';
import {entryFocusMin, timeStretches, type Logic, type ModuleSpec, type PropDef, type Stretch} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {Scale} from './Scale.tsx';
import {useL} from '../labels.tsx';
import {clockOf, sortDay, timed} from '../schedule.ts';

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
export function colors(p: Planner, day: string, fixed: Record<string, string> = {}) {
  const keys: string[] = [];
  for (const t of ofKind(p.records, 'task').filter(t => t.logicalDay === day).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) keys.push(t.id);
  for (const s of ofKind(p.records, 'session').filter(s => s.logicalDay === day)) { const k = s.body.taskId ?? `label:${s.body.label}`; if (!keys.includes(k)) keys.push(k); }
  // Subjects keep the colour the user gave them in the timer.
  return (key: string) => fixed[key] ?? PALETTE[Math.max(0, keys.indexOf(key)) % PALETTE.length]!;
}
export const sessionKey = (s: LifeRecord<'session'>) => s.body.taskId ?? `label:${s.body.label}`;

export function useTimer(p: Planner, settings: Settings) {
  const running = ofKind(p.records, 'session').find(s => !s.body.end);
  // The session that just stopped, waiting for "how did it go?" (condition 1–10 and a note).
  const [stopped, setStopped] = useState<LifeRecord<'session'> | null>(null);
  const stop = async () => {
    if (!running) return;
    const end = new Date();
    // Under a minute is a mis-tap: drop it rather than record noise.
    if (end.getTime() - new Date(running.body.start).getTime() < 60_000) { await p.remove(running.id); return; }
    const saved = await p.write(running.id, {kind: 'session', logicalDay: running.logicalDay, body: {...running.body, end: end.toISOString()}, baseRevision: running.revision});
    if (saved) setStopped(saved as LifeRecord<'session'>);
    void p.refresh();
  };
  const rate = async (condition: number | null, note: string) => {
    const s = stopped; setStopped(null);
    if (!s || (condition === null && !note.trim())) return;
    await p.write(s.id, {kind: 'session', logicalDay: s.logicalDay, body: {...s.body, condition, note: note.trim() || null}, baseRevision: s.revision});
    if (condition !== null) lowEnergyAlert(condition);
    void p.refresh();
  };
  const start = async (target: {task?: LifeRecord<'task'>; label?: string}) => {
    await stop();
    const at = new Date().toISOString(), t = target.task;
    await p.write(null, {kind: 'session', logicalDay: logicalDay(at, settings), body: {taskId: t?.id ?? null, label: t?.body.title ?? target.label ?? '집중', start: at, source: 'timer', personaIds: t?.body.personaIds ?? []}});
    if (t && t.body.outcome.result === 'unknown') await p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, outcome: {...t.body.outcome, result: 'in_progress', actualStart: t.body.outcome.actualStart ?? at}}, baseRevision: t.revision});
  };
  return {running, start, stop, stopped, rate};
}
export type Timer = ReturnType<typeof useTimer>;

export function FocusBar({p, day, timer, color}: {p: Planner; day: string; timer: Timer; color: (k: string) => string}) {
  const now = useClock();
  const [label, setLabel] = useState(''), [note, setNote] = useState('');
  const focus = focusOf(p.records, day, now);
  const done = timer.stopped;
  if (done && !timer.running) {
    const m = Math.round((new Date(done.body.end!).getTime() - new Date(done.body.start).getTime()) / 60000);
    return <div className="focus-bar ask" role="dialog" aria-label="방금 집중 어땠어요">
      <div className="focus-what"><span className="muted small">{done.body.label} · {hm(m)} 집중했어요</span><strong>방금 컨디션은 몇 점이었어요?</strong>
        <Scale value={null} onPick={n => { void timer.rate(n, note); setNote(''); }} label="방금 집중할 때 컨디션 1~10" />
        <input className="label-in wide" value={note} onChange={e => setNote(e.target.value)} placeholder="메모" aria-label="메모" />
      </div>
      <button className="ghost small skip" onClick={() => { void timer.rate(null, note); setNote(''); }}>건너뛰기</button>
    </div>;
  }
  const r = timer.running;
  const L = useL();
  const todo = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !t.body.plan.fixed && !['done', 'cancelled', 'postponed'].includes(t.body.outcome.result)).slice(0, 6);
  return <div className={`focus-bar ${r ? 'on' : ''}`} style={r ? {'--focus': color(sessionKey(r))} as React.CSSProperties : undefined}>
    {r ? <>
      <span className="focus-dot" />
      <div className="focus-what"><span className="muted small">{L('running', '지금 집중 중')}</span><strong>{r.body.label}</strong></div>
      <span className="focus-time" aria-live="off">{hms(now.getTime() - new Date(r.body.start).getTime())}</span>
      <button className="stop" onClick={timer.stop} aria-label="멈추기">■</button>
    </> : <>
      <div className="focus-what"><span className="muted small">{L('ask', '지금 무엇에 집중하나요?')}</span>
        <div className="chips">
          {todo.map(t => <button key={t.id} className="chip" onClick={() => timer.start({task: t})}>▶ {t.body.title}</button>)}
          <form className="inline" onSubmit={e => { e.preventDefault(); if (label.trim()) { void timer.start({label: label.trim()}); setLabel(''); } }}>
            <input className="label-in" value={label} onChange={e => setLabel(e.target.value)} placeholder={L('other', '다른 일')} aria-label="집중할 일" />
          </form>
        </div>
      </div>
    </>}
    <div className="focus-total"><span className="muted small">{L('total', '오늘 순집중')}</span><strong>{hm(focus.todayMinutes)}</strong></div>
  </div>;
}

/** Local wall-clock instant for a logical day; hours past 24 belong to the next calendar date. */
const cellStart = (day: string, minuteOfDay: number) => {
  const d = minuteOfDay >= 1440 ? addDays(day, 1) : day, m = minuteOfDay % 1440;
  return new Date(`${d}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`);
};

export function Timetable({m, p, day, settings, color, logic}: {m: ModuleSpec; p: Planner; day: string; settings: Settings; color: (k: string) => string; logic?: Logic}) {
  const now = useClock(30_000);
  const startHour = Number(m.options.startHour ?? 6), endHour = Number(settings.dayBoundary.slice(0, 2)) + 24;
  const manual = m.options.input !== 'timer';
  const rangeFrom = cellStart(day, startHour * 60), rangeTo = cellStart(day, endHour * 60);
  const copied = new Set(p.records.filter(r => r.kind === 'entry' && !r.deletedAt).map(r => (r.ext as {src?: string} | undefined)?.src).filter(Boolean));
  const sessions = ofKind(p.records, 'session').filter(s => !copied.has(s.id) && new Date(s.body.start) < rangeTo && (s.body.end ? new Date(s.body.end) : now) > rangeFrom);
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !['cancelled', 'postponed'].includes(t.body.outcome.result));
  const [pick, setPick] = useState<{at: number; session?: LifeRecord<'session'>; entry?: Stretch} | null>(null);
  const [label, setLabel] = useState('');
  // Time measured by block widgets (timers, start·end buttons, sleep…) is painted here too.
  const stretches = logic ? timeStretches(p.records, logic, rangeFrom, rangeTo, now).filter(x => x.src === 'entry') : [];
  const owner = (from: Date, to: Date) => {
    let best: LifeRecord<'session'> | Stretch | undefined, overlap = 0;
    for (const s of [...sessions, ...stretches]) {
      const st = 'src' in s ? s.start : s.body.start, en = 'src' in s ? s.end : s.body.end;
      const a = Math.max(from.getTime(), new Date(st).getTime()), b = Math.min(to.getTime(), en ? new Date(en).getTime() : now.getTime());
      if (b - a > overlap) { overlap = b - a; best = s; }
    }
    return overlap >= 4 * 60_000 ? best : undefined; // a cell is painted when it was mostly spent on one thing
  };
  // The same subject has one colour whichever timer measured it (the old one or a block one).
  const keyColor = (s: LifeRecord<'session'> | Stretch) => 'src' in s ? color(`label:${s.label}`) : color(sessionKey(s));
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
          const o = owner(from, to), live = now >= from && now < to;
          const v = o ? ('src' in o ? {label: o.label, start: o.start, end: o.end} : {label: o.body.label, start: o.body.start, end: o.body.end}) : null;
          return <button key={i} role="gridcell" className={`tt-cell ${o ? 'filled' : ''} ${live ? 'now' : ''} ${v && !v.end ? 'running' : ''}`}
            style={o ? {background: keyColor(o)} : undefined}
            title={v ? `${v.label} · ${clock(v.start)}–${v.end ? clock(v.end) : '지금'}` : `${clock(from.toISOString())}`}
            aria-label={`${clock(from.toISOString())} ${v ? v.label : '비어 있음'}`}
            onClick={() => (o || manual) && setPick(o && 'src' in o ? {at: minute, entry: o} : {at: minute, session: o as LifeRecord<'session'> | undefined})} />;
        })}
      </div>)}
    </div>
    {pick && <div className="tt-pop" role="dialog" aria-label="칸 기록">
      <div className="tt-pop-head"><strong>{clock(cellStart(day, pick.at).toISOString())}–{clock(cellStart(day, pick.at + 10).toISOString())}</strong><button className="ghost small" onClick={() => setPick(null)} aria-label="닫기">✕</button></div>
      {pick.entry ? <>
        <p>{pick.entry.label} <span className="muted">{clock(pick.entry.start)}–{pick.entry.end ? clock(pick.entry.end) : '지금'}</span></p>
        <button className="small danger" onClick={async () => { await p.remove(pick.entry!.id); setPick(null); }}>이 기록 지우기</button>
      </> : pick.session ? <>
        <p>{pick.session.body.label} <span className="muted">{clock(pick.session.body.start)}–{pick.session.body.end ? clock(pick.session.body.end) : '지금'} · {pick.session.body.source === 'timer' ? '스톱워치' : '직접 칠함'}</span></p>
        <SessionNote s={pick.session} p={p} />
        <button className="small danger" onClick={async () => { await p.remove(pick.session!.id); setPick(null); }}>이 기록 지우기</button>
      </> : <>
        <p className="muted small">이 10분을 무엇에 썼나요?</p>
        <div className="chips">{tasks.map(t => <button key={t.id} className="chip" onClick={() => paint(pick.at, {task: t})}><i className="dot" style={{background: color(t.id)}} />{t.body.title}</button>)}</div>
        <form className="inline" onSubmit={e => { e.preventDefault(); if (label.trim()) void paint(pick.at, {label: label.trim()}); }}><input value={label} onChange={e => setLabel(e.target.value)} placeholder="다른 일" aria-label="다른 일" /><button className="small">칠하기</button></form>
      </>}
    </div>}
  </div>;
}

export function Receipt({p, day, routineRate, logic}: {p: Planner; day: string; routineRate: {done: number; of: number} | null; logic?: Logic}) {
  const cond = dayCondition(p.records, day), personas = personaShare(p.records, day, 1).rows.filter(r => r.minutes > 0);
  const estimated = ofKind(p.records, 'task').filter(t => t.logicalDay === day && t.body.plan.estimateMin && t.body.outcome.result === 'done');
  const estSum = estimated.reduce((s, t) => s + t.body.plan.estimateMin!, 0), actSum = estimated.reduce((s, t) => s + actualMin(p.records, t.id), 0);
  const now = useClock(60_000);
  const f = focusOf(p.records, day, now);
  // Focus measured by block widgets (types marked as focus), by what was measured.
  const extra = logic ? timeStretches(p.records, logic, new Date(`${day}T00:00:00`), new Date(Date.parse(`${day}T00:00:00`) + 30 * 3600_000), now)
    .filter(x => { const r = p.records.find(y => y.id === x.id); return x.src === 'entry' && !!logic.types.find(t => t.id === x.type)?.focus && r?.logicalDay === day && !(r.ext as {src?: string} | undefined)?.src; }) : [];
  const extraBy = [...new Set(extra.map(x => x.label))].map(l => ({title: l, minutes: extra.filter(x => x.label === l).reduce((a, x) => a + Math.max(0, ((x.end ? Date.parse(x.end) : now.getTime()) - Date.parse(x.start)) / 60000), 0)}));
  const extraMin = logic ? entryFocusMin(p.records, logic, day, now.getTime()) : 0;
  // One line per subject, whichever timer measured it.
  const merged = [...f.byTask.map(r => ({title: r.title, minutes: r.minutes})), ...extraBy].reduce<{title: string; minutes: number}[]>((acc, r) => { const x = acc.find(a => a.title === r.title); if (x) x.minutes += r.minutes; else acc.push({...r}); return acc; }, []).filter(r => r.minutes >= 1);
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !t.body.plan.fixed && !['cancelled', 'postponed'].includes(t.body.outcome.result) && t.body.plan.state !== 'dropped');
  const done = tasks.filter(t => t.body.outcome.result === 'done').length;
  const date = new Intl.DateTimeFormat('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', timeZone: 'UTC'}).format(new Date(`${day}T00:00:00Z`));
  return <figure className="receipt" aria-label="하루 영수증">
    <figcaption>하루 영수증</figcaption>
    <p className="r-date">{date}</p>
    <hr />
    <p className="r-line"><span>시작</span><span>{f.firstStart ? clock(f.firstStart) : '--:--'}</span></p>
    <p className="r-line"><span>마지막</span><span>{f.lastEnd ? (f.active ? '진행 중' : clock(f.lastEnd)) : '--:--'}</span></p>
    <hr />
    {merged.length === 0 && <p className="r-empty">아직 잰 시간이 없어요</p>}
    {merged.map(r => <p key={r.title} className="r-line item"><span>{r.title}</span><i /><span>{hm(r.minutes)}</span></p>)}
    <hr />
    <p className="r-line total"><span>순집중 합계</span><span>{hm(f.todayMinutes + extraMin)}</span></p>
    <p className="r-line"><span>할 일 완료</span><span>{done}/{tasks.length}</span></p>
    {routineRate && routineRate.of > 0 && <p className="r-line"><span>루틴</span><span>{routineRate.done}/{routineRate.of}</span></p>}
    {estSum > 0 && <p className="r-line"><span>예상 → 실제</span><span>{hm(estSum)} → {hm(actSum)}</span></p>}
    {cond.score !== null && <p className="r-line"><span>컨디션</span><span>{cond.score}/10</span></p>}
    {personas.length > 0 && <><hr />{personas.map(r => <p key={r.id} className="r-line item"><span>{r.name}</span><i /><span>{r.share}%</span></p>)}</>}
    <hr />
    <p className="r-foot">{f.todayMinutes >= 1 ? '오늘도 수고했어요' : '첫 집중을 시작해 보세요'}</p>
  </figure>;
}

/** The note and condition left when a timer stopped: editable and removable later. */
function SessionNote({s, p}: {s: LifeRecord<'session'>; p: Planner}) {
  const [note, setNote] = useState(s.body.note ?? '');
  const save = (patch: Partial<LifeRecord<'session'>['body']>) => p.write(s.id, {kind: 'session', logicalDay: s.logicalDay, body: {...s.body, ...patch}, baseRevision: s.revision});
  return <div className="session-note">
    <Scale value={s.body.condition} onPick={n => save({condition: n})} label="그때 컨디션 1~10" />
    <div className="inline"><input value={note} onChange={e => setNote(e.target.value)} placeholder="메모" aria-label="집중 메모" />
      <button className="small" onClick={() => save({note: note.trim() || null})}>저장</button>
      {(s.body.note || s.body.condition) && <button className="ghost small danger" onClick={() => { setNote(''); void save({note: null, condition: null}); }}>메모·점수 지우기</button>}</div>
  </div>;
}

/** 에너지 신호등: when the user asked for it, a low score raises a notification right away (this device). */
export function lowEnergyAlert(score: number) {
  let at = NaN; try { at = Number(localStorage.getItem('lit.energyAlert')); } catch { /* no storage */ }
  if (!Number.isFinite(at) || score > at || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  let own = ''; try { own = localStorage.getItem('lit.energyAlertText') ?? ''; } catch { /* */ }
  const body = own ? `${score}점 · ${own}` : `컨디션 ${score}점`;
  const plain = () => { try { new Notification('lit · 에너지 낮음', {body}); } catch { /* not allowed here */ } };
  if (navigator.serviceWorker?.controller) void navigator.serviceWorker.ready.then(r => r.showNotification('lit · 에너지 낮음', {body, tag: 'lit-energy'})).catch(plain);
  else plain();
}

// ── 과목 타이머 (열품타처럼) ─────────────────────────────────────────────────
// A list of subjects (and, if wanted, today's tasks), each with its own ▶ / ■. Pressing ▶ starts that one (and stops
// whatever was running); pressing ■ stops it. Every stretch is a session, so the 10-minute timetable fills by itself.
export type Subject = {name: string; color: string};
export const SUBJECT_COLORS = ['#3a66b8', '#2f9585', '#e9a317', '#d0342c', '#7b6bc4', '#00838f', '#c4689a', '#5d5d57'];
export function SubjectTimer({p, day, timer, subjects, showTasks, askCondition, onSubjects, view = 'list', onView, show = ['goal'], defs = []}: {p: Planner; day: string; timer: Timer; subjects: Subject[]; showTasks: boolean; askCondition: boolean; onSubjects?: (s: Subject[]) => void;
  view?: string; onView?: (v: 'list' | 'time') => void; show?: string[]; defs?: PropDef[]}) {
  const now = useClock(1000), L = useL();
  const [adding, setAdding] = useState(''), [note, setNote] = useState('');
  const sessions = ofKind(p.records, 'session').filter(s => s.logicalDay === day);
  const spent = (match: (s: LifeRecord<'session'>) => boolean) => sessions.filter(match).reduce((m, s) => m + Math.max(0, (new Date(s.body.end ?? now.toISOString()).getTime() - new Date(s.body.start).getTime()) / 60000), 0);
  const total = spent(() => true), r = timer.running;
  const tasks = showTasks ? sortDay(ofKind(p.records, 'task').filter(t => t.logicalDay === day && !t.body.plan.fixed && !['cancelled', 'postponed'].includes(t.body.outcome.result))) : [];
  const rows: {key: string; name: string; color: string; min: number; running: boolean; go: () => void; task?: LifeRecord<'task'>}[] = [
    ...subjects.map(sj => ({key: `label:${sj.name}`, name: sj.name, color: sj.color, min: spent(s => !s.body.taskId && s.body.label === sj.name), running: !!r && !r.body.taskId && r.body.label === sj.name, go: () => void timer.start({label: sj.name})})),
    ...tasks.map(t => ({key: t.id, name: t.body.title, color: '', min: spent(s => s.body.taskId === t.id), running: r?.body.taskId === t.id, go: () => void timer.start({task: t}), task: t})),
  ];
  const done = timer.stopped;
  return <div className="subj">
    <div className="subj-head"><span className="k">{L('total', '오늘 순집중')}</span><strong>{hm(total)}</strong>
      {r && <span className="subj-now">{r.body.label} · {hms(now.getTime() - new Date(r.body.start).getTime())}</span>}
      {onView && <span className="seg subj-view" role="radiogroup" aria-label="보기">{([['list', '목록'], ['time', '시간순']] as const).map(([k, n]) =>
        <button key={k} role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => onView(k)}>{n}</button>)}</span>}</div>
    {done && askCondition && !r && <div className="subj-ask" role="group" aria-label="방금 컨디션">
      <span className="small">{done.body.label} 컨디션</span>
      <Scale value={null} onPick={n => { void timer.rate(n, note); setNote(''); }} label="방금 집중할 때 컨디션 1~10" />
      <input className="subj-note" value={note} onChange={e => setNote(e.target.value)} placeholder="메모" aria-label="메모" />
      <button className="ghost small" onClick={() => { void timer.rate(null, note); setNote(''); }}>건너뛰기</button>
    </div>}
    {view === 'time' ? <FocusTimeline p={p} day={day} timer={timer} subjects={subjects} tasks={tasks} show={show} defs={defs} now={now} />
      : <ul className="subj-list">{rows.map(x => <li key={x.key} className={x.running ? 'on' : ''} style={x.color ? {'--sc': x.color} as React.CSSProperties : undefined}>
      <i className="subj-dot" aria-hidden="true" />
      <span className="subj-name">{x.task && show.includes('time') && timed(x.task) && <em className="subj-at">{clockOf(x.task.body.plan.start!.value)}</em>}{x.name}
        {x.task && <TaskProps t={x.task} p={p} show={show} defs={defs} />}</span>
      <span className="subj-min">{hm(x.min)}</span>
      <button className={`subj-btn ${x.running ? 'stop' : ''}`} onClick={x.running ? () => void timer.stop() : x.go} aria-label={`${x.name} ${x.running ? '멈추기' : '시작'}`}>{x.running ? '■' : '▶'}</button>
      {onSubjects && !x.key.startsWith('label:') ? null : onSubjects && <button className="ghost small subj-del" onClick={() => onSubjects(subjects.filter(sj => `label:${sj.name}` !== x.key))} aria-label={`${x.name} 빼기`}>×</button>}
    </li>)}</ul>}
    {onSubjects && view !== 'time' && <form className="inline subj-add" onSubmit={e => { e.preventDefault(); const n = adding.trim(); if (n && !subjects.some(sj => sj.name === n)) onSubjects([...subjects, {name: n.slice(0, 40), color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length]!}]); setAdding(''); }}>
      <input value={adding} onChange={e => setAdding(e.target.value)} placeholder="과목" aria-label="과목 추가" maxLength={40} /><button className="small">추가</button></form>}
  </div>;
}

/** The properties the user chose to show next to a task: goal %, the whole goal's %, persona, category, estimate, own properties. */
function TaskProps({t, p, show, defs}: {t: LifeRecord<'task'>; p: Planner; show: string[]; defs: PropDef[]}) {
  const goals = ofKind(p.records, 'goal'), mine = goals.filter(g => t.body.goalIds.includes(g.id));
  const rootOf = (id: string) => { let g = goals.find(x => x.id === id); for (let i = 0; g?.body.parentGoalId && i < 10; i++) g = goals.find(x => x.id === g!.body.parentGoalId) ?? g; return g; };
  const out: React.ReactNode[] = [];
  if (show.includes('goal')) for (const g of mine) out.push(<span key={`g${g.id}`} className="goal-chip">→ {g.body.title} <b>{goalPercent(g.id, p.records).pct}%</b></span>);
  if (show.includes('root')) for (const g of new Set(mine.map(g => rootOf(g.id)).filter(x => x && !mine.includes(x)))) out.push(<span key={`r${g!.id}`} className="goal-chip root">◎ {g!.body.title} <b>{goalPercent(g!.id, p.records).pct}%</b></span>);
  if (show.includes('persona')) for (const x of ofKind(p.records, 'persona').filter(x => t.body.personaIds.includes(x.id))) out.push(<span key={`p${x.id}`} className="persona-chip" style={{'--pc': x.body.color} as React.CSSProperties}>{x.body.name}</span>);
  if (show.includes('category') && t.body.category) out.push(<span key="c" className={`cat cat-${t.body.category}`}>{({must: '꼭', want: '하고 싶은', leisure: '여가'} as Record<string, string>)[t.body.category]}</span>);
  if (show.includes('estimate') && t.body.plan.estimateMin) out.push(<span key="e" className="prop-val">예상 {hm(t.body.plan.estimateMin)}</span>);
  for (const d of defs) if (show.includes(`prop:${d.id}`)) { const v = t.body.props?.[d.id]; if (v !== null && v !== undefined && v !== '' && v !== false) out.push(<span key={d.id} className="prop-val"><em>{d.name}</em> {v === true ? '✓' : String(v)}</span>); }
  return out.length ? <span className="psub subj-props">{out}</span> : null;
}

/** 시간순: the day's focus stretches and the tasks planned at a time, on one line of time. Stretches can be retimed or removed. */
function FocusTimeline({p, day, timer, subjects, tasks, show, defs, now}: {p: Planner; day: string; timer: Timer; subjects: Subject[]; tasks: LifeRecord<'task'>[]; show: string[]; defs: PropDef[]; now: Date}) {
  const [edit, setEdit] = useState<string | null>(null);
  const sessions = ofKind(p.records, 'session').filter(s => s.logicalDay === day);
  const color = (s: LifeRecord<'session'>) => subjects.find(sj => !s.body.taskId && sj.name === s.body.label)?.color ?? PALETTE[Math.abs([...(s.body.taskId ?? s.body.label)].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % PALETTE.length]!;
  type Item = {at: string; key: string; s?: LifeRecord<'session'>; t?: LifeRecord<'task'>};
  const items: Item[] = [
    ...sessions.map(s => ({at: s.body.start, key: s.id, s})),
    ...tasks.filter(t => timed(t) && !sessions.some(s => s.body.taskId === t.id)).map(t => ({at: t.body.plan.start!.value, key: t.id, t})),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const retime = (s: LifeRecord<'session'>, which: 'start' | 'end', hhmm: string) => {
    if (!hhmm) return;
    const [h, m] = hhmm.split(':').map(Number), base = new Date(s.body[which] ?? s.body.start);
    base.setHours(h!, m!, 0, 0);
    const body = {...s.body, [which]: base.toISOString()};
    if (body.end && body.end <= body.start) return;
    return p.write(s.id, {kind: 'session', logicalDay: s.logicalDay, body, baseRevision: s.revision});
  };
  if (!items.length) return <p className="muted small">–</p>;
  return <ol className="ftl">{items.map(it => {
    if (it.t) return <li key={it.key} className="ftl-plan"><span className="ftl-time">{clockOf(it.t.body.plan.start!.value)}{it.t.body.plan.end && <small>–{clockOf(it.t.body.plan.end.value)}</small>}</span>
      <span className="ftl-name">{it.t.body.title}<TaskProps t={it.t} p={p} show={show} defs={defs} /></span><span className="ftl-tag">예정</span>
      <button className="subj-btn" onClick={() => void timer.start({task: it.t})} aria-label={`${it.t.body.title} 시작`}>▶</button></li>;
    const s = it.s!, t = s.body.taskId ? tasks.find(x => x.id === s.body.taskId) ?? ofKind(p.records, 'task').find(x => x.id === s.body.taskId) : undefined;
    const min = Math.max(0, (new Date(s.body.end ?? now.toISOString()).getTime() - Date.parse(s.body.start)) / 60000);
    return <li key={it.key} className={`ftl-s ${s.body.end ? '' : 'on'}`} style={{'--sc': color(s)} as React.CSSProperties}>
      <span className="ftl-time">{clockOf(s.body.start)}<small>–{s.body.end ? clockOf(s.body.end) : '지금'}</small></span>
      <span className="ftl-name">{s.body.label}{t && <TaskProps t={t} p={p} show={show} defs={defs} />}{s.body.condition !== null && <em className="ftl-cond">컨디션 {s.body.condition}</em>}</span>
      <span className="subj-min">{hm(min)}</span>
      {s.body.end ? <button className="ghost small" onClick={() => setEdit(edit === s.id ? null : s.id)} aria-expanded={edit === s.id} aria-label="고치기">⋯</button>
        : <button className="subj-btn stop" onClick={() => void timer.stop()} aria-label="멈추기">■</button>}
      {edit === s.id && <span className="ftl-edit inline">
        <input type="time" className="time-in" defaultValue={clockOf(s.body.start)} onBlur={e => void retime(s, 'start', e.target.value)} aria-label="시작" />–
        <input type="time" className="time-in" defaultValue={clockOf(s.body.end!)} onBlur={e => void retime(s, 'end', e.target.value)} aria-label="끝" />
        <button className="ghost small danger" onClick={() => { setEdit(null); void p.remove(s.id); }}>지우기</button></span>}
    </li>;
  })}</ol>;
}
