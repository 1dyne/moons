import {useState} from 'react';
import type {LifeRecord, Task} from '@workspace/life-contract';
import {ofKind} from '../data.ts';
import {parseEntry} from '../parse.ts';
import {MARK, moveTo, outcome, saveTask, type Ctx} from './day.ts';
import {hm, sessionKey, useClock} from './Focus.tsx';
import {Tip} from '../Tip.tsx';

// Day layouts from the reference library. Same records, different pages: hourly timeline, bullet log, one free page.
const PX = 52; // pixels per hour on timelines
const minuteOf = (iso: string, startHour: number) => { const d = new Date(iso); let m = d.getHours() * 60 + d.getMinutes() - startHour * 60; if (m < 0) m += 1440; return m; };
const localIso = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();
const clock = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
const dayTasks = (ctx: Ctx) => ofKind(ctx.p.records, 'task').filter(t => t.logicalDay === ctx.day && !t.body.routineId);
const timed = (t: LifeRecord<'task'>) => t.body.plan.start?.precision === 'minute' && t.body.plan.end?.precision === 'minute';

/** Structured-style vertical timeline: plan on the left, what really happened (timer) on the right. */
export function HourlyDay({ctx, startHour, endHour}: {ctx: Ctx; startHour: number; endHour: number}) {
  const now = useClock(60_000);
  const hours = Array.from({length: Math.max(1, endHour - startHour)}, (_, i) => startHour + i);
  const tasks = dayTasks(ctx).filter(t => !['cancelled', 'postponed'].includes(t.body.outcome.result));
  const planned = tasks.filter(timed), loose = tasks.filter(t => !timed(t) && t.body.outcome.result !== 'done');
  const sessions = ofKind(ctx.p.records, 'session').filter(s => s.logicalDay === ctx.day);
  const [at, setAt] = useState<Record<string, string>>({});
  const place = (t: LifeRecord<'task'>) => {
    const start = at[t.id] ?? '09:00', len = t.body.plan.estimateMin ?? 60;
    const s = new Date(localIso(ctx.day, start)), e = new Date(s.getTime() + len * 60_000);
    return saveTask(ctx, t, {plan: {...t.body.plan, start: {value: s.toISOString(), precision: 'minute'}, end: {value: e.toISOString(), precision: 'minute'}}});
  };
  const unplace = (t: LifeRecord<'task'>) => saveTask(ctx, t, {plan: {...t.body.plan, start: null, end: null}});
  const nowTop = minuteOf(now.toISOString(), startHour) / 60 * PX;
  return <div className="hourly">
    <div className="hr-head"><span>계획</span><span>실제</span></div>
    <div className="hr-grid" style={{height: hours.length * PX}}>
      {hours.map((h, i) => <span key={h} className="hr-line" style={{top: i * PX}}><em>{String(h % 24).padStart(2, '0')}</em></span>)}
      {planned.map(t => {
        const top = minuteOf(t.body.plan.start!.value, startHour) / 60 * PX, h = Math.max(18, (Date.parse(t.body.plan.end!.value) - Date.parse(t.body.plan.start!.value)) / 3_600_000 * PX);
        return <div key={t.id} className={`hr-plan ${t.body.plan.fixed ? 'fixed' : ''} ${t.body.outcome.result}`} style={{top, height: h, '--c': ctx.color(t.id)} as React.CSSProperties} title={`${t.body.title} ${clock(t.body.plan.start!.value)}–${clock(t.body.plan.end!.value)}`}>
          <b>{t.body.title}</b><small>{clock(t.body.plan.start!.value)}–{clock(t.body.plan.end!.value)}</small>
          {!t.body.plan.fixed && <button className="ghost small" onClick={() => unplace(t)} aria-label={`${t.body.title} 시간 빼기`}>✕</button>}
        </div>;
      })}
      {sessions.map(s => {
        const top = minuteOf(s.body.start, startHour) / 60 * PX, end = s.body.end ?? now.toISOString(), h = Math.max(6, (Date.parse(end) - Date.parse(s.body.start)) / 3_600_000 * PX);
        return <div key={s.id} className={`hr-actual ${s.body.end ? '' : 'running'}`} style={{top, height: h, background: ctx.color(sessionKey(s))}} title={`${s.body.label} ${clock(s.body.start)}–${s.body.end ? clock(s.body.end) : '지금'}${s.body.condition ? ` · 컨디션 ${s.body.condition}` : ''}`} />;
      })}
      {nowTop >= 0 && nowTop <= hours.length * PX && <i className="hr-now" style={{top: nowTop}} />}
    </div>
    {loose.length > 0 && <div className="hr-loose"><span className="muted small">아직 시간이 없는 할 일</span> <Tip id="hourly-loose">시각을 고르면 타임라인에 배치돼요</Tip>
      <ul className="prows">{loose.map(t => <li key={t.id} className="prow">
        <span className="ptitle"><span className="pname">{t.body.title}</span><span className="psub">{t.body.plan.estimateMin ? `예상 ${t.body.plan.estimateMin}분` : '예상 60분으로 배치'}</span></span>
        <input type="time" className="time-in" value={at[t.id] ?? '09:00'} onChange={e => setAt({...at, [t.id]: e.target.value})} aria-label={`${t.body.title} 시작 시각`} />
        <button className="small" onClick={() => place(t)}>배치</button>
      </li>)}</ul></div>}
  </div>;
}

