import {useEffect, useMemo, useState, type DragEvent} from 'react';
import {addDays, v2} from '@workspace/life-contract';
import {aggregate, evalSignal, itemDay, matchesAll, nest, parseCapture, periodRange, query, title, value, type Ctx, type Item, type Workspace} from '@workspace/lit-core';
import {useLit} from './store.tsx';
import {checkGlyph, newItemBody, nextDone, propsForItem, roleProp} from './model.ts';
import {ItemSheet} from './Item.tsx';
import {clock, fmt, nameOf, optionColor, ValueInput} from './ui.tsx';

// Parts (부품): each one reads or writes items through the shared engine. A part knows databases and properties
// only by id and roles by meaning; the user decided everything else.

export type PartProps = {part: v2.Part; day: string; setDay: (d: string) => void};
export const ctxFor = (ctx: Ctx, day: string): Ctx => ({...ctx, day});

/** The items a view shows on a day: source → period → chips → sort → limit. */
export function viewItems(ws: Workspace, view: v2.View, ctx: Ctx, day: string, chips: Record<string, string | null> = {}) {
  const c = ctxFor(ctx, day);
  let items = query(ws, view, c);
  if (view.period === 'day') items = items.filter(x => itemDay(ws, x) === day);
  else if (view.period) { const [from, to] = periodRange(view.period, day); items = items.filter(x => { const d = itemDay(ws, x); return d >= from && d <= to; }); }
  for (const [pid, want] of Object.entries(chips)) {
    if (want === null) continue;
    if (pid === '__db') { items = items.filter(x => x.body.dbs.includes(want)); continue; }
    items = items.filter(x => { const v = value(ws, x, pid); return Array.isArray(v) ? v.includes(want) : String(v) === want || (want === 'true' && v === true); });
  }
  if (view.sort.length) items = [...items].sort((a, b) => {
    for (const s of view.sort) { const x = value(ws, a, s.prop), y = value(ws, b, s.prop); if (x === y) continue; const d = x === null ? 1 : y === null ? -1 : x < y ? -1 : 1; return s.dir === 'asc' ? d : -d; }
    return 0;
  });
  return items.slice(0, view.limit);
}
export function looks(ws: Workspace, view: v2.View, item: Item, ctx: Ctx) {
  const out: string[] = []; let color = '';
  for (const s of view.styles) if (matchesAll(ws, item, s.when, ctx)) { out.push(`look-${s.look}`); if (s.look === 'color') color = s.color; }
  return {cls: out.join(' '), color};
}

export function PartView(props: PartProps) {
  switch (props.part.kind) {
    case 'capture': return <Capture {...props} />;
    case 'checklist': case 'list': return <Lines {...props} check={props.part.kind === 'checklist'} />;
    case 'table': return <Table {...props} />;
    case 'gallery': case 'cards': return <Gallery {...props} />;
    case 'calendar': return <Calendar {...props} />;
    case 'timegrid': return <TimeGrid {...props} />;
    case 'metric': return <Metric {...props} />;
    case 'chart': return <Chart {...props} />;
    case 'breakdown': return <Breakdown {...props} />;
    case 'form': return <Form {...props} />;
    case 'timestamp': return <Stamp {...props} />;
    case 'timer': return <Timer {...props} />;
    case 'rating': return <Rating {...props} />;
    case 'counter': return <Counter {...props} />;
    case 'heading': return <p className={`part-heading ${props.part.text.length < 30 ? 'big' : ''}`}>{props.part.text || props.part.label}</p>;
  }
}

function Chips({view, chips, setChips}: {view: v2.View; chips: Record<string, string | null>; setChips: (c: Record<string, string | null>) => void}) {
  const {ws} = useLit();
  if (!view.chips.length) return null;
  return <div className="filter-chips" role="group" aria-label="필터">{view.chips.map(pid => {
    const p = ws.properties.get(pid), db = ws.databases.get(pid);
    const opts: [string, string, string][] = db ? [[db.id, db.body.name, '']] : p?.body.kind === 'checkbox' ? [['true', p.body.name, '']] : (p?.body.options ?? []).map(o => [o.id, o.name, o.color]);
    const key = db ? '__db' : pid;
    return opts.map(([v, n, c]) => <button key={pid + v} className={`chip c-${c} ${chips[key] === v ? 'on' : ''}`} aria-pressed={chips[key] === v} onClick={() => setChips({...chips, [key]: chips[key] === v ? null : v})}>{n}</button>);
  })}</div>;
}

