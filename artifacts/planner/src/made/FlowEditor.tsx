import {OPS, VERB_NAMES, type Cond, type TypeDef} from '@workspace/planner-spec';
import {VERBS} from '@workspace/life-contract';

// Conditions on a DB's properties (views' filters and filter chips). Rules have their own cards (RuleCards.tsx).
export const SYS_FIELDS = [{id: 'verb', name: '동작'}, {id: 'value', name: '값'}, {id: 'duration', name: '걸린 시간(분)'}, {id: 'hour', name: '시작 시각(시)'}];
export const fieldsFor = (t: TypeDef | undefined) => [...(t?.fields ?? []).map(f => ({id: f.id, name: f.name, options: f.options, kind: f.kind})), ...SYS_FIELDS.map(f => ({...f, options: f.id === 'verb' ? [...VERBS] : [] as string[], kind: 'sys'}))];

export function CondsEditor({conds, type, onChange, label = '조건'}: {conds: Cond[]; type: TypeDef | undefined; onChange: (c: Cond[]) => void; label?: string}) {
  const fs = fieldsFor(type);
  const set = (i: number, p: Partial<Cond>) => onChange(conds.map((c, j) => j === i ? {...c, ...p} : c));
  return <div className="conds">
    {conds.map((c, i) => { const f = fs.find(x => x.id === c.field); return <div key={i} className="inline cond">
      <select value={c.field} onChange={e => set(i, {field: e.target.value})} aria-label="속성">{fs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select value={c.op} onChange={e => set(i, {op: e.target.value as Cond['op']})} aria-label="비교">{OPS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      {!['empty', 'filled'].includes(c.op) && (f?.options.length ? <select value={String(c.value)} onChange={e => set(i, {value: e.target.value})} aria-label="값"><option value="" />{f.options.map(o => <option key={o} value={o}>{f.id === 'verb' ? VERB_NAMES[o as keyof typeof VERB_NAMES] : o}</option>)}</select>
        : <input className="cond-v" value={String(c.value)} onChange={e => set(i, {value: e.target.value !== '' && !Number.isNaN(Number(e.target.value)) ? Number(e.target.value) : e.target.value})} aria-label="값" />)}
      <button className="ghost small" onClick={() => onChange(conds.filter((_, j) => j !== i))} aria-label="조건 빼기">×</button></div>; })}
    <button className="ghost small" onClick={() => onChange([...conds, {field: fs[0]?.id ?? 'value', op: 'eq', value: ''}])}>+ {label}</button>
  </div>;
}

