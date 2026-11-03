import {useState} from 'react';
import {linkedTasks, periodsOf, type LifeRecord, type Goal} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {GoalBar, horizonLabel, label, type Nav} from './Today.tsx';

// Goals are a ladder (year → month → week). Days link up to them; this screen reads those links back.
export function Goals({spec, p, nav, today, goalId, setGoalId}: {spec: PlannerSpec; p: Planner; nav: Nav; today: string; goalId: string | null; setGoalId: (id: string | null) => void}) {
  const goals = ofKind(p.records, 'goal');
  const selected = goals.find(g => g.id === goalId);
  if (selected) return <GoalDashboard g={selected} p={p} nav={nav} back={() => setGoalId(null)} open={setGoalId} />;
  const levels = (spec.modules.find(m => m.type === 'goals')?.options.levels as Goal['horizon'][] | undefined) ?? ['year', 'month', 'week'];
  const roots = goals.filter(g => !g.body.parentGoalId || !goals.some(x => x.id === g.body.parentGoalId))
    .sort((a, b) => ['year', 'quarter', 'month', 'week'].indexOf(a.body.horizon) - ['year', 'quarter', 'month', 'week'].indexOf(b.body.horizon) || b.body.period.localeCompare(a.body.period));
  const tree = (g: LifeRecord<'goal'>, depth: number): React.ReactNode => <li key={g.id} className={`goal-node ${g.body.status}`}>
    <div className="row goal-row" style={{paddingLeft: depth * 18}}>
      <button className="link" onClick={() => setGoalId(g.id)}><span className="horizon">{horizonLabel(g.body.horizon)} · {g.body.period}</span>{g.body.title}</button>
      <GoalBar g={g} records={p.records} />
    </div>
    <ul>{goals.filter(c => c.body.parentGoalId === g.id).map(c => tree(c, depth + 1))}</ul>
  </li>;
  return <div className="goals">
    <section className="module"><h3>목표 사다리</h3>
      {roots.length ? <ul className="tree">{roots.map(g => tree(g, 0))}</ul> : <p className="muted">아직 목표가 없어요. 큰 목표부터 적어 보세요.</p>}
    </section>
    <section className="module"><h3>목표 추가</h3><GoalForm p={p} goals={goals} levels={levels} today={today} /></section>
  </div>;
}

function GoalForm({p, goals, levels, today}: {p: Planner; goals: LifeRecord<'goal'>[]; levels: Goal['horizon'][]; today: string}) {
  const periods = periodsOf(today);
  const [title, setTitle] = useState(''), [horizon, setHorizon] = useState<Goal['horizon']>(levels[0] ?? 'month'), [parent, setParent] = useState('');
  const [amount, setAmount] = useState(''), [unit, setUnit] = useState(''), [agg, setAgg] = useState<'sum' | 'count'>('sum');
  const parents = goals.filter(g => g.body.status === 'active' && ['year', 'quarter', 'month', 'week'].indexOf(g.body.horizon) < ['year', 'quarter', 'month', 'week'].indexOf(horizon));
  const add = async () => {
    if (!title.trim()) return;
    const target = Number(amount) > 0 ? {amount: Number(amount), unit: unit.trim() || (agg === 'count' ? '번' : '개'), aggregation: agg} : null;
    if (await p.write(null, {kind: 'goal', body: {title: title.trim(), horizon, period: periods[horizon], parentGoalId: parent || null, target}})) { setTitle(''); setAmount(''); }
  };
  return <form className="add stack" onSubmit={e => { e.preventDefault(); void add(); }}>
    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 단어 600개 외우기" aria-label="목표" />
    <div className="inline">
      <select value={horizon} onChange={e => setHorizon(e.target.value as Goal['horizon'])} aria-label="기간">{levels.map(h => <option key={h} value={h}>{horizonLabel(h)} ({periods[h]})</option>)}</select>
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

function GoalDashboard({g, p, nav, back, open}: {g: LifeRecord<'goal'>; p: Planner; nav: Nav; back: () => void; open: (id: string) => void}) {
  const goals = ofKind(p.records, 'goal'), parent = goals.find(x => x.id === g.body.parentGoalId), children = goals.filter(x => x.body.parentGoalId === g.id);
  const tasks = linkedTasks(g, p.records).sort((a, b) => (b.logicalDay ?? '').localeCompare(a.logicalDay ?? ''));
  const days = [...new Set(tasks.map(t => t.logicalDay ?? ''))];
  const setStatus = (status: Goal['status']) => p.write(g.id, {kind: 'goal', body: {...g.body, status}, baseRevision: g.revision});
  return <div className="dashboard">
    <button className="ghost small" onClick={back}>‹ 목표 사다리</button>
    <h2><span className="horizon">{horizonLabel(g.body.horizon)} · {g.body.period}</span>{g.body.title}</h2>
    <GoalBar g={g} records={p.records} />
    {parent && <p className="muted">위 목표: <button className="link" onClick={() => open(parent.id)}>{parent.body.title}</button></p>}
    {children.length > 0 && <section className="module"><h3>아래 목표</h3><ul className="rows">{children.map(c => <li key={c.id} className="row goal-row"><button className="link" onClick={() => open(c.id)}><span className="horizon">{horizonLabel(c.body.horizon)}</span>{c.body.title}</button><GoalBar g={c} records={p.records} /></li>)}</ul></section>}
    <section className="module"><h3>이 목표로 이어진 하루들</h3>
      {days.length === 0 && <p className="muted">아직 이어진 할 일이 없어요. 오늘 화면에서 할 일을 이 목표에 이어 보세요.</p>}
      {days.map(d => <div key={d} className="history-day">
        <button className="link day-link" onClick={() => nav.setDay(d)}>{d ? label(d) : '날짜 없음'}</button>
        <ul className="rows">{tasks.filter(t => (t.logicalDay ?? '') === d).map(t => <li key={t.id} className={`row ${t.body.outcome.result}`}><span>{t.body.title}</span><span className="meta">{t.body.outcome.amount !== null ? `${t.body.outcome.amount}${t.body.outcome.unit ?? ''}` : t.body.plan.target ? `${t.body.plan.target.amount}${t.body.plan.target.unit}` : ''} {t.body.outcome.result === 'done' ? '✓' : ''}</span></li>)}</ul>
      </div>)}
    </section>
    <div className="inline">
      {g.body.status !== 'achieved' && <button className="small" onClick={() => setStatus('achieved')}>이뤘어요</button>}
      {g.body.status !== 'active' && <button className="small" onClick={() => setStatus('active')}>다시 진행</button>}
      {g.body.status === 'active' && <button className="small" onClick={() => setStatus('paused')}>잠시 멈춤</button>}
      <button className="small danger" onClick={async () => { await p.remove(g.id); back(); }}>지우기</button>
    </div>
  </div>;
}
