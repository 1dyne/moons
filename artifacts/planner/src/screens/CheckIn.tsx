import {useState} from 'react';
import {capacity, dayCondition, type LifeRecord} from '@workspace/life-contract';
import type {ModuleSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {hm} from './Focus.tsx';
import {Scale} from './Scale.tsx';
import {Tip} from '../Tip.tsx';
import {lowEnergyAlert} from './Focus.tsx';
export {Scale};

// Morning ritual: energy on waking (1–10) and today's fixed appointments → how much the day can really hold.
const localIso = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();

export function CheckIn({m, p, day, now}: {m: ModuleSpec; p: Planner; day: string; now: () => string}) {
  const wake = String(m.options.wake ?? '07:00'), sleep = String(m.options.sleep ?? '00:00');
  const checks = ofKind(p.records, 'condition').filter(c => c.logicalDay === day && c.body.moment === 'wake');
  const w = checks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const fixed = ofKind(p.records, 'task').filter(t => t.logicalDay === day && t.body.plan.fixed && !['cancelled'].includes(t.body.outcome.result));
  const [title, setTitle] = useState(''), [from, setFrom] = useState('10:00'), [to, setTo] = useState('11:00');
  const cap = capacity(p.records, day, {wake, sleep, energy: w?.body.energy ?? null});
  const setEnergy = (n: number) => (lowEnergyAlert(n), p.write(w?.id ?? null, {kind: 'condition', logicalDay: day, body: {...(w?.body ?? {}), at: now(), energy: n, moment: 'wake'}, ...(w ? {baseRevision: w.revision} : {})}));
  const addFixed = async () => {
    if (!title.trim() || to <= from) return;
    if (await p.write(null, {kind: 'task', logicalDay: day, body: {title: title.trim(), plan: {state: 'committed', fixed: true, start: {value: localIso(day, from), precision: 'minute'}, end: {value: localIso(day, to), precision: 'minute'}, estimateMin: null}}})) setTitle('');
  };
  const pct = (n: number) => `${Math.min(100, Math.round(n / Math.max(1, cap.awake) * 100))}%`;
  return <div className="checkin">
    <div className="ck-row"><span className="ck-q">일어났을 때 에너지</span><Scale value={w?.body.energy} onPick={setEnergy} label="기상 직후 에너지 1~10" /></div>
    <div className="ck-fixed">
      <span className="ck-q">오늘 고정 일정</span>
      <ul className="prows">{fixed.map(t => <li key={t.id} className="prow">
        <span className="time-tag">{t.body.plan.start ? new Date(t.body.plan.start.value).toTimeString().slice(0, 5) : ''}–{t.body.plan.end ? new Date(t.body.plan.end.value).toTimeString().slice(0, 5) : ''}</span>
        <span className="ptitle">{t.body.title}</span><button className="ghost small" onClick={() => p.remove(t.id)} aria-label={`${t.body.title} 지우기`}>✕</button></li>)}</ul>
      <form className="padd" onSubmit={e => { e.preventDefault(); void addFixed(); }}>
        <input type="time" value={from} onChange={e => setFrom(e.target.value)} aria-label="시작" className="time-in" />–<input type="time" value={to} onChange={e => setTo(e.target.value)} aria-label="끝" className="time-in" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="고정 일정" aria-label="고정 일정" /><button className="small">추가</button>
      </form>
    </div>
    <div className="capacity" aria-label="오늘 가용 시간">
      <div className="cap-bar">
        <i className="cap-fixed" style={{width: pct(cap.fixedMin)}} title={`고정 일정 ${hm(cap.fixedMin)}`} />
        <i className="cap-real" style={{width: pct(cap.realistic)}} title={`현실적인 집중 ${hm(cap.realistic)}`} />
        <i className="cap-plan" style={{left: `calc(${pct(cap.fixedMin)})`, width: pct(cap.planned)}} title={`계획 ${hm(cap.planned)}`} />
      </div>
      <p className="cap-text">
        <span className="k">가용</span> <strong>{hm(cap.free)}</strong>
        {w && <> · <span className="k">현실 집중</span> <strong>{hm(cap.realistic)}</strong></>}
        <Tip id="checkin-math"> 깨어 있는 {hm(cap.awake)} − 고정 {hm(cap.fixedMin)}. 에너지를 고르면 현실적인 집중량을 계산해요.</Tip>
      </p>
      {w && <p className={`cap-verdict ${cap.over ? 'over' : 'ok'}`}>
        {cap.over ? <>계획 {hm(cap.planned)} · <strong>{hm(cap.over)}</strong> 초과</>
          : <>계획 {hm(cap.planned)} · 여유 {hm(cap.realistic - cap.planned)}</>}
        {cap.unestimated > 0 && <Tip id="checkin-unestimated"> 예상 시간이 없는 할 일 {cap.unestimated}개는 빠졌어요</Tip>}
      </p>}
    </div>
  </div>;
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