// ── Lines: the checklist (할 일처럼) and the plain list ──────────────────────────────────────────────
function Lines({part, day, check}: PartProps & {check: boolean}) {
  const {ws, ctx, save, setValues, flash, open, runEffects} = useLit();
  const [chips, setChips] = useState<Record<string, string | null>>({}), [opened, setOpened] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null);
  const [text, setText] = useState(''), [drag, setDrag] = useState<string | null>(null), [folded, setFolded] = useState<Set<string>>(new Set());
  const v = part.view, c = ctxFor(ctx, day);
  const items = viewItems(ws, v, ctx, day, chips);
  const group = v.group ? ws.properties.get(v.group) : undefined;
  const sections: [string, Item[]][] = group ? [...group.body.options.map(o => [o.name, items.filter(x => x.body.values[group.id] === o.id || (Array.isArray(x.body.values[group.id]) && (x.body.values[group.id] as string[]).includes(o.id)))] as [string, Item[]]), ['', items.filter(x => !x.body.values[group.id])] as [string, Item[]]].filter(([, l]) => l.length) : [['', items]];
  const ordered = (l: Item[]) => [...l].sort((a, b) => { const la = looks(ws, v, a, c).cls.includes('look-bottom') ? 1 : 0, lb = looks(ws, v, b, c).cls.includes('look-bottom') ? 1 : 0; return la - lb; });
  const add = async () => {
    const t = text.trim(); if (!t) return;
    setText('');
    const dbs = v.dbs.length ? v.dbs : v.lens ? ws.lenses.get(v.lens)?.body.dbs ?? [] : [];
    await save('item', newItemBody(ws, dbs, t, v.period === 'day' || v.period === '' ? day : null));
  };
  const drop = (e: DragEvent, target: Item, list: Item[]) => {
    e.preventDefault();
    if (!drag || drag === target.id) return;
    const ids = list.map(x => x.id).filter(x => x !== drag), at = ids.indexOf(target.id);
    ids.splice(at, 0, drag);
    ids.forEach((id, i) => { const it = ws.items.get(id); if (it && it.body.order !== i * 10) void save('item', {...it.body, order: i * 10}, id); });
    setDrag(null);
  };
  const start = (it: Item) => roleProp(ws, 'start', it.body.dbs), end = (it: Item) => roleProp(ws, 'end', it.body.dbs);
  return <div className="lines">
    <Chips view={v} chips={chips} setChips={setChips} />
    {sections.map(([name, list]) => <div key={name} className="section">
      {name && <h4 className="section-h">{name}</h4>}
      <ul>{(() => { const rows = v.nest ? nest(ws, ordered(list), v.nest) : ordered(list).map(item => ({item, depth: 0})); let hideBelow = Infinity;
        return rows.map(({item: it, depth}, i) => {
        if (depth > hideBelow) return null;
        hideBelow = folded.has(it.id) ? depth : Infinity;
        const hasKids = (rows[i + 1]?.depth ?? -1) > depth;
        const lk = looks(ws, v, it, c); if (lk.cls.includes('look-hidden')) return null;
        const s = start(it), en = end(it), running = s && it.body.values[s.id] && en && !it.body.values[en.id];
        const moves = open(it);
        return <li key={it.id} className={`line ${depth ? 'sub' : ''} ${lk.cls} ${flash[it.id] ? `fx-${flash[it.id]}` : ''}`} style={{...(lk.color ? {'--look': `var(--c-${lk.color})`} : {}), paddingLeft: depth * 20} as React.CSSProperties}
          draggable onDragStart={() => setDrag(it.id)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, it, list)}>
          {v.nest && <button className="fold" aria-label={folded.has(it.id) ? '하위 펼치기' : '하위 접기'} style={{visibility: hasKids ? 'visible' : 'hidden'}} onClick={() => setFolded(f => { const n = new Set(f); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}>{folded.has(it.id) ? '▸' : '▾'}</button>}
          {check && <button className="check" aria-label="달성 단계 바꾸기" onClick={() => { const n = nextDone(ws, it); if (n) void setValues(it, n); }}>{checkGlyph(ws, it) || '○'}</button>}
          <button className="line-title" onClick={() => setOpened(it.id)}>{title(ws, it) || <span className="muted">(이름 없음)</span>}</button>
          <span className="line-props">{v.show.map(pid => { const p = ws.properties.get(pid), val = value(ws, it, pid), t = fmt(ws, p, val); return t ? <span key={pid} className={`pv c-${optionColor(p, val)}`}>{t}</span> : null; })}</span>
          {s && en && <button className={`stamp ${running ? 'on' : ''}`} aria-label={running ? '끝' : '시작'} onClick={() => void setValues(it, running ? {[en.id]: new Date().toISOString()} : {[s.id]: new Date().toISOString(), [en.id]: null})}>{running ? '■' : '▶'}</button>}
          {moves.length > 0 && <button className="go" aria-label="이어서 열기" onClick={() => runEffects(moves)}>→</button>}
          <button className="more" aria-label="더 보기" onClick={() => setMenu(menu === it.id ? null : it.id)}>⋯</button>
          {menu === it.id && <LineMenu item={it} edit={v.edit} day={day} nestProp={v.nest} close={() => setMenu(null)} />}
        </li>;
      }); })()}</ul>
    </div>)}
    {!items.length && <p className="muted small empty">비어 있어요</p>}
    <form className="add-line" onSubmit={e => { e.preventDefault(); void add(); }}><input value={text} onChange={e => setText(e.target.value)} placeholder="+ 추가" aria-label="새 항목" /></form>
    {opened && <ItemSheet id={opened} onClose={() => setOpened(null)} />}
  </div>;
}
function LineMenu({item, edit, day, nestProp, close}: {item: Item; edit: string[]; day: string; nestProp?: string | null; close: () => void}) {
  const {ws, setValues, save, remove} = useLit(), [child, setChild] = useState('');
  const d = roleProp(ws, 'day', item.body.dbs);
  return <div className="line-menu">
    {nestProp && <form className="row" onSubmit={async e => { e.preventDefault(); const t = child.trim(); if (!t) return; setChild('');
      // A sub-item starts on its parent's day; after that each moves and is checked on its own.
      await save('item', newItemBody(ws, item.body.dbs, t, itemDay(ws, item) || day, {[nestProp]: [item.id]})); }}>
      <input value={child} onChange={e => setChild(e.target.value)} placeholder="+ 하위 항목" aria-label="하위 항목 추가" autoFocus /><button className="small" type="submit">추가</button></form>}
    {edit.map(pid => ws.properties.get(pid)).filter(p => p && p.body.kind !== 'formula').map(p => <label key={p!.id}><span className="k">{p!.body.name}</span><ValueInput p={p!} item={item} value={item.body.values[p!.id] ?? null} onChange={val => setValues(item, {[p!.id]: val})} /></label>)}
    <div className="row wrap">
      {d && <button className="small" onClick={() => { void setValues(item, {[d.id]: addDays(itemDay(ws, item) || day, 1)}); close(); }}>내일로</button>}
      {d && <input type="date" aria-label="날짜 옮기기" value={itemDay(ws, item)} onChange={e => { if (e.target.value) void setValues(item, {[d.id]: e.target.value}); }} />}
      <button className="small" onClick={() => { void save('item', {...item.body, archived: true}, item.id); close(); }}>보관</button>
      <button className="small danger" onClick={() => { void remove(item.id); close(); }}>지우기</button>
      <button className="small ghost" onClick={close}>닫기</button>
    </div>
  </div>;
}

