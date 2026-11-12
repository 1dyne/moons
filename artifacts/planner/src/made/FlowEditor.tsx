import {AGGS, OPEN_WHAT, OPS, TRIGGERS, VERB_NAMES, flowSentence, newLogicId, type Action, type Cond, type Flow, type TypeDef} from '@workspace/planner-spec';
import {VERBS} from '@workspace/life-contract';

// Automations read as one sentence (Shortcuts / Airtable style): 언제 → 조건 → 하기, every part picked from lists,
// so nothing can be written that the engine cannot run.
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

export const newFlow = (type: string): Flow => ({id: newLogicId(), name: '', enabled: true, on: {kind: 'record', at: '22:00', type, event: 'created', verbs: []}, if: [], ifAgg: [], do: [{do: 'notify', text: '알림'}]});

export function FlowEditor({flow, types, onChange, onDelete}: {flow: Flow; types: TypeDef[]; onChange: (f: Flow) => void; onDelete?: () => void}) {
  const t = types.find(x => x.id === flow.on.type);
  const set = (p: Partial<Flow>) => onChange({...flow, ...p});
  const setAct = (i: number, a: Action) => set({do: flow.do.map((x, j) => j === i ? a : x)});
  const typeSel = (v: string, on: (id: string) => void, label: string) => <select value={v} onChange={e => on(e.target.value)} aria-label={label}>{types.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
  return <div className="flow-ed">
    <p className="flow-sentence">{flowSentence(flow, types)}</p>
    <div className="flow-part"><span className="flow-k">언제</span>
      <select value={flow.on.kind} onChange={e => set({on: {...flow.on, kind: e.target.value as Flow['on']['kind'], type: flow.on.type || types[0]?.id || ''}, ...(e.target.value === 'record' ? {} : {if: []})})} aria-label="무엇이 시작하나">
        {Object.entries(TRIGGERS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      {flow.on.kind === 'time' && <label className="inline"><span className="k">시각</span><input type="time" className="time-in" value={flow.on.at} onChange={e => e.target.value && set({on: {...flow.on, at: e.target.value}})} /></label>}
      {flow.on.kind === 'record' && <><div className="inline">{typeSel(flow.on.type, id => set({on: {...flow.on, type: id}, if: []}), '어느 기록')} 기록이
        <select value={flow.on.event} onChange={e => set({on: {...flow.on, event: e.target.value as Flow['on']['event']}})} aria-label="언제"><option value="created">생기면</option><option value="changed">바뀌면</option><option value="any">생기거나 바뀌면</option></select></div>
      <div className="chips">{VERBS.map(v => <button key={v} className={`chip ${flow.on.verbs.includes(v) ? 'on' : ''}`} aria-pressed={flow.on.verbs.includes(v)} onClick={() => set({on: {...flow.on, verbs: flow.on.verbs.includes(v) ? flow.on.verbs.filter(x => x !== v) : [...flow.on.verbs, v]}})}>{VERB_NAMES[v]}</button>)}</div></>}
    </div>
    <div className="flow-part"><span className="flow-k">조건</span>
      {flow.on.kind === 'record' && <CondsEditor conds={flow.if} type={t} onChange={c => set({if: c})} label="이 기록의 조건" />}
      {flow.ifAgg.map((c, i) => { const at = types.find(x => x.id === c.type); const put = (p: Partial<typeof c>) => set({ifAgg: flow.ifAgg.map((x, j) => j === i ? {...x, ...p} : x)}); return <div key={i} className="inline cond">
        <select value={c.period} onChange={e => put({period: e.target.value as typeof c.period})} aria-label="기간"><option value="today">오늘</option><option value="week">이번 주</option><option value="month">이번 달</option></select>
        {typeSel(c.type, id => put({type: id, of: ''}), '어느 기록')}
        <select value={c.agg} onChange={e => put({agg: e.target.value as typeof c.agg})} aria-label="계산">{AGGS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {!['count', 'streak', 'days'].includes(c.agg) && <select value={c.of} onChange={e => put({of: e.target.value})} aria-label="무엇의"><option value="">값</option><option value="duration">걸린 시간(분)</option>{at?.fields.filter(f => ['number', 'score', 'duration'].includes(f.kind)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
        <select value={c.op} onChange={e => put({op: e.target.value as typeof c.op})} aria-label="비교">{OPS.filter(o => ['lt', 'lte', 'gt', 'gte', 'eq', 'ne'].includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <input className="num" inputMode="decimal" value={c.value} onChange={e => put({value: Number(e.target.value) || 0})} aria-label="기준" />
        <button className="ghost small" onClick={() => set({ifAgg: flow.ifAgg.filter((_, j) => j !== i)})} aria-label="빼기">×</button></div>; })}
      <button className="ghost small" onClick={() => set({ifAgg: [...flow.ifAgg, {type: flow.on.type, agg: 'count', of: '', period: 'today', op: 'gte', value: 1}]})}>+ 합계 조건</button>
    </div>
    <div className="flow-part"><span className="flow-k">하기</span>
      {flow.do.map((a, i) => <div key={i} className="flow-act">
        <select value={a.do} onChange={e => setAct(i, e.target.value === 'open' ? {do: 'open', what: 'receipt-today'} : e.target.value === 'notify' ? {do: 'notify', text: '알림'} : e.target.value === 'create' ? {do: 'create', type: flow.on.type, verb: 'did', fields: {}, link: true} : e.target.value === 'update' ? {do: 'update', fields: {}} : {do: 'updateWhere', type: flow.on.type, conds: [], fields: {}, limit: 1})} aria-label="동작">
          <option value="notify">알림 띄우기</option><option value="open">화면 열기 (영수증·아침 상태)</option><option value="create">다른 기록에 한 줄 쓰기</option><option value="update">이 기록 값 바꾸기</option><option value="updateWhere">조건에 맞는 기록 값 바꾸기</option></select>
        {a.do === 'open' && <select value={a.what} onChange={e => setAct(i, {do: 'open', what: e.target.value as typeof a.what})} aria-label="무엇을 열지">{Object.entries(OPEN_WHAT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>}
        {a.do === 'notify' && <input value={a.text} maxLength={200} onChange={e => setAct(i, {...a, text: e.target.value || ' '})} aria-label="알림 문구" />}
        {a.do === 'create' && <div className="inline">{typeSel(a.type, id => setAct(i, {...a, type: id, fields: {}}), '어느 기록에')}
          <select value={a.verb} onChange={e => setAct(i, {...a, verb: e.target.value as typeof a.verb})} aria-label="동작 단어">{VERBS.map(v => <option key={v} value={v}>{VERB_NAMES[v]}</option>)}</select></div>}
        {a.do === 'updateWhere' && <><div className="inline">{typeSel(a.type, id => setAct(i, {...a, type: id, conds: [], fields: {}}), '어느 기록')} 중 <input className="num" value={a.limit} onChange={e => setAct(i, {...a, limit: Math.max(1, Number(e.target.value) || 1)})} aria-label="몇 개" />개</div>
          <CondsEditor conds={a.conds} type={types.find(x => x.id === a.type)} onChange={c => setAct(i, {...a, conds: c})} label="고를 조건" /></>}
        {a.do !== 'notify' && a.do !== 'open' && <FieldSets type={types.find(x => x.id === (a.do === 'update' ? flow.on.type : a.type))} src={t} fields={a.fields} onChange={fields => setAct(i, {...a, fields} as Action)} />}
        {flow.do.length > 1 && <button className="ghost small" onClick={() => set({do: flow.do.filter((_, j) => j !== i)})} aria-label="동작 빼기">×</button>}
      </div>)}
      <button className="ghost small" disabled={flow.do.length >= 6} onClick={() => set({do: [...flow.do, {do: 'notify', text: '알림'}]})}>+ 동작</button>
    </div>
    <div className="inline"><label className="row-check"><input type="checkbox" checked={flow.enabled} onChange={e => set({enabled: e.target.checked})} /> 켜기</label>
      <input value={flow.name} onChange={e => set({name: e.target.value})} placeholder="이름" maxLength={60} aria-label="자동화 이름" />
      {onDelete && <button className="ghost small danger" onClick={onDelete}>지우기</button>}</div>
  </div>;
}

/** Which fields an action sets, and to what: a fixed value, a value copied from the entry that started it, or now. */
function FieldSets({type, src, fields, onChange}: {type: TypeDef | undefined; src: TypeDef | undefined; fields: Record<string, unknown>; onChange: (f: Record<string, never>) => void}) {
  const fs = type?.fields ?? [];
  const entries = Object.entries(fields) as [string, {set?: unknown; copy?: string; now?: true}][];
  const put = (k: string, v: unknown) => onChange({...fields, [k]: v} as Record<string, never>);
  return <div className="fieldsets">
    {entries.map(([k, x]) => { const f = fs.find(y => y.id === k); const mode = 'copy' in x ? 'copy' : 'now' in x ? 'now' : 'set'; return <div key={k} className="inline cond">
      <span>{f?.name ?? k}</span>
      <select value={mode} onChange={e => put(k, e.target.value === 'copy' ? {copy: src?.fields[0]?.id ?? 'value'} : e.target.value === 'now' ? {now: true} : {set: ''})} aria-label="어떻게"><option value="set">값으로</option><option value="copy">시작한 기록에서</option><option value="now">지금 시각</option></select>
      {mode === 'set' && (f?.options.length ? <select value={String(x.set ?? '')} onChange={e => put(k, {set: e.target.value})} aria-label="값"><option value="" />{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
        : <input className="cond-v" value={String(x.set ?? '')} onChange={e => put(k, {set: e.target.value})} aria-label="값" />)}
      {mode === 'copy' && <select value={x.copy} onChange={e => put(k, {copy: e.target.value})} aria-label="어느 값">{fieldsFor(src).map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select>}
      <button className="ghost small" onClick={() => { const n = {...fields}; delete n[k]; onChange(n as Record<string, never>); }} aria-label="빼기">×</button></div>; })}
    {fs.some(f => !(f.id in fields)) && <select value="" onChange={e => e.target.value && put(e.target.value, {set: ''})} aria-label="바꿀 속성 추가"><option value="">+ 바꿀 속성</option>{fs.filter(f => !(f.id in fields)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
  </div>;
}
