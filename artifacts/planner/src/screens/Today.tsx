import {useState} from 'react';
import {addDays, goalProgress, periodContains, routineDue, routineRate, type AnyRecord, type LifeRecord, type Task} from '@workspace/life-contract';
import {modulesFor, type ModuleSpec, type PlannerSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';

export type Nav = {day: string; setDay: (d: string) => void; openGoal: (id: string) => void};
type Ctx = {p: Planner; day: string; nav: Nav; now: () => string};
const CATEGORY: Record<string, string> = {must: '꼭', want: '하고 싶은', leisure: '여가'};
const RESULT: Record<string, string> = {done: '완료', partial: '일부', in_progress: '하는 중', missed: '못 함', postponed: '미룸', cancelled: '취소', unknown: ''};
export const label = (day: string) => new Intl.DateTimeFormat('ko-KR', {month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC'}).format(new Date(`${day}T00:00:00Z`));

export function Today({spec, p, nav, today}: {spec: PlannerSpec; p: Planner; nav: Nav; today: string}) {
  const ctx: Ctx = {p, day: nav.day, nav, now: () => new Date().toISOString()};
  return <div className="today">
    <div className="day-nav">
      <button onClick={() => nav.setDay(addDays(nav.day, -1))} aria-label="전날">‹</button>
      <h2>{label(nav.day)}</h2>
      <button onClick={() => nav.setDay(addDays(nav.day, 1))} aria-label="다음 날">›</button>
      {nav.day !== today && <button className="ghost small" onClick={() => nav.setDay(today)}>오늘</button>}
    </div>
    {modulesFor(spec, 'day').map(m => <section key={`${m.id}:${nav.day}`} className={`module module-${m.type}`}>
      <h3>{m.label}</h3>
      <ModuleBody m={m} ctx={ctx} />
    </section>)}
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

function Tasks({m, ctx}: {m: ModuleSpec; ctx: Ctx}) {
  const {p, day} = ctx;
  const cats = m.options.categories !== false, amounts = m.options.amounts !== false;
  const goals = ofKind(p.records, 'goal').filter(g => g.body.status === 'active' && periodContains(g.body.period, day));
  const tasks = ofKind(p.records, 'task').filter(t => t.logicalDay === day && !t.body.routineId).sort((a, b) => (a.body.priority ?? 9) - (b.body.priority ?? 9) || a.createdAt.localeCompare(b.createdAt));
  const [title, setTitle] = useState(''), [cat, setCat] = useState('must'), [amount, setAmount] = useState(''), [unit, setUnit] = useState('분'), [goal, setGoal] = useState('');
  const add = async () => {
    if (!title.trim()) return;
    const ok = await p.write(null, {kind: 'task', logicalDay: day, body: {title: title.trim(), category: cats ? cat : null, goalIds: goal ? [goal] : [], plan: {state: 'committed', target: amounts && Number(amount) > 0 ? {amount: Number(amount), unit} : null}}});
    if (ok) { setTitle(''); setAmount(''); }
  };
  const groups = cats ? (['must', 'want', 'leisure', null] as const).map(c => [c, tasks.filter(t => t.body.category === c)] as const).filter(([, l]) => l.length) : [[null, tasks] as const];
  return <>
    {tasks.length === 0 && <p className="muted">아직 오늘 할 일이 없어요.</p>}
    {groups.map(([c, list]) => <div key={String(c)} className="task-group">
      {cats && c && <span className={`cat cat-${c}`}>{CATEGORY[c]}</span>}
      <ul className="rows">{list.map(t => <TaskRow key={t.id} t={t} ctx={ctx} amounts={amounts} />)}</ul>
    </div>)}
    <form className="add" onSubmit={e => { e.preventDefault(); void add(); }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="할 일 추가" aria-label="할 일" />
      {cats && <select value={cat} onChange={e => setCat(e.target.value)} aria-label="분류">{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      {amounts && <><input className="num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="분량" aria-label="분량" />
        <input className="unit" value={unit} onChange={e => setUnit(e.target.value)} aria-label="단위" /></>}
      {goals.length > 0 && <select value={goal} onChange={e => setGoal(e.target.value)} aria-label="이어질 목표"><option value="">목표 없음</option>{goals.map(g => <option key={g.id} value={g.id}>{g.body.title}</option>)}</select>}
      <button className="primary">추가</button>
    </form>
  </>;
}

function TaskRow({t, ctx, amounts}: {t: LifeRecord<'task'>; ctx: Ctx; amounts: boolean}) {
  const {p, nav} = ctx;
  const [open, setOpen] = useState(false), [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const o = t.body.outcome, target = t.body.plan.target, done = o.result === 'done';
  const goals = ofKind(p.records, 'goal').filter(g => t.body.goalIds.includes(g.id));
  const toggle = () => saveTask(ctx, t, outcome(t, done
    ? {result: 'unknown', completedAt: null, reportedAt: null, amount: null, unit: null}
    : {result: 'done', completedAt: ctx.now(), reportedAt: ctx.now(), amount: o.amount ?? (amounts ? target?.amount ?? null : null), unit: o.unit ?? target?.unit ?? null}));
  const report = (result: Task['outcome']['result'], extra: Partial<Task['outcome']> = {}) => { setOpen(false); return saveTask(ctx, t, outcome(t, {result, reportedAt: ctx.now(), ...extra})); };
  const postpone = async () => {
    const next = await p.write(null, {kind: 'task', logicalDay: addDays(t.logicalDay!, 1), body: {...t.body, outcome: {}}});
    if (next) await report('postponed', {postponedTo: next.id});
  };
  return <li className={`row ${o.result}`}>
    <label className="check"><input type="checkbox" checked={done} onChange={toggle} disabled={['postponed', 'cancelled'].includes(o.result)} /><span>{t.body.title}</span></label>
    <span className="meta">
      {target && <span className="qty">{o.amount !== null && o.result !== 'done' ? `${o.amount}/` : ''}{target.amount}{target.unit}</span>}
      {RESULT[o.result] && o.result !== 'done' && <span className={`badge ${o.result}`}>{RESULT[o.result]}</span>}
      {goals.map(g => <button key={g.id} className="goal-chip" onClick={() => nav.openGoal(g.id)}>{g.body.title}</button>)}
      <button className="ghost small" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="더 보기">⋯</button>
    </span>
    {o.reason && <p className="reason">{o.reason}</p>}
    {open && <div className="row-actions">
      {amounts && <span className="inline"><input className="num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={target ? `몇 ${target.unit}?` : '얼마나?'} aria-label="한 만큼" />
        <button className="small" onClick={() => Number(amount) >= 0 && amount !== '' && report(target && Number(amount) >= target.amount ? 'done' : 'partial', {amount: Number(amount), unit: target?.unit ?? null, completedAt: target && Number(amount) >= target.amount ? ctx.now() : null})}>한 만큼 기록</button></span>}
      <span className="inline"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="이유(선택)" aria-label="이유" />
        <button className="small" onClick={() => report('missed', {reason: reason.trim() || null})}>못 했어요</button></span>
      <button className="small" onClick={postpone}>내일로 미루기</button>
      <button className="small" onClick={() => report('cancelled', {reason: reason.trim() || null})}>취소</button>
      {o.result !== 'unknown' && <button className="small" onClick={() => report('unknown', {completedAt: null, amount: null, unit: null, reason: null, reportedAt: null})}>되돌리기</button>}
      <button className="small danger" onClick={() => p.remove(t.id)}>지우기</button>
    </div>}
  </li>;
}

function Routines({m, ctx}: {m: ModuleSpec; ctx: Ctx}) {
  const {p, day} = ctx;
  const pick = m.options.mode !== 'fixed_all', askReason = m.options.askReason === true;
  const routines = ofKind(p.records, 'routine').filter(r => r.body.active);
  const instances = ofKind(p.records, 'task').filter(t => t.logicalDay === day && t.body.routineId);
  const inst = (id: string) => instances.find(t => t.body.routineId === id);
  const [title, setTitle] = useState(''), [reasons, setReasons] = useState<Record<string, string>>({});
  const rate = routineRate(p.records, day);
  const due = routines.filter(r => pick || routineDue(r.body, day));
  const shown = pick ? due.filter(r => inst(r.id)?.body.plan.state === 'committed') : due;
  const commit = (r: LifeRecord<'routine'>) => p.write(null, {kind: 'task', logicalDay: day, body: {title: r.body.title, routineId: r.id, goalIds: r.body.goalIds, plan: {state: 'committed', target: r.body.target}}});
  const check = async (r: LifeRecord<'routine'>) => {
    const t = inst(r.id) ?? (pick ? null : await commit(r) as LifeRecord<'task'> | null);
    if (!t) return;
    const done = t.body.outcome.result === 'done';
    return saveTask(ctx, t, outcome(t, done ? {result: 'unknown', completedAt: null, reportedAt: null} : {result: 'done', completedAt: ctx.now(), reportedAt: ctx.now(), reason: null}));
  };
  const missed = async (r: LifeRecord<'routine'>) => {
    const t = inst(r.id) ?? (pick ? null : await commit(r) as LifeRecord<'task'> | null);
    if (t) await saveTask(ctx, t, outcome(t, {result: 'missed', reportedAt: ctx.now(), completedAt: null, reason: reasons[r.id]?.trim() || null}));
  };
  return <>
    <p className="rate"><strong>{rate.done}</strong> / {rate.of} <span className="muted">{pick ? '오늘 고른 루틴 기준' : '정해 둔 루틴 기준'}</span></p>
    {pick && <div className="pick">
      <span className="muted">오늘 할 루틴을 골라요</span>
      {due.filter(r => !inst(r.id)).map(r => <button key={r.id} className="chip" onClick={() => commit(r)}>+ {r.body.title}</button>)}
      {due.length > 0 && due.every(r => inst(r.id)) && <span className="muted">· 모두 골랐어요</span>}
    </div>}
    <ul className="rows">{shown.map(r => {
      const t = inst(r.id), result = t?.body.outcome.result ?? 'unknown';
      return <li key={r.id} className={`row ${result}`}>
        <label className="check"><input type="checkbox" checked={result === 'done'} onChange={() => check(r)} /><span>{r.body.title}</span></label>
        <span className="meta">
          {result === 'missed' && <span className="badge missed">못 함</span>}
          {result !== 'done' && result !== 'missed' && <>
            {askReason && <input className="reason-in" value={reasons[r.id] ?? ''} onChange={e => setReasons({...reasons, [r.id]: e.target.value})} placeholder="못 한 이유" aria-label={`${r.body.title} 못 한 이유`} />}
            <button className="ghost small" onClick={() => missed(r)}>못 했어요</button></>}
          {pick && t && result === 'unknown' && <button className="ghost small" onClick={() => p.remove(t.id)} aria-label="고른 것 취소">빼기</button>}
        </span>
        {t?.body.outcome.reason && <p className="reason">{t.body.outcome.reason}</p>}
      </li>;
    })}</ul>
    <form className="add" onSubmit={async e => { e.preventDefault(); if (title.trim() && await p.write(null, {kind: 'routine', body: {title: title.trim(), recurrence: {freq: 'daily'}, mode: pick ? 'pick_daily' : 'fixed_all'}})) setTitle(''); }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="루틴 추가 (매일)" aria-label="루틴" />
      <button className="primary">추가</button>
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