function Table({part, day}: PartProps) {
  const {ws, ctx, setValues, save} = useLit(), [chips, setChips] = useState<Record<string, string | null>>({}), [opened, setOpened] = useState<string | null>(null);
  const items = viewItems(ws, part.view, ctx, day, chips);
  const cols = part.view.show.length ? part.view.show : [...new Set(part.view.dbs.flatMap(d => ws.databases.get(d)?.body.properties ?? []))];
  return <div className="table-wrap">
    <Chips view={part.view} chips={chips} setChips={setChips} />
    <table className="grid"><thead><tr><th>이름</th>{cols.map(c => <th key={c}>{nameOf(ws, c)}</th>)}</tr></thead>
      <tbody>{items.map(it => <tr key={it.id} className={looks(ws, part.view, it, ctxFor(ctx, day)).cls}>
        <td><button className="link" onClick={() => setOpened(it.id)}>{title(ws, it) || '(이름 없음)'}</button></td>
        {cols.map(cid => { const p = ws.properties.get(cid); return <td key={cid}>{p && p.body.kind !== 'formula' && part.view.edit.includes(cid) ? <ValueInput p={p} item={it} value={it.body.values[cid] ?? null} onChange={v => setValues(it, {[cid]: v})} /> : fmt(ws, p, value(ws, it, cid))}</td>; })}
      </tr>)}</tbody></table>
    <button className="small" onClick={() => void save('item', newItemBody(ws, part.view.dbs, '', part.view.period === 'day' ? day : null))}>+ 줄</button>
    {opened && <ItemSheet id={opened} onClose={() => setOpened(null)} />}
  </div>;
}

