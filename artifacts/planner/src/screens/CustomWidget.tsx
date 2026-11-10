import {useEffect, useMemo, useRef, useState} from 'react';
import {dayCondition, goalPercent, shareable, type AnyRecord, type LifeRecord, type Note} from '@workspace/life-contract';
import {PERMISSIONS, colKey, codeHash, isCode, type Block, type Column, type LibraryItem, type PropDef, type Widget, type WidgetManifest} from '@workspace/planner-spec';
import {attachHost, buildSrcdoc, PROTOCOL_VERSION, type Cell, type Row, type Theme} from '@workspace/lit-widget-sdk';
import {ofKind} from '../data.ts';
import {useLibrary} from '../library.tsx';
import {Gauge} from '../Gauge.tsx';
import {PropInput} from './Table.tsx';
import type {Ctx} from './day.ts';

// A widget from 내 라이브러리 placed on a page (widget.options.ref = library id).
// Blocks render natively; code runs in a sandboxed frame and reaches lit only through the widget API.
const toDef = (c: Column): PropDef => ({id: colKey(c), name: c.name, type: c.type, options: c.options});
const chains = new Map<string, Promise<LifeRecord<'note'> | null>>();

function useRows(ctx: Ctx, w: Widget, m: WidgetManifest) {
  const rows = ofKind(ctx.p.records, 'note').filter(n => n.body.signifier === 'row' && n.body.table === w.id && (m.data.scope === 'all' || n.logicalDay === ctx.day))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const add = (cells: Record<string, Cell>, name = '') => ctx.p.write(null, {kind: 'note', logicalDay: ctx.day, body: {text: name.slice(0, 5000), signifier: 'row', table: w.id, cells}}) as Promise<LifeRecord<'note'> | null>;
  // Writes to one row go one after another, each on the last saved revision.
  const update = (r: LifeRecord<'note'>, body: Partial<Note>) => {
    const next = (chains.get(r.id) ?? Promise.resolve(r)).then(cur => { const base = cur && cur.revision >= r.revision ? cur : r; return ctx.p.write(r.id, {kind: 'note', logicalDay: base.logicalDay, body: {...base.body, ...body}, baseRevision: base.revision}) as Promise<LifeRecord<'note'> | null>; });
    chains.set(r.id, next.then(x => x ?? r)); return next;
  };
  return {rows, add, update, remove: (r: LifeRecord<'note'>) => ctx.p.remove(r.id)};
}
const rowView = (r: LifeRecord<'note'>): Row => ({id: r.id, day: r.logicalDay, name: r.body.text, cells: r.body.cells, createdAt: r.createdAt});

export function CustomWidget({w, ctx}: {w: Widget; ctx: Ctx}) {
  const lib = useLibrary();
  const ref = String(w.options.ref ?? '');
  const item = lib?.items.find(x => x.id === ref && x.kind === 'custom') as LibraryItem<'custom'> | undefined;
  if (!lib) return <p className="muted small">내 위젯은 내 플래너에서 보여요.</p>;
  if (!item) return <p className="muted small">{lib.ready ? '라이브러리에 없는 위젯이에요. 메뉴 → 내 라이브러리에서 확인해요.' : ''}</p>;
  const m = item.data.manifest;
  if (!item.enabled) return <p className="muted small">꺼 둔 위젯이에요. 메뉴 → 설치한 위젯에서 켜요.</p>;
  if (isCode(m) && item.approved !== codeHash(m)) return <Consent item={item} />;
  return <div className="cw">{m.view.map((b, i) => <BlockView key={i} b={b} m={m} w={w} ctx={ctx} />)}{isCode(m) && <CodeFrame m={m} w={w} ctx={ctx} />}</div>;
}

