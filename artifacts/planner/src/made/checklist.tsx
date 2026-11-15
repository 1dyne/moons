import {useState} from 'react';
import {useDoubleTap} from './parts.tsx';
import {createPortal} from 'react-dom';
import type {Entry, LifeRecord} from '@workspace/life-contract';
import type {E, FieldDef, LogicBlock} from '@workspace/planner-spec';
import {useBack} from '../back.ts';
import {parseEntry} from '../parse.ts';
import {clockOf} from '../schedule.ts';
import {FieldInput, atFor, ofPeriod, showValue, titleOf, write, type M} from './MadeWidget.tsx';

// 체크 목록: one row per item with a check, the properties the user chose for the row, and ⋯ for the properties the
// user chose to change. Nothing about 할 일 is fixed here: the 할 일 widget is this part on the 할 일 DB, set up by
// its starting template, and every choice (row, ⋯, check, double tap, add line, ▶) is the user's in the editor.

const MARKS = ['', '✓', '◐', '✕', '→', '–'];
export {useDoubleTap};
export function ChecklistBlock({b, m}: {b: LogicBlock; m: M}) {
  const t = m.type, [open, setOpen] = useState<string | null>(null), [text, setText] = useState('');
  const stateF = t?.fields.find(f => f.id === b.stateField && f.kind === 'choice');
  const titleF = t?.fields.find(f => f.id === 'title') ?? t?.fields.find(f => f.kind === 'text');
  const groupF = t?.fields.find(f => f.id === b.field && f.kind === 'choice');
  const rowF = b.fields.map(id => t?.fields.find(f => f.id === id)).filter((f): f is FieldDef => !!f && f.id !== titleF?.id && f.id !== stateF?.id);
  const list = ofPeriod(m, b).sort((a, c) => {
    const sa = String(a.body.fields.start ?? ''), sc = String(c.body.fields.start ?? '');
    return sa && sc ? sa.localeCompare(sc) : sa ? -1 : sc ? 1 : a.body.at.localeCompare(c.body.at);
  });
  const save = (e: E, fields: Record<string, unknown>) => write(m, e.id, {fields: {...e.body.fields, ...fields} as Entry['fields']}, undefined, e);
  const remove = (id: string) => { setOpen(null); void m.ctx.p.remove(id); };
  const dbl = useDoubleTap(id => { if (b.dbl === 'delete') remove(id); else if (b.dbl === 'open') setOpen(id); });
  // The check: through the first four states (할 일 → 한 일 → 일부 → 못 함), or just done / not done.
  const next = (v: string) => { const o = stateF!.options, i = Math.max(0, o.indexOf(v)); return b.tap === 'done' ? (i === 1 ? o[0]! : o[1] ?? o[0]!) : o[(i + 1) % Math.min(4, o.length)]!; };
  const task = (id: string) => m.ctx.p.records.find(r => r.id === id && r.kind === 'task') as LifeRecord<'task'> | undefined;
  const timer = m.ctx.timer;
  const add = async () => {
    const p = parseEntry(text, m.ctx.day);
    if (!p.title.trim() || !titleF) return;
    const has = (id: string) => t?.fields.some(f => f.id === id);
    const fields: Record<string, unknown> = {[titleF.id]: p.title};
    if (p.time && has('start')) fields.start = clockOf(p.time.start.value);
    if (p.time?.end && has('end')) fields.end = clockOf(p.time.end.value);
    if (p.estimateMin && has('est')) fields.est = p.estimateMin;
    if (stateF) fields[stateF.id] = stateF.options[0];
    // Added under a grouped list, a new item takes the first group (할 일 → 필수), unless the part shows only one group.
    const only = b.conds.find(c => c.op === 'eq' && t?.fields.some(f => f.id === c.field));
    if (only) fields[only.field] = only.value; else if (groupF) fields[groupF.id] = groupF.options[0];
    setText('');
    await write(m, null, {verb: 'planned', at: atFor(m), fields: fields as Entry['fields']});
  };
  const row = (e: E) => {
    const st = stateF ? String(e.body.fields[stateF.id] ?? stateF.options[0] ?? '') : '', si = stateF ? stateF.options.indexOf(st) : -1;
    const running = !!timer?.running && timer.running.body.taskId === e.id, tk = t?.id === 'task' && b.play && timer ? task(e.id) : undefined;
    return <li key={e.id} data-entry={e.id} className={`cl-row st-${si}`} onPointerUp={dbl(e.id)}>
      {stateF && <button className="cl-mark" onClick={() => void save(e, {[stateF.id]: next(st)})} aria-label={`${titleOf(e.body, t)}: ${st}. 눌러서 바꾸기`}>{MARKS[si] ?? st.slice(0, 1)}</button>}
      <span className="cl-main"><span className="cl-title">{titleF ? String(e.body.fields[titleF.id] ?? '') : titleOf(e.body, t)}</span>
        {rowF.length > 0 && <span className="cl-chips">{rowF.map(f => { const v = showValue(m, f, e.body.fields[f.id]); return v ? <span key={f.id} className="cl-chip"><em>{f.name}</em> {v}</span> : null; })}</span>}</span>
      {tk && si !== 1 && (running ? <button className="play on" onClick={timer!.stop} aria-label="멈추기">■</button> : <button className="play" onClick={() => timer!.start({task: tk})} aria-label="시작">▶</button>)}
      <button className="ghost small cl-more" onClick={() => setOpen(e.id)} aria-label="더 보기">⋯</button>
    </li>;
  };
  const groups = groupF ? [...groupF.options, ''].map(o => [o, list.filter(e => String(e.body.fields[groupF.id] ?? '') === o)] as const).filter(([, l]) => l.length) : [['', list] as const];
  const cur = list.find(e => e.id === open);
  return <div className="cl">
    {groups.map(([g, l]) => <div key={g} className="cl-group">{groupF && <span className="cl-gname">{g || `${groupF.name} 없음`}</span>}<ul className="cl-list">{l.map(row)}</ul></div>)}
    {!list.length && <p className="muted small mb-none">–</p>}
    {b.add && titleF && <form className="cl-add" onSubmit={ev => { ev.preventDefault(); void add(); }}>
      <input value={text} onChange={ev => setText(ev.target.value)} placeholder={`${t?.name ?? ''} 추가 (예: 14:00 회의 30분)`} aria-label={`${t?.name ?? '항목'} 추가`} />
      <button className="primary small" disabled={!text.trim()}>추가</button></form>}
    {b.dbl === 'delete' && list.length > 0 && <p className="muted small cl-hint">두 번 누르면 지워져요 · 되돌리기 가능</p>}
    {cur && <Detail e={cur} b={b} m={m} close={() => setOpen(null)} save={f => save(cur, f)} remove={() => remove(cur.id)} titleF={titleF} />}
  </div>;
}