function Gallery({part, day}: PartProps) {
  const {ws, ctx, flash, setValues} = useLit(), [opened, setOpened] = useState<string | null>(null);
  const items = viewItems(ws, part.view, ctx, day);
  return <div className="gallery">{items.map(it => {
    const sigId = part.kind === 'cards' && part.signal ? it.body.values[part.signal] : null;
    const sig = typeof sigId === 'string' ? evalSignal(ws, sigId, ctx) : null;
    const lk = looks(ws, part.view, it, ctxFor(ctx, day));
    return <div key={it.id} className={`card ${lk.cls} ${sig?.met ? 'met' : sig ? 'locked' : ''} ${flash[it.id] ? `fx-${flash[it.id]}` : ''}`}>
      <button className="card-title" onClick={() => setOpened(it.id)}>{sig ? (sig.met ? '🔓 ' : '🔒 ') : ''}{title(ws, it) || '(이름 없음)'}</button>
      {sig && <><div className="bar"><i style={{width: `${typeof sig.value === 'number' && typeof sig.target === 'number' && sig.target ? Math.min(100, sig.value / sig.target * 100) : sig.met ? 100 : 0}%`}} /></div><span className="small muted">{typeof sigId === 'string' ? ws.signals.get(sigId)?.body.name : ''} {sig.value ?? ''}{sig.target !== null ? ` / ${sig.target}` : ''}</span></>}
      {part.view.show.map(pid => { const p = ws.properties.get(pid), t = fmt(ws, p, value(ws, it, pid)); return t ? <span key={pid} className="pv">{p?.body.name} {t}</span> : null; })}
      {part.kind === 'cards' && sig?.met && (() => { const n = nextDone(ws, it); return n ? <button className="small" onClick={() => void setValues(it, n)}>{checkGlyph(ws, it)} 사용</button> : null; })()}
    </div>;
  })}{!items.length && <p className="muted small">비어 있어요</p>}{opened && <ItemSheet id={opened} onClose={() => setOpened(null)} />}</div>;
}

