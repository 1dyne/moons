import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {SIGNALS, Signal, evalSignal, signalText, type Launch, type LogicBlock} from '@workspace/planner-spec';
import {attachHost, buildSrcdoc} from '@workspace/lit-widget-sdk';
import {ofKind} from '../data.ts';
import {useBack} from '../back.ts';
import {Icon, iconSvg} from './icons.tsx';
import type {M} from './MadeWidget.tsx';

// Parts of the new editor that are more than a block: the 상황 picker, 열림 카드, stickers, effects and the developer console.

/** 상황 picker: one of lit's situations, with its number, time or goal. Stored on an item as JSON (a wish's condition). */
export function SignalPicker({value, onChange, m}: {value: string; onChange: (v: string) => void; m: M}) {
  const parsed = Signal.safeParse((() => { try { return JSON.parse(value); } catch { return null; } })());
  const cur = parsed.success ? parsed.data : null;
  const goals = ofKind(m.ctx.p.records, 'goal').filter(g => g.body.status === 'active').map(g => ({id: g.id, title: g.body.title}));
  const put = (s: Partial<Signal>) => onChange(JSON.stringify(Signal.parse({...(cur ?? {}), ...s})));
  const info = cur ? SIGNALS.find(x => x.kind === cur.kind) : null;
  return <div className="sig-pick">
    <div className="chips">{SIGNALS.filter(x => x.kind !== 'db').map(x => <button type="button" key={x.kind} className={`chip ${cur?.kind === x.kind ? 'on' : ''}`} aria-pressed={cur?.kind === x.kind}
      onClick={() => put({kind: x.kind, n: x.kind === 'focus' || x.kind === 'mission' ? 8 : x.kind === 'goal' ? 50 : x.kind.startsWith('energy') ? 7 : x.kind === 'tasksDone' ? 3 : 1, goalId: x.needs.includes('goal') ? goals[0]?.id ?? '' : ''})}>{x.name}</button>)}</div>
    {cur && info && <div className="inline wrap sig-args">
      {info.needs.includes('n') && <label className="inline"><input className="num" inputMode="decimal" value={cur.n} onChange={e => put({n: Number(e.target.value) || 0})} aria-label="기준" />{info.unit}</label>}
      {info.needs.includes('at') && <label className="inline"><input type="time" className="time-in" value={cur.at} onChange={e => e.target.value && put({at: e.target.value})} aria-label="시각" /> 전</label>}
      {info.needs.includes('goal') && <select value={cur.goalId} onChange={e => put({goalId: e.target.value})} aria-label="목표">{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}
      <span className="muted small">{signalText(cur, m.logic, goals)}</span>
    </div>}
  </div>;
}
export const signalOf = (v: unknown) => { if (typeof v !== 'string') return null; try { const p = Signal.safeParse(JSON.parse(v)); return p.success ? p.data : null; } catch { return null; } };

/** 열림 카드: each item with its 상황 and how far along it is; opened ones can be used. */
export function CardsBlock({b, m, entries, write, remove}: {b: LogicBlock; m: M; entries: import('@workspace/planner-spec').E[]; write: (id: string, fields: Record<string, unknown>) => void; remove: (id: string) => void}) {
  const t = m.type, stateF = t?.fields.find(f => f.id === b.stateField), sigF = t?.fields.find(f => f.id === b.field);
  const [locked, open, used] = stateF?.options ?? ['잠김', '열림', '사용함'];
  const goals = ofKind(m.ctx.p.records, 'goal').map(g => ({id: g.id, title: g.body.title}));
  const title = (e: (typeof entries)[number]) => String(t?.fields.filter(f => f.kind === 'text').map(f => e.body.fields[f.id]).find(Boolean) ?? '');
  const order = (e: (typeof entries)[number]) => { const s = stateF ? e.body.fields[stateF.id] : null; return s === open ? 0 : s === used ? 2 : 1; };
  const list = [...entries].sort((a, c) => order(a) - order(c) || c.body.at.localeCompare(a.body.at));
  if (!list.length) return <p className="muted small mb-none">–</p>;
  return <ul className="mb-wcards">{list.map(e => {
    const state = stateF ? String(e.body.fields[stateF.id] ?? locked) : '', sg = sigF ? signalOf(e.body.fields[sigF.id]) : null;
    const ev = sg ? evalSignal(sg, m.ctx.p.records, m.logic, m.ctx.day) : null, pct = ev?.target ? Math.min(100, Math.round((ev.value ?? 0) / ev.target * 100)) : ev?.met ? 100 : 0;
    const st = state === open ? 'open' : state === used ? 'used' : 'locked';
    return <li key={e.id} data-entry={e.id} className={`wcard st-${st}`}>
      <div className="wc-head"><span className="wc-ico" aria-hidden="true">{st === 'open' ? <Icon name="sparkles" size={18} /> : st === 'used' ? <Icon name="check" size={18} /> : <Icon name="lock" size={18} />}</span>
        <b>{title(e) || t?.name}</b>{stateF && <span className="wc-state">{state}</span>}</div>
      {sg && <span className="wc-cond">{signalText(sg, m.logic, goals)}{ev?.met && st === 'locked' ? ' · 달성' : ''}</span>}
      {sg && st === 'locked' && ev && <><span className="wc-bar"><i style={{width: `${pct}%`}} /></span><span className="wc-num mono">{ev.text}</span></>}
      <div className="inline wc-act">
        {st === 'open' && stateF && <button className="primary small" onClick={() => write(e.id, {[stateF.id]: used})}>사용하기</button>}
        {st === 'used' && stateF && <button className="ghost small" onClick={() => write(e.id, {[stateF.id]: locked})}>다시 잠그기</button>}
        <button className="ghost small danger" onClick={() => remove(e.id)} aria-label="지우기">지우기</button>
      </div>
    </li>;
  })}</ul>;
}

/** The widget as a sticker on the page: an icon cut out along its shape, an icon in a shape, or the user's picture.
 *  Tapping opens the widget as a popup, a sheet from below, or a full page. */
export function Sticker({launch, count, label, children}: {launch: Launch; count: number; label: string; children: React.ReactNode}) {
  const [open, setOpen] = useState(false);
  useBack(open, () => setOpen(false));
  const L = launch, cut = L.imageCut;
  const face = L.mode === 'image' && L.image
    ? <span className={`stk-img cut-${cut}`} style={{width: L.size, height: L.size, backgroundImage: `url("${L.image.replace(/"/g, '')}")`}} />
    : L.mode === 'shape'
      ? <span className={`stk-shape sh-${L.shape}`} style={{width: L.size, height: L.size, background: L.color}}><span dangerouslySetInnerHTML={{__html: iconSvg(L.icon, Math.round(L.size * .5))}} /></span>
      : <span className="stk-cut" style={{width: L.size, height: L.size, color: L.color}} dangerouslySetInnerHTML={{__html: cutSvg(L.icon, L.color)}} />;
  return <>
    <button className="sticker" style={{transform: `rotate(${L.rotate}deg)`}} onClick={() => setOpen(true)} aria-label={`${label} 열기`}>
      {face}{count > 0 && <span className="stk-badge">{count}</span>}{L.label && <span className="stk-label">{L.label}</span>}
    </button>
    {open && createPortal(<div className={`stk-wrap open-${L.open}`} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="stk-panel" role="dialog" aria-label={label}>
        <header className="stk-bar"><b>{label}</b><button className="ghost" onClick={() => setOpen(false)} aria-label="닫기">✕</button></header>
        <div className="stk-body">{children}</div>
      </div></div>, document.body)}
  </>;
}
/** A sticker cut along the icon: the icon filled, a thick white outline (the cut line) under its own outline. */
function cutSvg(name: string, color: string) {
  const svg = iconSvg(name, 24);
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg viewBox="-3 -3 30 30" width="100%" height="100%" aria-hidden="true"><g fill="${color}" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${inner}</g><g fill="${color}" stroke="#151515" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;
}

/** Plays a movement on cards (data-entry) or the widget when a rule asks for it ('lit:effect'). */
export function useEffectsOn(box: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{name: string; entry: string | null}>).detail, root = box.current;
      if (!root) return;
      const els = d.entry ? [...root.querySelectorAll<HTMLElement>(`[data-entry="${CSS.escape(d.entry)}"]`)] : [root];
      for (const el of els) { el.classList.remove(`fx-${d.name}`); void el.offsetWidth; el.classList.add(`fx-${d.name}`); setTimeout(() => el.classList.remove(`fx-${d.name}`), 1600); }
    };
    addEventListener('lit:effect', on); return () => removeEventListener('lit:effect', on);
  }, [box]);
}
export const playEffect = (name: string, entry: string | null) => dispatchEvent(new CustomEvent('lit:effect', {detail: {name, entry}}));

