import {useMemo, useState} from 'react';
import {goalSchedule, parseBody, weeklyFocus, type AnyRecord, type Kind} from '@workspace/life-contract';
import {api, ofKind, type GoalPlanResult, type MilestoneDraft, type Planner} from '../data.ts';
import {hm} from './Focus.tsx';

// Big goal → MOONS asks until it is concrete → goal + milestones with effort → wanted deadline vs feasible date,
// bottlenecks with other goals → the user edits and approves. Only approval writes anything.
type Draft = MilestoneDraft & {keep: boolean; addTask: boolean};
type QA = {id: string; text: string; choices: string[]; answer: string};
const fmt = (d: string | null) => d ? d.replace(/^(\d{4})-(\d{2})(-(\d{2}))?$/, (_, y, m, __, dd) => dd ? `${y}.${m}.${dd}` : `${y}.${m}`) : '–';
/** Long spans read as hours ("60시간"), short ones as h:mm. */
const hrs = (min: number) => min >= 600 ? `${Math.round(min / 60)}시간` : hm(min);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Draft goal + milestones as records, so the real schedule can include them next to existing goals. */
function virtual(drafts: Draft[], title: string, deadline: string | null, today: string): AnyRecord[] {
  let n = 0;
  const rec = (kind: Kind, body: unknown) => ({id: `DRAFT${String(++n).padStart(21, '0')}`, kind, revision: 0, createdAt: today, updatedAt: today, deletedAt: null, logicalDay: null, tz: 'UTC', source: {type: 'planner', confirmed: false}, body: parseBody(kind, body)}) as AnyRecord;
  const top = rec('goal', {title: title || '새 목표', horizon: 'year', period: (deadline ?? today).slice(0, 4), deadline});
  return [top, ...drafts.filter(d => d.keep && d.title.trim()).map(d => rec('goal', {title: d.title, horizon: 'milestone', period: d.due, parentGoalId: top.id, weight: d.weight, effortHours: d.effortHours}))];
}

export function Feasibility({records, extra, focusId, weeklyMin, today}: {records: AnyRecord[]; extra: AnyRecord[]; focusId?: string; weeklyMin: number; today: string}) {
  const before = useMemo(() => goalSchedule(records, today, weeklyMin), [records, today, weeklyMin]);
  const after = useMemo(() => goalSchedule([...records, ...extra], today, weeklyMin), [records, extra, today, weeklyMin]);
  const target = focusId ?? extra[0]?.id;
  const mine = after.goals.find(g => g.id === target);
  const rows = after.rows.filter(r => r.topId === target);
  // Other goals pushed later by this one.
  const pushed = after.goals.filter(g => g.id !== target).map(g => ({g, prev: before.goals.find(x => x.id === g.id)})).filter(x => x.prev && x.g.projected > x.prev.projected);
  const myMonths = new Set(rows.map(r => r.due.slice(0, 7)));
  const clashes = after.months.filter(m => m.over && (extra.length === 0 || m.goals.length > 1 || myMonths.has(m.month)));
  return <div className="feasible">
    {mine ? <div className="fz-head">
      <div><span className="muted small">원하는 마감</span><strong>{fmt(mine.deadline)}</strong></div>
      <div><span className="muted small">지금 속도로 가능한 날</span><strong className={mine.lateDays ? 'late' : 'ok'}>{fmt(mine.projected)}</strong></div>
      <p className={`fz-verdict ${mine.lateDays ? 'late' : 'ok'}`}>{mine.lateDays
        ? <>마감보다 <b>{mine.lateDays}일</b> 늦어요. 주당 시간을 늘리거나, 마일스톤을 줄이거나, 마감을 {fmt(mine.projected)}로 옮기는 걸 생각해 보세요.</>
        : mine.deadline ? <>마감 {daysBetween(mine.projected, mine.deadline)}일 전에 끝낼 수 있어요.</> : <>마감을 정하면 늦는지 바로 알려 드려요.</>}</p>
    </div> : <p className="muted small">마일스톤에 예상 시간을 넣으면 가능한 날짜를 계산해요.</p>}
    {rows.length > 0 && <ol className="fz-rows">{rows.map(r => <li key={r.id} className={r.late ? 'late' : ''}>
      <span className="ptitle">{r.title}</span><span className="muted small">{hrs(r.remainingMin)}</span>
      <span className="small">끝낼 달 {fmt(r.due.slice(0, 7))} → 예상 {fmt(r.finish)}</span>{r.late && <b className="late small">늦음</b>}
    </li>)}</ol>}
    <p className="muted small">일주일 목표 집중 {hrs(weeklyMin)} 기준 · 모든 목표의 남은 마일스톤이 이 시간을 나눠 써요(끝낼 달이 이른 것부터).{after.unestimated ? ` 예상 시간이 없는 마일스톤 ${after.unestimated}개는 빠졌어요.` : ''}</p>
    {(pushed.length > 0 || clashes.length > 0) && <div className="fz-clash">
      <strong>다른 목표와의 병목</strong>
      {pushed.map(({g, prev}) => <p key={g.id}>· <b>{g.title}</b>이(가) {fmt(prev!.projected)} → {fmt(g.projected)}로 {daysBetween(prev!.projected, g.projected)}일 밀려요{g.lateDays ? ` (마감보다 ${g.lateDays}일 늦음)` : ''}.</p>)}
      {clashes.map(m => <p key={m.month}>· {fmt(m.month)}: 필요 {hrs(m.demandMin)} / 가능 {hrs(m.capacityMin)} — {m.goals.join(', ')}</p>)}
    </div>}
  </div>;
}