function Calendar({part, day, setDay}: PartProps) {
  const {ws, ctx} = useLit();
  const month = day.slice(0, 7), first = new Date(`${month}-01T00:00:00Z`), lead = first.getUTCDay();
  const days = Array.from({length: 42}, (_, i) => addDays(`${month}-01`, i - lead));
  const all = query(ws, part.view, ctxFor(ctx, day));
  const byDay = new Map<string, Item[]>(); for (const it of all) { const d = itemDay(ws, it); byDay.set(d, [...(byDay.get(d) ?? []), it]); }
  const max = Math.max(1, ...[...byDay.values()].map(l => l.length));
  return <div className="calendar">
    <div className="cal-head"><button className="ghost small" onClick={() => setDay(addDays(`${month}-01`, -1))}>‹</button><b>{month.replace('-', '. ')}</b><button className="ghost small" onClick={() => setDay(addDays(`${month}-01`, 32).slice(0, 8) + '01')}>›</button></div>
    <div className="cal-grid">{['일', '월', '화', '수', '목', '금', '토'].map(d => <span key={d} className="cal-dow">{d}</span>)}
      {days.map(d => { const l = byDay.get(d) ?? [], r = aggregate(ws, l, 'doneRatio', null); return <button key={d} className={`cal-day ${d.slice(0, 7) !== month ? 'out' : ''} ${d === day ? 'sel' : ''} ${d === ctx.today ? 'today' : ''}`} onClick={() => setDay(d)} style={{'--fill': l.length / max} as React.CSSProperties} title={`${l.length}개${r !== null ? ` · ${r}%` : ''}`}><span>{Number(d.slice(8))}</span>{l.length > 0 && <i />}</button>; })}
    </div>
  </div>;
}

/** 10-minute cells: every item with a start and an end on that day paints them, whatever database it is in. */
function TimeGrid({part, day}: PartProps) {
  const {ws, ctx} = useLit();
  const src = part.view.lens || part.view.dbs.length || part.view.where.length ? query(ws, part.view, ctxFor(ctx, day)) : [...ws.items.values()].filter(x => !x.body.archived);
  const from = new Date(`${day}T00:00:00`); from.setHours(part.startHour);
  const spans = src.flatMap(it => {
    const s = roleProp(ws, 'start', it.body.dbs) ?? undefined, e = roleProp(ws, 'end', it.body.dbs) ?? undefined;
    const sv = s ? it.body.values[s.id] : null, ev = e ? it.body.values[e.id] : null;
    if (typeof sv !== 'string') return [];
    const a = Date.parse(sv), b = typeof ev === 'string' ? Date.parse(ev) : (Date.now() > a ? Date.now() : a);
    return [{a, b, it}];
  });
  const cell = (i: number) => { const t0 = from.getTime() + i * 600_000, t1 = t0 + 600_000; return spans.find(x => x.a < t1 && x.b > t0); };
  const colorOf = (it: Item) => { const d = it.body.dbs[0]; return d ? `hsl(${[...d].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)} 55% 62%)` : 'var(--accent)'; };
  const total = spans.reduce((n, x) => n + Math.max(0, Math.min(x.b, from.getTime() + 86_400_000) - Math.max(x.a, from.getTime())), 0) / 60000;
  return <div className="timegrid">
    {Array.from({length: 24}, (_, h) => <div key={h} className="tg-row"><span className="tg-h">{(part.startHour + h) % 24}</span>{Array.from({length: 6}, (_, m) => { const x = cell(h * 6 + m); return <span key={m} className="tg-cell" style={x ? {background: colorOf(x.it)} : undefined} title={x ? `${title(ws, x.it)} ${clock(new Date(x.a).toISOString())}` : ''} />; })}</div>)}
    <p className="small muted">합계 {Math.floor(total / 60)}시간 {Math.round(total % 60)}분</p>
  </div>;
}

