import {createElement, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {logicalDay, type AnyRecord, type Entry} from '@workspace/life-contract';
import {Logic, MadeOptions, aggregate, timeStretches, type Stretch, checkTemplate, cleanCss, durationMin, entriesOf, inRange, matches, periodRange, read, renderTemplate, runFlows, suggestLinks,
  type E, type FieldDef, type LogicBlock, type TypeDef} from '@workspace/planner-spec';
import {ofKind} from '../data.ts';
import type {Ctx} from '../screens/day.ts';
import {Icon, iconSvg} from './icons.tsx';

// A made widget: blocks over one type of entries (docs/lit/BLOCKS.md §3). The same component draws the live widget,
// the preview in the studio, and the blocks inside an HTML design.
export type M = {ctx: Ctx; logic: Logic; type: TypeDef | undefined; wid: string; opts: MadeOptions; today: string; notify: (s: string) => void};

export const logicOf = (ctx: Ctx, override?: Logic) => override ?? Logic.parse(ctx.spec?.logic ?? {});
const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const clock = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const isOpen = (e: E) => !e.body.end && (e.ext as {open?: boolean} | undefined)?.open === true;
const noon = (day: string) => new Date(`${day}T12:00:00`).toISOString();

export function MadeWidget({w, ctx, today, logic: override, options}: {w: {id: string; options: Record<string, unknown>}; ctx: Ctx; today: string; logic?: Logic; options?: MadeOptions}) {
  const opts = useMemo(() => options ?? MadeOptions.parse(w.options), [options, w.options]);
  const logic = logicOf(ctx, override), type = logic.types.find(t => t.id === opts.type);
  const [notices, setNotices] = useState<string[]>([]);
  const notify = (s: string) => {
    setNotices(n => [...n, s]); setTimeout(() => setNotices(n => n.slice(1)), 5000);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') { try { new Notification('lit', {body: s}); } catch { /* not here */ } }
  };
  const m: M = {ctx: opts.followDay ? ctx : {...ctx, day: today}, logic, type, wid: w.id, opts, today, notify};
  if (!type) return <p className="muted small made-empty">{ctx.saveSpec ? '두 번 눌러 이 위젯의 기록 묶음을 정해요' : '–'}</p>;
  const d = opts.design;
  const style = {...(d.accent ? {'--accent': d.accent, '--btn': d.accent} : {}), ...(d.bg ? {background: d.bg, '--wg-bg': d.bg} : {}), ...(d.ink ? {color: d.ink, '--ink': d.ink} : {}), ...(d.radius !== null ? {'--radius': `${d.radius}px`} : {})} as React.CSSProperties;
  return <div className={`made density-${d.density} align-${d.align}`} style={style} data-made={w.id}>
    {d.mode === 'html' && d.html.trim() ? <HtmlDesign m={m} /> : opts.blocks.map(b => <BlockView key={b.id} b={b} m={m} />)}
    {notices.length > 0 && <div className="made-notice" role="status">{notices.map((n, i) => <p key={i}>{n}</p>)}</div>}
  </div>;
}

// ── Writing entries (and the automations that follow) ────────────────────────────────────────────
async function write(m: M, id: string | null, body: Partial<Entry>, ext?: Record<string, unknown>, base?: E) {
  const at = body.at ?? base?.body.at ?? new Date().toISOString();
  const settings = m.ctx.settings;
  const full = {type: m.opts.type, verb: 'did', end: null, value: null, fields: {}, links: [], ...base?.body, ...body, at} as Entry;
  const rec = await m.ctx.p.write(id, {kind: 'entry', logicalDay: base?.logicalDay ?? (settings ? logicalDay(at, settings) : m.ctx.day), body: full, ...(ext ? {ext} : base?.ext ? {ext: base.ext} : {}), ...(base ? {baseRevision: base.revision} : {})});
  if (rec) {
    const {notices, writes, opens} = runFlows(m.logic, [...m.ctx.p.records.filter(r => r.id !== rec.id), rec], rec, {day: rec.logicalDay ?? m.ctx.day});
    notices.forEach(m.notify);
    if (opens.length) dispatchEvent(new CustomEvent('lit:open', {detail: {what: opens.at(-1)}}));
    if (writes.length) setTimeout(() => void m.ctx.p.refresh(), 500);
  }
  return rec as E | null;
}
/** When the visible day is not today, inputs without a clock (check, score, form) are written to the visible day. */
const atFor = (m: M) => m.ctx.day === m.today ? new Date().toISOString() : noon(m.ctx.day);
const entries = (m: M) => entriesOf(m.ctx.p.records, m.opts.type);
const ofPeriod = (m: M, b: LogicBlock) => entries(m).filter(e => inRange(e, periodRange(b.period, m.ctx.day, m.today)) && matches(e.body, b.conds));
const fieldOf = (m: M, id: string) => m.type?.fields.find(f => f.id === id);

/** What a block's main button does — shared by the drawn block and data-lit-press in HTML designs. */
export async function press(m: M, b: LogicBlock, opt?: string) {
  const list = entries(m);
  // A choice field on a toggle or check makes one row per option (과목별 타이머, 루틴 항목); opt is the row.
  const tag = b.field && opt !== undefined ? {[b.field]: opt} : {};
  switch (b.kind) {
    case 'button': return write(m, null, {verb: b.verb ?? 'did', at: new Date().toISOString(), ...(b.field ? {fields: {[b.field]: true}} : {})});
    case 'toggle': case 'stopwatch': {
      const open = list.find(isOpen);
      const end = (e: E) => write(m, e.id, {end: new Date().toISOString(), value: m.type?.unit === 'min' || m.type?.unit === '분' ? {amount: Math.round(durationMin(e.body)), unit: m.type.unit} : e.body.value}, {open: false}, e);
      // Starting one row stops the one running (one stretch at a time, like a subject timer).
      if (open) { const ended = await end(open); if (opt === undefined || open.body.fields[b.field] === opt) return ended; }
      return write(m, null, {verb: b.verb ?? 'did', at: new Date().toISOString(), fields: tag}, {open: true});
    }
    case 'counter': return write(m, null, {verb: b.verb ?? 'did', at: atFor(m), value: {amount: b.amount, unit: m.type?.unit ?? ''}});
    case 'check': {
      const done = list.find(e => e.logicalDay === m.ctx.day && (opt === undefined || e.body.fields[b.field] === opt));
      if (opt !== undefined) { if (done) return m.ctx.p.remove(done.id); return write(m, null, {verb: b.verb ?? 'did', at: atFor(m), fields: tag}); }
      if (done) return m.ctx.p.remove(done.id);
      return write(m, null, {verb: b.verb ?? 'did', at: atFor(m), ...(b.field ? {fields: {[b.field]: true}} : {})});
    }
    case 'timer': return timerToggle(m, b);
    default: return null;
  }
}

function BlockView({b, m}: {b: LogicBlock; m: M}) {
  const head = b.label || b.icon ? <span className="mb-label">{b.icon && <Icon name={b.icon} size={16} />}{b.label}</span> : null;
  switch (b.kind) {
    case 'button': return <ButtonBlock b={b} m={m} />;
    case 'toggle': case 'stopwatch': return <ToggleBlock b={b} m={m} />;
    case 'counter': return <CounterBlock b={b} m={m} />;
    case 'check': return <CheckBlock b={b} m={m} />;
    case 'score': return <div className="mb mb-score">{head}<ScoreBlock b={b} m={m} /></div>;
    case 'form': return <div className="mb mb-form">{head}<FormBlock b={b} m={m} /></div>;
    case 'timer': return <TimerBlock b={b} m={m} />;
    case 'stat': return <StatBlock b={b} m={m} />;
    case 'list': case 'table': case 'gallery': return <div className={`mb mb-${b.kind}`}>{head}<ListBlock b={b} m={m} /></div>;
    case 'timeline': return <div className="mb mb-timeline">{head}<TimelineBlock b={b} m={m} /></div>;
    case 'calendar': return <div className="mb mb-calendar">{head}<CalendarBlock b={b} m={m} /></div>;
    case 'chart': return <div className="mb mb-chart">{head}<ChartBlock b={b} m={m} /></div>;
    case 'grid10': return <Grid10Block b={b} m={m} />;
    case 'breakdown': return <BreakdownBlock b={b} m={m} />;
    case 'heading': return <p className={`mb mb-heading ${b.style || 'm'}`}>{b.icon && <Icon name={b.icon} size={18} />}{b.text}</p>;
    case 'note': return <div className="mb mb-space" aria-hidden="true" />;
  }
}

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────
function ButtonBlock({b, m}: {b: LogicBlock; m: M}) {
  const last = entries(m).filter(e => e.logicalDay === m.ctx.day).sort((a, c) => c.body.at.localeCompare(a.body.at))[0];
  return <div className={`mb mb-button st-${b.style || 'pill'}`}>
    <button className="mb-btn" onClick={() => void press(m, b)}>{b.icon && <Icon name={b.icon} />}<span>{b.label || '기록'}</span></button>
    {last && <span className="mb-last mono">{clock(last.body.at)}</span>}
  </div>;
}
function useTick(on: boolean, ms = 1000) { const [, set] = useState(0); useEffect(() => { if (!on) return; const t = setInterval(() => set(n => n + 1), ms); return () => clearInterval(t); }, [on, ms]); }
const optionsOf = (m: M, b: LogicBlock) => { const f = fieldOf(m, b.field); return f && (f.kind === 'choice' || f.kind === 'multi') && f.options.length ? f.options : null; };
function ToggleBlock({b, m}: {b: LogicBlock; m: M}) {
  const all = entries(m), open = all.find(isOpen), opts = optionsOf(m, b);
  useTick(!!open, b.kind === 'stopwatch' || opts ? 1000 : 30_000);
  const [asked, setAsked] = useState<string | null>(null);
  const go = async (opt?: string) => { const was = open; const r = await press(m, b, opt); if (b.ask && was && r && (r as E).id === was.id) setAsked(was.id); };
  const today = all.filter(e => e.logicalDay === m.ctx.day && e.body.end), total = today.reduce((s, e) => s + durationMin(e.body), 0);
  const ms = open ? Date.now() - Date.parse(open.body.at) : 0, s = Math.floor(ms / 1000);
  const hms = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const ask = asked ? all.find(e => e.id === asked) : undefined, af = fieldOf(m, b.ask);
  const rate = ask && af && <div className="mb-ask" role="group" aria-label={`${af.name} 남기기`}><span className="small">{af.name}</span>
    <div className="scale" style={{'--n': af.max} as React.CSSProperties}>{Array.from({length: af.max}, (_, i) => i + 1).map(n => <button key={n} onClick={() => { setAsked(null); void write(m, ask.id, {fields: {...ask.body.fields, [af.id]: n}}, undefined, ask); }} style={{'--lv': Math.round(n / af.max * 10)} as React.CSSProperties}>{n}</button>)}</div>
    <button className="ghost small" onClick={() => setAsked(null)}>건너뛰기</button></div>;
  if (opts) {
    const spent = (o: string) => all.filter(e => e.logicalDay === m.ctx.day && e.body.fields[b.field] === o).reduce((x, e) => x + durationMin(e.body), 0);
    return <div className="mb mb-subjects">
      <div className="mb-subj-head"><span className="mb-label">{b.icon && <Icon name={b.icon} size={16} />}{b.label || '오늘'}</span><strong className="mono">{hm(total + (open ? durationMin(open.body) : 0))}</strong>{open && <span className="mono small">{String(open.body.fields[b.field] ?? '')} · {hms}</span>}</div>
      {rate}
      <ul className="subj-list">{opts.map(o => { const on = !!open && open.body.fields[b.field] === o; return <li key={o} className={on ? 'on' : ''} style={{'--sc': colorFor(m, opts)(o)} as React.CSSProperties}>
        <i className="subj-dot" aria-hidden="true" /><span className="subj-name">{o}</span><span className="subj-min">{hm(spent(o))}</span>
        <button className={`subj-btn ${on ? 'stop' : ''}`} onClick={() => void go(o)} aria-label={`${o} ${on ? '멈추기' : '시작'}`}>{on ? '■' : '▶'}</button></li>; })}</ul>
    </div>;
  }
  return <div className={`mb mb-toggle ${open ? 'on' : ''} st-${b.style || (b.kind === 'stopwatch' ? 'big' : 'pill')}`}>
    {b.kind === 'stopwatch' && <span className="mb-clock mono" aria-live="off">{open ? hms : hm(total)}</span>}
    <button className="mb-btn" onClick={() => void go()} aria-pressed={!!open}>{b.icon && <Icon name={b.icon} />}<span>{open ? b.endLabel || '끝' : b.startLabel || '시작'}</span></button>
    {open ? <span className="mb-last mono">{clock(open.body.at)}~</span> : today.length > 0 && b.kind === 'toggle' && <span className="mb-last mono">{today.map(e => `${clock(e.body.at)}–${clock(e.body.end!)}`).slice(-2).join(' · ')}</span>}
    {rate}
  </div>;
}
function CounterBlock({b, m}: {b: LogicBlock; m: M}) {
  const list = entries(m).filter(e => e.logicalDay === m.ctx.day), n = list.reduce((s, e) => s + (e.body.value?.amount ?? 1), 0);
  const last = [...list].sort((a, c) => c.body.at.localeCompare(a.body.at))[0];
  return <div className={`mb mb-counter st-${b.style || 'pill'}`}>
    {b.label && <span className="mb-label">{b.icon && <Icon name={b.icon} size={16} />}{b.label}</span>}
    <button className="ghost mb-minus" disabled={!last} onClick={() => last && m.ctx.p.remove(last.id)} aria-label="하나 빼기">−</button>
    <strong className="mb-count mono">{n}{m.type?.unit ? <small>{m.type.unit}</small> : null}{b.target ? <small>/{b.target}</small> : null}</strong>
    <button className="mb-btn" onClick={() => void press(m, b)} aria-label="하나 더하기">+{b.amount !== 1 ? b.amount : ''}</button>
  </div>;
}
function CheckBlock({b, m}: {b: LogicBlock; m: M}) {
  const opts = optionsOf(m, b);
  if (opts) {
    const today = entries(m).filter(e => e.logicalDay === m.ctx.day);
    return <ul className="mb mb-checks">{b.label && <li className="mb-label">{b.label}</li>}{opts.map(o => { const on = today.some(e => e.body.fields[b.field] === o); return <li key={o} className={`mb-check ${on ? 'on' : ''}`}>
      <button className="mark" onClick={() => void press(m, b, o)} aria-pressed={on} aria-label={o}>{on ? '○' : ''}</button><span>{o}</span></li>; })}</ul>;
  }
  const done = entries(m).some(e => e.logicalDay === m.ctx.day);
  return <label className={`mb mb-check ${done ? 'on' : ''}`}><button className="mark" onClick={() => void press(m, b)} aria-pressed={done} aria-label={b.label || '오늘 체크'}>{done ? '○' : ''}</button>{b.icon && <Icon name={b.icon} size={16} />}<span>{b.label}</span></label>;
}
function ScoreBlock({b, m}: {b: LogicBlock; m: M}) {
  const f = fieldOf(m, b.field), max = f?.max ?? 10;
  const last = entries(m).filter(e => e.logicalDay === m.ctx.day && (b.field ? e.body.fields[b.field] !== undefined : e.body.value)).sort((a, c) => c.body.at.localeCompare(a.body.at))[0];
  const cur = last ? (b.field ? last.body.fields[b.field] : last.body.value?.amount) : null;
  const pick = (n: number) => write(m, null, {verb: b.verb ?? 'felt', at: atFor(m), ...(b.field ? {fields: {[b.field]: n}} : {value: {amount: n, unit: '점'}})});
  return <div className="scale" role="group" aria-label={b.label || f?.name || '점수'} style={{'--n': max} as React.CSSProperties}>{Array.from({length: max}, (_, i) => i + 1).map(n =>
    <button key={n} className={cur === n ? 'on' : ''} aria-pressed={cur === n} onClick={() => void pick(n)} style={{'--lv': Math.round(n / max * 10)} as React.CSSProperties}>{n}</button>)}</div>;
}

// ── Form: the fields the user picked, saved as one entry ────────────────────────────────────────
function FormBlock({b, m, entry, done}: {b: LogicBlock; m: M; entry?: E; done?: () => void}) {
  const shown = (b.fields.length ? b.fields : m.type?.fields.map(f => f.id) ?? []).map(id => fieldOf(m, id)).filter((f): f is FieldDef => !!f);
  const [v, setV] = useState<Record<string, unknown>>(() => entry ? {...entry.body.fields} : {});
  const save = async () => {
    const fields = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined)) as Entry['fields'];
    const links = shown.filter(f => f.kind === 'link' && typeof fields[f.id] === 'string' && fields[f.id]).map(f => ({rel: 'part_of' as const, to: String(fields[f.id])}));
    if (entry) await write(m, entry.id, {fields, links}, undefined, entry);
    else { if (!Object.keys(fields).length) return; await write(m, null, {verb: b.verb ?? 'noted', at: atFor(m), fields, links}); setV({}); }
    done?.();
  };
  const title = String(shown.map(f => v[f.id]).find(x => typeof x === 'string' && x) ?? '');
  return <form className="mb-formgrid" onSubmit={e => { e.preventDefault(); void save(); }}>
    {shown.map(f => <label key={f.id} className={`mf mf-${f.kind}`}><span className="k">{f.name}</span><FieldInput f={f} m={m} value={v[f.id]} title={title} onChange={x => setV(s => ({...s, [f.id]: x}))} /></label>)}
    <div className="inline"><button className="primary small">{entry ? '저장' : b.label && b.kind === 'form' ? '저장' : '저장'}</button>{done && <button type="button" className="ghost small" onClick={done}>닫기</button>}</div>
  </form>;
}
export function linkCandidates(records: AnyRecord[], to: string, logic: Logic) {
  if (to === 'goal') return ofKind(records, 'goal').filter(g => g.body.status === 'active').map(g => ({id: g.id, title: g.body.title}));
  if (to === 'task') return ofKind(records, 'task').slice(-200).map(t => ({id: t.id, title: t.body.title}));
  if (to === 'persona') return ofKind(records, 'persona').filter(x => x.body.active).map(x => ({id: x.id, title: x.body.name}));
  const t = logic.types.find(x => x.id === to);
  return entriesOf(records, to).slice(-200).map(e => ({id: e.id, title: titleOf(e.body, t)}));
}
export const titleOf = (e: Entry, t?: TypeDef) => String(t?.fields.filter(f => f.kind === 'text').map(f => e.fields[f.id]).find(Boolean) ?? `${t?.name ?? ''} ${clock(e.at)}`);
function FieldInput({f, m, value, onChange, title}: {f: FieldDef; m: M; value: unknown; onChange: (v: unknown) => void; title: string}) {
  const s = value === undefined || value === null ? '' : String(value);
  switch (f.kind) {
    case 'number': case 'duration': return <span className="inline"><input inputMode="decimal" className="num" value={s} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} aria-label={f.name} />{f.unit || (f.kind === 'duration' ? '분' : '')}</span>;
    case 'score': return <div className="scale" style={{'--n': f.max} as React.CSSProperties}>{Array.from({length: f.max}, (_, i) => i + 1).map(n => <button type="button" key={n} className={value === n ? 'on' : ''} onClick={() => onChange(value === n ? '' : n)} style={{'--lv': Math.round(n / f.max * 10)} as React.CSSProperties}>{n}</button>)}</div>;
    case 'text': return <input value={s} onChange={e => onChange(e.target.value)} aria-label={f.name} maxLength={300} />;
    case 'longtext': return <textarea rows={3} value={s} onChange={e => onChange(e.target.value)} aria-label={f.name} />;
    case 'choice': return <div className="chips">{f.options.map(o => <button type="button" key={o} className={`chip ${value === o ? 'on' : ''}`} onClick={() => onChange(value === o ? '' : o)}>{o}</button>)}</div>;
    case 'multi': { const arr = Array.isArray(value) ? value.map(String) : []; return <div className="chips">{f.options.map(o => <button type="button" key={o} className={`chip ${arr.includes(o) ? 'on' : ''}`} onClick={() => onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])}>{o}</button>)}</div>; }
    case 'check': return <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} />;
    case 'date': return <input type="date" value={s} onChange={e => onChange(e.target.value)} />;
    case 'time': return <input type="time" className="time-in" value={s} onChange={e => onChange(e.target.value)} />;
    case 'link': {
      const cands = linkCandidates(m.ctx.p.records, f.to, m.logic);
      const history = entries(m).filter(e => typeof e.body.fields[f.id] === 'string').map(e => ({title: titleOf(e.body, m.type), to: String(e.body.fields[f.id])}));
      const sug = !s && title ? suggestLinks(title, cands, history).slice(0, 3) : [];
      return <span className="mf-link"><select value={s} onChange={e => onChange(e.target.value)} aria-label={f.name}><option value="">없음</option>{cands.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        {sug.map(c => <button type="button" key={c.id} className="chip sug" onClick={() => onChange(c.id)}>→ {c.title}</button>)}</span>;
    }
  }
}

