import {useState} from 'react';
import type {LifeRecord, Note} from '@workspace/life-contract';
import {PROP_TYPES, newPropId, type PlannerSpec, type PropDef, type Widget} from '@workspace/planner-spec';
import {ofKind} from '../data.ts';
import {useL} from '../labels.tsx';
import type {Ctx} from './day.ts';

// Notion-style pieces: properties the user names and types on the spot, and a table (DB) widget built from them.
type Value = string | number | boolean | null;

/** Applies a change to one widget wherever it lives: the day page or a page tab. */
export function patchWidget(spec: PlannerSpec, id: string, f: (w: Widget) => Widget): PlannerSpec {
  const map = (ws: Widget[] | undefined) => ws?.map(w => w.id === id ? f(w) : w);
  return {...spec, canvas: {...spec.canvas, day: map(spec.canvas.day)}, tabs: spec.tabs?.map(t => ({...t, widgets: map(t.widgets)}))};
}

/** Name, type and (for 선택) choices of one property. */
export function PropForm({initial, onSave, onDelete, onCancel}: {initial?: PropDef; onSave: (p: PropDef) => void; onDelete?: () => void; onCancel: () => void}) {
  const [name, setName] = useState(initial?.name ?? ''), [type, setType] = useState<PropDef['type']>(initial?.type ?? 'text'), [opts, setOpts] = useState((initial?.options ?? []).join(', '));
  const save = () => { if (!name.trim()) return; onSave({id: initial?.id ?? newPropId(), name: name.trim().slice(0, 30), type, options: type === 'select' ? opts.split(',').map(x => x.trim()).filter(Boolean).slice(0, 30) : []}); };
  return <form className="prop-form" onSubmit={e => { e.preventDefault(); save(); }}>
    <input value={name} onChange={e => setName(e.target.value)} placeholder="속성 이름" aria-label="속성 이름" autoFocus maxLength={30} />
    <select value={type} onChange={e => setType(e.target.value as PropDef['type'])} aria-label="종류">{PROP_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    {type === 'select' && <input value={opts} onChange={e => setOpts(e.target.value)} placeholder="선택지 (쉼표로 구분)" aria-label="선택지" />}
    <button className="primary small" disabled={!name.trim()}>{initial ? '바꾸기' : '추가'}</button>
    {onDelete && <button type="button" className="small danger" onClick={onDelete}>속성 지우기</button>}
    <button type="button" className="ghost small" onClick={onCancel}>닫기</button>
  </form>;
}

/** One value editor; text-like values save when the box loses focus. */
export function PropInput({def, value, onChange, compact}: {def: PropDef; value: Value | undefined; onChange: (v: Value) => void; compact?: boolean}) {
  const v = value ?? null;
  switch (def.type) {
    case 'check': return <input type="checkbox" checked={v === true} onChange={e => onChange(e.target.checked)} aria-label={def.name} />;
    case 'select': return <select value={typeof v === 'string' ? v : ''} onChange={e => onChange(e.target.value || null)} aria-label={def.name}>
      <option value="">{compact ? '' : '–'}</option>{def.options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
    case 'date': return <input type="date" value={typeof v === 'string' ? v : ''} onChange={e => onChange(e.target.value || null)} aria-label={def.name} />;
    case 'number': return <input className="num" inputMode="decimal" defaultValue={typeof v === 'number' ? String(v) : ''} key={String(v)} aria-label={def.name}
      onBlur={e => { const t = e.target.value.trim(); const n = Number(t); const next = t === '' || Number.isNaN(n) ? null : n; if (next !== v) onChange(next); }} />;
    default: return <input defaultValue={typeof v === 'string' ? v : ''} key={String(v)} aria-label={def.name} onBlur={e => { const t = e.target.value.trim() || null; if (t !== v) onChange(t); }} />;
  }
}

const chains = new Map<string, Promise<LifeRecord<'note'>>>();

export const showValue = (def: PropDef, v: Value | undefined) => v === null || v === undefined || v === '' ? null : def.type === 'check' ? (v ? '✓' : null) : String(v);

/** 표 위젯: columns the user defines right here; each line is a note record (signifier 'row'). */
export function TableWidget({w, ctx}: {w: Widget; ctx: Ctx}) {
  const L = useL();
  const cols = ((w.options.columns as PropDef[] | undefined) ?? []), first = String(w.options.firstName ?? '이름');
  const scope = w.options.scope === 'all' ? 'all' : 'day';
  const rows = ofKind(ctx.p.records, 'note').filter(n => n.body.signifier === 'row' && n.body.table === w.id && (scope === 'all' || n.logicalDay === ctx.day)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [editing, setEditing] = useState<string | null>(null);
  const can = !!ctx.saveSpec;
  const setCols = (next: PropDef[], extra: Record<string, unknown> = {}) => ctx.saveSpec?.(s => patchWidget(s, w.id, x => ({...x, options: {...x.options, columns: next, ...extra}})));
  // Cells save one after another per row, each on top of the last saved revision (two quick edits never clash).
  const saveRow = (r: LifeRecord<'note'>, body: Partial<Note>) => {
    const prev = chains.get(r.id) ?? Promise.resolve(r);
    const next = prev.then(cur => { const base = cur && cur.revision >= r.revision ? cur : r; return ctx.p.write(r.id, {kind: 'note', logicalDay: base.logicalDay, body: {...base.body, ...body}, baseRevision: base.revision}) as Promise<LifeRecord<'note'> | null>; });
    chains.set(r.id, next.then(x => x ?? r)); return next;
  };
  const addRow = () => ctx.p.write(null, {kind: 'note', logicalDay: ctx.day, body: {text: '', signifier: 'row', table: w.id, cells: {}}});
  return <div className="dbt">
    <div className="dbt-scroll"><table>
      <thead><tr>
        <th>{editing === 'first' ? <form className="prop-form" onSubmit={e => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('n') ?? '').trim(); if (v) void setCols(cols, {firstName: v}); setEditing(null); }}>
          <input name="n" defaultValue={first} aria-label="첫 열 이름" autoFocus maxLength={30} /><button className="small primary">바꾸기</button></form>
          : <button className="link th" disabled={!can} onClick={() => setEditing('first')}>{first}</button>}</th>
        {cols.map(c => <th key={c.id}>{editing === c.id
          ? <PropForm initial={c} onCancel={() => setEditing(null)} onSave={d => { void setCols(cols.map(x => x.id === c.id ? d : x)); setEditing(null); }} onDelete={() => { void setCols(cols.filter(x => x.id !== c.id)); setEditing(null); }} />
          : <button className="link th" disabled={!can} onClick={() => setEditing(c.id)}>{c.name}</button>}</th>)}
        {can && <th className="dbt-add">{editing === 'new' ? <PropForm onCancel={() => setEditing(null)} onSave={d => { void setCols([...cols, d]); setEditing(null); }} />
          : <button className="ghost small" onClick={() => setEditing('new')} aria-label="열 추가">+ 열</button>}</th>}
        <th aria-label="지우기" />
      </tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}>
        <td><input defaultValue={r.body.text} key={r.revision} aria-label={first} onBlur={e => { if (e.target.value !== r.body.text) void saveRow(r, {text: e.target.value}); }} /></td>
        {cols.map(c => <td key={c.id}><PropInput def={c} value={r.body.cells[c.id]} compact onChange={v => void saveRow(r, {cells: {...r.body.cells, [c.id]: v}})} /></td>)}
        {can && <td />}
        <td><button className="ghost small" onClick={() => ctx.p.remove(r.id)} aria-label="줄 지우기">×</button></td>
      </tr>)}</tbody>
    </table></div>
    <button className="small dbt-new" onClick={() => void addRow()}>{L('add', '+ 새 줄')}</button>
  </div>;
}