/** Code runs only after the user sees what it asks for (Obsidian-style gate, per code version). */
export function Consent({item}: {item: LibraryItem<'custom'>}) {
  const lib = useLibrary(), m = item.data.manifest;
  const [busy, setBusy] = useState(false);
  return <div className="cw-consent">
    <strong>{m.name}</strong> <span className="muted small">{m.version}{m.author ? ` · ${m.author}` : ''} · {item.source === 'claude' ? 'Claude가 만든 위젯' : item.source === 'developer' ? '개발자 도구로 올린 위젯' : '직접 넣은 위젯'}</span>
    <p className="small">이 위젯은 코드로 움직여요. 인터넷에는 접속할 수 없고, 아래 권한만 써요.</p>
    <ul className="small">{m.permissions.length ? m.permissions.map(p => <li key={p}>{PERMISSIONS.find(x => x.id === p)?.name ?? p}</li>) : <li>권한 없음 (화면만 그려요)</li>}</ul>
    <button className="primary small" disabled={busy} onClick={async () => { setBusy(true); try { await lib?.patch(item.id, {approve: true, enabled: true}); } finally { setBusy(false); } }}>승인하고 켜기</button>
  </div>;
}

const aggregate = (vals: number[], how: string) => !vals.length ? null : how === 'count' ? vals.length : how === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : how === 'last' ? vals.at(-1)! : how === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0);
const nums = (rows: LifeRecord<'note'>[], key: string) => rows.map(r => r.body.cells[key]).filter((v): v is number => typeof v === 'number');
const fmt = (n: number | null) => n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1);

function BlockView({b, m, w, ctx}: {b: Block; m: WidgetManifest; w: Widget; ctx: Ctx}) {
  const {rows, add, update, remove} = useRows(ctx, w, m);
  const cols = m.data.columns, find = (k: string) => cols.find(c => colKey(c) === k || c.name === k);
  switch (b.block) {
    case 'text': return <p className="cw-text">{b.text}</p>;
    case 'stat': { const c = find(b.value), v = c ? aggregate(nums(rows, colKey(c)), b.agg) : null; return <p className="cw-stat"><span className="k">{b.label ?? c?.name ?? b.value}</span><strong>{fmt(v)}</strong>{b.unit && <em>{b.unit}</em>}</p>; }
    case 'gauge': { const c = find(b.value), v = c ? aggregate(nums(rows, colKey(c)), b.agg) : null; return <div className="cw-gauge"><span className="k">{b.label ?? c?.name ?? b.value} · {fmt(v)}/{b.target}</span><Gauge pct={v === null ? null : v / b.target * 100} size="md" /></div>; }
    case 'chart': return <Chart rows={rows.slice(-b.last)} x={find(b.x)} y={find(b.y)} kind={b.kind} />;
    case 'list': { const t = find(b.title), c = b.check ? find(b.check) : undefined; if (!t) return null;
      return <ul className="cw-list">{rows.map(r => <li key={r.id}>{c && <input type="checkbox" checked={r.body.cells[colKey(c)] === true} onChange={e => void update(r, {cells: {...r.body.cells, [colKey(c)]: e.target.checked}})} aria-label={String(r.body.cells[colKey(t)] ?? '')} />}
        <span className={c && r.body.cells[colKey(c)] === true ? 'done' : ''}>{String(r.body.cells[colKey(t)] ?? r.body.text ?? '')}</span></li>)}</ul>; }
    case 'form': return <Form cols={(b.fields?.length ? b.fields.map(find).filter((c): c is Column => !!c) : cols)} button={b.button} onAdd={cells => void add(cells)} />;
    case 'table': return <div className="dbt"><div className="dbt-scroll"><table>
      <thead><tr>{cols.map(c => <th key={colKey(c)}><span className="th">{c.name}</span></th>)}<th aria-label="지우기" /></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}>{cols.map(c => <td key={colKey(c)}><PropInput def={toDef(c)} value={r.body.cells[colKey(c)]} compact onChange={v => void update(r, {cells: {...r.body.cells, [colKey(c)]: v}})} /></td>)}
        <td><button className="ghost small" onClick={() => remove(r)} aria-label="줄 지우기">×</button></td></tr>)}</tbody></table></div>
      <button className="small dbt-new" onClick={() => void add({})}>+ 새 줄</button></div>;
    default: return null;
  }
}

