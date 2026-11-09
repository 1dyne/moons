import {useState} from 'react';
import {addDays, isoWeek, routineDue, weekday, type LifeRecord, type Settings} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {parseEntry} from '../parse.ts';
import {GoalBar} from './Today.tsx';
import {MARK, NEXT, type Nav} from './day.ts';
import {colors, hm, sessionKey} from './Focus.tsx';

// Weekly pages: horizontal (seven columns of tasks, drag between days) or vertical (seven columns with an hour grid).
const DOW = ['월', '화', '수', '목', '금', '토', '일'];
const PX = 34;

export function Week({spec, p, nav, today}: {spec: PlannerSpec; settings: Settings; p: Planner; nav: Nav; today: string}) {
  const [anchor, setAnchor] = useState(nav.day);
  const monday = addDays(anchor, -((weekday(anchor) + 6) % 7));
  const days = Array.from({length: 7}, (_, i) => addDays(monday, i));
  const vertical = spec.layout?.week === 'vertical';
  const goals = ofKind(p.records, 'goal').filter(g => g.body.horizon === 'week' && g.body.period === isoWeek(monday));
  const focus = (d: string) => ofKind(p.records, 'session').filter(s => s.logicalDay === d && s.body.end).reduce((sum, s) => sum + (Date.parse(s.body.end!) - Date.parse(s.body.start)) / 60000, 0);
  return <div className="week">
    <div className="day-nav">
      <button onClick={() => setAnchor(addDays(monday, -7))} aria-label="지난주">‹</button>
      <h2>{Number(monday.slice(5, 7))}월 {Number(monday.slice(8))}일 주 <span className="muted small">{isoWeek(monday)}</span></h2>
      <button onClick={() => setAnchor(addDays(monday, 7))} aria-label="다음 주">›</button>
      {!days.includes(today) && <button className="ghost small" onClick={() => setAnchor(today)}>이번 주</button>}
    </div>
    {goals.length > 0 && <div className="wk-goals">{goals.map(g => <span key={g.id} className="wk-goal"><button className="link" onClick={() => nav.openGoal(g.id)}>{g.body.title}</button><GoalBar g={g} records={p.records} /></span>)}</div>}
    {vertical ? <WeekVertical p={p} days={days} today={today} nav={nav} spec={spec} /> : <WeekHorizontal p={p} days={days} today={today} nav={nav} />}
    <div className="wk-foot">{days.map(d => <span key={d}>{hm(focus(d))}</span>)}</div>
    <HabitRows p={p} days={days} />
  </div>;
}

function WeekHorizontal({p, days, today, nav}: {p: Planner; days: string[]; today: string; nav: Nav}) {
  const [drag, setDrag] = useState<string | null>(null), [over, setOver] = useState<string | null>(null), [text, setText] = useState<Record<string, string>>({});
  const tasks = ofKind(p.records, 'task').filter(t => !t.body.routineId);
  // Moving a task that hasn't started just changes its day; a started one would be "postponed" from the day view.
  const move = (id: string, day: string) => { const t = tasks.find(x => x.id === id); if (t && t.logicalDay !== day) void p.write(t.id, {kind: 'task', logicalDay: day, body: t.body, baseRevision: t.revision}); };
  const cycle = (t: LifeRecord<'task'>) => { const r = NEXT[t.body.outcome.result] ?? 'unknown'; return p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, outcome: {...t.body.outcome, result: r, completedAt: r === 'done' ? new Date().toISOString() : null, reportedAt: r === 'unknown' ? null : new Date().toISOString()}}, baseRevision: t.revision}); };
  const add = async (d: string) => { const e = parseEntry(text[d] ?? '', d); if ((text[d] ?? '').trim() && await p.write(null, {kind: 'task', logicalDay: d, body: {title: e.title, plan: {state: 'committed', target: e.target, estimateMin: e.estimateMin, ...(e.fixed ? {fixed: true, ...e.fixed} : {})}}})) setText({...text, [d]: ''}); };
  return <div className="wk-h">{days.map((d, i) => <div key={d} className={`wk-col ${d === today ? 'today' : ''} ${over === d ? 'over' : ''}`}
    onDragOver={e => { e.preventDefault(); setOver(d); }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); setOver(null); if (drag) move(drag, d); setDrag(null); }}>
    <button className="wk-day link" onClick={() => nav.setDay(d)}><b>{DOW[i]}</b> {Number(d.slice(8))}</button>
    <ul>{tasks.filter(t => t.logicalDay === d).sort((a, b) => Number(b.body.plan.fixed) - Number(a.body.plan.fixed) || a.createdAt.localeCompare(b.createdAt)).map(t => <li key={t.id} className={`wk-task ${t.body.outcome.result} ${t.body.plan.fixed ? 'fixed' : ''}`}
      draggable={t.body.outcome.result !== 'done'} onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)}>
      {t.body.plan.fixed ? <span className="wk-time">{t.body.plan.start ? new Date(t.body.plan.start.value).toTimeString().slice(0, 5) : '○'}</span>
        : <button className="mark mini" onClick={() => cycle(t)} aria-label={`${t.body.title} 바꾸기`}>{MARK[t.body.outcome.result]}</button>}
      <span>{t.body.title}</span>
    </li>)}</ul>
    <form onSubmit={e => { e.preventDefault(); void add(d); }}><input value={text[d] ?? ''} onChange={e => setText({...text, [d]: e.target.value})} placeholder="+" aria-label={`${DOW[i]}요일 할 일 추가`} /></form>
  </div>)}</div>;
}

