import {useState} from 'react';
import {addDays, goalProgress, periodContains, routineDue, routineRate, type AnyRecord, type LifeRecord, type Settings, type Task} from '@workspace/life-contract';
import {modulesFor, uses, type ModuleSpec, type PlannerSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {FocusBar, Receipt, Timetable, colors, hm, useTimer, type Timer} from './Focus.tsx';

export type Nav = {day: string; setDay: (d: string) => void; openGoal: (id: string) => void};
type Ctx = {p: Planner; day: string; nav: Nav; now: () => string; timer: Timer | null; color: (k: string) => string};
const CATEGORY: Record<string, string> = {must: '꼭', want: '하고 싶은', leisure: '여가'};
const RESULT: Record<string, string> = {done: '완료', partial: '일부', in_progress: '하는 중', missed: '못 함', postponed: '미룸', cancelled: '취소', unknown: '아직'};
// Paper-planner marks: ○ done, △ partly, × not done.
const MARK: Record<string, string> = {done: '○', partial: '△', missed: '×', in_progress: '◐', postponed: '→', cancelled: '–', unknown: ''};
const NEXT: Record<string, Task['outcome']['result']> = {unknown: 'done', in_progress: 'done', done: 'partial', partial: 'missed', missed: 'unknown'};
export const label = (day: string) => new Intl.DateTimeFormat('ko-KR', {month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC'}).format(new Date(`${day}T00:00:00Z`));

/** "수학 20문제" → a target of 20 문제, read locally (no AI). */
const UNITS = '분|시간|문제|문항|쪽|페이지|p|단어|개|세트|회|번|km|강|챕터|장';
export function parseTarget(text: string) {
  const m = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS})(?![가-힣a-z])`));
  return m ? {amount: Number(m[1]), unit: m[2] === 'p' ? '쪽' : m[2]!} : null;
}

export function Today({spec, settings, p, nav, today}: {spec: PlannerSpec; settings: Settings; p: Planner; nav: Nav; today: string}) {
  const timerModule = spec.modules.find(m => m.type === 'timer');
  const timer = useTimer(p, settings), color = colors(p, nav.day);
  const ctx: Ctx = {p, day: nav.day, nav, now: () => new Date().toISOString(), timer: timerModule ? timer : null, color};
  const parts = modulesFor(spec, 'day').filter(m => m.type !== 'timer');
  return <div className="sheet">
    <div className="day-nav">
      <button onClick={() => nav.setDay(addDays(nav.day, -1))} aria-label="전날">‹</button>
      <h2>{label(nav.day)}</h2>
      <button onClick={() => nav.setDay(addDays(nav.day, 1))} aria-label="다음 날">›</button>
      {nav.day !== today && <button className="ghost small" onClick={() => nav.setDay(today)}>오늘로</button>}
    </div>
    {timerModule && <FocusBar p={p} day={today} timer={timer} color={colors(p, today)} />}
    <div className={timerModule ? 'sheet-cols' : 'sheet-one'}>
      <div className="col-main">
        {nav.day === today && <CarryOver ctx={ctx} />}
        {parts.map(m => <section key={`${m.id}:${nav.day}`} className={`part part-${m.type}`}>
          <h3>{m.label}</h3>
          <ModuleBody m={m} ctx={ctx} />
        </section>)}
      </div>
      {timerModule && <div className="col-side">
        <section className="part part-timer"><h3>{timerModule.label} <span className="muted small">10분 = 한 칸</span></h3>
          <Timetable key={nav.day} m={timerModule} p={p} day={nav.day} settings={settings} color={color} /></section>
        <Receipt p={p} day={nav.day} routineRate={uses(spec, 'routine') ? routineRate(p.records, nav.day) : null} />
      </div>}
    </div>
  </div>;
}

function ModuleBody({m, ctx}: {m: ModuleSpec; ctx: Ctx}) {
  switch (m.type) {
    case 'tasks': return <Tasks m={m} ctx={ctx} />;
    case 'routine': return <Routines m={m} ctx={ctx} />;
    case 'goals': return <DayGoals ctx={ctx} />;
    case 'condition': return <ConditionBox ctx={ctx} />;
    case 'sleep': return <SleepBox ctx={ctx} />;
    case 'review': return <ReviewBox ctx={ctx} />;
    default: return <p className="muted">이 모듈은 곧 그려져요. 기록 형식은 이미 정해져 있어요.</p>;
  }
}

const saveTask = (ctx: Ctx, t: LifeRecord<'task'>, patch: Partial<Task>) => ctx.p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, ...patch}, baseRevision: t.revision});
const outcome = (t: LifeRecord<'task'>, o: Partial<Task['outcome']>): Partial<Task> => ({outcome: {...t.body.outcome, ...o}});
/** Moving a task keeps history: the original says "postponed to X", X starts fresh on the new day. */
async function moveTo(ctx: Ctx, t: LifeRecord<'task'>, day: string) {
  const next = await ctx.p.write(null, {kind: 'task', logicalDay: day, body: {...t.body, outcome: {}}});
  if (next) await saveTask(ctx, t, outcome(t, {result: 'postponed', postponedTo: next.id, reportedAt: ctx.now()}));
}

function CarryOver({ctx}: {ctx: Ctx}) {
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

function Tasks({m, ctx}: {m: ModuleSpec; ctx: Ctx}) {
  const {p, day} = ctx;
  const cats = m.options.categories !== false;
  const goals = ofKind(p.records, 'goal').filter(g => g.body.status === 'active' && periodContains(g.body.period, day));
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !t.body.routineId).sort((a, b) => (a.body.priority ?? 9) - (b.body.priority ?? 9) || a.createdAt.localeCompare(b.createdAt));
  const [title, setTitle] = useState(''), [cat, setCat] = useState('must'), [goal, setGoal] = useState('');
  const target = parseTarget(title);
  const add = async () => {
    if (!title.trim()) return;
    if (await p.write(null, {kind: 'task', logicalDay: day, body: {title: title.trim(), category: cats ? cat : null, goalIds: goal ? [goal] : [], plan: {state: 'committed', target}}})) setTitle('');
  };
  const groups = cats ? (['must', 'want', 'leisure', null] as const).map(c => [c, tasks.filter(t => t.body.category === c)] as const).filter(([, l]) => l.length) : [[null, tasks] as const];
  const done = tasks.filter(t => t.body.outcome.result === 'done').length, live = tasks.filter(t => !['cancelled', 'postponed'].includes(t.body.outcome.result)).length;
  return <>
    {tasks.length > 0 && <p className="tally muted small">{done}/{live} 완료 · 동그라미를 누르면 ○ → △ → × 순서로 바뀌어요</p>}
    {tasks.length === 0 && <p className="muted">아직 오늘 할 일이 없어요. 아래에 적어 보세요.</p>}
    {groups.map(([c, list]) => <div key={String(c)} className="task-group">
      {cats && c && <span className={`cat cat-${c}`}>{CATEGORY[c]}</span>}
      <ul className="prows">{list.map(t => <TaskRow key={t.id} t={t} ctx={ctx} />)}</ul>
    </div>)}
    <form className="padd" onSubmit={e => { e.preventDefault(); void add(); }}>
      <span className="mark static" aria-hidden="true">+</span>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="할 일 · 예) 수학 20문제, 보고서 2시간" aria-label="할 일" />
      {target && <span className="parsed" title="분량으로 읽었어요">{target.amount}{target.unit}</span>}
      {cats && <select value={cat} onChange={e => setCat(e.target.value)} aria-label="분류">{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      {goals.length > 0 && <select value={goal} onChange={e => setGoal(e.target.value)} aria-label="이어질 목표"><option value="">목표 없음</option>{goals.map(g => <option key={g.id} value={g.id}>{g.body.title}</option>)}</select>}
      <button className="primary small">추가</button>
    </form>
  </>;
}

function TaskRow({t, ctx}: {t: LifeRecord<'task'>; ctx: Ctx}) {
  const {p, nav, timer, color} = ctx;
  const [open, setOpen] = useState(false), [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const o = t.body.outcome, target = t.body.plan.target;
  const goals = ofKind(p.records, 'goal').filter(g => t.body.goalIds.includes(g.id));
  const spent = ofKind(p.records, 'session').filter(s => s.body.taskId === t.id).reduce((m, s) => m + Math.max(0, (new Date(s.body.end ?? ctx.now()).getTime() - new Date(s.body.start).getTime()) / 60000), 0);
  const running = timer?.running?.body.taskId === t.id;
  const set = (result: Task['outcome']['result'], extra: Partial<Task['outcome']> = {}) => saveTask(ctx, t, outcome(t, {
    result, reportedAt: result === 'unknown' ? null : ctx.now(),
    ...(result === 'done' ? {completedAt: ctx.now(), amount: o.amount ?? target?.amount ?? null, unit: o.unit ?? target?.unit ?? null} : {}),
    ...(result === 'unknown' ? {completedAt: null, amount: null, unit: null, reason: null} : {}), ...extra,
  }));
  const fixed = ['postponed', 'cancelled'].includes(o.result);
  return <li className={`prow ${o.result} ${running ? 'running' : ''}`} style={{'--c': color(t.id)} as React.CSSProperties}>
    <button className="mark" disabled={fixed} onClick={() => set(NEXT[o.result] ?? 'unknown')} aria-label={`${t.body.title}: ${RESULT[o.result]}. 눌러서 바꾸기`}>{MARK[o.result]}</button>
    <span className="ptitle">
      <span className="pname">{t.body.title}</span>
      <span className="psub">
        {target && <span className="qty">{o.amount !== null && o.result !== 'done' ? `${o.amount}/` : ''}{target.amount}{target.unit}</span>}
        {goals.map(g => <button key={g.id} className="goal-chip" onClick={() => nav.openGoal(g.id)}>{g.body.title}</button>)}
        {o.reason && <span className="reason">· {o.reason}</span>}
        {o.result === 'postponed' && <span>내일로 미룸</span>}
      </span>
    </span>
    {timer && spent > 0 && <span className="spent" title="이 일에 집중한 시간">{hm(spent)}</span>}
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
      <button className="small danger" onClick={() => p.remove(t.id)}>지우기</button>
    </div>}
  </li>;
}

function Routines({m, ctx}: {m: ModuleSpec; ctx: Ctx}) {
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

export function GoalBar({g, records}: {g: LifeRecord<'goal'>; records: AnyRecord[]}) {
  const pr = goalProgress(g, records, '');
  if (!pr || !g.body.target) return null;
  const max = pr.unit === '%' ? 100 : g.body.target.amount, pct = Math.min(100, Math.round(pr.amount / Math.max(1, max) * 100));
  return <span className="bar" title={`${pr.amount}/${max} ${pr.unit}`}><i style={{width: `${pct}%`}} /><em>{pr.amount}/{max} {pr.unit}</em></span>;
}
const HORIZON: Record<string, string> = {year: '연간', quarter: '분기', month: '월간', week: '주간'};
export const horizonLabel = (h: string) => HORIZON[h] ?? h;

function DayGoals({ctx}: {ctx: Ctx}) {
  const goals = ofKind(ctx.p.records, 'goal').filter(g => g.body.status === 'active' && periodContains(g.body.period, ctx.day))
    .sort((a, b) => ['week', 'month', 'quarter', 'year'].indexOf(a.body.horizon) - ['week', 'month', 'quarter', 'year'].indexOf(b.body.horizon));
  if (!goals.length) return <p className="muted">이 날에 걸린 목표가 없어요. 목표 탭에서 연간·월간·주간 목표를 세워 보세요.</p>;
  return <ul className="rows">{goals.map(g => <li key={g.id} className="row goal-row">
    <button className="link" onClick={() => ctx.nav.openGoal(g.id)}><span className="horizon">{horizonLabel(g.body.horizon)}</span>{g.body.title}</button>
    <GoalBar g={g} records={ctx.p.records} />
  </li>)}</ul>;
}

function ConditionBox({ctx}: {ctx: Ctx}) {
  const c = ofKind(ctx.p.records, 'condition').filter(r => r.logicalDay === ctx.day).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const [mood, setMood] = useState<string | null>(null);
  const save = (patch: {energy?: number; mood?: string}) => ctx.p.write(c?.id ?? null, {kind: 'condition', logicalDay: ctx.day, body: {...(c?.body ?? {}), at: ctx.now(), ...patch}, ...(c ? {baseRevision: c.revision} : {})});
  return <div className="condition">
    <div className="energy" role="group" aria-label="에너지">{[1, 2, 3, 4, 5].map(n => <button key={n} className={c?.body.energy === n ? 'on' : ''} onClick={() => save({energy: n})} aria-pressed={c?.body.energy === n}>{n}</button>)}<span className="muted">에너지</span></div>
    <input value={mood ?? c?.body.mood ?? ''} onChange={e => setMood(e.target.value)} onBlur={() => mood !== null && mood !== (c?.body.mood ?? '') && save({mood})} placeholder="지금 기분 한 마디" aria-label="기분" />
  </div>;
}

function SleepBox({ctx}: {ctx: Ctx}) {
  const s = ofKind(ctx.p.records, 'sleep').find(r => r.logicalDay === ctx.day);
  const local = (iso: string | null | undefined) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const save = (key: 'start' | 'end', v: string) => ctx.p.write(s?.id ?? null, {kind: 'sleep', logicalDay: ctx.day, body: {...(s?.body ?? {}), [key]: v ? new Date(v).toISOString() : null}, ...(s ? {baseRevision: s.revision} : {})});
  return <div className="sleep">
    <label>잠든 시각 <input type="datetime-local" defaultValue={local(s?.body.start)} onBlur={e => save('start', e.target.value)} /></label>
    <label>일어난 시각 <input type="datetime-local" defaultValue={local(s?.body.end)} onBlur={e => save('end', e.target.value)} /></label>
  </div>;
}

function ReviewBox({ctx}: {ctx: Ctx}) {
  const r = ofKind(ctx.p.records, 'review').find(x => x.logicalDay === ctx.day && x.body.horizon === 'day');
  const [text, setText] = useState<string | null>(null);
  const priv = r?.privateFields?.includes('text') ?? false;
  const save = (body: string, makePrivate = priv) => ctx.p.write(r?.id ?? null, {kind: 'review', logicalDay: ctx.day, body: {horizon: 'day', period: ctx.day, text: body || null}, privateFields: makePrivate ? ['text'] : [], ...(r ? {baseRevision: r.revision} : {})});
  return <div className="review">
    <textarea rows={3} value={text ?? r?.body.text ?? ''} onChange={e => setText(e.target.value)} onBlur={() => text !== null && text !== (r?.body.text ?? '') && save(text)} placeholder="오늘은 어땠나요? 한 줄이면 충분해요." aria-label="하루 돌아보기" />
    <label className="muted small-label"><input type="checkbox" checked={priv} onChange={e => save(text ?? r?.body.text ?? '', e.target.checked)} /> 나만 보기 (다른 서비스에 보내지 않아요)</label>
  </div>;
}
