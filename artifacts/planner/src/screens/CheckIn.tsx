import {useEffect, useState} from 'react';
import {fromClock} from '../schedule.ts';
import {capacity, dayCondition, type LifeRecord} from '@workspace/life-contract';
import type {ModuleSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {hm} from './Focus.tsx';
import {Scale} from './Scale.tsx';
import {InlineEdit} from '../InlineEdit.tsx';
import {lowEnergyAlert} from './Focus.tsx';
import {FACTORS} from '../lifeLogic.ts';
export {Scale};

// Morning ritual: energy on waking (1–10) and today's fixed appointments → how much the day can really hold.
const localIso = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();

export function CheckIn({m, p, day, now, today, boundary = 4}: {m: ModuleSpec; p: Planner; day: string; now: () => string; today?: string; boundary?: number}) {
  const wake = String(m.options.wake ?? '07:00'), sleep = String(m.options.sleep ?? '00:00');
  const checks = ofKind(p.records, 'condition').filter(c => c.logicalDay === day && c.body.moment === 'wake');
  const w = checks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const fixed = ofKind(p.records, 'task').filter(t => t.logicalDay === day && t.body.plan.fixed && !['cancelled'].includes(t.body.outcome.result));
  const [title, setTitle] = useState(''), [from, setFrom] = useState('10:00'), [to, setTo] = useState('11:00'), [fixing, setFixing] = useState(false);
  // Today counts from now (re-read every minute): only the time, appointments and work still ahead.
  const [, tick] = useState(0);
  useEffect(() => { if (day !== today) return; const t = setInterval(() => tick(n => n + 1), 60_000); return () => clearInterval(t); }, [day, today]);
  const wakeAt = Date.parse(fromClock(day, wake, boundary).value);
  let sleepAt = Date.parse(fromClock(day, sleep, boundary).value); if (sleepAt <= wakeAt) sleepAt += 86_400_000;
  const live = day === today;
  const cap = capacity(p.records, day, {wake, sleep, energy: w?.body.energy ?? null, ...(live ? {window: {wakeAt, sleepAt, now: Date.now()}} : {})});
  const setEnergy = (n: number) => (lowEnergyAlert(n), p.write(w?.id ?? null, {kind: 'condition', logicalDay: day, body: {...(w?.body ?? {}), at: now(), energy: n, moment: 'wake'}, ...(w ? {baseRevision: w.revision} : {})}));
  const addFixed = async () => {
    if (!title.trim() || to <= from) return;
    if (await p.write(null, {kind: 'task', logicalDay: day, body: {title: title.trim(), plan: {state: 'committed', fixed: true, start: {value: localIso(day, from), precision: 'minute'}, end: {value: localIso(day, to), precision: 'minute'}, estimateMin: null}}})) setTitle('');
  };
  const pct = (n: number) => `${Math.min(100, Math.round(n / Math.max(1, cap.awake) * 100))}%`;
  return <div className="checkin">
    {/* Energy right after waking is asked once a day; after that the row says it is done (고치기 reopens it). */}
    {w?.body.energy && !fixing ? <div className="ck-row ck-done"><span className="ck-q">일어났을 때 에너지</span><b className="mono">{w.body.energy}</b><span className="done-badge">✓ 기록 완료</span>
        <button className="ghost small" onClick={() => setFixing(true)}>고치기</button></div>
      : <div className="ck-row"><span className="ck-q">일어났을 때 에너지</span><Scale value={w?.body.energy} onPick={n => { setFixing(false); void setEnergy(n); }} label="기상 직후 에너지 1~10" /></div>}
    <div className="ck-fixed">
      <span className="ck-q">오늘 고정 일정</span>
      <ul className="prows">{fixed.map(t => <li key={t.id} className="prow">
        <span className="time-tag">{t.body.plan.start ? new Date(t.body.plan.start.value).toTimeString().slice(0, 5) : ''}–{t.body.plan.end ? new Date(t.body.plan.end.value).toTimeString().slice(0, 5) : ''}</span>
        <InlineEdit className="ptitle" value={t.body.title} onSave={title => p.write(t.id, {kind: 'task', logicalDay: t.logicalDay, body: {...t.body, title}, baseRevision: t.revision})} /><button className="ghost small" onClick={() => p.remove(t.id)} aria-label={`${t.body.title} 지우기`}>✕</button></li>)}</ul>
      <form className="padd" onSubmit={e => { e.preventDefault(); void addFixed(); }}>
        <input type="time" value={from} onChange={e => setFrom(e.target.value)} aria-label="시작" className="time-in" />–<input type="time" value={to} onChange={e => setTo(e.target.value)} aria-label="끝" className="time-in" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="고정 일정" aria-label="고정 일정" /><button className="small">추가</button>
      </form>
    </div>
    <TimeLeft cap={cap} hasEnergy={!!w} energy={w?.body.energy ?? null} wake={wake} sleep={sleep} live={live} />
  </div>;
}

/** 오늘 할 일에 쓸 수 있는 시간: one big number first, then how it was worked out, then whether today's plan fits. */
function TimeLeft({cap, hasEnergy, energy, wake, sleep, live}: {cap: ReturnType<typeof capacity>; hasEnergy: boolean; energy: number | null; wake: string; sleep: string; live: boolean}) {
  const left = cap.realistic - cap.planned, fill = cap.realistic ? Math.min(100, Math.round(cap.planned / cap.realistic * 100)) : cap.planned ? 100 : 0;
  const clock = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const started = live && cap.passed > 0;
  if (live && cap.ended) return <section className="tl" aria-label="오늘 할 일에 쓸 수 있는 시간"><p className="tl-head"><span className="tl-k">오늘 깨어 있을 시간({sleep})이 지났어요</span>
    <strong className="tl-big mono">0:00</strong><span className="tl-note">남은 할 일 {hm(cap.planned)}은 내일로 옮기거나 희망사항으로</span></p></section>;
  return <section className="tl" aria-label="오늘 할 일에 쓸 수 있는 시간">
    <p className="tl-head"><span className="tl-k">{live ? `지금(${clock()})부터 할 일에 쓸 수 있는 시간` : '이날 할 일에 쓸 수 있는 시간'}</span><strong className="tl-big mono">{hm(cap.realistic)}</strong>
      {!hasEnergy && <span className="tl-note">위에서 일어났을 때 에너지를 고르면 더 정확해져요</span>}</p>
    <ol className="tl-steps">
      <li><span>{started ? <>남은 깨어 있는 시간 <em>{clock()}–{sleep}</em></> : <>깨어 있는 시간 <em>{wake}–{sleep}</em></>}</span><b className="mono">{hm(cap.ahead)}</b></li>
      <li><span>{started ? '남은 고정 일정' : '고정 일정'}</span><b className="mono">− {hm(cap.fixedMin)}</b></li>
      <li><span>그 밖의 시간</span><b className="mono">{hm(cap.free)}</b></li>
      <li><span>그중 집중할 수 있는 몫 <em>{energy !== null ? `에너지 ${energy} → ${Math.round(cap.factor * 100)}%` : `에너지 모름 → ${Math.round(cap.factor * 100)}%`}</em></span><b className="mono">= {hm(cap.realistic)}</b></li>
    </ol>
    <div className="tl-plan">
      <div className="tl-bar" role="img" aria-label={`남은 할 일 ${hm(cap.planned)} / 쓸 수 있는 시간 ${hm(cap.realistic)}`}><i className={cap.over ? 'over' : ''} style={{width: `${fill}%`}} /></div>
      <p className={`tl-verdict ${cap.over ? 'over' : 'ok'}`}>{cap.over
        ? <>{live ? '남은 할 일' : '계획'} <b className="mono">{hm(cap.planned)}</b> · <strong>{hm(cap.over)} 넘쳐요</strong> — 몇 개는 희망사항이나 내일로</>
        : <>{live ? '남은 할 일' : '계획'} <b className="mono">{hm(cap.planned)}</b> · <strong>{hm(left)} 더 넣을 수 있어요</strong></>}</p>
      {live && <p className="tl-note">남은 할 일 = 안 끝낸 할 일의 예상 시간 − 이미 집중한 시간 · 1분마다 다시 계산</p>}
      {cap.unestimated > 0 && <p className="tl-note">예상 시간을 안 적은 할 일 {cap.unestimated}개는 계획에 안 들어갔어요</p>}
    </div>
  </section>;
}

export function ConditionDay({p, day, now}: {p: Planner; day: string; now: () => string}) {
  const c = dayCondition(p.records, day);
  const evening = ofKind(p.records, 'condition').filter(x => x.logicalDay === day && x.body.moment === 'evening').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] as LifeRecord<'condition'> | undefined;
  const save = (n: number, moment: 'evening' | 'check', prior?: LifeRecord<'condition'>) => (lowEnergyAlert(n), p.write(prior?.id ?? null, {kind: 'condition', logicalDay: day, body: {...(prior?.body ?? {}), at: now(), energy: n, moment}, ...(prior ? {baseRevision: prior.revision} : {})}));
  const sessions = ofKind(p.records, 'session').filter(s => s.logicalDay === day && s.body.condition !== null);
  return <div className="condition">
    <p className="cond-score"><strong>{c.score ?? '–'}</strong><span className="muted">/10 오늘 컨디션</span>
      <span className="muted small"> 기상 {c.wake ?? '–'} · 집중 중 {c.focus ?? '–'} · 저녁 {c.evening ?? '–'}</span></p>
    {sessions.length > 0 && <div className="cond-trail" aria-label="집중할 때 남긴 컨디션">{sessions.sort((a, b) => a.body.start.localeCompare(b.body.start)).map(s =>
      <span key={s.id} className="cond-dot" title={`${s.body.label} ${s.body.condition}/10${s.body.note ? ` · ${s.body.note}` : ''}`} style={{'--lv': s.body.condition} as React.CSSProperties}>{s.body.condition}</span>)}</div>}
    <div className="ck-row"><span className="ck-q">지금 컨디션</span><Scale value={null} onPick={n => save(n, 'check')} label="지금 컨디션 1~10" /></div>
    <div className="ck-row"><span className="ck-q">하루를 마치며</span><Scale value={evening?.body.energy} onPick={n => save(n, 'evening', evening)} label="하루 마무리 컨디션 1~10" /></div>
  </div>;
}