function metricValue(ws: Workspace, part: v2.Part, ctx: Ctx, day: string) {
  if (part.signal) { const s = evalSignal(ws, part.signal, ctxFor(ctx, day)); return {v: s.value, target: s.target ?? part.target, met: s.met as boolean | null}; }
  const items = viewItems(ws, {...part.view, limit: 500}, ctx, day);
  return {v: aggregate(ws, items, part.agg, part.of, 0, ctxFor(ctx, day)), target: part.target, met: null};
}
function Metric({part, day}: PartProps) {
  const {ws, ctx} = useLit(), {v, target, met} = metricValue(ws, part, ctx, day);
  const n = typeof v === 'number' ? v : null, p = part.of ? ws.properties.get(part.of) : undefined;
  const pct = n !== null && typeof target === "number" && target ? Math.max(0, Math.min(100, n / target * 100)) : null;
  const light = part.show === 'light' && n !== null ? (part.green !== null && n >= part.green ? 'green' : part.red !== null && n <= part.red ? 'red' : 'amber') : '';
  const label = part.label || (part.signal ? nameOf(ws, part.signal) : '');
  return <div className={`metric show-${part.show} ${met ? 'met' : ''}`}>
    {part.show === 'light' && <span className={`light ${light}`} aria-label={light} />}
    {part.show === 'ring' && pct !== null ? <svg viewBox="0 0 36 36" className="ring"><circle cx="18" cy="18" r="15.9" /><circle cx="18" cy="18" r="15.9" className="fg" strokeDasharray={`${pct} 100`} /></svg> : null}
    <span className="metric-n">{n === null ? (v === null ? '–' : fmt(ws, p, v)) : p?.body.kind === 'duration' ? fmt(ws, p, n) : `${Math.round(n * 100) / 100}${p?.body.unit ? ` ${p.body.unit}` : ''}`}{target !== null && part.show !== 'light' ? <small> / {target}</small> : null}</span>
    {label && <span className="metric-l">{label}{met ? ' ✓' : ''}</span>}
    {part.show === 'bar' && pct !== null && <div className="bar"><i style={{width: `${pct}%`}} /></div>}
  </div>;
}
function Chart({part, day}: PartProps) {
  const {ws, ctx} = useLit(), n = part.view.period === 'last30' || part.view.period === 'month' ? 30 : 7;
  const base = query(ws, part.view, ctxFor(ctx, day));
  const days = Array.from({length: n}, (_, i) => addDays(day, i - n + 1));
  const vals = days.map(d => { const v = aggregate(ws, base.filter(x => itemDay(ws, x) === d), part.agg, part.of, 0); return typeof v === 'number' ? v : 0; });
  const max = Math.max(1, part.target ?? 0, ...vals);
  return <div className="chart">{days.map((d, i) => <div key={d} className="col" title={`${d} · ${vals[i]}`}><i style={{height: `${vals[i]! / max * 100}%`}} className={part.target !== null && vals[i]! >= part.target ? 'hit' : ''} /><span>{n === 7 ? '일월화수목금토'[new Date(`${d}T00:00:00Z`).getUTCDay()] : Number(d.slice(8)) % 5 === 0 ? Number(d.slice(8)) : ''}</span></div>)}</div>;
}
function Breakdown({part, day}: PartProps) {
  const {ws, ctx} = useLit(), g = part.view.group ? ws.properties.get(part.view.group) : undefined;
  const items = viewItems(ws, {...part.view, limit: 500}, ctx, day);
  if (!g) return <p className="muted small">나눌 속성(묶기)을 골라 주세요</p>;
  const rows = g.body.options.map(o => { const l = items.filter(x => { const v = x.body.values[g.id]; return v === o.id || (Array.isArray(v) && v.includes(o.id)); }); const v = aggregate(ws, l, part.agg, part.of, 0); return [o.name, typeof v === 'number' ? v : 0, o.color] as const; }).filter(r => r[1] > 0);
  const max = Math.max(1, ...rows.map(r => r[1]));
  const p = part.of ? ws.properties.get(part.of) : undefined;
  return <div className="breakdown">{rows.map(([n, v, c]) => <div key={n} className="bd-row"><span>{n}</span><div className="bar"><i className={`c-${c}`} style={{width: `${v / max * 100}%`}} /></div><b>{p ? fmt(ws, p, v) : v}</b></div>)}{!rows.length && <p className="muted small">아직 없어요</p>}</div>;
}