/** A part's own movement: always, when it appears, or when it is tapped. */
export function Animated({b, children}: {b: LogicBlock; children: React.ReactNode}) {
  const [tap, setTap] = useState(0);
  if (!b.anim) return <>{children}</>;
  const cls = b.animWhen === 'always' ? `fx-${b.anim} fx-loop` : b.animWhen === 'appear' ? `fx-${b.anim}` : tap ? `fx-${b.anim}` : '';
  return <div key={tap} className={`fx-wrap ${cls}`} onClickCapture={b.animWhen === 'tap' ? () => setTap(n => n + 1) : undefined}>{children}</div>;
}

/** 개발자 콘솔: the widget drawn by the developer's own HTML, CSS and JavaScript in a sandboxed frame.
 *  It reaches lit only through window.lit.made: data(), press(partId), add(fields by name), update(id, fields), on('change'). */
export function CodeDesign({m, data, press, add, update}: {m: M; data: () => unknown; press: (id: string) => void; add: (f: Record<string, unknown>) => Promise<unknown>; update: (id: string, f: Record<string, unknown>) => Promise<unknown>}) {
  const frame = useRef<HTMLIFrameElement>(null), [h, setH] = useState(120), host = useRef<ReturnType<typeof attachHost> | null>(null);
  const d = m.opts.design;
  const theme = {bg: '#ffffff', surface: '#ffffff', ink: '#151515', muted: '#6b6a63', accent: d.accent || '#3a66b8', font: 'system-ui, sans-serif', radius: d.radius ?? 10, dark: false};
  const src = buildSrcdoc({html: d.html, css: d.css, code: `${MADE_CLIENT}\n${d.js}`}, theme);
  useEffect(() => {
    if (!frame.current) return;
    host.current = attachHost(frame.current, {permissions: [], onResize: setH, handlers: {
      'made.data': () => data(), 'made.press': (p: Record<string, unknown>) => { press(String(p.part ?? '')); return true; },
      'made.add': (p: Record<string, unknown>) => add((p.fields ?? {}) as Record<string, unknown>).then(() => true), 'made.update': (p: Record<string, unknown>) => update(String(p.id ?? ''), (p.fields ?? {}) as Record<string, unknown>).then(() => true),
    } as never});
    return () => host.current?.dispose();
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { host.current?.push('change', data()); }, [m.ctx.p.records]); // eslint-disable-line react-hooks/exhaustive-deps
  return <iframe ref={frame} className="made-code" title="개발자 콘솔 위젯" sandbox="allow-scripts allow-forms" srcDoc={src} style={{height: h}} />;
}
const MADE_CLIENT = `window.lit.made={data:function(){return new Promise(function(res,rej){var id=Math.random();var f=function(e){var d=e.data;if(d&&d.lit===1&&d.id===id){removeEventListener('message',f);d.error?rej(new Error(d.error)):res(d.result)}};addEventListener('message',f);parent.postMessage({lit:1,id:id,method:'made.data',params:{}},'*')})},
press:function(p){parent.postMessage({lit:1,id:Math.random(),method:'made.press',params:{part:p}},'*')},
add:function(f){parent.postMessage({lit:1,id:Math.random(),method:'made.add',params:{fields:f||{}}},'*')},
update:function(id,f){parent.postMessage({lit:1,id:Math.random(),method:'made.update',params:{id:id,fields:f||{}}},'*')}};`;
