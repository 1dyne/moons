import {useState} from 'react';
import {goalPercent, linkedTasks, periodsOf, type Goal, type LifeRecord} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import {api, ofKind, type Planner} from '../data.ts';
import {GoalPlanPanel, NewGoal} from './GoalPlan.tsx';
import {goalSchedule, suggestGoal, unlinkedDone, weeklyFocus} from '@workspace/life-contract';
import {GoalBar, horizonLabel, label, type Nav} from './Today.tsx';
import {Gauge} from '../Gauge.tsx';
import {Tip} from '../Tip.tsx';

// Long-term goals: write one naively, let MOONS split it into milestones, review, then live by the daily list.
// Every task linked to a milestone moves the goal's overall percentage.
const ORDER = ['year', 'quarter', 'month', 'milestone', 'week'];
const rank = (h: string) => ORDER.indexOf(h);

export function Goals({spec, p, nav, today, goalId, setGoalId}: {spec: PlannerSpec; p: Planner; nav: Nav; today: string; goalId: string | null; setGoalId: (id: string | null) => void}) {
  // Weekly focus the user gives to goals: their own setting, else the last four weeks of real focus.
  const goalsModule = spec.modules.find(m => m.type === 'goals');
  const weekly = typeof goalsModule?.options.weeklyMin === 'number' ? goalsModule.options.weeklyMin as number : null;
  const weeklyMin = weekly ?? weeklyFocus(p.records, today);
  const saveWeekly = (min: number) => { if (goalsModule) void api.putSpec({...spec, modules: spec.modules.map(m => m.type === 'goals' ? {...m, options: {...m.options, weeklyMin: min}} : m)}); };
  const goals = ofKind(p.records, 'goal');
  const [view, setView] = useState<'ladder' | 'roadmap'>('ladder');
  const selected = goals.find(g => g.id === goalId);
  if (selected) return <GoalDashboard g={selected} p={p} nav={nav} today={today} back={() => setGoalId(null)} open={setGoalId} weeklyMin={weeklyMin} />;
  const levels = (spec.modules.find(m => m.type === 'goals')?.options.levels as Goal['horizon'][] | undefined) ?? ['year', 'month', 'week'];
  const roots = goals.filter(g => !g.body.parentGoalId || !goals.some(x => x.id === g.body.parentGoalId))
    .sort((a, b) => rank(a.body.horizon) - rank(b.body.horizon) || b.body.period.localeCompare(a.body.period));
  const tree = (g: LifeRecord<'goal'>, depth: number): React.ReactNode => <li key={g.id} className={`goal-node ${g.body.status}`}>
    <div className="row goal-row" style={{paddingLeft: depth * 18}}>
      <button className="link" onClick={() => setGoalId(g.id)}><span className="horizon">{g.body.horizon === 'milestone' ? `◆ ~${g.body.period}` : `${horizonLabel(g.body.horizon)} · ${g.body.period}`}</span>{g.body.title}</button>
      <GoalBar g={g} records={p.records} />
    </div>
    <ul>{goals.filter(c => c.body.parentGoalId === g.id).sort((a, b) => a.body.period.localeCompare(b.body.period)).map(c => tree(c, depth + 1))}</ul>
  </li>;
  return <div className="goals">
    <NewGoal p={p} today={today} weekly={weekly} onWeekly={saveWeekly} onDone={setGoalId} />
    <Bottlenecks p={p} today={today} weeklyMin={weeklyMin} open={setGoalId} />
    <Unlinked p={p} today={today} />
    <div className="seg" role="tablist">
      <button role="tab" aria-selected={view === 'ladder'} className={view === 'ladder' ? 'on' : ''} onClick={() => setView('ladder')}>목표 사다리</button>
      <button role="tab" aria-selected={view === 'roadmap'} className={view === 'roadmap' ? 'on' : ''} onClick={() => setView('roadmap')}>연간 로드맵</button>
    </div>
    {view === 'roadmap' ? <Roadmap p={p} today={today} open={setGoalId} /> : <section className="part"><h3>목표 사다리 <Tip id="goals-percent">퍼센트 = 이어진 할 일과 마일스톤으로 계산한 전체 진행률</Tip></h3>
      {roots.length ? <ul className="tree">{roots.map(g => tree(g, 0))}</ul> : <p className="muted">아직 목표가 없어요. 위에 큰 목표를 대충 적어 보세요.</p>}
    </section>}
    <details className="part manual"><summary>기간 목표 직접 추가 (연간·월간·주간)</summary><GoalForm p={p} goals={goals} levels={levels} today={today} /></details>
  </div>;
}

