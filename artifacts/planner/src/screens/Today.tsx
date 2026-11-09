import {useState} from 'react';
import {addDays, goalPercent, goalProgress, logicalDay, periodContains, personaShare, suggestGoal, routineDue, routineRate, type AnyRecord, type LifeRecord, type Settings, type Task} from '@workspace/life-contract';
import {modulesFor, uses, type ModuleSpec, type PlannerSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {FocusBar, Receipt, Timetable, colors, hm, useTimer, type Timer} from './Focus.tsx';
import {CheckIn, ConditionDay} from './CheckIn.tsx';
import {parseEntry} from '../parse.ts';
import {MARK, NEXT, moveTo, outcome, saveTask, type Ctx, type Nav} from './day.ts';
export {MARK, NEXT, moveTo, outcome, saveTask, type Ctx, type Nav} from './day.ts';
import {BulletDay, HourlyDay, OnePageDay} from './DayLayouts.tsx';
import {Gauge} from '../Gauge.tsx';
import {HIGHLIGHTS} from '@workspace/planner-spec';
export {parseEntry, parseTarget} from '../parse.ts';

const CATEGORY: Record<string, string> = {must: '꼭', want: '하고 싶은', leisure: '여가'};
const RESULT: Record<string, string> = {done: '완료', partial: '일부', in_progress: '하는 중', missed: '못 함', postponed: '미룸', cancelled: '취소', unknown: '아직'};
// Paper-planner marks: ○ done, △ partly, × not done.
export const label = (day: string) => new Intl.DateTimeFormat('ko-KR', {month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC'}).format(new Date(`${day}T00:00:00Z`));

/** Goals a day's task can move: calendar goals that contain the day and open milestones. */
export const linkableGoals = (records: AnyRecord[], day: string) => ofKind(records, 'goal').filter(g => g.body.status === 'active' && (g.body.horizon === 'milestone' ? g.body.period >= day.slice(0, 7) : periodContains(g.body.period, day)));
export function CarryOver({ctx}: {ctx: Ctx}) {
  const left = ofKind(ctx.p.records, 'task').filter(t => t.logicalDay === addDays(ctx.day, -1) && !t.body.routineId && ['unknown', 'in_progress', 'partial', 'missed'].includes(t.body.outcome.result) && t.body.plan.state !== 'dropped');
  if (!left.length) return null;
  return <section className="part carry">
    <h3>어제 못 끝낸 일 <span className="muted small">{left.length}</span></h3>
    <ul className="prows">{left.map(t => <li key={t.id} className="prow">
      <span className="mark static">{MARK[t.body.outcome.result]}</span>
      <span className="ptitle">{t.body.title}</span>
      <button className="small" onClick={() => moveTo(ctx, t, ctx.day)}>오늘로 →</button>
    </li>)}</ul>
  </section>;
}

export function Tasks({m, ctx}: {m: ModuleSpec; ctx: Ctx}) {
  const {p, day} = ctx;
  const cats = m.options.categories !== false;
  const goals = linkableGoals(p.records, day), personas = ofKind(p.records, 'persona').filter(x => x.body.active);
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !t.body.routineId && !t.body.plan.fixed).sort((a, b) => (a.body.priority ?? 9) - (b.body.priority ?? 9) || a.createdAt.localeCompare(b.createdAt));
  const [title, setTitle] = useState(''), [cat, setCat] = useState('must'), [goal, setGoal] = useState(''), [persona, setPersona] = useState('');
  const parsed = parseEntry(title, day), target = parsed.target;
  // Until the user picks a goal, the one the title points to is preselected, so a check moves it without extra taps.
  const [picked, setPicked] = useState(false);
  const auto = !picked && title.trim() ? suggestGoal(p.records, day, title) : null;
  const goalId = picked ? goal : auto?.id ?? '';
  const add = async () => {
    if (!title.trim()) return;
    if (await p.write(null, {kind: 'task', logicalDay: day, body: {title: parsed.title, category: cats && !parsed.fixed ? cat : null, goalIds: goalId ? [goalId] : [], personaIds: persona ? [persona] : [],
      plan: {state: 'committed', target, estimateMin: parsed.estimateMin, ...(parsed.fixed ? {fixed: true, ...parsed.fixed} : {})}}})) { setTitle(''); setPicked(false); setGoal(''); }
  };
  const groups = cats ? (['must', 'want', 'leisure', null] as const).map(c => [c, tasks.filter(t => t.body.category === c)] as const).filter(([, l]) => l.length) : [[null, tasks] as const];
  const done = tasks.filter(t => t.body.outcome.result === 'done').length, live = tasks.filter(t => !['cancelled', 'postponed'].includes(t.body.outcome.result)).length;
  return <>
    {tasks.length > 0 && <p className="tally muted small">{done}/{live} 완료 · 체크 칸을 누를 때마다 완료 → 일부 → 못 함 → 처음으로</p>}
    {tasks.length === 0 && <p className="muted">아직 오늘 할 일이 없어요. 아래에 적어 보세요.</p>}
    {groups.map(([c, list]) => <div key={String(c)} className="task-group">
      {cats && c && <span className={`cat cat-${c}`}>{CATEGORY[c]}</span>}
      <ul className="prows">{list.map(t => <TaskRow key={t.id} t={t} ctx={ctx} />)}</ul>
    </div>)}
    <form className="padd" onSubmit={e => { e.preventDefault(); void add(); }}>
      <span className="mark static" aria-hidden="true">+</span>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="할 일 · 예) 수학 20문제, 보고서 90분, 14:00-15:00 회의" aria-label="할 일" />
      {parsed.fixed ? <span className="parsed" title="고정 일정으로 읽었어요">고정 일정</span> : parsed.estimateMin ? <span className="parsed" title="예상 시간으로 읽었어요">예상 {parsed.estimateMin}분</span> : target && <span className="parsed" title="분량으로 읽었어요">{target.amount}{target.unit}</span>}
      {cats && <select value={cat} onChange={e => setCat(e.target.value)} aria-label="분류">{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      {auto && <span className="parsed auto-goal" title="제목으로 고른 목표예요. 바꾸려면 옆에서 고르세요">→ {auto.body.title}</span>}
      {goals.length > 0 && <select value={goalId} onChange={e => { setGoal(e.target.value); setPicked(true); }} aria-label="이어질 목표"><option value="">목표 없음</option>{goals.map(g => <option key={g.id} value={g.id}>{g.body.horizon === 'milestone' ? '◆ ' : ''}{g.body.title}</option>)}</select>}
      {personas.length > 0 && <select value={persona} onChange={e => setPersona(e.target.value)} aria-label="페르소나"><option value="">페르소나</option>{personas.map(x => <option key={x.id} value={x.id}>{x.body.name}</option>)}</select>}
      <button className="primary small">추가</button>
    </form>
  </>;
}

function TaskRow({t, ctx}: {t: LifeRecord<'task'>; ctx: Ctx}) {
  const {p, nav, timer, color} = ctx;
  const [open, setOpen] = useState(false), [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const o = t.body.outcome, target = t.body.plan.target;
  const goals = ofKind(p.records, 'goal').filter(g => t.body.goalIds.includes(g.id)), personas = ofKind(p.records, 'persona').filter(x => t.body.personaIds.includes(x.id));
  const spent = ofKind(p.records, 'session').filter(s => s.body.taskId === t.id).reduce((m, s) => m + Math.max(0, (new Date(s.body.end ?? ctx.now()).getTime() - new Date(s.body.start).getTime()) / 60000), 0);
  const running = timer?.running?.body.taskId === t.id;
  const set = (result: Task['outcome']['result'], extra: Partial<Task['outcome']> = {}) => saveTask(ctx, t, outcome(t, {
    result, reportedAt: result === 'unknown' ? null : ctx.now(),
    ...(result === 'done' ? {completedAt: ctx.now(), amount: o.amount ?? target?.amount ?? null, unit: o.unit ?? target?.unit ?? null} : {}),
    ...(result === 'unknown' ? {completedAt: null, amount: null, unit: null, reason: null} : {}), ...extra,
  }));
  const fixed = ['postponed', 'cancelled'].includes(o.result);
  const hl = HIGHLIGHTS.find(h => h.id === t.body.highlight);
  const pen = (id: Task['highlight']) => saveTask(ctx, t, {...t.body, highlight: id});
  return <li className={`prow ${o.result} ${running ? 'running' : ''} ${hl ? 'hl' : ''}`} style={{'--c': color(t.id), ...(hl ? {'--hl': hl.color} : {})} as React.CSSProperties}>
    <button className="mark" disabled={fixed} onClick={() => set(NEXT[o.result] ?? 'unknown')} aria-label={`${t.body.title}: ${RESULT[o.result]}. 눌러서 바꾸기`}>{MARK[o.result]}</button>
    <span className="ptitle">
      <span className="pname">{t.body.title}</span>
      <span className="psub">
        {target && <span className="qty">{o.amount !== null && o.result !== 'done' ? `${o.amount}/` : ''}{target.amount}{target.unit}</span>}
        {goals.map(g => <button key={g.id} className="goal-chip" onClick={() => nav.openGoal(g.id)} title="이 할 일이 올리는 목표">→ {g.body.title} <b>{goalPercent(g.id, p.records).pct}%</b></button>)}
        {personas.map(x => <span key={x.id} className="persona-chip" style={{'--pc': x.body.color} as React.CSSProperties}>{x.body.name}</span>)}
        {o.reason && <span className="reason">· {o.reason}</span>}
        {o.result === 'postponed' && <span>내일로 미룸</span>}
      </span>
    </span>
    {t.body.plan.estimateMin ? <span className={`spent ${spent > t.body.plan.estimateMin ? 'late' : ''}`} title="예상 시간 대비 실제 집중 시간">{hm(spent)}<small>/{hm(t.body.plan.estimateMin)}</small></span>
      : timer && spent > 0 && <span className="spent" title="이 일에 집중한 시간">{hm(spent)}</span>}
    {timer && !fixed && o.result !== 'done' && (running
      ? <button className="play on" onClick={timer.stop} aria-label={`${t.body.title} 멈추기`}>■</button>
      : <button className="play" onClick={() => timer.start({task: t})} aria-label={`${t.body.title} 시작`}>▶</button>)}
    <button className="ghost small more" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="더 보기">⋯</button>
    {open && <div className="row-actions">
      <span className="inline"><input className="num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={target ? `몇 ${target.unit}?` : '얼마나?'} aria-label="한 만큼" />
        <button className="small" onClick={() => { if (amount === '' || Number.isNaN(Number(amount))) return; const n = Number(amount); setOpen(false); void set(target && n >= target.amount ? 'done' : 'partial', {amount: n, unit: target?.unit ?? null}); }}>한 만큼 기록</button></span>
      <span className="inline"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="못 한 이유(선택)" aria-label="이유" />
        <button className="small" onClick={() => { setOpen(false); void set('missed', {reason: reason.trim() || null}); }}>× 못 했어요</button></span>
      <button className="small" onClick={() => moveTo(ctx, t, addDays(t.logicalDay!, 1))}>내일로 →</button>
      <button className="small" onClick={() => set('cancelled', {reason: reason.trim() || null})}>취소</button>
      {o.result !== 'unknown' && <button className="small" onClick={() => set('unknown')}>되돌리기</button>}
      <span className="inline pens" role="group" aria-label="형광펜"><span className="muted small">형광펜</span>
        {HIGHLIGHTS.map(h => <button key={h.id} className={`pen ${t.body.highlight === h.id ? 'on' : ''}`} style={{'--hl': h.color} as React.CSSProperties} aria-pressed={t.body.highlight === h.id} onClick={() => void pen(t.body.highlight === h.id ? null : h.id)} aria-label={`${h.name} 형광펜`} />)}
        {t.body.highlight && <button className="small ghost" onClick={() => void pen(null)}>지우기</button>}</span>
      <button className="small danger" onClick={() => p.remove(t.id)}>지우기</button>
    </div>}
  </li>;
}

export function Routines({m, ctx}: {m: ModuleSpec; ctx: Ctx}) {
  const {p, day, timer} = ctx;
  const pick = m.options.mode !== 'fixed_all', askReason = m.options.askReason === true;
  const routines = ofKind(p.records, 'routine').filter(r => r.body.active);
  const instances = ofKind(p.records, 'task').filter(t => t.logicalDay === day && t.body.routineId);
  const inst = (id: string) => instances.find(t => t.body.routineId === id);
  const [title, setTitle] = useState(''), [reasons, setReasons] = useState<Record<string, string>>({});
  const rate = routineRate(p.records, day);
  const due = routines.filter(r => pick || routineDue(r.body, day));
  const shown = pick ? due.filter(r => inst(r.id)?.body.plan.state === 'committed') : due;
  const commit = (r: LifeRecord<'routine'>) => p.write(null, {kind: 'task', logicalDay: day, body: {title: r.body.title, routineId: r.id, goalIds: r.body.goalIds, plan: {state: 'committed', target: r.body.target}}}) as Promise<LifeRecord<'task'> | null>;
  const instance = async (r: LifeRecord<'routine'>) => inst(r.id) ?? (pick ? null : await commit(r));
  const set = async (r: LifeRecord<'routine'>, result: Task['outcome']['result']) => {
    const t = await instance(r); if (!t) return;
    await saveTask(ctx, t, outcome(t, result === 'done' ? {result, completedAt: ctx.now(), reportedAt: ctx.now(), reason: null}
      : result === 'missed' ? {result, completedAt: null, reportedAt: ctx.now(), reason: reasons[r.id]?.trim() || null}
      : {result, completedAt: null, reportedAt: null, reason: null}));
  };
  return <>
    <p className="tally"><strong>{rate.done}</strong>/{rate.of} <span className="muted small">{pick ? '오늘 고른 루틴만 세요' : '정해 둔 루틴 전부를 세요'}</span></p>
    {pick && <div className="pick">
      {due.filter(r => !inst(r.id)).map(r => <button key={r.id} className="chip" onClick={() => commit(r)}>+ {r.body.title}</button>)}
      {due.length > 0 && due.every(r => inst(r.id)) && <span className="muted small">오늘 할 루틴을 모두 골랐어요</span>}
      {due.length === 0 && <span className="muted small">루틴을 추가하면 여기서 오늘 할 것을 골라요</span>}
    </div>}
    <ul className="prows">{shown.map(r => {
      const t = inst(r.id), result = t?.body.outcome.result ?? 'unknown', running = !!t && timer?.running?.body.taskId === t.id;
      return <li key={r.id} className={`prow ${result}`}>
        <button className="mark" onClick={() => set(r, result === 'done' ? 'unknown' : 'done')} aria-label={`${r.body.title}: ${RESULT[result]}. 눌러서 바꾸기`}>{MARK[result]}</button>
        <span className="ptitle"><span className="pname">{r.body.title}</span>{t?.body.outcome.reason && <span className="psub reason">· {t.body.outcome.reason}</span>}</span>
        {result !== 'done' && result !== 'missed' && <>
          {askReason && <input className="reason-in" value={reasons[r.id] ?? ''} onChange={e => setReasons({...reasons, [r.id]: e.target.value})} placeholder="못 한 이유" aria-label={`${r.body.title} 못 한 이유`} />}
          <button className="ghost small" onClick={() => set(r, 'missed')}>× 못 했어요</button>
          {timer && t && (running ? <button className="play on" onClick={timer.stop} aria-label="멈추기">■</button> : <button className="play" onClick={() => timer.start({task: t})} aria-label={`${r.body.title} 시작`}>▶</button>)}
        </>}
        {result === 'missed' && <button className="ghost small" onClick={() => set(r, 'unknown')}>되돌리기</button>}
        {pick && t && result === 'unknown' && <button className="ghost small" onClick={() => p.remove(t.id)} aria-label="고른 것 빼기">빼기</button>}
      </li>;
    })}</ul>
    <form className="padd" onSubmit={async e => { e.preventDefault(); if (title.trim() && await p.write(null, {kind: 'routine', body: {title: title.trim(), recurrence: {freq: 'daily'}, mode: pick ? 'pick_daily' : 'fixed_all'}})) setTitle(''); }}>
      <span className="mark static" aria-hidden="true">+</span>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="루틴 추가 (매일)" aria-label="루틴" />
      <button className="primary small">추가</button>
    </form>
  </>;
}

/** Overall progress (0–100%) with the measured amount when the goal has a target. */
export function GoalBar({g, records}: {g: LifeRecord<'goal'>; records: AnyRecord[]}) {
  const gp = goalPercent(g.id, records), pr = g.body.target ? goalProgress(g, records, '') : null;
  const detail = pr && g.body.target ? ` · ${pr.amount}/${pr.unit === '%' ? 100 : g.body.target.amount}${pr.unit}` : '';
  const how = {achieved: '이룸', target: '목표량 기준', children: '아래 목표·마일스톤 기준', tasks: '이어진 할 일 기준(이룸 표시 전 최대 90%)', none: '아직 이어진 일이 없어요'}[gp.basis];
  return <span className="goal-gauge" title={`${gp.pct}% · ${how}`}><Gauge pct={gp.basis === 'none' ? null : gp.pct} size="sm" label={g.body.title} />{detail && <em className="g-detail">{detail.slice(3)}</em>}</span>;
}
const HORIZON: Record<string, string> = {year: '연간', quarter: '분기', month: '월간', week: '주간', milestone: '마일스톤'};
export const horizonLabel = (h: string) => HORIZON[h] ?? h;

export function DayGoals({ctx}: {ctx: Ctx}) {
  const order = ['week', 'milestone', 'month', 'quarter', 'year'];
  const goals = linkableGoals(ctx.p.records, ctx.day).sort((a, b) => order.indexOf(a.body.horizon) - order.indexOf(b.body.horizon) || a.body.period.localeCompare(b.body.period)).slice(0, 8);
  if (!goals.length) return <p className="muted">이 날에 걸린 목표가 없어요. 목표 탭에서 연간·월간·주간 목표를 세워 보세요.</p>;
  return <ul className="rows">{goals.map(g => <li key={g.id} className="row goal-row">
    <button className="link" onClick={() => ctx.nav.openGoal(g.id)}><span className="horizon">{horizonLabel(g.body.horizon)}</span>{g.body.title}</button>
    <GoalBar g={g} records={ctx.p.records} />
  </li>)}</ul>;
}

export function PersonaToday({ctx}: {ctx: Ctx}) {
  const share = personaShare(ctx.p.records, ctx.day, 1), recent = personaShare(ctx.p.records, ctx.day, 14);
  if (!share.rows.length) return <p className="muted small">설정 → 페르소나에서 나의 역할(예: 수험생, 직장인, 창작자)을 만들면 할 일에 붙일 수 있어요.</p>;
  return <div className="persona-today">
    {share.rows.map(r => <span key={r.id} className="persona-chip big" style={{'--pc': r.color} as React.CSSProperties}>{r.name} <b>{hm(r.minutes)}</b> <small>할 일 {r.done}/{r.tasks}</small></span>)}
    {recent.total > 0 && <p className="muted small">최근 2주: {recent.rows.filter(r => r.minutes).map(r => `${r.name} ${r.share}%`).join(' · ')}</p>}
  </div>;
}

/** Sleep by two taps: "잘게요" starts it, "일어났어요" ends it. The night belongs to the day you wake into. */
export function SleepBox({ctx}: {ctx: Ctx}) {
  const settings = ctx.settings ?? {tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', dayBoundary: '04:00'};
  const sleeps = ofKind(ctx.p.records, 'sleep');
  const running = sleeps.find(r => r.body.start && !r.body.end);
  const night = sleeps.filter(r => r.logicalDay === ctx.day && r.body.end).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const [edit, setEdit] = useState(false);
  const local = (iso: string | null | undefined) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const clock = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
  const start = () => { const at = ctx.now(); return ctx.p.write(null, {kind: 'sleep', logicalDay: logicalDay(at, settings), body: {start: at}}); };
  const wake = () => { if (!running) return; const at = ctx.now(); return ctx.p.write(running.id, {kind: 'sleep', logicalDay: logicalDay(at, settings), body: {...running.body, end: at}, baseRevision: running.revision}); };
  const save = (key: 'start' | 'end', v: string) => night && ctx.p.write(night.id, {kind: 'sleep', logicalDay: night.logicalDay, body: {...night.body, [key]: v ? new Date(v).toISOString() : null}, baseRevision: night.revision});
  if (running) return <div className="sleep running">
    <span className="sleep-moon" aria-hidden="true">☾</span><span>{clock(running.body.start!)}부터 자는 중 · {hm((Date.now() - Date.parse(running.body.start!)) / 60000)}</span>
    <button className="primary" onClick={wake}>일어났어요</button>
    <button className="ghost small" onClick={() => ctx.p.remove(running.id)}>취소</button>
  </div>;
  return <div className="sleep">
    {night ? <p className="sleep-night"><b>{clock(night.body.start!)} → {clock(night.body.end!)}</b> · {hm((Date.parse(night.body.end!) - Date.parse(night.body.start!)) / 60000)} 잤어요
      <button className="ghost small" onClick={() => setEdit(!edit)}>{edit ? '닫기' : '고치기'}</button>
      <button className="ghost small danger" onClick={() => ctx.p.remove(night.id)}>지우기</button></p>
      : <p className="muted small">자기 전에 "잘게요", 일어나면 "일어났어요"를 누르세요.</p>}
    {edit && night && <div className="inline">
      <label>잠든 시각 <input type="datetime-local" defaultValue={local(night.body.start)} onBlur={e => save('start', e.target.value)} /></label>
      <label>일어난 시각 <input type="datetime-local" defaultValue={local(night.body.end)} onBlur={e => save('end', e.target.value)} /></label></div>}
    <button className="small" onClick={start}>☾ 잘게요</button>
  </div>;
}

export function ReviewBox({ctx}: {ctx: Ctx}) {
  const r = ofKind(ctx.p.records, 'review').find(x => x.logicalDay === ctx.day && x.body.horizon === 'day');
  const [text, setText] = useState<string | null>(null);
  const priv = r?.privateFields?.includes('text') ?? false;
  const save = (body: string, makePrivate = priv) => ctx.p.write(r?.id ?? null, {kind: 'review', logicalDay: ctx.day, body: {horizon: 'day', period: ctx.day, text: body || null}, privateFields: makePrivate ? ['text'] : [], ...(r ? {baseRevision: r.revision} : {})});
  return <div className="review">
    <textarea rows={3} value={text ?? r?.body.text ?? ''} onChange={e => setText(e.target.value)} onBlur={() => text !== null && text !== (r?.body.text ?? '') && save(text)} placeholder="오늘은 어땠나요? 한 줄이면 충분해요." aria-label="하루 돌아보기" />
    <label className="muted small-label"><input type="checkbox" checked={priv} onChange={e => save(text ?? r?.body.text ?? '', e.target.checked)} /> 나만 보기 (다른 서비스에 보내지 않아요)</label>
    {r && <button className="ghost small danger" onClick={async () => { await ctx.p.remove(r.id); setText(''); }}>지우기</button>}
  </div>;
}
