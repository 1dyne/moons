import {useEffect, useState} from 'react';
import {type AnyRecord, type Goal, type LifeRecord, type Persona} from '@workspace/life-contract';
import type {PlannerSpec, PropDef, Widget} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {useL} from '../labels.tsx';
import {Gauge} from '../Gauge.tsx';
import {hm} from './Focus.tsx';
import {abilitiesOf, deployedOver, energyPoints, goalActualMin, lightOf, missionState, roi} from '../lifeLogic.ts';
export {abilitiesOf, deployedOver, energyPoints, focusReachedAt, goalActualMin, lightOf, missionState, roi} from '../lifeLogic.ts';
import type {Ctx} from './day.ts';

const mins = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000);
const localHour = (iso: string) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; };

// ── 에너지 신호등 ─────────────────────────────────────────────────────────────
export function EnergyLight({w, ctx}: {w: Widget; ctx: Ctx}) {
  const warnAt = Number(w.options.warnAt ?? 6), start = Number(w.options.startHour ?? 6), end = Number(w.options.endHour ?? 26);
  const pts = energyPoints(ctx.p.records, ctx.day), last = pts.at(-1);
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [on, setOn] = useState(() => { try { return localStorage.getItem('lit.energyAlert') !== null; } catch { return false; } });
  const enable = async () => {
    const r = typeof Notification === 'undefined' ? 'denied' : await Notification.requestPermission();
    setPerm(r);
    if (r === 'granted') { try { localStorage.setItem('lit.energyAlert', String(warnAt)); } catch { /* no storage */ } setOn(true); }
  };
  const W = 300, H = 64, x = (h: number) => 8 + (Math.min(end, Math.max(start, h < start ? h + 24 : h)) - start) / (end - start) * (W - 16), y = (n: number) => 6 + (10 - n) / 9 * (H - 22);
  return <div className="energy-light">
    {last && last.score <= warnAt && <p className={`energy-warn ${lightOf(last.score)}`} role="alert">에너지 {last.score}점 · {new Date(last.at).toTimeString().slice(0, 5)} {last.label}</p>}
    <svg viewBox={`0 0 ${W} ${H}`} className="energy-svg" role="img" aria-label="시간대별 컨디션">
      {[7, 4].map(n => <line key={n} x1={8} x2={W - 8} y1={y(n) + (n === 7 ? 4 : 4)} y2={y(n) + 4} className="energy-band" />)}
      {Array.from({length: Math.floor((end - start) / 3) + 1}, (_, i) => start + i * 3).map(h => <text key={h} x={x(h)} y={H - 2} textAnchor="middle" className="energy-hour">{h % 24}</text>)}
      {pts.map((p, i) => <g key={i}><circle cx={x(localHour(p.at))} cy={y(p.score)} r={5} className={`dot-${lightOf(p.score)}`}><title>{`${new Date(p.at).toTimeString().slice(0, 5)} ${p.label} · ${p.score}점`}</title></circle></g>)}
    </svg>
    {!pts.length && <p className="muted small">타이머를 멈출 때 컨디션을 남기면 점이 찍혀요.</p>}
    {perm !== 'unsupported' && (on && perm === 'granted' ? <button className="ghost small" onClick={() => { try { localStorage.removeItem('lit.energyAlert'); } catch { /* */ } setOn(false); }}>{warnAt} 이하 알림 끄기</button>
      : <button className="small" onClick={() => void enable()} disabled={perm === 'denied'}>{perm === 'denied' ? '브라우저에서 알림이 막혀 있어요' : `${warnAt} 이하면 알림 받기`}</button>)}
  </div>;
}

// ── 오늘의 미션 ──────────────────────────────────────────────────────────────
export function Mission({w, ctx}: {w: Widget; ctx: Ctx}) {
  const L = useL(), target = Number(w.options.focusTarget ?? 480);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);
  const m = missionState(ctx.p.records, ctx.day, target);
  const free = m.wonAt ? mins(m.wonAt, new Date().toISOString()) : 0;
  const pct = (a: number, b: number) => b ? Math.min(100, a / b * 100) : 0;
  return <div className="mission">
    <div className={`ms-bar ${m.winner === 'focus' ? 'won' : ''}`}><span className="k">{L('focus', '순집중')} {hm(m.focus)} / {hm(target)}</span><Gauge pct={pct(m.focus, target)} size="md" kind="bar" /></div>
    <div className={`ms-bar ${m.winner === 'plan' ? 'won' : ''}`}><span className="k">{L('plan', '일정 전부 완료')} {m.done}/{m.plan}</span><Gauge pct={m.plan ? pct(m.done, m.plan) : null} size="md" kind="bar" /></div>
    {m.wonAt ? <p className="ms-free"><strong>{L('free', '자유시간')} {hm(free)}</strong> <span className="muted small">{new Date(m.wonAt).toTimeString().slice(0, 5)}부터 · {m.winner === 'focus' ? '순집중' : '일정 완료'}이 먼저</span></p>
      : <p className="muted small">둘 중 먼저 차는 쪽부터 자유시간이 시작돼요.</p>}
    <Wishes w={w} ctx={ctx} won={!!m.wonAt} unlock={L('unlock', '해금')} />
  </div>;
}

