import {useState} from 'react';
import {goalPercent, linkedTasks, periodsOf, type Goal, type LifeRecord} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import {api, ofKind, type MilestoneDraft, type Planner} from '../data.ts';
import {GoalBar, horizonLabel, label, type Nav} from './Today.tsx';

// Long-term goals: write one naively, let MOONS split it into milestones, review, then live by the daily list.
// Every task linked to a milestone moves the goal's overall percentage.
const ORDER = ['year', 'quarter', 'month', 'milestone', 'week'];
const rank = (h: string) => ORDER.indexOf(h);

export function Goals({spec, p, nav, today, goalId, setGoalId}: {spec: PlannerSpec; p: Planner; nav: Nav; today: string; goalId: string | null; setGoalId: (id: string | null) => void}) {
  const goals = ofKind(p.records, 'goal');
  const [view, setView] = useState<'ladder' | 'roadmap'>('ladder');
  const selected = goals.find(g => g.id === goalId);
  if (selected) return <GoalDashboard g={selected} p={p} nav={nav} today={today} back={() => setGoalId(null)} open={setGoalId} />;
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
    <NewGoal p={p} today={today} onDone={setGoalId} />
    <div className="seg" role="tablist">
      <button role="tab" aria-selected={view === 'ladder'} className={view === 'ladder' ? 'on' : ''} onClick={() => setView('ladder')}>목표 사다리</button>
      <button role="tab" aria-selected={view === 'roadmap'} className={view === 'roadmap' ? 'on' : ''} onClick={() => setView('roadmap')}>연간 로드맵</button>
    </div>
    {view === 'roadmap' ? <Roadmap p={p} today={today} open={setGoalId} /> : <section className="part"><h3>목표 사다리 <span className="muted small">퍼센트 = 이어진 할 일과 마일스톤으로 계산한 전체 진행률</span></h3>
      {roots.length ? <ul className="tree">{roots.map(g => tree(g, 0))}</ul> : <p className="muted">아직 목표가 없어요. 위에 큰 목표를 대충 적어 보세요.</p>}
    </section>}
    <details className="part manual"><summary>기간 목표 직접 추가 (연간·월간·주간)</summary><GoalForm p={p} goals={goals} levels={levels} today={today} /></details>
  </div>;
}