/** Finished work that moves no goal yet: link it in one tap so it counts. */
function Unlinked({p, today}: {p: Planner; today: string}) {
  const tasks = unlinkedDone(p.records, today);
  const goals = ofKind(p.records, 'goal').filter(g => g.body.status === 'active');
  if (!tasks.length || !goals.length) return null;
  return <details className="part unlinked"><summary>목표에 안 이어진 끝낸 일 {tasks.length}개 — 이으면 진행률에 들어가요</summary>
    <ul className="prows">{tasks.slice(0, 20).map(t => { const s = suggestGoal(p.records, today, t.body.title); return <li key={t.id} className="prow">
      <span className="ptitle"><span className="pname">{t.body.title}</span><span className="psub">{t.logicalDay}</span></span>
      <select defaultValue={s?.id ?? ''} aria-label={`${t.body.title} 이을 목표`} onChange={e => e.target.value && p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, goalIds: [e.target.value]}, baseRevision: t.revision})}>
        <option value="">목표 고르기</option>{goals.map(g => <option key={g.id} value={g.id}>{g.body.horizon === 'milestone' ? '◆ ' : ''}{g.body.title}</option>)}</select>
      {s && <button className="small" onClick={() => p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, goalIds: [s.id]}, baseRevision: t.revision})}>→ {s.body.title}</button>}
    </li>; })}</ul>
  </details>;
}

/** A standing warning on the goals page: goals that will miss their deadline and months where goals collide. */
function Bottlenecks({p, today, weeklyMin, open}: {p: Planner; today: string; weeklyMin: number; open: (id: string) => void}) {
  const s = goalSchedule(p.records, today, weeklyMin);
  const late = s.goals.filter(g => g.lateDays > 0);
  if (!late.length && !s.bottlenecks.length) return null;
  return <section className="part fz-clash"><h3>지금 계획대로면</h3>
    {late.map(g => <p key={g.id}>· <button className="link" onClick={() => open(g.id)}><b>{g.title}</b></button>: 마감 {g.deadline} → 가능 {g.projected} ({g.lateDays}일 늦음)</p>)}
    {s.bottlenecks.map(m => <p key={m.month}>· {m.month} 병목: {m.goals.join(', ')} — 필요 {Math.round(m.demandMin / 60)}시간 / 가능 {Math.round(m.capacityMin / 60)}시간</p>)}
  </section>;
}