export function NewGoal({p, today, weekly, onWeekly, onDone}: {p: Planner; today: string; weekly: number | null; onWeekly: (min: number) => void; onDone: (id: string) => void}) {
  const [open, setOpen] = useState(false), [goal, setGoal] = useState(''), [deadline, setDeadline] = useState(''), [context, setContext] = useState('');
  const [qas, setQas] = useState<QA[][]>([]), [result, setResult] = useState<Extract<GoalPlanResult, {status: 'ready'}> | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const weeklyMin = weekly ?? weeklyFocus(p.records, today);
  const [hours, setHours] = useState(String(Math.round(weeklyMin / 60)));
  const ask = async (answers: QA[][]) => {
    setBusy(true); setError('');
    try {
      const r = await api.planGoal({goal, deadline, context, today, round: answers.length + 1, weeklyHours: Number(hours) || undefined,
        answers: answers.flat().filter(q => q.answer.trim()).map(q => ({q: q.text, a: q.answer}))});
      if (r.status === 'ask') setQas([...answers, r.questions.map(q => ({...q, answer: ''}))]);
      else { setQas(answers); setResult(r); setDrafts(r.milestones.map((m, i) => ({...m, keep: true, addTask: i === 0}))); if (r.refined.deadline && !deadline) setDeadline(r.refined.deadline); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const answer = (round: number, i: number, a: string) => setQas(all => all.map((r, j) => j !== round ? r : r.map((q, k) => k === i ? {...q, answer: a} : q)));
  const set = (i: number, patch: Partial<Draft>) => setDrafts(d => d!.map((x, j) => j === i ? {...x, ...patch} : x));
  const title = result?.refined.title ?? goal, wanted = (deadline || result?.refined.deadline || null);
  const extra = useMemo(() => drafts ? virtual(drafts, title, wanted && /^\d{4}-\d{2}/.test(wanted) ? wanted : null, today) : [], [drafts, title, wanted, today]);
  const reset = () => { setOpen(false); setGoal(''); setDeadline(''); setContext(''); setQas([]); setResult(null); setDrafts(null); setError(''); };
  const save = async () => {
    setBusy(true);
    const dl = wanted && /^\d{4}-\d{2}(-\d{2})?$/.test(wanted) ? wanted : null;
    const top = await p.write(null, {kind: 'goal', body: {title: title.trim(), horizon: 'year', period: (dl ?? today).slice(0, 4), deadline: dl, criterion: result?.refined.success || null}});
    if (top) {
      for (const d of (drafts ?? []).filter(x => x.keep && x.title.trim())) {
        const ms = await p.write(null, {kind: 'goal', body: {title: d.title.trim(), horizon: 'milestone', period: d.due, parentGoalId: top.id, weight: d.weight, effortHours: d.effortHours, criterion: d.why || null,
          target: d.measure ? {...d.measure, aggregation: 'sum'} : null}});
        if (ms && d.addTask && d.firstTask.trim()) await p.write(null, {kind: 'task', logicalDay: today, body: {title: d.firstTask.trim(), category: 'must', goalIds: [ms.id], plan: {state: 'committed'}}});
      }
      if (Number(hours) > 0 && Math.round(Number(hours) * 60) !== weekly) onWeekly(Math.round(Number(hours) * 60));
      reset(); onDone(top.id);
    }
    setBusy(false);
  };
  if (!open) return <button className="new-goal" onClick={() => setOpen(true)}>＋ 큰 목표 세우기 <span className="muted small">대충 적으면 MOONS가 물어보고, 구체화해서 마일스톤으로 쪼개 줘요</span></button>;
  const round = qas.at(-1), waiting = !!round && !result;
  return <section className="part goal-maker">
    <h3>큰 목표 세우기</h3>
    <input className="goal-in" value={goal} onChange={e => setGoal(e.target.value)} placeholder="예: 내년에 로스쿨 붙기, 올해 안에 책 한 권 쓰기" aria-label="큰 목표" autoFocus disabled={!!result} />
    <div className="inline">
      <label className="muted small">원하는 마감 <input value={deadline} onChange={e => setDeadline(e.target.value)} placeholder="2027-03 또는 2027-03-15" className="num wide" aria-label="원하는 마감" /></label>
      <label className="muted small">일주일에 목표에 쓸 시간 <input className="num" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} aria-label="주당 목표 시간" />시간</label>
      <span className="muted small">(최근 4주 실제 집중 기준 {hm(weeklyFocus(p.records, today))}/주)</span>
    </div>
    {!result && qas.length === 0 && <textarea rows={2} value={context} onChange={e => setContext(e.target.value)} placeholder="(선택) 지금 상황, 이미 해 둔 것, 제약" aria-label="상황" />}

    {qas.map((r, ri) => <div key={ri} className="bubble moon qa">
      <p className="muted small">MOONS가 목표를 구체화하려고 물어봐요 ({ri + 1}/2)</p>
      {r.map((q, i) => <div key={q.id} className="qa-item">
        <p>{q.text}</p>
        {q.choices.length > 0 && <div className="chips">{q.choices.map(c => <button key={c} className={`chip ${q.answer === c ? 'on' : ''}`} aria-pressed={q.answer === c} onClick={() => answer(ri, i, c)} disabled={!!result || ri < qas.length - 1}>{c}</button>)}</div>}
        <input value={q.answer} onChange={e => answer(ri, i, e.target.value)} placeholder="직접 답하기" aria-label={q.text} disabled={!!result || ri < qas.length - 1} />
      </div>)}
    </div>)}

    {!result && <div className="actions">
      {waiting ? <button className="primary" disabled={busy || !round!.some(q => q.answer.trim())} onClick={() => ask(qas)}>{busy ? '정리하는 중…' : '답하고 계속'}</button>
        : <button className="primary" disabled={!goal.trim() || busy} onClick={() => ask([])}>{busy ? '생각하는 중…' : 'MOONS와 구체화하기'}</button>}
      <button className="ghost" disabled={!goal.trim()} onClick={() => { setResult({status: 'ready', refined: {title: goal, success: '', deadline: deadline || null}, milestones: [], assumptions: []}); setDrafts([]); }}>직접 쪼갤래요</button>
      <button className="ghost" onClick={reset}>닫기</button>
    </div>}
    {error && <p className="error">{error}</p>}

    {result && drafts && <div className="drafts">
      <div className="refined">
        <label>구체화된 목표 <input value={result.refined.title} onChange={e => setResult({...result, refined: {...result.refined, title: e.target.value}})} aria-label="구체화된 목표" /></label>
        <label>끝났다고 볼 기준 <input value={result.refined.success} onChange={e => setResult({...result, refined: {...result.refined, success: e.target.value}})} placeholder="예: LEET 언어이해 표준점수 60" aria-label="성공 기준" /></label>
        {result.assumptions.length > 0 && <ul className="tips">{result.assumptions.map(a => <li key={a}>{a}</li>)}</ul>}
      </div>
      <ol className="ms-list">{drafts.map((d, i) => <li key={i} className={d.keep ? '' : 'off'}>
        <div className="inline">
          <input type="checkbox" checked={d.keep} onChange={e => set(i, {keep: e.target.checked})} aria-label="포함" />
          <input className="ms-title" value={d.title} onChange={e => set(i, {title: e.target.value})} aria-label="마일스톤" />
          <input type="month" value={d.due} onChange={e => set(i, {due: e.target.value})} aria-label="끝낼 달" />
          <label className="small">예상 <input className="num" inputMode="decimal" value={d.effortHours ?? ''} onChange={e => set(i, {effortHours: Number(e.target.value) > 0 ? Number(e.target.value) : null})} aria-label="예상 시간" />시간</label>
          <select value={d.weight} onChange={e => set(i, {weight: Number(e.target.value)})} aria-label="무게" title="목표 전체에서 차지하는 무게">{[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>무게 {w}</option>)}</select>
        </div>
        <div className="inline ms-measure"><span className="muted small">끝났다고 볼 기준</span>
          <input className="num" inputMode="decimal" value={d.measure?.amount ?? ''} onChange={e => set(i, {measure: Number(e.target.value) > 0 ? {amount: Number(e.target.value), unit: d.measure?.unit ?? '회'} : null})} placeholder="양" aria-label="기준 양" />
          <input className="unit" value={d.measure?.unit ?? ''} onChange={e => set(i, {measure: d.measure ? {...d.measure, unit: e.target.value} : null})} placeholder="단위" aria-label="기준 단위" disabled={!d.measure} />
        </div>
        {d.why && <p className="why">{d.why}</p>}
        {d.firstTask && <label className="small first-task"><input type="checkbox" checked={d.addTask} onChange={e => set(i, {addTask: e.target.checked})} /> 오늘 할 일로 올리기: {d.firstTask}</label>}
      </li>)}</ol>
      <button className="small" onClick={() => setDrafts([...drafts, {title: '', due: today.slice(0, 7), measure: null, weight: 1, effortHours: null, why: '', firstTask: '', keep: true, addTask: false}])}>＋ 마일스톤 추가</button>
      <Feasibility records={p.records} extra={extra} weeklyMin={Math.max(30, Math.round((Number(hours) || 0) * 60) || weeklyMin)} today={today} />
      <div className="actions"><button className="primary" disabled={busy || !title.trim()} onClick={save}>{busy ? '저장 중…' : '이대로 내 목표로 잡기'}</button><button className="ghost" onClick={reset}>취소</button></div>
    </div>}
  </section>;
}

/** On a goal's page: its schedule, deadline vs feasible date, and clashes, with deadline and effort editable. */
export function GoalPlanPanel({p, goalId, today, weeklyMin}: {p: Planner; goalId: string; today: string; weeklyMin: number}) {
  const goals = ofKind(p.records, 'goal'), g = goals.find(x => x.id === goalId)!;
  const ms = goals.filter(x => x.body.parentGoalId === goalId && x.body.horizon === 'milestone');
  const [dl, setDl] = useState(g.body.deadline ?? '');
  const saveDl = () => (dl === '' || /^\d{4}-\d{2}(-\d{2})?$/.test(dl)) && dl !== (g.body.deadline ?? '') && p.write(g.id, {kind: 'goal', body: {...g.body, deadline: dl || null}, baseRevision: g.revision});
  return <section className="part"><h3>마감과 가능일 · 병목</h3>
    <div className="inline"><label className="muted small">원하는 마감 <input value={dl} onChange={e => setDl(e.target.value)} onBlur={saveDl} placeholder="2027-03" className="num wide" aria-label="원하는 마감" /></label></div>
    {ms.length > 0 && <ul className="prows">{ms.map(m => <li key={m.id} className="prow">
      <span className="ptitle"><span className="pname">{m.body.title}</span><span className="psub">~{m.body.period}</span></span>
      <label className="small">예상 <input className="num" inputMode="decimal" defaultValue={m.body.effortHours ?? ''} aria-label={`${m.body.title} 예상 시간`}
        onBlur={e => { const v = Number(e.target.value) > 0 ? Number(e.target.value) : null; if (v !== m.body.effortHours) void p.write(m.id, {kind: 'goal', body: {...m.body, effortHours: v}, baseRevision: m.revision}); }} />시간</label>
    </li>)}</ul>}
    <Feasibility records={p.records} extra={[]} focusId={goalId} weeklyMin={weeklyMin} today={today} />
  </section>;
}
