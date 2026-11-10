import {useState} from 'react';
import {addDays, goalPercent, type LifeRecord, type Settings} from '@workspace/life-contract';
import type {PlannerSpec, PropDef, Widget} from '@workspace/planner-spec';
import {ofKind} from '../data.ts';
import {InlineEdit} from '../InlineEdit.tsx';
import {Gauge} from '../Gauge.tsx';
import type {Ctx} from './day.ts';
import {Week} from './Week.tsx';
import {Month} from './Month.tsx';
import {Goals} from './Goals.tsx';
import {Insights} from './Insights.tsx';
import {showValue} from './Table.tsx';

// Built-in views as widgets: a tab's 주간·월·목표·분석 can sit on a page with anything else around them.
export function ViewWidget({w, ctx, spec, settings, today}: {w: Widget; ctx: Ctx; spec: PlannerSpec; settings: Settings; today: string}) {
  const [month, setMonth] = useState(today.slice(0, 7)), [goalId, setGoalId] = useState<string | null>(null);
  switch (w.type) {
    case 'week-view': return <Week spec={spec} settings={settings} p={ctx.p} nav={ctx.nav} today={today} />;
    case 'month-view': return <Month p={ctx.p} nav={ctx.nav} month={month} setMonth={setMonth} today={today} />;
    case 'goals-view': return <Goals spec={spec} p={ctx.p} nav={{...ctx.nav, openGoal: id => setGoalId(id)}} today={today} goalId={goalId} setGoalId={setGoalId} />;
    case 'insights-view': return <Insights p={ctx.p} settings={settings} today={today} />;
    default: return null;
  }
}

