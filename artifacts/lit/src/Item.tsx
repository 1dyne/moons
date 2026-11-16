import {useEffect, useState} from 'react';
import {v2, type AnyRecord} from '@workspace/life-contract';
import {itemDay, similarProperties, value, type Item} from '@workspace/lit-core';
import {api, useLit} from './store.tsx';
import {propsForItem, roleProp} from './model.ts';
import {En, IdPicker, KIND_NAMES, Sheet, ValueInput, dbList, fmt, nameOf} from './ui.tsx';

/** One item: every property, its databases, a new property right here, archive, history. */
export function ItemSheet({id, onClose}: {id: string; onClose: () => void}) {
  const {ws, save, setValues, remove, open, runEffects, ctx} = useLit();
  const item = ws.items.get(id);
  const [extra, setExtra] = useState<string[]>([]), [history, setHistory] = useState<Promise<AnyRecord[]> | null>(null);
  if (!item) return <Sheet title="항목" onClose={onClose}><p className="muted">지워졌어요.</p></Sheet>;
  const props = [...propsForItem(ws, item), ...extra.map(x => ws.properties.get(x)!).filter(p => p && !propsForItem(ws, item).includes(p))];
  const t = roleProp(ws, 'title', item.body.dbs);
  const moves = open(item);
  return <Sheet title={<span>항목 <En>Item</En></span>} onClose={onClose}>
    <div className="item-sheet">
      {!t || !(t.id in item.body.values || item.body.dbs.length) ? <label><span className="k">글</span><TextField value={item.body.text} onSave={text => save('item', {...item.body, text}, item.id)} /></label> : null}
      <IdPicker label="DB(태그)" ids={dbList(ws)} value={item.body.dbs} onChange={dbs => save('item', {...item.body, dbs}, item.id)} />
      <div className="props">
        {props.map(p => <div key={p.id} className="prop-row">
          <span className="k">{p.body.name}{p.body.role && <span className="role-mark" title="lit이 뜻을 아는 칸">◆</span>}</span>
          {p.body.kind === 'formula' ? <span className="computed">{fmt(ws, p, value(ws, item, p.id)) || '–'}</span> : <ValueInput p={p} item={item} value={item.body.values[p.id] ?? null} onChange={v => setValues(item, {[p.id]: v})} />}
        </div>)}
      </div>
      <AddProperty onAdd={pid => setExtra(x => [...x, pid])} />
      <p className="muted small">하루: {itemDay(ws, item)}{item.body.archived ? ' · 보관됨' : ''}</p>
      <div className="row wrap">
        {moves.length > 0 && <button className="primary" onClick={() => { runEffects(moves); onClose(); }}>→ 이어서 열기</button>}
        <button onClick={() => save('item', {...item.body, archived: !item.body.archived}, item.id)}>{item.body.archived ? '보관에서 꺼내기' : '보관 Archive'}</button>
        <button onClick={() => setHistory(api.history(item.id).then(r => r.items))}>기록 보기</button>
        <button className="danger" onClick={() => { if (confirm('이 항목을 지울까요? (기록은 남아요)')) { void remove(item.id); onClose(); } }}>지우기</button>
      </div>
      {history && <History list={history} />}
      <p className="muted small">{ctx.today === itemDay(ws, item) ? '오늘' : ''}</p>
    </div>
  </Sheet>;
}
function History({list}: {list: Promise<AnyRecord[]>}) {
  const {ws} = useLit(), [rows, setRows] = useState<AnyRecord[]>([]);
  useEffect(() => { void list.then(setRows).catch(() => setRows([])); }, [list]);
  return <ol className="history">{rows.slice().reverse().map(r => <li key={r.revision}>
    <span className="mono small">{new Date(r.updatedAt).toLocaleString()}</span> {r.source?.ref?.startsWith('rule:') ? <b>규칙 “{nameOf(ws, r.source.ref.slice(5))}”</b> : r.source?.ref?.startsWith('template:') ? '템플릿' : '직접'}{r.deletedAt ? ' · 지움' : ''}
  </li>)}</ol>;
}
export function TextField({value, onSave, placeholder}: {value: string; onSave: (v: string) => void; placeholder?: string}) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  return <input value={t} placeholder={placeholder} onChange={e => setT(e.target.value)} onBlur={() => t !== value && onSave(t)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
/** Add a property from here: lit first shows the ones that look the same, so the dictionary does not grow twins. */
export function AddProperty({onAdd}: {onAdd: (id: string) => void}) {
  const {ws, save} = useLit(), [name, setName] = useState(''), [kind, setKind] = useState<v2.PropertyKind>('text'), [openForm, setOpen] = useState(false);
  if (!openForm) return <button className="small" onClick={() => setOpen(true)}>+ 칸 추가 <En>Property</En></button>;
  const same = name.trim() ? (similarProperties(ws, name.trim()) as string[]).map(id => ws.properties.get(id)!).filter(Boolean) : [];
  const exact = [...ws.properties.values()].find(p => p.body.name === name.trim());
  return <div className="add-prop">
    <input autoFocus placeholder="칸 이름" value={name} onChange={e => setName(e.target.value)} />
    {(exact || same.length > 0) && <div className="hint">이미 있는 칸: <div className="chips">{[exact, ...same].filter((p, i, a) => p && a.indexOf(p) === i).map(p => <button key={p!.id} className="chip" onClick={() => { onAdd(p!.id); setOpen(false); setName(''); }}>{p!.body.name} · {KIND_NAMES[p!.body.kind][1]}</button>)}</div></div>}
    <select value={kind} onChange={e => setKind(e.target.value as v2.PropertyKind)}>{v2.PROPERTY_KINDS.filter(k => k !== 'formula' && k !== 'title').map(k => <option key={k} value={k}>{KIND_NAMES[k][1]} · {KIND_NAMES[k][0]}</option>)}</select>
    <button className="primary small" disabled={!name.trim()} onClick={async () => { const r = await save('property', {name: name.trim(), kind}); if (r) { onAdd(r.id); setOpen(false); setName(''); } }}>새 칸 만들기</button>
    <button className="ghost small" onClick={() => setOpen(false)}>취소</button>
  </div>;
}
export type {Item};