function wishTable(spec: PlannerSpec | undefined, ref: string) {
  const all = [...(spec?.canvas?.day ?? []), ...(spec?.tabs ?? []).flatMap(t => t.widgets ?? [])].filter(x => x.type === 'table');
  return all.find(x => x.id === ref) ?? all.find(x => (x.title ?? '') === ref) ?? null;
}
function Wishes({w, ctx, won, unlock}: {w: Widget; ctx: Ctx; won: boolean; unlock: string}) {
  const ref = String(w.options.wishTable ?? ''), table = ref ? wishTable(ctx.spec, ref) : null;
  if (!table) return null;
  const cols = (table.options.columns as PropDef[] | undefined) ?? [];
  const status = cols.find(c => c.name === String(w.options.statusColumn ?? '상태'));
  const locked = String(w.options.lockedValue ?? '잠김'), opened = String(w.options.unlockValue ?? '해금');
  if (!status) return <p className="muted small">소원 표에 "{String(w.options.statusColumn ?? '상태')}" 열이 없어요.</p>;
  const rows = ofKind(ctx.p.records, 'note').filter(n => n.body.signifier === 'row' && n.body.table === table.id && n.body.cells[status.id] === locked);
  if (!rows.length) return null;
  return <div className="wishes"><span className="k">해금 가능한 소원</span>
    <ul>{rows.slice(0, 5).map(r => <li key={r.id}><span>{r.body.text || '(이름 없음)'}</span>
      <button className="small" disabled={!won} title={won ? undefined : '미션을 먼저 이루면 열려요'} onClick={() => ctx.p.write(r.id, {kind: 'note', logicalDay: r.logicalDay, body: {...r.body, cells: {...r.body.cells, [status.id]: opened}}, baseRevision: r.revision})}>{unlock}</button></li>)}</ul>
  </div>;
}

// ── 페르소나 현황 ────────────────────────────────────────────────────────────
const STATUS = {deployed: 'Deployed', attached: 'Attached', standby: 'Standby'} as const;
export function PersonaBoard({w, ctx}: {w: Widget; ctx: Ctx}) {
  const month = ctx.day.slice(0, 7), limit = Number(w.options.limit ?? 3);
  const personas = ofKind(ctx.p.records, 'persona').filter(p => p.body.active)
    .sort((a, b) => (a.body.months?.[month]?.priority ?? 9) - (b.body.months?.[month]?.priority ?? 9) || a.body.name.localeCompare(b.body.name));
  const d = deployedOver(personas, month, limit);
  const save = (p: LifeRecord<'persona'>, body: Partial<Persona>) => ctx.p.write(p.id, {kind: 'persona', body: {...p.body, ...body}, baseRevision: p.revision});
  const setMonth = (p: LifeRecord<'persona'>, v: Partial<{status: 'deployed' | 'attached' | 'standby' | ''; priority: number | null}>) => {
    const cur = p.body.months?.[month], months = {...p.body.months};
    const status = v.status === undefined ? cur?.status : v.status || undefined;
    if (!status) delete months[month]; else months[month] = {status, priority: v.priority !== undefined ? v.priority : cur?.priority ?? null};
    return save(p, {months});
  };
  const [role, setRole] = useState<Record<string, string>>({});
  if (!personas.length) return <p className="muted small">설정 → 페르소나에서 역할을 만들면 여기서 이번 달 배치를 정해요.</p>;
  return <div className="pboard">
    <p className={`pb-count ${d.over ? 'over' : ''}`} role={d.over ? 'alert' : undefined}>{month.slice(5)}월 Deployed <strong>{d.count}</strong>/{limit}{d.over ? ' · 한도를 넘었어요' : ''} <span className="muted small">(Attached는 세지 않아요)</span></p>
    <ul className="pb-list">{personas.map(p => { const m = p.body.months?.[month], ab = abilitiesOf(ctx.p.records, p.id);
      return <li key={p.id} className={`pb-item st-${m?.status ?? 'none'}`}>
        <div className="pb-head"><i className="dot" style={{background: p.body.color}} /><strong>{p.body.name}</strong>
          <select value={m?.status ?? ''} onChange={e => void setMonth(p, {status: e.target.value as 'deployed'})} aria-label={`${p.body.name} 이번 달 상태`}><option value="">–</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={m?.priority ?? ''} onChange={e => void setMonth(p, {priority: e.target.value ? Number(e.target.value) : null})} disabled={!m} aria-label={`${p.body.name} 우선순위`}><option value="">순위</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>{n}</option>)}</select>
        </div>
        <div className="pb-roles">{(p.body.roles ?? []).map(r => <span key={r} className="tag">{r}<button className="link" onClick={() => void save(p, {roles: (p.body.roles ?? []).filter(x => x !== r)})} aria-label={`${r} 지우기`}> ×</button></span>)}
          <form className="inline" onSubmit={e => { e.preventDefault(); const v = (role[p.id] ?? '').trim(); if (v && !(p.body.roles ?? []).includes(v)) void save(p, {roles: [...(p.body.roles ?? []), v].slice(0, 60)}); setRole({...role, [p.id]: ''}); }}>
            <input value={role[p.id] ?? ''} onChange={e => setRole({...role, [p.id]: e.target.value})} placeholder="역할" aria-label={`${p.body.name} 역할 추가`} maxLength={40} /></form></div>
        {ab.length > 0 && <div className="pb-abilities"><span className="k">획득한 능력</span>{ab.map(g => <span key={g.id} className="ability">{g.body.title}</span>)}</div>}
      </li>; })}</ul>
  </div>;
}