function Form({cols, button, onAdd}: {cols: Column[]; button?: string; onAdd: (cells: Record<string, Cell>) => void}) {
  const [v, setV] = useState<Record<string, Cell>>({}), [n, setN] = useState(0);
  return <form className="cw-form" key={n} onSubmit={e => { e.preventDefault(); if (!Object.values(v).some(x => x !== null && x !== '')) return; onAdd(v); setV({}); setN(n + 1); }}>
    {cols.map(c => <label key={colKey(c)}><span className="k">{c.name}</span>
      {c.type === 'select' ? <select value={String(v[colKey(c)] ?? '')} onChange={e => setV({...v, [colKey(c)]: e.target.value || null})}><option value="" />{c.options.map(o => <option key={o}>{o}</option>)}</select>
        : c.type === 'check' ? <input type="checkbox" checked={v[colKey(c)] === true} onChange={e => setV({...v, [colKey(c)]: e.target.checked})} />
        : <input type={c.type === 'date' ? 'date' : 'text'} inputMode={c.type === 'number' ? 'decimal' : undefined} onChange={e => { const t = e.target.value.trim(); setV({...v, [colKey(c)]: c.type === 'number' ? (t === '' || Number.isNaN(Number(t)) ? null : Number(t)) : t || null}); }} />}
    </label>)}
    <button className="primary small">{button ?? '추가'}</button>
  </form>;
}

function Chart({rows, x, y, kind}: {rows: LifeRecord<'note'>[]; x?: Column; y?: Column; kind: 'bar' | 'line'}) {
  if (!x || !y) return <p className="muted small">그래프 열 이름을 확인해요.</p>;
  const pts = rows.map(r => ({label: String(r.body.cells[colKey(x)] ?? r.body.text ?? ''), v: typeof r.body.cells[colKey(y)] === 'number' ? r.body.cells[colKey(y)] as number : null})).filter(p => p.v !== null) as {label: string; v: number}[];
  if (!pts.length) return <p className="muted small">아직 숫자가 없어요.</p>;
  const W = 300, H = 120, pad = 18, max = Math.max(...pts.map(p => p.v), 1), step = (W - pad * 2) / pts.length;
  const yy = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return <svg className="cw-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${y.name} 그래프`}>
    <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="axis" />
    {kind === 'bar' ? pts.map((p, i) => <rect key={i} x={pad + i * step + step * .15} y={yy(p.v)} width={step * .7} height={H - pad - yy(p.v)} className={i === pts.length - 1 ? 'cw-last' : 'cw-bar'} />)
      : <polyline fill="none" className="line" points={pts.map((p, i) => `${pad + i * step + step / 2},${yy(p.v)}`).join(' ')} />}
    {pts.map((p, i) => <text key={i} x={pad + i * step + step / 2} y={H - 4} textAnchor="middle" className="lbl">{p.label.slice(0, 6)}</text>)}
    <text x={pad} y={10} className="lbl">{fmt(max)}</text>
  </svg>;
}

function themeOf(el: Element | null): Theme {
  const cs = getComputedStyle(el ?? document.documentElement), v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  const bg = v('--bg', '#e6e6e1');
  return {bg, surface: v('--surface', '#f5f5f1'), ink: v('--ink', '#151515'), muted: v('--muted', '#5d5d57'), accent: v('--accent', '#f2c230'),
    font: cs.fontFamily || 'system-ui, sans-serif', radius: parseInt(v('--radius', '0'), 10) || 0, dark: /night|dark/.test((el as HTMLElement | null)?.className ?? '')};
}

