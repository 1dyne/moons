import {useState} from 'react';
import {EFFECTS, Flow, OPEN_WHAT, SIGNALS, Signal, flowSentence, newLogicId, signalText, type Action, type Cond, type TypeDef} from '@workspace/planner-spec';

// The rule editor (docs/lit/BLOCKS.md §4): a rule is cards stacked top to bottom — 언제 (yellow), 만약 (orange),
// 하기 (blue; 효과 purple). Every blank in a card is a chip you tap to choose, and only things of the right kind are
// offered there (a 속성 chip lists the properties of the DB chosen above). 코드 shows the same rule as JSON (developers, Claude).
type Goal = {id: string; title: string};
const fieldsOf = (t: TypeDef | undefined) => (t?.fields ?? []).map(f => ({id: f.id, name: f.name, options: f.options, kind: f.kind}));
const SYS = [{id: 'value', name: '값'}, {id: 'duration', name: '걸린 시간(분)'}];

export function newRule(type: string): Flow {
  return Flow.parse({id: newLogicId(), on: {kind: 'record', type, event: 'created'}, do: [{do: 'notify', text: '알림'}]});
}

export function RuleCards({flow, types, goals, onChange, onDelete}: {flow: Flow; types: TypeDef[]; goals: Goal[]; onChange: (f: Flow) => void; onDelete?: () => void}) {
  const [code, setCode] = useState(false), [text, setText] = useState(''), [err, setErr] = useState('');
  const set = (p: Partial<Flow>) => onChange({...flow, ...p});
  const on = flow.on, t = types.find(x => x.id === on.type), hasItem = on.kind === 'record' || on.kind === 'item';
  const dbSel = (v: string, put: (id: string) => void) => <select className="chip-sel" value={v} onChange={e => put(e.target.value)} aria-label="DB">{types.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
  const setAct = (i: number, a: Action) => set({do: flow.do.map((x, j) => j === i ? a : x)});
  return <div className={`rule ${flow.enabled ? '' : 'off'}`}>
    <div className="rule-top">
      <input className="rule-name" value={flow.name} onChange={e => set({name: e.target.value})} placeholder="규칙 이름" maxLength={60} aria-label="규칙 이름" />
      <label className="row-check small"><input type="checkbox" checked={flow.enabled} onChange={e => set({enabled: e.target.checked})} /> 켜기</label>
      <span className="seg small" role="radiogroup" aria-label="보기">{([['card', '카드'], ['code', '코드']] as const).map(([k, n]) => <button key={k} role="radio" aria-checked={code === (k === 'code')} className={code === (k === 'code') ? 'on' : ''}
        onClick={() => { setCode(k === 'code'); setText(JSON.stringify(flow, null, 2)); setErr(''); }}>{n}</button>)}</span>
    </div>
    {code ? <div className="rule-code">
      <textarea spellCheck={false} rows={14} value={text} onChange={e => setText(e.target.value)} aria-label="규칙 코드" />
      {err && <p className="error small">{err}</p>}
      <button className="small primary" onClick={() => { try { const r = Flow.safeParse(JSON.parse(text)); if (!r.success) { setErr(r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join(' · ')); return; } onChange(r.data); setErr(''); setCode(false); } catch (e) { setErr((e as Error).message); } }}>적용</button>
    </div> : <>
      {/* 언제 */}
      <div className="rc rc-when"><span className="rc-k">언제</span>
        <select className="chip-sel" value={on.kind} onChange={e => set({on: {...on, kind: e.target.value as Flow['on']['kind'], type: on.type || types[0]?.id || '', field: e.target.value === 'item' ? (fieldsOf(t).find(f => f.kind === 'signal')?.id ?? '') : on.field,
          signal: e.target.value === 'signal' ? on.signal ?? Signal.parse({kind: 'tasksAll'}) : on.signal}, ...(e.target.value === 'record' || e.target.value === 'item' ? {} : {if: []})})} aria-label="언제">
          <option value="record">DB에 항목이 생기거나 바뀌면</option><option value="item">항목마다 그 항목의 상황이 되면</option><option value="signal">상황이 되면</option>
          <option value="time">매일 정한 시각에</option><option value="dayStart">하루를 시작하면</option><option value="wake">일어났어요를 누르면</option></select>
        <div className="rc-line">
          {on.kind === 'record' && <>{dbSel(on.type, id => set({on: {...on, type: id}, if: []}))}에 항목이
            <select className="chip-sel" value={on.event} onChange={e => set({on: {...on, event: e.target.value as Flow['on']['event']}})} aria-label="언제"><option value="created">추가되면</option><option value="changed">수정되면</option><option value="any">추가·수정되면</option></select></>}
          {on.kind === 'item' && <>{dbSel(on.type, id => set({on: {...on, type: id, field: fieldsOf(types.find(x => x.id === id)).find(f => f.kind === 'signal')?.id ?? ''}, if: []}))}의 항목마다, 그 항목의
            <select className="chip-sel" value={on.field} onChange={e => set({on: {...on, field: e.target.value}})} aria-label="상황 속성"><option value="">상황 속성</option>{fieldsOf(t).filter(f => f.kind === 'signal').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>이 되면</>}
          {on.kind === 'signal' && <><SignalChip value={on.signal} goals={goals} types={types} onChange={sg => set({on: {...on, signal: sg}})} />이 되면</>}
          {on.kind === 'time' && <>매일 <input type="time" className="chip-sel time-in" value={on.at} onChange={e => e.target.value && set({on: {...on, at: e.target.value}})} aria-label="시각" />에</>}
          {on.kind === 'dayStart' && <span className="muted small">그날 플래너를 처음 열 때</span>}
          {on.kind === 'wake' && <span className="muted small">수면 위젯의 일어났어요</span>}
        </div>
      </div>
      {/* 만약 */}
      {hasItem && flow.if.map((c, i) => <CondCard key={`if${i}`} c={c} t={t} onChange={x => set({if: flow.if.map((y, j) => j === i ? x : y)})} onDelete={() => set({if: flow.if.filter((_, j) => j !== i)})} />)}
      {flow.when.map((sg, i) => <div key={`w${i}`} className="rc rc-if"><span className="rc-k">만약</span><div className="rc-line"><SignalChip value={sg} goals={goals} types={types} onChange={x => x && set({when: flow.when.map((y, j) => j === i ? x : y)})} />이면</div>
        <button className="ghost small rc-x" onClick={() => set({when: flow.when.filter((_, j) => j !== i)})} aria-label="빼기">×</button></div>)}
      <div className="rc-add">
        {hasItem && <button className="ghost small" onClick={() => set({if: [...flow.if, {field: fieldsOf(t)[0]?.id ?? 'value', op: 'eq', value: ''}]})}>+ 만약 (그 항목의 속성)</button>}
        <button className="ghost small" disabled={flow.when.length >= 4} onClick={() => set({when: [...flow.when, Signal.parse({kind: 'tasksAll'})]})}>+ 만약 (상황)</button>
      </div>
      {/* 하기 */}
      {flow.do.map((a, i) => <div key={`d${i}`} className={`rc ${a.do === 'effect' ? 'rc-fx' : 'rc-do'}`}><span className="rc-k">{a.do === 'effect' ? '효과' : '하기'}</span>
        <div className="rc-line">
          <select className="chip-sel" value={a.do} onChange={e => setAct(i, blank(e.target.value as Action['do'], on.type))} aria-label="하기">
            {hasItem && <option value="update">그 항목 고치기</option>}<option value="notify">알림</option><option value="effect">효과</option><option value="open">화면 열기</option>
            <option value="create">DB에 항목 추가</option><option value="updateWhere">다른 항목 고치기</option></select>
          {a.do === 'notify' && <input className="chip-in" value={a.text} maxLength={200} onChange={e => setAct(i, {...a, text: e.target.value || ' '})} aria-label="알림 문구" />}
          {a.do === 'open' && <select className="chip-sel" value={a.what} onChange={e => setAct(i, {...a, what: e.target.value as typeof a.what})} aria-label="무엇을">{Object.entries(OPEN_WHAT).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>}
          {a.do === 'effect' && <><select className="chip-sel" value={a.target} onChange={e => setAct(i, {...a, target: e.target.value as typeof a.target})} aria-label="어디에">{hasItem && <option value="item">그 카드에</option>}<option value="widget">위젯에</option></select>
            <select className="chip-sel" value={a.name} onChange={e => setAct(i, {...a, name: e.target.value as typeof a.name})} aria-label="효과">{EFFECTS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></>}
          {a.do === 'create' && <>{dbSel(a.type, id => setAct(i, {...a, type: id, fields: {}}))}에 항목 추가</>}
          {a.do === 'updateWhere' && <>{dbSel(a.type, id => setAct(i, {...a, type: id, conds: [], fields: {}}))}에서 <input className="chip-in num" value={a.limit} onChange={e => setAct(i, {...a, limit: Math.max(1, Number(e.target.value) || 1)})} aria-label="몇 개" />개</>}
        </div>
        {a.do === 'updateWhere' && a.conds.map((c, k) => <CondCard key={k} c={c} t={types.find(x => x.id === a.type)} inner onChange={x => setAct(i, {...a, conds: a.conds.map((y, j) => j === k ? x : y)})} onDelete={() => setAct(i, {...a, conds: a.conds.filter((_, j) => j !== k)})} />)}
        {a.do === 'updateWhere' && <button className="ghost small" onClick={() => setAct(i, {...a, conds: [...a.conds, {field: fieldsOf(types.find(x => x.id === a.type))[0]?.id ?? 'value', op: 'eq', value: ''}]})}>+ 고를 조건</button>}
        {(a.do === 'update' || a.do === 'create' || a.do === 'updateWhere') && <Sets t={types.find(x => x.id === (a.do === 'update' ? on.type : a.type))} fields={a.fields as Record<string, never>} onChange={fields => setAct(i, {...a, fields} as Action)} />}
        {flow.do.length > 1 && <button className="ghost small rc-x" onClick={() => set({do: flow.do.filter((_, j) => j !== i)})} aria-label="빼기">×</button>}
      </div>)}
      <div className="rc-add"><button className="ghost small" disabled={flow.do.length >= 8} onClick={() => set({do: [...flow.do, hasItem ? {do: 'update', fields: {}} : {do: 'notify', text: '알림'}]})}>+ 하기</button>
        <button className="ghost small" disabled={flow.do.length >= 8} onClick={() => set({do: [...flow.do, {do: 'effect', name: 'sparkle', target: hasItem ? 'item' : 'widget'}]})}>+ 효과</button></div>
    </>}
    <p className="rule-sentence">{flowSentence(flow, types, goals)}</p>
    {onDelete && <button className="ghost small danger" onClick={onDelete}>규칙 지우기</button>}
  </div>;
}

const blank = (k: Action['do'], type: string): Action => k === 'notify' ? {do: 'notify', text: '알림'} : k === 'open' ? {do: 'open', what: 'receipt-today'} : k === 'effect' ? {do: 'effect', name: 'sparkle', target: 'item'}
  : k === 'create' ? {do: 'create', type, verb: 'did', fields: {}, link: false} : k === 'update' ? {do: 'update', fields: {}} : {do: 'updateWhere', type, conds: [], fields: {}, limit: 1};

function CondCard({c, t, onChange, onDelete, inner}: {c: Cond; t: TypeDef | undefined; onChange: (c: Cond) => void; onDelete: () => void; inner?: boolean}) {
  const fs = [...fieldsOf(t).filter(f => f.kind !== 'signal'), ...SYS.map(f => ({...f, options: [] as string[], kind: 'sys'}))], f = fs.find(x => x.id === c.field);
  return <div className={inner ? 'rc-inner' : 'rc rc-if'}>{!inner && <span className="rc-k">만약</span>}<div className="rc-line">
    {inner ? '' : '그 항목의 '}<select className="chip-sel" value={c.field} onChange={e => onChange({...c, field: e.target.value, value: ''})} aria-label="속성">{fs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>이(가)
    {!['empty', 'filled'].includes(c.op) && (f?.options.length ? <select className="chip-sel" value={String(c.value)} onChange={e => onChange({...c, value: e.target.value})} aria-label="값"><option value="" />{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
      : <input className="chip-in" value={String(c.value)} onChange={e => onChange({...c, value: e.target.value !== '' && !Number.isNaN(Number(e.target.value)) ? Number(e.target.value) : e.target.value})} aria-label="값" />)}
    <select className="chip-sel" value={c.op} onChange={e => onChange({...c, op: e.target.value as Cond['op']})} aria-label="비교">
      <option value="eq">이면</option><option value="ne">이 아니면</option><option value="gte">이상이면</option><option value="lte">이하이면</option><option value="gt">초과이면</option><option value="lt">미만이면</option>
      <option value="has">이 들어 있으면</option><option value="empty">비어 있으면</option><option value="filled">채워져 있으면</option></select></div>
    <button className="ghost small rc-x" onClick={onDelete} aria-label="빼기">×</button></div>;
}

/** "[속성]을 [값]으로" lines for actions that write. */
function Sets({t, fields, onChange}: {t: TypeDef | undefined; fields: Record<string, {set?: unknown; now?: true; copy?: string}>; onChange: (f: Record<string, never>) => void}) {
  const fs = fieldsOf(t).filter(f => f.kind !== 'signal'), put = (k: string, v: unknown) => onChange({...fields, [k]: v} as Record<string, never>);
  return <div className="rc-sets">{Object.entries(fields).map(([k, x]) => { const f = fs.find(y => y.id === k); return <div key={k} className="rc-line">
    <span className="chip-tag">{f?.name ?? k}</span>을(를)
    {'now' in x ? <span className="chip-tag">지금 시각</span> : f?.options.length ? <select className="chip-sel" value={String(x.set ?? '')} onChange={e => put(k, {set: e.target.value})} aria-label="값"><option value="" />{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
      : <input className="chip-in" value={String(x.set ?? '')} onChange={e => put(k, {set: e.target.value})} aria-label="값" />}(으)로
    <button className="ghost small" onClick={() => { const n = {...fields}; delete n[k]; onChange(n as Record<string, never>); }} aria-label="빼기">×</button></div>; })}
    {fs.some(f => !(f.id in fields)) && <select className="chip-sel add" value="" onChange={e => e.target.value && put(e.target.value, fs.find(f => f.id === e.target.value)?.kind === 'time' ? {now: true} : {set: ''})} aria-label="바꿀 속성"><option value="">+ 바꿀 속성</option>{fs.filter(f => !(f.id in fields)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
  </div>;
}

/** A 상황 chip: tap to choose what it is and its number. */
function SignalChip({value, goals, types, onChange}: {value: Signal | null; goals: Goal[]; types: TypeDef[]; onChange: (s: Signal | null) => void}) {
  const [open, setOpen] = useState(false);
  const cur = value ?? Signal.parse({kind: 'tasksAll'}), info = SIGNALS.find(x => x.kind === cur.kind)!;
  const put = (p: Partial<Signal>) => onChange(Signal.parse({...cur, ...p}));
  return <span className="sig-chip">
    <button type="button" className="chip-tag sig" onClick={() => setOpen(!open)} aria-expanded={open}>{signalText(cur, {types} as never, goals)}</button>
    {open && <span className="sig-pop">
      <select value={cur.kind} onChange={e => put({kind: e.target.value as Signal['kind']})} aria-label="상황">{SIGNALS.map(x => <option key={x.kind} value={x.kind}>{x.name}</option>)}</select>
      {info.needs.includes('n') && <label className="inline"><input className="num" inputMode="decimal" value={cur.n} onChange={e => put({n: Number(e.target.value) || 0})} aria-label="기준" />{info.unit}</label>}
      {info.needs.includes('at') && <input type="time" className="time-in" value={cur.at} onChange={e => e.target.value && put({at: e.target.value})} aria-label="시각" />}
      {info.needs.includes('goal') && <select value={cur.goalId} onChange={e => put({goalId: e.target.value})} aria-label="목표"><option value="">목표</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}
      {cur.kind === 'db' && <><select value={cur.type} onChange={e => put({type: e.target.value})} aria-label="DB">{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select value={cur.period} onChange={e => put({period: e.target.value as Signal['period']})} aria-label="기간"><option value="today">오늘</option><option value="week">이번 주</option><option value="month">이번 달</option></select>
        <label className="inline"><input className="num" value={cur.n} onChange={e => put({n: Number(e.target.value) || 0})} aria-label="기준" />이상</label></>}
      <button type="button" className="small" onClick={() => setOpen(false)}>완료</button>
    </span>}
  </span>;
}