const resolveWrite = (write: v2.Part['write'], ctx: Ctx, day: string) => Object.fromEntries(Object.entries(write.values).map(([k, e]) => [k, 'set' in e ? e.set : 'now' in e ? ctx.now.toISOString() : 'today' in e ? day : null])) as Record<string, v2.CellValue>;
function Form({part, day}: PartProps) {
  const {ws, ctx, save, toast} = useLit(), [vals, setVals] = useState<Record<string, v2.CellValue>>({}), [text, setText] = useState('');
  const props = part.props.map(id => ws.properties.get(id)).filter(p => !!p);
  const needsText = !props.length;
  return <form className="form" onSubmit={async e => {
    e.preventDefault();
    const body = newItemBody(ws, part.write.dbs, text, day, {...resolveWrite(part.write, ctx, day), ...Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== null && v !== ''))});
    if (await save('item', body)) { setVals({}); setText(''); toast('저장했어요'); }
  }}>
    {needsText && <input value={text} onChange={e => setText(e.target.value)} placeholder={part.label || '내용'} />}
    {props.map(p => <label key={p!.id}><span className="k">{p!.body.name}</span><ValueInput p={p!} value={vals[p!.id] ?? null} onChange={v => setVals(x => ({...x, [p!.id]: v}))} /></label>)}
    <button className="primary" type="submit">저장</button>
  </form>;
}
function useTick(on: boolean) { const [, set] = useState(0); useEffect(() => { if (!on) return; const t = setInterval(() => set(x => x + 1), 1000); return () => clearInterval(t); }, [on]); }
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
/** Timestamp (타임스탬프): start → end into the chosen database's start and end. */
function Stamp({part, day}: PartProps) {
  const {ws, save, setValues} = useLit();
  const s = roleProp(ws, 'start', part.write.dbs), e = roleProp(ws, 'end', part.write.dbs);
  const running = useMemo(() => s && e ? [...ws.items.values()].find(x => !x.body.archived && part.write.dbs.every(d => x.body.dbs.includes(d)) && typeof x.body.values[s.id] === 'string' && !x.body.values[e.id]) : undefined, [ws, s, e, part.write.dbs]);
  useTick(!!running);
  if (!s) return <p className="muted small">시작(Start) 역할이 있는 DB를 골라 주세요</p>;
  const only = !e;
  return <div className="stamp-part">
    <button className={`big-btn ${running ? 'on' : ''}`} onClick={() => {
      const now = new Date().toISOString();
      if (running && e) void setValues(running, {[e.id]: now});
      else void save('item', newItemBody(ws, part.write.dbs, part.label, day, {[s.id]: now, ...(only && e ? {} : {})}));
    }}>{running ? `■ ${hms(Date.now() - Date.parse(String(running.body.values[s.id])))}` : `▶ ${part.label || (only ? '기록' : '시작')}`}</button>
  </div>;
}
function Timer({part, day}: PartProps) {
  const {ws, save, toast} = useLit();
  const steps = part.steps.length ? part.steps : [{name: part.label || '타이머', min: 25}];
  const [run, setRun] = useState<{i: number; until: number; started: number; round: number} | null>(null);
  useTick(!!run);
  useEffect(() => {
    if (!run || Date.now() < run.until) return;
    const step = steps[run.i]!, s = roleProp(ws, 'start', part.write.dbs), e = roleProp(ws, 'end', part.write.dbs);
    if (part.write.dbs.length) void save('item', newItemBody(ws, part.write.dbs, step.name, day, {...(s ? {[s.id]: new Date(run.started).toISOString()} : {}), ...(e ? {[e.id]: new Date().toISOString()} : {})}));
    toast(`${step.name} 끝`);
    const next = run.i + 1 < steps.length ? {i: run.i + 1, round: run.round} : run.round + 1 < part.loop ? {i: 0, round: run.round + 1} : null;
    setRun(next ? {...next, started: Date.now(), until: Date.now() + steps[next.i]!.min * 60_000} : null);
  });
  return <div className="timer">
    {run ? <><b className="metric-n">{hms(run.until - Date.now())}</b><span className="muted small">{steps[run.i]!.name}{part.loop > 1 ? ` · ${run.round + 1}/${part.loop}` : ''}</span><button onClick={() => setRun(null)}>멈춤</button></>
      : <button className="big-btn" onClick={() => setRun({i: 0, round: 0, started: Date.now(), until: Date.now() + steps[0]!.min * 60_000})}>▶ {steps.map(s => `${s.name} ${s.min}분`).join(' → ')}</button>}
  </div>;
}
function Rating({part, day}: PartProps) {
  const {ws, ctx, save} = useLit(), prop = part.write.prop ? ws.properties.get(part.write.prop) : undefined;
  const todays = viewItems(ws, {...v2.View.parse({}), dbs: part.write.dbs, period: 'day'}, ctx, day);
  const last = prop ? aggregate(ws, todays, 'last', prop.id, 0) : null;
  if (!prop) return <p className="muted small">점수를 적을 속성을 골라 주세요</p>;
  const s = roleProp(ws, 'start', part.write.dbs);
  return <div className="rating">{part.label && <span className="k">{part.label}</span>}<div className="chips">{Array.from({length: part.max}, (_, i) => i + 1).map(n => <button key={n} className={`chip ${last === n ? 'on' : ''}`} onClick={() => void save('item', newItemBody(ws, part.write.dbs, '', day, {[prop.id]: n, ...(s ? {[s.id]: new Date().toISOString()} : {}), ...resolveWrite(part.write, ctx, day)}))}>{n}</button>)}</div></div>;
}
function Counter({part, day}: PartProps) {
  const {ws, ctx, save, remove} = useLit();
  const todays = viewItems(ws, {...v2.View.parse({}), dbs: part.write.dbs, period: 'day'}, ctx, day);
  return <div className="counter"><b className="metric-n">{todays.length}{part.target ? <small> / {part.target}</small> : null}</b><span className="muted small">{part.label}</span>
    <button className="big-btn" onClick={() => void save('item', newItemBody(ws, part.write.dbs, part.label, day, resolveWrite(part.write, ctx, day)))}>+1</button>
    {todays.length > 0 && <button className="ghost small" onClick={() => void remove(todays.at(-1)!.id)}>−1</button>}</div>;
}