function Roadmap({p, today, open}: {p: Planner; today: string; open: (id: string) => void}) {
  const [year, setYear] = useState(today.slice(0, 4));
  const goals = ofKind(p.records, 'goal');
  const tops = goals.filter(g => !g.body.parentGoalId && g.body.status !== 'dropped' && (g.body.horizon === 'year' ? g.body.period === year : g.body.period.startsWith(year)));
  const months = Array.from({length: 12}, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const descendants = (id: string): LifeRecord<'goal'>[] => goals.filter(g => g.body.parentGoalId === id).flatMap(g => [g, ...descendants(g.id)]);
  const now = today.slice(0, 7);
  return <section className="part roadmap">
    <h3><button className="ghost small" onClick={() => setYear(String(Number(year) - 1))} aria-label="이전 해">‹</button>{year} 로드맵<button className="ghost small" onClick={() => setYear(String(Number(year) + 1))} aria-label="다음 해">›</button></h3>
    {tops.length === 0 ? <p className="muted">{year}년 목표가 없어요.</p> : <div className="rm-grid" style={{gridTemplateColumns: `minmax(120px,1.4fr) repeat(12,minmax(0,1fr))`}}>
      <span className="rm-head" />{months.map(m => <span key={m} className={`rm-head ${m === now ? 'now' : ''}`}>{Number(m.slice(5))}</span>)}
      {tops.map(g => {
        const items = descendants(g.id).filter(c => c.body.horizon === 'milestone' || c.body.horizon === 'month');
        return [<button key={g.id} className="rm-goal link" onClick={() => open(g.id)}>{g.body.title}<Gauge pct={goalPercent(g.id, p.records).pct} size="sm" label={g.body.title} /></button>,
          ...months.map(m => <span key={`${g.id}-${m}`} className={`rm-cell ${m === now ? 'now' : ''}`}>
            {items.filter(c => c.body.period === m).map(c => {
              const pct = goalPercent(c.id, p.records).pct, state = c.body.status === 'achieved' ? 'done' : m < now ? 'late' : 'open';
              return <button key={c.id} className={`rm-ms ${state}`} onClick={() => open(c.id)} title={`${c.body.title} · ${pct}%`}>◆<span>{c.body.title}</span></button>;
            })}
          </span>)];
      })}
    </div>}
    <Tip id="roadmap-legend" block>◆ 초록 = 이룸 · 빨강 = 끝낼 달이 지났는데 아직 · 회색 = 남은 마일스톤</Tip>
  </section>;
}

function GoalForm({p, goals, levels, today}: {p: Planner; goals: LifeRecord<'goal'>[]; levels: Goal['horizon'][]; today: string}) {
  const periods = periodsOf(today);
  const [title, setTitle] = useState(''), [horizon, setHorizon] = useState<Goal['horizon']>(levels[0] ?? 'month'), [parent, setParent] = useState('');
  const [amount, setAmount] = useState(''), [unit, setUnit] = useState(''), [agg, setAgg] = useState<'sum' | 'count'>('sum');
  const parents = goals.filter(g => g.body.status === 'active' && rank(g.body.horizon) < rank(horizon));
  const add = async () => {
    if (!title.trim() || horizon === 'milestone') return;
    const target = Number(amount) > 0 ? {amount: Number(amount), unit: unit.trim() || (agg === 'count' ? '번' : '개'), aggregation: agg} : null;
    if (await p.write(null, {kind: 'goal', body: {title: title.trim(), horizon, period: periods[horizon], parentGoalId: parent || null, target}})) { setTitle(''); setAmount(''); }
  };
  return <form className="add stack" onSubmit={e => { e.preventDefault(); void add(); }}>
    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 이번 달 단어 600개" aria-label="기간 목표" />
    <div className="inline">
      <select value={horizon} onChange={e => setHorizon(e.target.value as Goal['horizon'])} aria-label="기간">{levels.filter(h => h !== 'milestone').map(h => <option key={h} value={h}>{horizonLabel(h)} ({periods[h as keyof typeof periods]})</option>)}</select>
      {parents.length > 0 && <select value={parent} onChange={e => setParent(e.target.value)} aria-label="위 목표"><option value="">위 목표 없음</option>{parents.map(g => <option key={g.id} value={g.id}>{horizonLabel(g.body.horizon)} · {g.body.title}</option>)}</select>}
    </div>
    <div className="inline">
      <input className="num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="목표량" aria-label="목표량" />
      <input className="unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="단위" aria-label="단위" />
      <select value={agg} onChange={e => setAgg(e.target.value as 'sum' | 'count')} aria-label="세는 법"><option value="sum">한 양을 더해서</option><option value="count">완료한 횟수로</option></select>
      <button className="primary">추가</button>
    </div>
  </form>;
}

function GoalDashboard({g, p, nav, today, back, open, weeklyMin}: {g: LifeRecord<'goal'>; p: Planner; nav: Nav; today: string; back: () => void; open: (id: string) => void; weeklyMin: number}) {
  const goals = ofKind(p.records, 'goal'), parent = goals.find(x => x.id === g.body.parentGoalId);
  const children = goals.filter(x => x.body.parentGoalId === g.id).sort((a, b) => a.body.period.localeCompare(b.body.period));
  const tasks = linkedTasks(g, p.records).sort((a, b) => (b.logicalDay ?? '').localeCompare(a.logicalDay ?? ''));
  const days = [...new Set(tasks.map(t => t.logicalDay ?? ''))];
  const [ms, setMs] = useState(''), [due, setDue] = useState(today.slice(0, 7));
  const setStatus = (x: LifeRecord<'goal'>, status: Goal['status']) => p.write(x.id, {kind: 'goal', body: {...x.body, status}, baseRevision: x.revision});
  const gp = goalPercent(g.id, p.records);
  return <div className="dashboard">
    <button className="ghost small" onClick={back}>‹ 목표</button>
    <h2><span className="horizon">{g.body.horizon === 'milestone' ? `마일스톤 · ~${g.body.period}` : `${horizonLabel(g.body.horizon)} · ${g.body.period}`}</span>{g.body.title}</h2>
    <div className="big-pct"><Gauge pct={gp.basis === 'none' ? null : gp.pct} size="lg" label={g.body.title} />
      <span className="muted small">{{achieved: '이룬 목표', target: '목표량 대비', children: '마일스톤·아래 목표의 무게로 계산', tasks: '이어진 할 일 중 끝낸 비율 · "이뤘어요"를 누르기 전엔 최대 90%', none: '아직 이어진 일이 없어요'}[gp.basis]}</span></div>
    {g.body.criterion && <p className="muted">{g.body.criterion}</p>}
    {parent && <p className="muted">위 목표: <button className="link" onClick={() => open(parent.id)}>{parent.body.title}</button> ({goalPercent(parent.id, p.records).pct}%)</p>}
    {g.body.horizon !== 'milestone' && <section className="part"><h3>마일스톤 · 아래 목표</h3>
      <ul className="prows">{children.map(c => <li key={c.id} className={`prow ${c.body.status === 'achieved' ? 'done' : ''}`}>
        <button className="mark" onClick={() => setStatus(c, c.body.status === 'achieved' ? 'active' : 'achieved')} aria-label={`${c.body.title} 이룸 표시`}>{c.body.status === 'achieved' ? '○' : ''}</button>
        <button className="link ptitle" onClick={() => open(c.id)}><span className="pname">{c.body.title}</span><span className="psub">{c.body.horizon === 'milestone' ? `~${c.body.period} · 무게 ${c.body.weight}` : horizonLabel(c.body.horizon)}</span></button>
        <GoalBar g={c} records={p.records} />
      </li>)}</ul>
      <form className="padd" onSubmit={async e => { e.preventDefault(); if (ms.trim() && await p.write(null, {kind: 'goal', body: {title: ms.trim(), horizon: 'milestone', period: due, parentGoalId: g.id}})) setMs(''); }}>
        <span className="mark static" aria-hidden="true">◆</span><input value={ms} onChange={e => setMs(e.target.value)} placeholder="마일스톤 추가" aria-label="마일스톤" /><input type="month" value={due} onChange={e => setDue(e.target.value)} aria-label="끝낼 달" /><button className="small">추가</button>
      </form>
    </section>}
    {g.body.horizon !== 'milestone' && <GoalPlanPanel p={p} goalId={g.id} today={today} weeklyMin={weeklyMin} />}
    <section className="part"><h3>이 목표로 이어진 하루들</h3>
      {days.length === 0 && <p className="muted">아직 이어진 할 일이 없어요. 오늘 화면에서 할 일을 추가할 때 이 목표를 고르면 진행률이 올라가요.</p>}
      {days.map(d => <div key={d} className="history-day">
        <button className="link day-link" onClick={() => nav.setDay(d)}>{d ? label(d) : '날짜 없음'}</button>
        <ul className="rows">{tasks.filter(t => (t.logicalDay ?? '') === d).map(t => <li key={t.id} className={`row ${t.body.outcome.result}`}><span>{t.body.title}</span><span className="meta">{t.body.outcome.amount !== null ? `${t.body.outcome.amount}${t.body.outcome.unit ?? ''}` : t.body.plan.target ? `${t.body.plan.target.amount}${t.body.plan.target.unit}` : ''} {t.body.outcome.result === 'done' ? '✓' : ''}</span></li>)}</ul>
      </div>)}
    </section>
    <div className="inline">
      {g.body.status !== 'achieved' && <button className="small" onClick={() => setStatus(g, 'achieved')}>이뤘어요</button>}
      {g.body.status !== 'active' && <button className="small" onClick={() => setStatus(g, 'active')}>다시 진행</button>}
      {g.body.status === 'active' && <button className="small" onClick={() => setStatus(g, 'paused')}>잠시 멈춤</button>}
      <button className="small danger" onClick={async () => { await p.remove(g.id); back(); }}>지우기</button>
    </div>
  </div>;
}