/** "지금 아침 상태는?": the energy right after waking (once a day), and when it is low, what lowered it.
 *  Asked by the sleep widget after 일어났어요, and by 아침 점검. */
export function WakeAsk({p, day, now, factors = FACTORS.map(f => f.name)}: {p: Planner; day: string; now: () => string; factors?: string[]}) {
  const w = ofKind(p.records, 'condition').filter(c => c.logicalDay === day && c.body.moment === 'wake').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const save = (body: Partial<LifeRecord<'condition'>['body']>) => p.write(w?.id ?? null, {kind: 'condition', logicalDay: day, body: {...(w?.body ?? {}), at: w?.body.at ?? now(), moment: 'wake', ...body}, ...(w ? {baseRevision: w.revision} : {})});
  const low = (w?.body.energy ?? 10) < 5;
  return <div className="wake-ask" role="group" aria-label="지금 아침 상태">
    <span className="ck-q">지금 아침 상태는?</span>
    <Scale value={w?.body.energy} onPick={n => { lowEnergyAlert(n); void save({energy: n}); }} label="기상 직후 에너지 1~10" />
    {w && low && <div className="chips" aria-label="저하 요인">{factors.map(f => { const on = (w.body.factors ?? []).includes(f); return <button key={f} className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
      onClick={() => void save({factors: on ? (w.body.factors ?? []).filter(x => x !== f) : [...(w.body.factors ?? []), f]})}>{f}</button>; })}</div>}
  </div>;
}