type Draft = MilestoneDraft & {keep: boolean; addTask: boolean};
function NewGoal({p, today, onDone}: {p: Planner; today: string; onDone: (id: string) => void}) {
  const [open, setOpen] = useState(false), [goal, setGoal] = useState(''), [deadline, setDeadline] = useState(`${Number(today.slice(0, 4)) + 1}`), [context, setContext] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null), [questions, setQuestions] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const split = async () => {
    if (!goal.trim()) return;
    setBusy(true); setError('');
    try {
      const r = await api.milestones({goal, deadline, context, today});
      setDrafts(r.milestones.map((m, i) => ({...m, keep: true, addTask: i === 0}))); setQuestions(r.questions);
    } catch (e) { setError((e as Error).message); setDrafts([]); } finally { setBusy(false); }
  };
  const set = (i: number, patch: Partial<Draft>) => setDrafts(d => d!.map((x, j) => j === i ? {...x, ...patch} : x));
  const save = async () => {
    setBusy(true);
    const year = deadline.slice(0, 4);
    const top = await p.write(null, {kind: 'goal', body: {title: goal.trim(), horizon: 'year', period: year, criterion: deadline.length > 4 ? `기한 ${deadline}` : null}});
    if (top) {
      for (const d of (drafts ?? []).filter(x => x.keep && x.title.trim())) {
        const ms = await p.write(null, {kind: 'goal', body: {title: d.title.trim(), horizon: 'milestone', period: d.due, parentGoalId: top.id, weight: d.weight, criterion: d.why || null,
          target: d.measure ? {...d.measure, aggregation: 'sum'} : null}});
        if (ms && d.addTask && d.firstTask.trim()) await p.write(null, {kind: 'task', logicalDay: today, body: {title: d.firstTask.trim(), category: 'must', goalIds: [ms.id], plan: {state: 'committed'}}});
      }
      setOpen(false); setGoal(''); setContext(''); setDrafts(null); onDone(top.id);
    }
    setBusy(false);
  };
  if (!open) return <button className="new-goal" onClick={() => setOpen(true)}>＋ 큰 목표 세우기 <span className="muted small">대충 적으면 MOONS가 마일스톤으로 쪼개 줘요</span></button>;
  return <section className="part goal-maker">
    <h3>큰 목표 세우기</h3>
    <input className="goal-in" value={goal} onChange={e => setGoal(e.target.value)} placeholder="예: 내년에 로스쿨 붙기, 올해 안에 책 한 권 쓰기" aria-label="큰 목표" autoFocus />
    <div className="inline">
      <label className="muted small">기한 <input value={deadline} onChange={e => setDeadline(e.target.value)} placeholder="2027 또는 2027-06" className="num wide" aria-label="기한" /></label>
    </div>
    <textarea rows={2} value={context} onChange={e => setContext(e.target.value)} placeholder="(선택) 지금 상황 · 일주일에 쓸 수 있는 시간 · 이미 해 둔 것" aria-label="상황" />
    <div className="actions">
      <button className="primary" disabled={!goal.trim() || busy} onClick={split}>{busy && !drafts ? '쪼개는 중…' : '마일스톤으로 쪼개기'}</button>
      <button className="ghost" onClick={() => setDrafts([])} disabled={!goal.trim()}>직접 쪼갤래요</button>
      <button className="ghost" onClick={() => { setOpen(false); setDrafts(null); }}>닫기</button>
    </div>
    {error && <p className="error">{error}</p>}
    {drafts && <div className="drafts">
      {drafts.length > 0 && <p className="muted small">MOONS가 쪼갠 초안이에요. 고치고, 빼고, 더한 뒤 내 목표로 잡으세요.</p>}
      {questions.length > 0 && <ul className="tips">{questions.map(q => <li key={q}>{q}</li>)}</ul>}
      <ol className="ms-list">{drafts.map((d, i) => <li key={i} className={d.keep ? '' : 'off'}>
        <div className="inline">
          <input type="checkbox" checked={d.keep} onChange={e => set(i, {keep: e.target.checked})} aria-label="포함" />
          <input className="ms-title" value={d.title} onChange={e => set(i, {title: e.target.value})} aria-label="마일스톤" />
          <input type="month" value={d.due} onChange={e => set(i, {due: e.target.value})} aria-label="끝낼 달" />
          <select value={d.weight} onChange={e => set(i, {weight: Number(e.target.value)})} aria-label="무게" title="목표 전체에서 차지하는 무게">{[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>무게 {w}</option>)}</select>
        </div>
        <div className="inline ms-measure"><span className="muted small">끝났다고 볼 기준</span>
          <input className="num" inputMode="decimal" value={d.measure?.amount ?? ''} onChange={e => set(i, {measure: Number(e.target.value) > 0 ? {amount: Number(e.target.value), unit: d.measure?.unit ?? '회'} : null})} placeholder="양" aria-label="기준 양" />
          <input className="unit" value={d.measure?.unit ?? ''} onChange={e => set(i, {measure: d.measure ? {...d.measure, unit: e.target.value} : null})} placeholder="단위" aria-label="기준 단위" disabled={!d.measure} />
          <span className="muted small">(없으면 이어진 할 일로 최대 90%까지)</span></div>
        {d.why && <p className="why">{d.why}</p>}
        {d.firstTask && <label className="small first-task"><input type="checkbox" checked={d.addTask} onChange={e => set(i, {addTask: e.target.checked})} /> 오늘 할 일로 올리기: {d.firstTask}</label>}
      </li>)}</ol>
      <button className="small" onClick={() => setDrafts([...drafts, {title: '', due: today.slice(0, 7), measure: null, weight: 1, why: '', firstTask: '', keep: true, addTask: false}])}>＋ 마일스톤 추가</button>
      <div className="actions"><button className="primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '이대로 내 목표로 잡기'}</button></div>
    </div>}
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
        return [<button key={g.id} className="rm-goal link" onClick={() => open(g.id)}>{g.body.title}<em>{goalPercent(g.id, p.records).pct}%</em></button>,
          ...months.map(m => <span key={`${g.id}-${m}`} className={`rm-cell ${m === now ? 'now' : ''}`}>
            {items.filter(c => c.body.period === m).map(c => {
              const pct = goalPercent(c.id, p.records).pct, state = c.body.status === 'achieved' ? 'done' : m < now ? 'late' : 'open';
              return <button key={c.id} className={`rm-ms ${state}`} onClick={() => open(c.id)} title={`${c.body.title} · ${pct}%`}>◆<span>{c.body.title}</span></button>;
            })}
          </span>)];
      })}
    </div>}
    <p className="muted small">◆ 초록 = 이룸 · 빨강 = 끝낼 달이 지났는데 아직 · 회색 = 남은 마일스톤</p>
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

function GoalDashboard({g, p, nav, today, back, open}: {g: LifeRecord<'goal'>; p: Planner; nav: Nav; today: string; back: () => void; open: (id: string) => void}) {
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
    <div className="big-pct"><span className="pct big"><i style={{width: `${gp.pct}%`}} /><em>{gp.pct}%</em></span>
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