// ── Timer: steps one after another (pomodoro 25 → 5), kept on this device so a reload does not lose it ────
type TState = {at: number; step: number; round: number} | null;
const tkey = (m: M, b: LogicBlock) => `lit.timer.${m.wid}.${b.id}`;
const tget = (m: M, b: LogicBlock): TState => { try { return JSON.parse(localStorage.getItem(tkey(m, b)) ?? 'null'); } catch { return null; } };
const tset = (m: M, b: LogicBlock, s: TState) => { try { if (s) localStorage.setItem(tkey(m, b), JSON.stringify(s)); else localStorage.removeItem(tkey(m, b)); } catch { /* */ } dispatchEvent(new Event('lit-timer')); };
const stepsOf = (b: LogicBlock) => b.steps.length ? b.steps : [{name: '집중', min: 25}];
function timerToggle(m: M, b: LogicBlock) { tset(m, b, tget(m, b) ? null : {at: Date.now(), step: 0, round: 1}); return null; }
function TimerBlock({b, m}: {b: LogicBlock; m: M}) {
  const [st, setSt] = useState<TState>(() => tget(m, b));
  useEffect(() => { const f = () => setSt(tget(m, b)); addEventListener('lit-timer', f); return () => removeEventListener('lit-timer', f); }, [m.wid, b.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useTick(!!st, 500);
  const steps = stepsOf(b), step = st ? steps[st.step]! : steps[0]!;
  const left = st ? step.min * 60000 - (Date.now() - st.at) : step.min * 60000;
  const fired = useRef('');
  const finish = async (s: NonNullable<TState>) => {
    // Once per step: the state moves on first, then the entry is written (re-renders meanwhile do nothing).
    const key = `${s.at}:${s.step}:${s.round}`;
    if (fired.current === key) return;
    fired.current = key;
    const cur = steps[s.step]!;
    const lastStep = s.step === steps.length - 1;
    tset(m, b, lastStep && s.round >= b.loop ? null : {at: s.at + cur.min * 60000, step: lastStep ? 0 : s.step + 1, round: lastStep ? s.round + 1 : s.round});
    await write(m, null, {verb: b.verb ?? 'did', at: new Date(s.at).toISOString(), end: new Date(s.at + cur.min * 60000).toISOString(), value: {amount: cur.min, unit: '분'}, ...(b.field ? {fields: {[b.field]: cur.name}} : {})});
    m.notify(`${cur.name} 끝`);
  };
  useEffect(() => { if (st && left <= 0) void finish(st); }); // eslint-disable-line react-hooks/exhaustive-deps
  const sec = Math.max(0, Math.ceil(left / 1000)), pct = st ? 1 - left / (step.min * 60000) : 0;
  const R = 44, C = 2 * Math.PI * R;
  return <div className={`mb mb-timer ${st ? 'on' : ''}`}>
    <svg viewBox="0 0 100 100" className="mb-ring" aria-hidden="true"><circle cx="50" cy="50" r={R} className="ring-bg" /><circle cx="50" cy="50" r={R} className="ring-fg" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 50 50)" /></svg>
    <div className="mb-timer-mid"><span className="k">{step.name}{b.loop > 1 && st ? ` · ${st.round}/${b.loop}` : ''}</span><strong className="mono">{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</strong></div>
    <div className="inline mb-timer-btns">
      <button className="mb-btn" onClick={() => void press(m, b)}>{st ? '멈춤' : b.label || '시작'}</button>
      {st && <button className="ghost small" onClick={() => void finish({...st, at: Date.now() - step.min * 60000})}>다음 단계</button>}
    </div>
  </div>;
}

// ── Compute ─────────────────────────────────────────────────────────────────────────────────────
export function statOf(m: M, b: LogicBlock) {
  const v = aggregate(ofPeriod(m, b), b.agg, b.of, m.ctx.day);
  const unit = b.of === 'duration' ? '분' : b.of && b.of !== 'value' ? fieldOf(m, b.of)?.unit ?? '' : b.agg === 'streak' || b.agg === 'days' ? '일' : b.agg === 'count' ? '' : m.type?.unit ?? '';
  const text = v === null ? '–' : b.of === 'duration' && ['sum', 'avg', 'max', 'min', 'last'].includes(b.agg) ? hm(v) : `${v}${unit}`;
  return {value: v, text, pct: b.target && v !== null ? Math.min(100, Math.round(v / b.target * 100)) : null};
}
function StatBlock({b, m}: {b: LogicBlock; m: M}) {
  const s = statOf(m, b), R = 30, C = 2 * Math.PI * R;
  if (b.show === 'light') return <LightStat b={b} m={m} v={s.value} />;
  return <div className={`mb mb-stat show-${b.show}`}>
    <span className="mb-label">{b.icon && <Icon name={b.icon} size={16} />}{b.label}</span>
    {b.show === 'ring' && s.pct !== null ? <svg viewBox="0 0 80 80" className="mb-statring" role="img" aria-label={`${s.text} ${s.pct}%`}><circle cx="40" cy="40" r={R} className="ring-bg" /><circle cx="40" cy="40" r={R} className="ring-fg" strokeDasharray={`${C * s.pct / 100} ${C}`} transform="rotate(-90 40 40)" /><text x="40" y="45" textAnchor="middle">{s.pct}%</text></svg> : null}
    <strong className="mb-num mono">{s.text}{b.target ? <small>/{b.of === 'duration' ? hm(b.target) : b.target}</small> : null}</strong>
    {(b.show === 'gauge' || b.show === 'bar') && s.pct !== null && <span className="mb-bar"><i style={{width: `${s.pct}%`}} /></span>}
  </div>;
}

/** 신호등: the value as three lamps, and the user's message for that score (phones: behind the i button). */
function LightStat({b, m, v}: {b: LogicBlock; m: M; v: number | null}) {
  const [info, setInfo] = useState(false), phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 700px)').matches;
  const lit = v === null ? null : v >= b.green ? 'blue' : v <= b.red ? 'red' : 'amber', msg = v === null ? '' : b.msgs[String(Math.round(v))] ?? '';
  return <div className="mb mb-light">
    <span className="mb-label">{b.icon && <Icon name={b.icon} size={16} />}{b.label}</span>
    <div className="tlight-top"><div className="tlight" role="img" aria-label={v === null ? '아직 기록 없음' : `${b.label} ${v}`}>{(['red', 'amber', 'blue'] as const).map(c => <i key={c} className={`lamp lamp-${c} ${lit === c ? 'lit' : ''}`} />)}</div>
      <strong className="mb-num mono">{v ?? '–'}</strong>{phone && msg && <button className="info-btn" onClick={() => setInfo(!info)} aria-expanded={info} aria-label="이 점수가 뜻하는 상태">i</button>}</div>
    {msg && (!phone || info) && <p className={`tlight-msg ${lit}`}>{msg}</p>}
  </div>;
}

/** 나눠 보기: one number per option of a choice field (과목별 시간, 분류별 지출). */
const PAL = ['#3a66b8', '#2f9585', '#e9a317', '#d0342c', '#7b6bc4', '#00838f', '#c4689a', '#5d5d57'];
/** Colours the user gave subjects in timer widgets, so a subject looks the same everywhere. */
function subjectColors(m: M) {
  const ws = [...(m.ctx.spec?.canvas?.day ?? []), ...(m.ctx.spec?.tabs ?? []).flatMap(t => t.widgets ?? [])];
  return new Map(ws.filter(w => w.type === 'focus').flatMap(w => ((w.options.subjects as {name: string; color: string}[] | undefined) ?? []).map(sj => [sj.name, sj.color] as const)));
}
const colorFor = (m: M, keys: string[]) => { const own = subjectColors(m); return (k: string) => own.get(k) ?? PAL[keys.indexOf(k) % PAL.length]!; };
function BreakdownBlock({b, m}: {b: LogicBlock; m: M}) {
  const f = fieldOf(m, b.field), list = ofPeriod(m, b);
  const keys = f ? [...new Set([...f.options, ...list.flatMap(e => { const v = e.body.fields[f.id]; return Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []; })])] : [];
  const col = colorFor(m, keys), rows = keys.map(k => ({k, c: col(k), v: aggregate(list.filter(e => { const v = e.body.fields[f!.id]; return Array.isArray(v) ? v.includes(k) : v === k; }), b.agg, b.of, m.ctx.day) ?? 0})).filter(r => r.v > 0).sort((x, y) => y.v - x.v);
  const total = rows.reduce((a, r) => a + r.v, 0), fmt = (v: number) => b.of === 'duration' && b.agg !== 'count' ? hm(v) : `${v}${b.of && b.of !== 'duration' ? fieldOf(m, b.of)?.unit ?? '' : ''}`;
  if (!f) return <p className="muted small">나눌 선택 속성을 고르세요</p>;
  const R = 34, C = 2 * Math.PI * R; let off = 0;
  return <div className={`mb mb-breakdown show-${b.show}`}>
    {b.label && <span className="mb-label">{b.label}</span>}
    {b.show === 'donut' && total > 0 && <svg viewBox="0 0 90 90" width="96" height="96" role="img" aria-label={rows.map(r => `${r.k} ${Math.round(r.v / total * 100)}%`).join(', ')}>
      <circle cx="45" cy="45" r={R} fill="none" stroke="var(--line)" strokeWidth="12" />
      {rows.map(r => { const len = C * r.v / total, el = <circle key={r.k} cx="45" cy="45" r={R} fill="none" stroke={r.c} strokeWidth="12" strokeDasharray={`${len} ${C}`} strokeDashoffset={-off} transform="rotate(-90 45 45)" />; off += len; return el; })}
      <text x="45" y="49" textAnchor="middle" className="donut-mid">{fmt(total)}</text></svg>}
    <ul className="mb-bd">{rows.map(r => <li key={r.k}><i style={{background: r.c}} /><span>{r.k}</span><span className="mb-bdbar"><b style={{width: `${total ? r.v / rows[0]!.v * 100 : 0}%`, background: r.c}} /></span><span className="mono">{fmt(r.v)}</span></li>)}
      {!rows.length && <li className="muted small mb-none">–</li>}</ul>
  </div>;
}

/** 10분 타임테이블: every measured stretch paints its 10-minute cells; an empty cell can be painted into this type. */
function Grid10Block({b, m}: {b: LogicBlock; m: M}) {
  const now = new Date(); useTick(true, 30_000);
  const boundary = Number(m.ctx.settings?.dayBoundary.slice(0, 2) ?? 4), start = b.startHour, end = boundary + 24;
  const cell = (min: number) => { const d = min >= 1440 ? new Date(Date.parse(`${m.ctx.day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : m.ctx.day, mm = min % 1440; return new Date(`${d}T${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}:00`); };
  const from = cell(start * 60), to = cell(end * 60);
  const all = timeStretches(m.ctx.p.records, m.logic, from, to, now).filter(x => b.scope === 'all' || x.type === m.opts.type);
  const keys = [...new Set(all.map(x => x.label))], color = colorFor(m, keys);
  const owner = (a: Date, z: Date) => { let best: Stretch | undefined, ov = 0; for (const x of all) { const o = Math.min(z.getTime(), x.end ? Date.parse(x.end) : now.getTime()) - Math.max(a.getTime(), Date.parse(x.start)); if (o > ov) { ov = o; best = x; } } return ov >= 4 * 60_000 ? best : undefined; };
  const [pick, setPick] = useState<{min: number; s?: Stretch} | null>(null);
  const opts = (m.type?.fields.find(f => f.kind === 'choice' && f.options.length)) ?? null;
  const paint = (min: number, opt?: string) => { setPick(null); return write(m, null, {verb: 'did', at: cell(min).toISOString(), end: cell(min + 10).toISOString(), ...(opts && opt ? {fields: {[opts.id]: opt}} : {})}); };
  const hours = Array.from({length: Math.max(1, end - start)}, (_, i) => start + i);
  return <div className="mb mb-grid10 timetable">
    {b.label && <span className="mb-label">{b.label}</span>}
    <div className="tt-grid" role="grid" aria-label="10분 타임테이블">{hours.map(h => <div key={h} className="tt-row" role="row"><span className="tt-hour">{String(h % 24).padStart(2, '0')}</span>
      {[0, 1, 2, 3, 4, 5].map(i => { const min = h * 60 + i * 10, a = cell(min), z = cell(min + 10), x = owner(a, z), live = now >= a && now < z;
        return <button key={i} role="gridcell" className={`tt-cell ${x ? 'filled' : ''} ${live ? 'now' : ''} ${x && !x.end ? 'running' : ''}`} style={x ? {background: color(x.label)} : undefined}
          title={x ? `${x.label} · ${clock(x.start)}–${x.end ? clock(x.end) : '지금'}` : clock(a.toISOString())} aria-label={`${clock(a.toISOString())} ${x ? x.label : '비어 있음'}`} onClick={() => setPick({min, s: x})} />; })}</div>)}</div>
    {keys.length > 0 && <div className="mb-legend">{keys.map(k => <span key={k}><i style={{background: color(k)}} />{k}</span>)}</div>}
    {pick && <div className="tt-pop" role="dialog" aria-label="칸">
      <div className="tt-pop-head"><strong>{clock(cell(pick.min).toISOString())}–{clock(cell(pick.min + 10).toISOString())}</strong><button className="ghost small" onClick={() => setPick(null)} aria-label="닫기">✕</button></div>
      {pick.s ? <><p>{pick.s.label} <span className="muted">{clock(pick.s.start)}–{pick.s.end ? clock(pick.s.end) : '지금'}</span></p>
        <button className="small danger" onClick={() => { const id = pick.s!.id; setPick(null); void m.ctx.p.remove(id); }}>이 기록 지우기</button></>
        : opts ? <div className="chips">{opts.options.map(o => <button key={o} className="chip" onClick={() => void paint(pick.min, o)}>{o}</button>)}</div>
        : <button className="small" onClick={() => void paint(pick.min)}>{m.type?.name ?? ''} 칠하기</button>}
    </div>}
  </div>;
}

// ── Views ───────────────────────────────────────────────────────────────────────────────────────
const pickKey = (m: M, b: LogicBlock) => `lit.filter.${m.wid}.${b.id}`;
function useFilter(m: M, b: LogicBlock) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(pickKey(m, b)) ?? ''; } catch { return ''; } });
  const set = (id: string) => { setOn(id); try { localStorage.setItem(pickKey(m, b), id); } catch { /* */ } };
  const active = b.filters.find(f => f.id === on);
  return {on: active ? on : '', set, conds: active?.conds ?? []};
}
export function showValue(m: M, f: FieldDef | undefined, v: unknown) {
  if (v === null || v === undefined || v === '') return '';
  if (f?.kind === 'link') return linkCandidates(m.ctx.p.records, f.to, m.logic).find(c => c.id === v)?.title ?? '';
  if (f?.kind === 'check') return v ? '✓' : '';
  if (Array.isArray(v)) return v.join(', ');
  return `${v}${f?.unit ?? ''}`;
}
function ListBlock({b, m}: {b: LogicBlock; m: M}) {
  const fl = useFilter(m, b), [edit, setEdit] = useState<string | null>(null);
  const list = ofPeriod(m, b).filter(e => matches(e.body, fl.conds)).sort((a, c) => b.sort === 'old' ? a.body.at.localeCompare(c.body.at) : b.sort === 'value' ? (c.body.value?.amount ?? 0) - (a.body.value?.amount ?? 0) : c.body.at.localeCompare(a.body.at)).slice(0, b.limit);
  const cols = (b.fields.length ? b.fields : m.type?.fields.map(f => f.id) ?? []).map(id => fieldOf(m, id)).filter((f): f is FieldDef => !!f);
  const chips = b.filters.length > 0 && <div className="chips mb-chips" role="radiogroup" aria-label="필터">
    <button className={`chip ${fl.on === '' ? 'on' : ''}`} role="radio" aria-checked={fl.on === ''} onClick={() => fl.set('')}>전체</button>
    {b.filters.map(f => <button key={f.id} className={`chip ${fl.on === f.id ? 'on' : ''}`} role="radio" aria-checked={fl.on === f.id} onClick={() => fl.set(f.id)}>{f.name}</button>)}</div>;
  const when = (e: E) => `${b.period === 'day' || b.period === 'today' ? '' : `${e.logicalDay?.slice(5).replace('-', '/')} `}${clock(e.body.at)}${e.body.end ? `–${clock(e.body.end)}` : ''}`;
  const editor = (e: E) => edit === e.id && <EntryEditor e={e} m={m} close={() => setEdit(null)} />;
  if (b.kind === 'table') return <>{chips}<div className="mb-tablewrap"><table className="mb-table"><thead><tr><th>시각</th>{cols.map(f => <th key={f.id}>{f.name}</th>)}{m.type?.unit ? <th>{m.type.unit}</th> : null}</tr></thead>
    <tbody>{list.map(e => <tr key={e.id} onClick={() => setEdit(edit === e.id ? null : e.id)}><td className="mono">{when(e)}</td>{cols.map(f => <td key={f.id}>{showValue(m, f, e.body.fields[f.id])}</td>)}{m.type?.unit ? <td className="mono">{e.body.value?.amount ?? ''}</td> : null}</tr>)}</tbody></table></div>
    {list.filter(e => e.id === edit).map(e => <EntryEditor key={e.id} e={e} m={m} close={() => setEdit(null)} />)}</>;
  if (b.kind === 'gallery') return <>{chips}<ul className="mb-cards">{list.map(e => <li key={e.id}><button className="mb-card" onClick={() => setEdit(edit === e.id ? null : e.id)}>
    <b>{titleOf(e.body, m.type)}</b><span className="mono small">{when(e)}</span>{cols.filter(f => f.kind !== 'text').slice(0, 3).map(f => { const v = showValue(m, f, e.body.fields[f.id]); return v && <span key={f.id} className="small">{f.name} {v}</span>; })}</button>{editor(e)}</li>)}</ul></>;
  return <>{chips}<ul className="mb-list">{list.map(e => <li key={e.id}><button className="mb-row" onClick={() => setEdit(edit === e.id ? null : e.id)}>
    <span className="mono mb-when">{when(e)}</span>
    <span className="mb-vals">{e.body.value ? <b className="mono">{e.body.value.amount}{e.body.value.unit}</b> : e.body.end ? <b className="mono">{hm(durationMin(e.body))}</b> : null}
      {cols.map(f => { const v = showValue(m, f, e.body.fields[f.id]); return v && <span key={f.id}><em>{f.name}</em> {v}</span>; })}</span></button>{editor(e)}</li>)}
    {!list.length && <li className="muted small mb-none">–</li>}</ul></>;
}
function EntryEditor({e, m, close}: {e: E; m: M; close: () => void}) {
  const day = e.logicalDay ?? m.ctx.day;
  const retime = (which: 'at' | 'end', hhmm: string) => {
    if (!hhmm) return;
    const [h, mi] = hhmm.split(':').map(Number), base = new Date(e.body[which] ?? e.body.at); base.setHours(h!, mi!, 0, 0);
    const body = {[which]: base.toISOString()} as Partial<Entry>;
    if (which === 'end' && base.toISOString() < e.body.at) return;
    return write(m, e.id, body, undefined, e);
  };
  return <div className="mb-edit">
    <div className="inline"><span className="k">{day.slice(5).replace('-', '/')}</span><input type="time" className="time-in" defaultValue={clock(e.body.at)} onBlur={x => void retime('at', x.target.value)} aria-label="시각" />
      {e.body.end && <>–<input type="time" className="time-in" defaultValue={clock(e.body.end)} onBlur={x => void retime('end', x.target.value)} aria-label="끝" /></>}
      {e.body.value && <input className="num" inputMode="decimal" defaultValue={e.body.value.amount} onBlur={x => { const n = Number(x.target.value); if (Number.isFinite(n) && n !== e.body.value!.amount) void write(m, e.id, {value: {...e.body.value!, amount: n}}, undefined, e); }} aria-label="값" />}</div>
    {m.type && m.type.fields.length > 0 && <FormBlock b={{id: 'edit', kind: 'form', fields: []} as unknown as LogicBlock} m={m} entry={e} done={close} />}
    <div className="inline"><button className="ghost small danger" onClick={() => { close(); void m.ctx.p.remove(e.id); }}>지우기</button>{!m.type?.fields.length && <button className="ghost small" onClick={close}>닫기</button>}</div>
  </div>;
}
function TimelineBlock({b, m}: {b: LogicBlock; m: M}) {
  const [edit, setEdit] = useState<string | null>(null);
  const list = ofPeriod(m, {...b, period: b.period === 'all' ? 'day' : b.period}).sort((a, c) => a.body.at.localeCompare(c.body.at));
  const pos = (iso: string) => { const d = new Date(iso); return (d.getHours() * 60 + d.getMinutes()) / 1440 * 100; };
  return <ol className="mb-tl">{list.map(e => <li key={e.id}>
    <button className="mb-tlrow" onClick={() => setEdit(edit === e.id ? null : e.id)}><span className="mono mb-when">{clock(e.body.at)}{e.body.end ? <small>–{clock(e.body.end)}</small> : null}</span>
      <span className="mb-tltrack"><i style={{left: `${pos(e.body.at)}%`, width: `${Math.max(0.8, (e.body.end ? durationMin(e.body) : 6) / 1440 * 100)}%`}} /></span>
      <span className="mb-vals">{e.body.end ? <b className="mono">{hm(durationMin(e.body))}</b> : null}{titleOf(e.body, m.type) !== `${m.type?.name ?? ''} ${clock(e.body.at)}` ? titleOf(e.body, m.type) : ''}</span></button>
    {edit === e.id && <EntryEditor e={e} m={m} close={() => setEdit(null)} />}</li>)}{!list.length && <li className="muted small mb-none">–</li>}</ol>;
}
function perDay(m: M, b: LogicBlock, days: string[]) {
  const all = entries(m).filter(e => matches(e.body, b.conds));
  return days.map(d => ({d, v: aggregate(all.filter(e => e.logicalDay === d), b.agg, b.of, d) ?? 0}));
}
const range = (a: string, z: string) => { const out: string[] = []; for (let d = a; d <= z && out.length < 62; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.push(d); return out; };
function CalendarBlock({b, m}: {b: LogicBlock; m: M}) {
  const mon = m.ctx.day.slice(0, 7), first = `${mon}-01`, last = new Date(Date.UTC(Number(mon.slice(0, 4)), Number(mon.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const days = perDay(m, b, range(first, last)), max = Math.max(1, ...days.map(x => x.v)), lead = new Date(`${first}T12:00:00Z`).getUTCDay();
  return <div className="mb-cal" role="grid" aria-label={`${mon} 달력`}>
    {['일', '월', '화', '수', '목', '금', '토'].map(d => <span key={d} className="dow">{d}</span>)}
    {Array.from({length: lead}, (_, i) => <span key={`x${i}`} />)}
    {days.map(x => <span key={x.d} className={`mb-calday ${x.d === m.ctx.day ? 'sel' : ''}`} style={{'--q': x.v / max} as React.CSSProperties} title={`${x.d} ${x.v}`}>{Number(x.d.slice(8))}</span>)}
  </div>;
}
function ChartBlock({b, m}: {b: LogicBlock; m: M}) {
  const [a, z] = periodRange(['day', 'today', 'all'].includes(b.period) ? 'last7' : b.period, m.ctx.day, m.today);
  const days = perDay(m, b, range(a, z)), max = Math.max(b.target ?? 0, 1, ...days.map(x => x.v));
  return <div className="mb-chartbars" role="img" aria-label={days.map(x => `${x.d.slice(5)} ${x.v}`).join(', ')}>
    {days.map(x => <span key={x.d} className="mb-col"><i style={{height: `${x.v / max * 100}%`}} className={x.d === m.ctx.day ? 'sel' : ''} /><em>{days.length > 14 ? (Number(x.d.slice(8)) % 5 === 0 ? Number(x.d.slice(8)) : '') : ['일', '월', '화', '수', '목', '금', '토'][new Date(`${x.d}T12:00:00Z`).getUTCDay()]}</em></span>)}
    {b.target ? <b className="mb-target" style={{bottom: `${b.target / max * 100}%`}} /> : null}
  </div>;
}

// ── HTML design: the user's template over the widget's data; blocks still work inside it ─────────────
export function designData(m: M) {
  const all = entries(m), day = all.filter(e => e.logicalDay === m.ctx.day).sort((a, c) => a.body.at.localeCompare(c.body.at));
  const row = (e: E) => ({time: clock(e.body.at), end: e.body.end ? clock(e.body.end) : '', minutes: e.body.end ? Math.round(durationMin(e.body)) : '', duration: e.body.end ? hm(durationMin(e.body)) : '',
    value: e.body.value?.amount ?? '', unit: e.body.value?.unit ?? '', day: e.logicalDay ?? '', verb: e.body.verb,
    ...Object.fromEntries((m.type?.fields ?? []).map(f => [f.name, showValue(m, f, e.body.fields[f.id])]))});
  const blocks: Record<string, unknown> = {};
  for (const b of m.opts.blocks) {
    if (b.kind === 'stat') blocks[b.id] = statOf(m, b);
    else if (['list', 'table', 'gallery', 'timeline'].includes(b.kind)) blocks[b.id] = ofPeriod(m, b).slice(0, b.limit).map(row);
    else if (b.kind === 'toggle' || b.kind === 'stopwatch') { const open = all.find(isOpen); blocks[b.id] = {running: !!open, since: open ? clock(open.body.at) : '', label: open ? b.endLabel || '끝' : b.startLabel || '시작'}; }
    else if (b.kind === 'counter') blocks[b.id] = {count: day.reduce((s, e) => s + (e.body.value?.amount ?? 1), 0)};
    else if (b.kind === 'check') blocks[b.id] = {done: day.length > 0};
  }
  return {title: m.type?.name ?? '', desc: m.type?.desc ?? '', day: m.ctx.day, today: day.length, entries: day.map(row), last: day.length ? row(day.at(-1)!) : null, blocks};
}
const DROP = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'STYLE', 'FORM', 'FRAME', 'FRAMESET', 'NOSCRIPT', 'TEMPLATE']);
/** HTML a design may contain: no scripts, no event handlers, no outside addresses. */
export function sanitize(html: string) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (el: Element) => {
    for (const c of [...el.children]) {
      if (DROP.has(c.tagName)) { c.remove(); continue; }
      for (const a of [...c.attributes]) {
        const n = a.name.toLowerCase(), v = a.value.trim().toLowerCase();
        if (n.startsWith('on') || n === 'srcset' || n === 'formaction' || ((n === 'href' || n === 'src' || n === 'xlink:href' || n === 'action') && !(v.startsWith('#') || v.startsWith('data:image/')))) c.removeAttribute(a.name);
        else if (n === 'style') c.setAttribute('style', cleanCss(a.value));
      }
      walk(c);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
/** Every selector is put under this widget, so a design (or a pasted CSS kit) never styles the rest of lit. */
export function scopeCss(css: string, scope: string) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cleanCss(css));
    const out = (rules: CSSRuleList): string => [...rules].map(r => {
      if (r instanceof CSSStyleRule) return `${r.selectorText.split(',').map(s => { const t = s.trim(); return /^(:root|html|body)$/.test(t) ? scope : `${scope} ${t.replace(/^(:root|html|body)\s+/, '')}`; }).join(', ')}{${r.style.cssText}}`;
      if (r instanceof CSSMediaRule) return `@media ${r.conditionText}{${out(r.cssRules)}}`;
      if (r instanceof CSSSupportsRule) return `@supports ${r.conditionText}{${out(r.cssRules)}}`;
      if (r instanceof CSSKeyframesRule) return r.cssText;
      return '';
    }).join('\n');
    return out(sheet.cssRules);
  } catch { return ''; }
}
function HtmlDesign({m}: {m: M}) {
  const d = m.opts.design, box = useRef<HTMLDivElement>(null), roots = useRef(new Map<Element, Root>());
  const err = checkTemplate(d.html);
  const html = useMemo(() => { if (err) return ''; try { return sanitize(renderTemplate(d.html, designData(m), n => iconSvg(n))); } catch { return ''; } }, [d.html, m.ctx.p.records, m.ctx.day, err]); // eslint-disable-line react-hooks/exhaustive-deps
  const css = useMemo(() => scopeCss(d.css, `[data-made="${m.wid}"] .made-html`), [d.css, m.wid]);
  // <lit-block ref> slots get their own small React root (a portal into HTML that React itself sets would be wiped),
  // kept per element so a block's own state (a half-filled form) survives new data.
  const shown = useRef<string | null>(null);
  useLayoutEffect(() => {
    // lit sets the design's HTML itself, and only when it changed, so blocks mounted inside are never wiped.
    if (box.current && shown.current !== html) {
      for (const r of roots.current.values()) queueMicrotask(() => r.unmount());
      roots.current.clear();
      box.current.innerHTML = html; shown.current = html;
    }
    const live = new Set<Element>();
    for (const el of box.current?.querySelectorAll('lit-block[ref]') ?? []) {
      const b = m.opts.blocks.find(x => x.id === el.getAttribute('ref'));
      if (!b) continue;
      live.add(el);
      let r = roots.current.get(el);
      if (!r) { r = createRoot(el); roots.current.set(el, r); }
      r.render(createElement(BlockView, {b, m}));
    }
    for (const [el, r] of roots.current) if (!live.has(el)) { roots.current.delete(el); queueMicrotask(() => r.unmount()); }
  });
  useEffect(() => () => { const all = [...roots.current.values()]; roots.current.clear(); queueMicrotask(() => all.forEach(r => r.unmount())); }, []);
  if (err) return <p className="muted small">디자인: {err}</p>;
  return <>
    <style>{css}</style>
    <div ref={box} className="made-html" onClick={e => {
      const t = (e.target as Element).closest('[data-lit-press]'); if (!t) return;
      const b = m.opts.blocks.find(x => x.id === t.getAttribute('data-lit-press')); if (b) void press(m, b);
    }} />
  </>;
}