/** ⋯: only the properties this part was set to show, in that order. Choices save at once; typing saves on leaving the box. */
function Detail({e, b, m, close, save, remove, titleF}: {e: E; b: LogicBlock; m: M; close: () => void; save: (f: Record<string, unknown>) => unknown; remove: () => void; titleF?: FieldDef}) {
  useBack(true, close);
  const [v, setV] = useState<Record<string, unknown>>({...e.body.fields});
  const ids = b.detail.length ? b.detail : (m.type?.fields.map(f => f.id) ?? []);
  const fs = ids.map(id => m.type?.fields.find(f => f.id === id)).filter((f): f is FieldDef => !!f && f.id !== titleF?.id);
  const typed = (f: FieldDef) => ['text', 'longtext', 'number', 'duration', 'time', 'date'].includes(f.kind);
  const set = (f: FieldDef, x: unknown) => { setV(s => ({...s, [f.id]: x})); if (!typed(f)) void save({[f.id]: x}); };
  const flush = (id: string) => { if (JSON.stringify(v[id] ?? '') !== JSON.stringify(e.body.fields[id] ?? '')) void save({[id]: v[id]}); };
  return createPortal(<div className="sheet-wrap cl-wrap" onClick={ev => { if (ev.target === ev.currentTarget) close(); }}>
    <section className="bottom-sheet cl-sheet" role="dialog" aria-label="항목 고치기">
      <header className="cl-sheet-head">
        {titleF ? <input className="cl-sheet-title" value={String(v[titleF.id] ?? '')} onChange={x => setV(s => ({...s, [titleF.id]: x.target.value}))} onBlur={() => flush(titleF.id)} aria-label={titleF.name} />
          : <b>{titleOf(e.body, m.type)}</b>}
        <button className="ghost" onClick={close} aria-label="닫기">✕</button>
      </header>
      <div className="cl-fields">{fs.map(f => { const In = typed(f) ? 'label' : 'div';
        return <In key={f.id} className={`cl-field k-${f.kind}`} onBlur={typed(f) ? () => flush(f.id) : undefined} {...(In === 'div' ? {role: 'group', 'aria-label': f.name} : {})}>
          <span className="k">{f.name}</span><FieldInput f={f} m={m} value={v[f.id]} title={String(v[titleF?.id ?? ''] ?? '')} onChange={x => set(f, x)} /></In>; })}
        {!fs.length && <p className="muted small">편집에서 ⋯에 보일 속성을 골라요.</p>}</div>
      <footer className="cl-sheet-foot"><span className="muted small">바꾸면 바로 저장돼요</span><button className="ghost small danger" onClick={remove}>지우기</button></footer>
    </section>
  </div>, document.body);
}