/** Bullet journal rapid log: one line per entry, signifiers in front, migrate with ›. */
const SIGN: Record<string, string> = {...MARK, unknown: '•', done: '×', postponed: '>', in_progress: '•'};
export function BulletDay({ctx}: {ctx: Ctx}) {
  const [text, setText] = useState(''), [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState('');
  const tasks = dayTasks(ctx), notes = ofKind(ctx.p.records, 'note').filter(n => n.logicalDay === ctx.day && n.body.signifier !== 'page' && n.body.signifier !== 'row');
  const rows = [...tasks.map(t => ({at: t.createdAt, t})), ...notes.map(n => ({at: n.createdAt, n}))].sort((a, b) => a.at.localeCompare(b.at));
  const add = async () => {
    const raw = text.trim(); if (!raw) return;
    const kind = raw.match(/^([-–!]|o\s|○)\s*/);
    if (kind && (kind[1] === '-' || kind[1] === '–' || kind[1] === '!')) { if (await ctx.p.write(null, {kind: 'note', logicalDay: ctx.day, body: {text: raw.slice(kind[0].length), signifier: kind[1] === '!' ? 'idea' : 'note'}})) setText(''); return; }
    const body = kind ? raw.slice(kind[0].length) : raw, e = parseEntry(body, ctx.day);
    // ○ an event: a time ("14:00") or a range ("14:00-15:00") makes it a fixed appointment.
    const one = kind && !e.fixed ? body.match(/(\d{1,2}):(\d{2})/) : null;
    const fixed = e.fixed ?? (one ? {start: {value: localIso(ctx.day, `${one[1]!.padStart(2, '0')}:${one[2]}`), precision: 'minute' as const}, end: {value: new Date(Date.parse(localIso(ctx.day, `${one[1]!.padStart(2, '0')}:${one[2]}`)) + 3_600_000).toISOString(), precision: 'minute' as const}} : null);
    const title = one ? e.title.replace(one[0], '').trim() || e.title : e.title;
    if (await ctx.p.write(null, {kind: 'task', logicalDay: ctx.day, body: {title, plan: {state: 'committed', target: e.target, estimateMin: e.estimateMin, ...(fixed ? {fixed: true, ...fixed} : {})}}})) setText('');
  };
  const toggle = (t: LifeRecord<'task'>) => saveTask(ctx, t, outcome(t, t.body.outcome.result === 'done' ? {result: 'unknown', completedAt: null, reportedAt: null} : {result: 'done', completedAt: ctx.now(), reportedAt: ctx.now()}));
  return <div className="bullet">
    <Tip id="bullet-legend" block>• 할 일 &nbsp;× 끝냄 &nbsp;&gt; 미룸 &nbsp;○ 일정 &nbsp;– 메모 &nbsp;! 아이디어 — 앞에 <code>-</code> <code>!</code> <code>o</code>를 붙여 쓰세요</Tip>
    <ul className="bj-list">{rows.map(r => 'n' in r ? <li key={r.n.id} className="bj note">
      <span className="bj-sign">{r.n.body.signifier === 'idea' ? '!' : '–'}</span>
      {editing === r.n.id ? <form className="bj-edit" onSubmit={e => { e.preventDefault(); const n = r.n; setEditing(null); if (draft.trim() && draft !== n.body.text) void ctx.p.write(n.id, {kind: 'note', logicalDay: n.logicalDay, body: {...n.body, text: draft.trim()}, baseRevision: n.revision}); }}>
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={e => e.currentTarget.form?.requestSubmit()} aria-label="메모 고치기" /></form>
        : <button className="bj-text link" onClick={() => { setEditing(r.n.id); setDraft(r.n.body.text); }} title="눌러서 고치기">{r.n.body.text}</button>}
      <button className="ghost small" onClick={() => ctx.p.remove(r.n.id)} aria-label="메모 지우기">✕</button>
    </li> : <BulletTask key={r.t.id} t={r.t} ctx={ctx} toggle={toggle} />)}</ul>
    <form className="bj-add" onSubmit={e => { e.preventDefault(); void add(); }}>
      <span className="bj-sign">•</span><input value={text} onChange={e => setText(e.target.value)} placeholder="빠르게 적기" aria-label="빠르게 적기" />
    </form>
  </div>;
}
function BulletTask({t, ctx, toggle}: {t: LifeRecord<'task'>; ctx: Ctx; toggle: (t: LifeRecord<'task'>) => unknown}) {
  const r = t.body.outcome.result, event = t.body.plan.fixed;
  return <li className={`bj task ${r}`}>
    <button className="bj-sign" disabled={event || ['postponed', 'cancelled'].includes(r)} onClick={() => toggle(t)} aria-label={`${t.body.title} 끝냄 표시`}>{event ? '○' : SIGN[r]}</button>
    <span className="bj-text">{event && t.body.plan.start ? <b>{clock(t.body.plan.start.value)} </b> : null}{t.body.title}{t.body.plan.estimateMin ? <small> · {t.body.plan.estimateMin}분</small> : null}</span>
    {!event && !['done', 'postponed', 'cancelled'].includes(r) && <button className="ghost small" onClick={() => moveTo(ctx, t, nextDay(t.logicalDay!))} title="내일로 옮기기" aria-label={`${t.body.title} 내일로`}>›</button>}
    <button className="ghost small" onClick={() => ctx.p.remove(t.id)} aria-label={`${t.body.title} 지우기`}>✕</button>
  </li>;
}
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** One page a day on grid paper: a small time ruler, a free page, a short checklist and the day's one line. */
export function OnePageDay({ctx, startHour, endHour}: {ctx: Ctx; startHour: number; endHour: number}) {
  const page = ofKind(ctx.p.records, 'note').find(n => n.logicalDay === ctx.day && n.body.signifier === 'page');
  const [text, setText] = useState<string | null>(null), [todo, setTodo] = useState('');
  const tasks = dayTasks(ctx).filter(t => !t.body.plan.fixed);
  const sessions = ofKind(ctx.p.records, 'session').filter(s => s.logicalDay === ctx.day && s.body.end);
  const hours = Array.from({length: Math.max(1, endHour - startHour)}, (_, i) => startHour + i);
  const save = () => text !== null && text !== (page?.body.text ?? '') && ctx.p.write(page?.id ?? null, {kind: 'note', logicalDay: ctx.day, body: {text, signifier: 'page'}, ...(page ? {baseRevision: page.revision} : {})});
  const cycle = (t: LifeRecord<'task'>) => { const next: Record<string, Task['outcome']['result']> = {unknown: 'done', in_progress: 'done', done: 'missed', missed: 'unknown', partial: 'done'}; const res = next[t.body.outcome.result] ?? 'unknown'; return saveTask(ctx, t, outcome(t, {result: res, completedAt: res === 'done' ? ctx.now() : null, reportedAt: res === 'unknown' ? null : ctx.now()})); };
  return <div className="onepage">
    <div className="op-ruler" aria-label="시간 눈금">{hours.map(h => {
      const mins = sessions.reduce((sum, s) => { const a = Math.max(minuteOf(s.body.start, startHour), (h - startHour) * 60), b = Math.min(minuteOf(s.body.end!, startHour), (h - startHour + 1) * 60); return sum + Math.max(0, b - a); }, 0);
      return <span key={h} className="op-hour"><em>{h % 24}</em><i style={{width: `${Math.round(mins / 60 * 100)}%`}} title={`${h % 24}시 집중 ${Math.round(mins)}분`} /></span>;
    })}</div>
    <div className="op-paper">
      <textarea className="op-page" value={text ?? page?.body.text ?? ''} onChange={e => setText(e.target.value)} onBlur={save} placeholder="" aria-label="오늘의 페이지" />
      {page && <button className="ghost small danger op-clear" onClick={async () => { await ctx.p.remove(page.id); setText(''); }}>페이지 지우기</button>}
      <div className="op-check">
        <span className="muted small">체크</span>
        {tasks.map(t => <label key={t.id} className={`op-item ${t.body.outcome.result}`}><button className="mark" onClick={() => cycle(t)} aria-label={`${t.body.title} 바꾸기`}>{MARK[t.body.outcome.result]}</button>{t.body.title}</label>)}
        <form onSubmit={async e => { e.preventDefault(); const p = parseEntry(todo, ctx.day); if (todo.trim() && await ctx.p.write(null, {kind: 'task', logicalDay: ctx.day, body: {title: p.title, plan: {state: 'committed', target: p.target, estimateMin: p.estimateMin}}})) setTodo(''); }}>
          <input value={todo} onChange={e => setTodo(e.target.value)} placeholder="+ 할 일" aria-label="체크 추가" />
        </form>
        {sessions.length > 0 && <span className="muted small">오늘 집중 {hm(sessions.reduce((s, x) => s + (Date.parse(x.body.end!) - Date.parse(x.body.start)) / 60000, 0))}</span>}
      </div>
    </div>
  </div>;
}