// ── 목표 이룸·포기 ───────────────────────────────────────────────────────────
export function GoalRetroForm({g, p, kind, done}: {g: LifeRecord<'goal'>; p: Planner; kind: 'achieved' | 'dropped'; done: () => void}) {
  const actual = goalActualMin(p.records, g.id);
  const [impact, setImpact] = useState<number | null>(null), [next, setNext] = useState<'me' | 'ai' | 'outsource' | null>(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const retro = {kind, at: new Date().toISOString(), actualMin: actual, impact: kind === 'achieved' ? impact : null, roi: kind === 'achieved' ? roi(impact, actual) : null, nextOwner: kind === 'achieved' ? next : null, note: note.trim() || null};
    await p.write(g.id, {kind: 'goal', body: {...g.body, status: kind, retro} satisfies Goal, baseRevision: g.revision});
    setBusy(false); done();
  };
  return <section className="part retro"><h3>{kind === 'achieved' ? '성취 기록지' : '조정 기록지'}</h3>
    {kind === 'achieved' && <>
      <p>실제 집중 <strong>{hm(actual)}</strong> <span className="muted small">(이 목표와 아래 마일스톤에 이어진 할 일의 타이머 합계)</span></p>
      <div className="inline"><span className="k">임팩트</span>{Array.from({length: 10}, (_, i) => i + 1).map(n => <button key={n} className={`scale-btn ${impact === n ? 'on' : ''}`} onClick={() => setImpact(n)} aria-pressed={impact === n}>{n}</button>)}</div>
      <p className="small">ROI (임팩트 ÷ 노력 시간) <strong>{roi(impact, actual) ?? '–'}</strong></p>
      <div className="inline"><span className="k">다음엔 누가</span>{([['me', '나'], ['ai', 'AI'], ['outsource', '외주']] as const).map(([k, v]) => <button key={k} className={`small ${next === k ? 'primary' : ''}`} onClick={() => setNext(k)} aria-pressed={next === k}>{v}</button>)}</div>
    </>}
    <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} aria-label={kind === 'achieved' ? '회고 메모' : '조정 메모'} />
    <div className="inline"><button className="primary small" disabled={busy} onClick={() => void save()}>{kind === 'achieved' ? '이뤘어요로 저장' : '포기로 저장'}</button><button className="ghost small" onClick={done}>닫기</button></div>
  </section>;
}

export function GoalRetroView({g}: {g: LifeRecord<'goal'>}) {
  const r = g.body.retro;
  if (!r) return null;
  const who = r.nextOwner ? {me: '나', ai: 'AI', outsource: '외주'}[r.nextOwner] : null;
  return <section className="part retro-view"><h3>{r.kind === 'achieved' ? '성취 기록지' : '조정 기록지'} <span className="muted small">{r.at.slice(0, 10)}</span></h3>
    {r.kind === 'achieved' && <p className="small">실제 {r.actualMin !== null ? hm(r.actualMin) : '–'} · 임팩트 {r.impact ?? '–'} · ROI {r.roi ?? '–'}{who ? ` · 다음엔 ${who}` : ''}</p>}
    {r.note && <p>{r.note}</p>}
  </section>;
}