function WeekVertical({p, days, today, nav, spec}: {p: Planner; days: string[]; today: string; nav: Nav; spec: PlannerSpec}) {
  const checkin = spec.modules.find(m => m.type === 'checkin'), timer = spec.modules.find(m => m.type === 'timer');
  const start = Number(String(checkin?.options.wake ?? '').slice(0, 2)) || Number(timer?.options.startHour ?? 7), end = 24;
  const hours = Array.from({length: end - start}, (_, i) => start + i);
  const top = (iso: string) => { const d = new Date(iso); return ((d.getHours() - start) * 60 + d.getMinutes()) / 60 * PX; };
  const tasks = ofKind(p.records, 'task').filter(t => !t.body.routineId), sessions = ofKind(p.records, 'session');
  return <div className="wk-v">
    <div className="wk-v-hours" style={{height: hours.length * PX}}>{hours.map((h, i) => <em key={h} style={{top: i * PX}}>{h}</em>)}</div>
    {days.map((d, i) => {
      const color = colors(p, d), mine = tasks.filter(t => t.logicalDay === d);
      const timed = mine.filter(t => t.body.plan.start?.precision === 'minute' && t.body.plan.end?.precision === 'minute'), loose = mine.filter(t => !timed.includes(t) && t.body.outcome.result !== 'done');
      return <div key={d} className={`wk-v-col ${d === today ? 'today' : ''}`}>
        <button className="wk-day link" onClick={() => nav.setDay(d)}><b>{DOW[i]}</b> {Number(d.slice(8))}</button>
        <div className="wk-v-loose">{loose.slice(0, 3).map(t => <span key={t.id}>• {t.body.title}</span>)}{loose.length > 3 && <span className="muted">+{loose.length - 3}</span>}</div>
        <div className="wk-v-grid" style={{height: hours.length * PX}}>
          {hours.map((_, j) => <i key={j} style={{top: j * PX}} />)}
          {timed.map(t => <div key={t.id} className={`wk-v-plan ${t.body.plan.fixed ? 'fixed' : ''}`} style={{top: top(t.body.plan.start!.value), height: Math.max(14, (Date.parse(t.body.plan.end!.value) - Date.parse(t.body.plan.start!.value)) / 3_600_000 * PX)}} title={t.body.title}>{t.body.title}</div>)}
          {sessions.filter(s => s.logicalDay === d && s.body.end).map(s => <div key={s.id} className="wk-v-actual" style={{top: top(s.body.start), height: Math.max(4, (Date.parse(s.body.end!) - Date.parse(s.body.start)) / 3_600_000 * PX), background: color(sessionKey(s))}} title={s.body.label} />)}
        </div>
      </div>;
    })}
  </div>;
}

function HabitRows({p, days}: {p: Planner; days: string[]}) {
  const routines = ofKind(p.records, 'routine').filter(r => r.body.active);
  if (!routines.length) return null;
  const inst = ofKind(p.records, 'task').filter(t => t.body.routineId);
  return <div className="wk-habits"><span className="muted small">이번 주 루틴</span>
    {routines.map(r => <div key={r.id} className="wk-habit"><span className="wk-habit-name">{r.body.title}</span>{days.map(d => {
      const t = inst.find(x => x.body.routineId === r.id && x.logicalDay === d), res = t?.body.outcome.result;
      return <i key={d} className={`hb ${res === 'done' ? 'done' : res === 'missed' ? 'missed' : t ? 'picked' : r.body.mode === 'fixed_all' && routineDue(r.body, d) ? 'due' : ''}`}>{res === 'done' ? '●' : res === 'missed' ? '×' : t ? '○' : ''}</i>;
    })}</div>)}
  </div>;
}