// ── 소원 상자 ─────────────────────────────────────────────────────────────────
// Wishes are rows of this widget (note records: table = widget id, cells.state, cells.cond); no table to manage.
export const WISH_STATES = ['잠김', '해금', '사용함'] as const;
export function Wishes({w, ctx, canUnlock = true}: {w: Widget; ctx: Ctx; canUnlock?: boolean}) {
  const rows = ofKind(ctx.p.records, 'note').filter(n => n.body.signifier === 'row' && n.body.table === w.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [text, setText] = useState(''), [cond, setCond] = useState('');
  const set = (r: LifeRecord<'note'>, state: string) => ctx.p.write(r.id, {kind: 'note', logicalDay: r.logicalDay, body: {...r.body, cells: {...r.body.cells, state}}, baseRevision: r.revision});
  return <div className="wish-box">
    <ul>{rows.map(r => { const st = String(r.body.cells.state ?? '잠김');
      return <li key={r.id} className={`wish st-${WISH_STATES.indexOf(st as never)}`}>
        <span className="wish-lock" aria-hidden="true">{st === '잠김' ? '🔒' : st === '해금' ? '🔓' : '✓'}</span>
        <span className="wish-text"><InlineEdit value={r.body.text || '소원'} onSave={t => ctx.p.write(r.id, {kind: 'note', logicalDay: r.logicalDay, body: {...r.body, text: t}, baseRevision: r.revision})} />
          {r.body.cells.cond ? <em className="wish-cond">{String(r.body.cells.cond)}</em> : null}</span>
        {st === '잠김' && <button className="small" disabled={!canUnlock} onClick={() => void set(r, '해금')}>해금</button>}
        {st === '해금' && <button className="small primary" onClick={() => void set(r, '사용함')}>사용</button>}
        {st === '사용함' && <button className="ghost small" onClick={() => void set(r, '잠김')} aria-label="다시 잠그기">↺</button>}
        <button className="ghost small" onClick={() => ctx.p.remove(r.id)} aria-label="소원 지우기">×</button>
      </li>; })}</ul>
    <form className="inline wish-add" onSubmit={e => { e.preventDefault(); if (!text.trim()) return; void ctx.p.write(null, {kind: 'note', logicalDay: ctx.day, body: {text: text.trim(), signifier: 'row', table: w.id, cells: {state: '잠김', cond: cond.trim() || null}}}); setText(''); setCond(''); }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="소원" aria-label="소원" maxLength={200} />
      <input value={cond} onChange={e => setCond(e.target.value)} placeholder="조건" aria-label="해금 조건" maxLength={200} />
      <button className="small">추가</button>
    </form>
  </div>;
}

// ── 목록 보기 ────────────────────────────────────────────────────────────────
// One store (all records), many views: the same tasks or goals filtered by period, status, category or a property.
type ListOpts = {source?: 'tasks' | 'goals'; period?: 'today' | 'week' | 'month' | 'overdue' | 'all'; status?: 'open' | 'done' | 'all'; category?: string; propId?: string; propValue?: string; goalId?: string};
export function ListView({w, ctx}: {w: Widget; ctx: Ctx}) {
  const o = w.options as ListOpts, source = o.source ?? 'tasks', period = o.period ?? 'week', status = o.status ?? 'open';
  const defs: PropDef[] = ctx.spec?.props?.task ?? [];
  const day = ctx.day, monday = addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
  const inPeriod = (d: string | null) => period === 'all' ? true : !d ? false : period === 'today' ? d === day : period === 'week' ? d >= monday && d <= addDays(monday, 6) : period === 'month' ? d.startsWith(day.slice(0, 7)) : d < day;
  if (source === 'goals') {
    const goals = ofKind(ctx.p.records, 'goal').filter(g => status === 'all' || (status === 'done' ? g.body.status === 'achieved' : g.body.status === 'active'))
      .filter(g => period === 'all' || inPeriod(g.body.deadline ? (g.body.deadline.length === 7 ? `${g.body.deadline}-28` : g.body.deadline) : null));
    return <ul className="lv">{goals.map(g => <li key={g.id}><button className="link" onClick={() => ctx.nav.openGoal(g.id)}>{g.body.title}</button>
      {g.body.deadline && <span className="lv-date">~{g.body.deadline}</span>}<Gauge pct={goalPercent(g.id, ctx.p.records).pct} size="sm" /></li>)}
      {!goals.length && <li className="lv-empty">–</li>}</ul>;
  }
  const tasks = ofKind(ctx.p.records, 'task').filter(t => !t.body.routineId && t.body.plan.state !== 'dropped' && !['cancelled', 'postponed'].includes(t.body.outcome.result))
    .filter(t => period === 'overdue' ? inPeriod(t.logicalDay) && t.body.outcome.result !== 'done' : inPeriod(t.logicalDay))
    .filter(t => status === 'all' || (status === 'done' ? t.body.outcome.result === 'done' : t.body.outcome.result !== 'done'))
    .filter(t => !o.category || t.body.category === o.category)
    .filter(t => !o.goalId || t.body.goalIds.includes(o.goalId))
    .filter(t => !o.propId || String(t.body.props?.[o.propId] ?? '') === (o.propValue ?? ''))
    .sort((a, b) => (a.logicalDay ?? '').localeCompare(b.logicalDay ?? '') || a.createdAt.localeCompare(b.createdAt));
  const toggle = (t: LifeRecord<'task'>) => { const done = t.body.outcome.result === 'done'; return ctx.p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, outcome: {...t.body.outcome, result: done ? 'unknown' : 'done', completedAt: done ? null : new Date().toISOString(), reportedAt: done ? null : new Date().toISOString()}}, baseRevision: t.revision}); };
  return <ul className="lv prows">{tasks.map(t => <li key={t.id} className={`prow ${t.body.outcome.result} ${t.body.category === 'want' ? 'want' : ''}`}>
    <button className="mark mini" onClick={() => void toggle(t)} aria-label={`${t.body.title} 완료 바꾸기`}>{t.body.outcome.result === 'done' ? '○' : ''}</button>
    <span className="ptitle"><InlineEdit className="pname" value={t.body.title} onSave={title => ctx.p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, title}, baseRevision: t.revision})} />
      <span className="psub">{period !== 'today' && t.logicalDay && <span className="lv-date">{t.logicalDay.slice(5)}</span>}
        {defs.map(d => { const v = showValue(d, t.body.props?.[d.id]); return v && <span key={d.id} className="prop-val">{v}</span>; })}</span></span>
  </li>)}{!tasks.length && <li className="lv-empty">–</li>}</ul>;
}