/** Quick capture: write a line; lit shows what it understood (#tags, key: value) and saves only what is known. */
function Capture({part, day}: PartProps) {
  const {ws, save} = useLit(), [line, setLine] = useState('');
  const got = line.trim() ? parseCapture(ws, line) : null;
  const unknownTags = got?.tags.filter(t => !t.db) ?? [], unknownKeys = got?.pairs.filter(p => !p.prop) ?? [];
  const commit = async (makeNew: boolean) => {
    if (!got) return;
    const dbs = [...part.write.dbs, ...got.tags.flatMap(t => t.db ? [t.db] : [])];
    const values: Record<string, v2.CellValue> = {};
    for (const p of got.pairs) if (p.prop) values[p.prop] = p.value;
    if (makeNew) {
      for (const t of unknownTags) { const r = await save('database', {name: t.name}); if (r) dbs.push(r.id); }
      for (const p of unknownKeys) { const num = /^-?\d+(\.\d+)?\D*$/.test(p.raw); const r = await save('property', {name: p.key, kind: num ? 'number' : 'text'}); if (r) values[r.id] = num ? Number(p.raw.replace(/[^\d.-]/g, '')) : p.raw; }
    }
    const extra = makeNew ? '' : unknownKeys.map(p => `${p.key}: ${p.raw}`).join(' ');
    await save('item', {...newItemBody(ws, [...new Set(dbs)], [got.text, extra].filter(Boolean).join(' '), day), values: {...newItemBody(ws, [...new Set(dbs)], got.text, day).values, ...values}});
    setLine('');
  };
  return <form className="capture" onSubmit={e => { e.preventDefault(); void commit(false); }}>
    <input value={line} onChange={e => setLine(e.target.value)} placeholder={part.label || '무엇이든 한 줄 · #태그 칸: 값'} aria-label="빠른 입력" />
    {got && (got.tags.length > 0 || got.pairs.length > 0) && <div className="understood small">
      {got.tags.map(t => <span key={t.name} className={`chip ${t.db ? 'on' : 'new'}`}>#{t.db ? nameOf(ws, t.db) : `${t.name} (새 태그)`}</span>)}
      {got.pairs.map(p => <span key={p.key} className={`chip ${p.prop ? 'on' : 'new'}`}>{p.prop ? nameOf(ws, p.prop) : `${p.key} (새 칸)`}: {String(p.value)}</span>)}
      {(unknownTags.length > 0 || unknownKeys.length > 0) && <button type="button" className="small" onClick={() => void commit(true)}>새 태그·칸도 만들고 저장</button>}
    </div>}
  </form>;
}
export {propsForItem};