function CodeFrame({m, w, ctx}: {m: WidgetManifest; w: Widget; ctx: Ctx}) {
  const frame = useRef<HTMLIFrameElement>(null), [height, setHeight] = useState(80);
  const live = useRef({ctx, m, w}); live.current = {ctx, m, w};
  const theme = useMemo(() => themeOf(document.querySelector('.app') ?? document.querySelector('.ed-canvas')), []);
  const srcdoc = useMemo(() => buildSrcdoc(m, theme), [m.code, m.html, m.css, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const host = useRef<ReturnType<typeof attachHost> | null>(null);
  useEffect(() => {
    if (!frame.current) return;
    const rec = () => live.current.ctx.p.records;
    const rows = () => ofKind(rec(), 'note').filter(n => n.body.signifier === 'row' && n.body.table === live.current.w.id && (live.current.m.data.scope === 'all' || n.logicalDay === live.current.ctx.day));
    const mine = (id: unknown) => { const r = rows().find(x => x.id === id); if (!r) throw new Error('이 위젯의 줄이 아니에요.'); return r; };
    const cells = (v: unknown) => { const o: Record<string, Cell> = {}; for (const [k, x] of Object.entries(v && typeof v === 'object' ? v : {}).slice(0, 30)) if (x === null || ['string', 'number', 'boolean'].includes(typeof x)) o[k.slice(0, 30)] = typeof x === 'string' ? x.slice(0, 500) : x as Cell; return o; };
    const shared = (r: AnyRecord, scopes: Parameters<typeof shareable>[1]) => shareable(r, scopes);
    host.current = attachHost(frame.current, {permissions: m.permissions, onResize: h => setHeight(Math.max(24, h)), handlers: {
      context: () => ({day: live.current.ctx.day, today: live.current.ctx.day, widgetId: live.current.m.id, instanceId: live.current.w.id, theme, permissions: live.current.m.permissions, protocol: PROTOCOL_VERSION}),
      'table.rows': () => rows().map(rowView),
      'table.add': async p => { const r = await live.current.ctx.p.write(null, {kind: 'note', logicalDay: live.current.ctx.day, body: {text: String(p.name ?? '').slice(0, 5000), signifier: 'row', table: live.current.w.id, cells: cells(p.cells)}}); if (!r) throw new Error(live.current.ctx.p.error || '저장하지 못했어요.'); return rowView(r as LifeRecord<'note'>); },
      'table.update': async p => { const r = mine(p.id); const out = await live.current.ctx.p.write(r.id, {kind: 'note', logicalDay: r.logicalDay, body: {...r.body, cells: {...r.body.cells, ...cells(p.cells)}, ...(typeof p.name === 'string' ? {text: p.name} : {})}, baseRevision: r.revision}); if (!out) throw new Error(live.current.ctx.p.error || '저장하지 못했어요.'); return rowView(out as LifeRecord<'note'>); },
      'table.remove': async p => { const r = mine(p.id); await live.current.ctx.p.remove(r.id); return {removed: r.id}; },
      'tasks.today': () => ofKind(rec(), 'task').filter(t => t.logicalDay === live.current.ctx.day).map(t => shared(t, ['life.read.plan', 'life.read.outcome']) as LifeRecord<'task'> | null).filter(Boolean)
        .map(t => ({id: t!.id, title: t!.body.title, result: t!.body.outcome?.result ?? 'unknown', goalIds: t!.body.goalIds, estimateMin: t!.body.plan.estimateMin, props: t!.body.props ?? {}})),
      'goals.list': () => ofKind(rec(), 'goal').filter(g => g.body.status === 'active').map(g => ({id: g.id, title: g.body.title, horizon: g.body.horizon, period: g.body.period, percent: goalPercent(g.id, rec()).pct, parentId: g.body.parentGoalId, deadline: g.body.deadline ?? null})),
      'condition.today': () => { const night = ofKind(rec(), 'sleep').find(s => s.logicalDay === live.current.ctx.day && s.body.start && s.body.end);
        return {day: live.current.ctx.day, score: dayCondition(rec(), live.current.ctx.day).score, sleepMinutes: night ? Math.round((Date.parse(night.body.end!) - Date.parse(night.body.start!)) / 60000) : null}; },
    }});
    return () => { host.current?.dispose(); host.current = null; };
  }, [srcdoc, m.permissions.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tell the widget when records change (it re-reads what it needs).
  useEffect(() => { const t = setTimeout(() => host.current?.push('change'), 150); return () => clearTimeout(t); }, [ctx.p.records, ctx.day]);
  return <iframe ref={frame} className="cw-frame" title={m.name} sandbox="allow-scripts allow-forms" srcDoc={srcdoc} style={{height}} />;
}
