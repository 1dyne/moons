import {useEffect, useState, type ReactNode} from 'react';
import {v2} from '@workspace/life-contract';
import {title, type Item, type Prop, type Workspace} from '@workspace/lit-core';
import {useLit} from './store.tsx';

// Small shared pieces. Every word a user sees about their own data comes from their records; the words here
// are lit's own chrome (buttons, grammar names), English canonical with the Korean translation.

export const KIND_NAMES: Record<v2.PropertyKind, [string, string]> = {
  title: ['Title', '이름'], text: ['Text', '짧은 글'], longtext: ['Long text', '긴 글'], number: ['Number', '숫자'], rating: ['Rating', '점수'],
  select: ['Select', '선택'], multi: ['Multi-select', '여러 개 선택'], checkbox: ['Checkbox', '체크'], date: ['Date', '날짜'], datetime: ['Date & time', '시각'],
  duration: ['Duration', '걸린 시간(분)'], relation: ['Relation', '연결'], signal: ['Signal', '상황'], formula: ['Formula', '계산 속성'],
};
export const ROLE_NAMES: Record<v2.Role, [string, string]> = {title: ['Title', '이름'], day: ['Date', '날짜'], start: ['Start', '시작'], end: ['End', '끝'], done: ['Done', '달성'], fixed: ['Fixed', '고정 일정']};
export const MEANING_NAMES: Record<v2.Meaning, string> = {done: '끝냄', open: '안 끝냄', skip: '세지 않음'};
export const AGG_NAMES: Record<v2.Aggregate, [string, string]> = {count: ['Count', '개수'], sum: ['Sum', '합계'], avg: ['Average', '평균'], max: ['Max', '최대'], min: ['Min', '최소'], last: ['Latest', '마지막 값'], streak: ['Streak', '연속 일수'], days: ['Days logged', '기록한 날 수'], doneRatio: ['Done ratio', '끝낸 비율']};
export const PERIOD_NAMES: Record<string, string> = {'': '모든 날', day: '보이는 날', today: '오늘', yesterday: '어제', week: '이번 주', last7: '최근 7일', month: '이번 달', last30: '최근 30일', all: '전체'};
export const OP_NAMES: Record<v2.Op, string> = {is: '=', isNot: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', contains: '포함', empty: '비어 있음', filled: '값 있음'};
export const COLORS = ['', 'gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

export const En = ({children}: {children: ReactNode}) => <span className="en" lang="en">{children}</span>;
export function Sheet({title: t, onClose, children, wide}: {title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean}) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return <div className="sheet-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
      <header><h2>{t}</h2><button className="ghost" onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="sheet-body">{children}</div>
    </div>
  </div>;
}
export function Toasts() {
  const {toasts, flash} = useLit();
  return <>
    <div className="toasts" role="status">{toasts.map(t => <div key={t.id} className={`toast ${t.tone ?? ''}`}>{t.text}</div>)}</div>
    {flash.__screen && <div className={`screen-fx fx-${flash.__screen}`} aria-hidden="true">{flash.__screen === 'celebrate' || flash.__screen === 'confetti' ? '🎉' : '✨'}</div>}
  </>;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const clock = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const toLocalInput = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const propsOf = (ws: Workspace) => [...ws.properties.values()].sort((a, b) => a.body.name.localeCompare(b.body.name, 'ko'));
export const nameOf = (ws: Workspace, id: string | null | undefined) => (id && (ws.properties.get(id)?.body.name ?? ws.databases.get(id)?.body.name ?? ws.lenses.get(id)?.body.name ?? ws.signals.get(id)?.body.name ?? ws.rules.get(id)?.body.name ?? (ws.items.get(id) ? title(ws, ws.items.get(id)!) : ''))) || '(없음)';

/** A value as text: option names, item titles, clock times, units. */
export function fmt(ws: Workspace, p: Prop | undefined, v: v2.CellValue): string {
  if (v === null || v === undefined || v === '') return '';
  if (!p) return String(v);
  const k = p.body.kind, unit = p.body.unit ? ` ${p.body.unit}` : '';
  if (k === 'checkbox') return v === true ? '✓' : '';
  if (k === 'select') return p.body.options.find(o => o.id === v)?.name ?? String(v);
  if (k === 'multi' && Array.isArray(v)) return v.map(x => p.body.options.find(o => o.id === x)?.name ?? x).join(', ');
  if (k === 'relation') return (Array.isArray(v) ? v : [String(v)]).map(id => ws.items.get(id) ? title(ws, ws.items.get(id)!) : '…').join(', ');
  if (k === 'datetime' && typeof v === 'string') return clock(v);
  if (k === 'date' && typeof v === 'string') return v.slice(5).replace('-', '/');
  if (k === 'duration' && typeof v === 'number') return v >= 60 ? `${Math.floor(v / 60)}시간 ${v % 60 ? `${v % 60}분` : ''}`.trim() : `${v}분`;
  if (k === 'signal' && typeof v === 'string') return ws.signals.get(v)?.body.name ?? '';
  if (Array.isArray(v)) return v.join(', ');
  return `${v}${typeof v === 'number' ? unit : ''}`;
}
export const optionColor = (p: Prop | undefined, v: v2.CellValue) => p?.body.options.find(o => o.id === v)?.color ?? '';

/** An input for one property's value, by its kind. */
export function ValueInput({p, value, onChange, item, autoFocus}: {p: Prop; value: v2.CellValue; onChange: (v: v2.CellValue) => void; item?: Item; autoFocus?: boolean}) {
  const {ws} = useLit(), k = p.body.kind;
  const [text, setText] = useState(typeof value === 'string' || typeof value === 'number' ? String(value) : '');
  useEffect(() => { setText(typeof value === 'string' || typeof value === 'number' ? String(value) : ''); }, [value]);
  if (k === 'formula') return <span className="computed">계산됨</span>;
  if (k === 'checkbox') return <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} />;
  if (k === 'select') return <div className="chips">{p.body.options.map(o => <button key={o.id} type="button" className={`chip c-${o.color} ${value === o.id ? 'on' : ''}`} onClick={() => onChange(value === o.id ? null : o.id)}>{o.name}</button>)}</div>;
  if (k === 'multi') { const cur = Array.isArray(value) ? value : []; return <div className="chips">{p.body.options.map(o => <button key={o.id} type="button" className={`chip c-${o.color} ${cur.includes(o.id) ? 'on' : ''}`} onClick={() => onChange(cur.includes(o.id) ? cur.filter(x => x !== o.id) : [...cur, o.id])}>{o.name}</button>)}</div>; }
  if (k === 'rating') return <div className="chips">{Array.from({length: p.body.max}, (_, i) => i + 1).map(n => <button key={n} type="button" className={`chip ${value === n ? 'on' : ''}`} onClick={() => onChange(value === n ? null : n)}>{n}</button>)}</div>;
  if (k === 'longtext') return <textarea value={text} autoFocus={autoFocus} onChange={e => setText(e.target.value)} onBlur={() => text !== (value ?? '') && onChange(text || null)} rows={3} />;
  if (k === 'number' || k === 'duration') return <input type="number" inputMode="decimal" value={text} autoFocus={autoFocus} onChange={e => setText(e.target.value)} onBlur={() => onChange(text === '' ? null : Number(text))} />;
  if (k === 'date') return <input type="date" value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || null)} />;
  if (k === 'datetime') return <span className="row"><input type="datetime-local" value={typeof value === 'string' ? toLocalInput(value) : ''} onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} /><button type="button" className="small" onClick={() => onChange(new Date().toISOString())}>지금</button></span>;
  if (k === 'signal') return <select value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || null)}><option value="">(없음)</option>{[...ws.signals.values()].map(s => <option key={s.id} value={s.id}>{s.body.name}</option>)}</select>;
  if (k === 'relation') return <RelationInput p={p} value={value} onChange={onChange} self={item?.id} />;
  return <input value={text} autoFocus={autoFocus} onChange={e => setText(e.target.value)} onBlur={() => text !== (value ?? '') && onChange(text || null)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
function RelationInput({p, value, onChange, self}: {p: Prop; value: v2.CellValue; onChange: (v: v2.CellValue) => void; self?: string}) {
  const {ws} = useLit(), [q, setQ] = useState('');
  const cur = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const pool = [...ws.items.values()].filter(x => x.id !== self && !x.body.archived && (!p.body.relation?.db || x.body.dbs.includes(p.body.relation.db)));
  const hits = q ? pool.filter(x => title(ws, x).toLowerCase().includes(q.toLowerCase())).slice(0, 8) : pool.slice(-6).reverse();
  return <div className="relation">
    <div className="chips">{cur.map(id => <button key={id} type="button" className="chip on" onClick={() => onChange(cur.filter(x => x !== id))}>{ws.items.get(id) ? title(ws, ws.items.get(id)!) : '…'} ✕</button>)}</div>
    <input placeholder="찾기" value={q} onChange={e => setQ(e.target.value)} />
    <div className="chips">{hits.filter(x => !cur.includes(x.id)).map(x => <button key={x.id} type="button" className="chip" onClick={() => onChange(p.body.relation?.many === false ? [x.id] : [...cur, x.id])}>{title(ws, x) || '(이름 없음)'}</button>)}</div>
  </div>;
}

export function IdPicker({ids, value, onChange, label, many = true}: {ids: [string, string][]; value: string[]; onChange: (v: string[]) => void; label?: string; many?: boolean}) {
  return <div className="picker">{label && <span className="k">{label}</span>}<div className="chips">{ids.map(([id, n]) => <button key={id} type="button" className={`chip ${value.includes(id) ? 'on' : ''}`} onClick={() => onChange(value.includes(id) ? value.filter(x => x !== id) : many ? [...value, id] : [id])}>{n}</button>)}{!ids.length && <span className="muted small">아직 없어요</span>}</div></div>;
}
export const dbList = (ws: Workspace): [string, string][] => [...ws.databases.values()].map(d => [d.id, d.body.name]);
export const propList = (ws: Workspace, filter?: (p: Prop) => boolean): [string, string][] => propsOf(ws).filter(p => !filter || filter(p)).map(p => [p.id, p.body.name]);

const TOKENS_DAY = [['@day', '보이는 날'], ['@today', '오늘'], ['@yesterday', '어제'], ['@tomorrow', '내일'], ['@thisWeek', '이번 주']];
const TOKENS_DONE = [['@done', '끝냄'], ['@open', '안 끝냄'], ['@skip', '세지 않음']];
/** Conditions: on a property, on a role (across every database), on the databases an item has, or on its text. */
export function CondEditor({conds, onChange}: {conds: v2.Cond[]; onChange: (c: v2.Cond[]) => void}) {
  const {ws} = useLit();
  const set = (i: number, c: Partial<v2.Cond>) => onChange(conds.map((x, j) => j === i ? {...x, ...c} : x));
  return <div className="conds">
    {conds.map((c, i) => {
      const target = c.on === 'db' ? 'db' : c.on === 'text' ? 'text' : c.role ? `role:${c.role}` : c.prop ?? '';
      const p = c.prop ? ws.properties.get(c.prop) : undefined;
      const isDay = c.role === 'day' || p?.body.kind === 'date' || p?.body.kind === 'datetime', isDone = c.role === 'done' || !!p?.body.role && p.body.role === 'done';
      return <div key={i} className="cond">
        <select value={target} onChange={e => { const v = e.target.value; set(i, v === 'db' ? {on: 'db', prop: undefined, role: undefined, op: 'is', value: '@none'} : v === 'text' ? {on: 'text', prop: undefined, role: undefined, op: 'contains', value: ''} : v.startsWith('role:') ? {on: 'value', role: v.slice(5) as v2.Role, prop: undefined} : {on: 'value', prop: v, role: undefined}); }}>
          <option value="">고르기</option>
          <optgroup label="역할 (모든 DB)">{v2.ROLES.map(r => <option key={r} value={`role:${r}`}>{ROLE_NAMES[r][1]}</option>)}</optgroup>
          <optgroup label="속성">{propsOf(ws).map(x => <option key={x.id} value={x.id}>{x.body.name}</option>)}</optgroup>
          <option value="db">DB(태그)</option><option value="text">글자</option>
        </select>
        <select value={c.op} onChange={e => set(i, {op: e.target.value as v2.Op})}>{v2.OPS.map(o => <option key={o} value={o}>{OP_NAMES[o]}</option>)}</select>
        {c.op !== 'empty' && c.op !== 'filled' && (c.on === 'db'
          ? <select value={String(c.value ?? '')} onChange={e => set(i, {value: e.target.value})}><option value="@none">태그 없음</option>{dbList(ws).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          : p && (p.body.kind === 'select' || p.body.kind === 'multi') && !isDone ? <select value={String(c.value ?? '')} onChange={e => set(i, {value: e.target.value})}><option value="">고르기</option>{p.body.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          : isDone ? <select value={String(c.value ?? '')} onChange={e => set(i, {value: e.target.value})}>{TOKENS_DONE.map(([v, n]) => <option key={v} value={v}>{n}</option>)}{p?.body.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          : <TokenInput value={c.value} tokens={isDay ? TOKENS_DAY : c.prop && p?.body.kind === 'relation' ? [['@carried', '들고 온 항목']] : [['@weekday', '오늘 요일(0=일)']]} numeric={!!p && ['number', 'rating', 'duration', 'formula'].includes(p.body.kind)} onChange={v => set(i, {value: v})} />)}
        <button className="ghost small" onClick={() => onChange(conds.filter((_, j) => j !== i))} aria-label="조건 지우기">✕</button>
      </div>;
    })}
    <button className="small" onClick={() => onChange([...conds, {on: 'value', op: 'is', value: null}])}>+ 조건</button>
  </div>;
}
function TokenInput({value, tokens, numeric, onChange}: {value: v2.CellValue; tokens: string[][]; numeric: boolean; onChange: (v: v2.CellValue) => void}) {
  const [t, setT] = useState(value === null ? '' : String(value));
  return <span className="row">
    <input value={t} onChange={e => setT(e.target.value)} onBlur={() => onChange(t === '' ? null : numeric && !t.startsWith('@') && !Number.isNaN(Number(t)) ? Number(t) : t)} placeholder="값" />
    <select value="" onChange={e => { if (e.target.value) { setT(e.target.value); onChange(e.target.value); } }}><option value="">특수 값</option>{tokens.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
  </span>;
}
/** Databases, a lens, conditions: where a view or rule takes its items from. */
export function SourceEditor({src, onChange}: {src: v2.Source; onChange: (s: v2.Source) => void}) {
  const {ws} = useLit();
  return <div className="source">
    <label><span className="k">모아보기 <En>Lens</En></span><select value={src.lens ?? ''} onChange={e => onChange({...src, lens: e.target.value || null})}><option value="">(안 씀)</option>{[...ws.lenses.values()].map(l => <option key={l.id} value={l.id}>{l.body.name}</option>)}</select></label>
    <IdPicker label="DB(태그)" ids={dbList(ws)} value={src.dbs} onChange={dbs => onChange({...src, dbs})} />
    <div><span className="k">조건</span><CondEditor conds={src.where} onChange={where => onChange({...src, where})} /></div>
  </div>;
}
