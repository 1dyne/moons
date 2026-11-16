import {useEffect, useState} from 'react';
import {v2} from '@workspace/life-contract';
import {evalSignal, query, type Plan} from '@workspace/lit-core';
import {api, useLit} from './store.tsx';
import {AddProperty} from './Item.tsx';
import {newOptionId} from './model.ts';
import {AGG_NAMES, COLORS, CondEditor, En, IdPicker, KIND_NAMES, MEANING_NAMES, PERIOD_NAMES, ROLE_NAMES, SourceEditor, ValueInput, dbList, nameOf, propList, propsOf} from './ui.tsx';

// The user's structure: the property dictionary, databases (tags), lenses, signals and rules.
// Each editor keeps a draft and saves on 저장, so half-made rules never run.

type Tab = 'properties' | 'databases' | 'lenses' | 'signals' | 'rules';
const TABS: [Tab, string, string][] = [['properties', '속성 사전', 'Properties'], ['databases', 'DB(태그)', 'Databases'], ['lenses', '모아보기', 'Lenses'], ['signals', '상황', 'Signals'], ['rules', '규칙', 'Rules']];
export function DataScreen() {
  const [tab, setTab] = useState<Tab>('properties'), [sel, setSel] = useState<string | 'new' | null>(null);
  const {ws} = useLit();
  const list: [string, string, string][] = tab === 'properties' ? propsOf(ws).map(p => [p.id, p.body.name, `${KIND_NAMES[p.body.kind][1]}${p.body.role ? ` · ◆${ROLE_NAMES[p.body.role][1]}` : ''}`])
    : tab === 'databases' ? [...ws.databases.values()].map(d => [d.id, `${d.body.icon} ${d.body.name}`.trim(), `${[...ws.items.values()].filter(x => x.body.dbs.includes(d.id)).length}개`])
    : tab === 'lenses' ? [...ws.lenses.values()].map(l => [l.id, l.body.name, ''])
    : tab === 'signals' ? [...ws.signals.values()].map(s => [s.id, s.body.name, ''])
    : [...ws.rules.values()].map(r => [r.id, r.body.name || '(이름 없는 규칙)', `${r.body.enabled ? '켜짐' : '꺼짐'} · ${r.body.mode === 'auto' ? '자동' : '제안만'}`]);
  return <div className="data">
    <nav className="subtabs">{TABS.map(([t, n, en]) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setSel(null); }}>{n} <En>{en}</En></button>)}</nav>
    <div className="data-split">
      <ul className="data-list">
        <li><button className="primary small" onClick={() => setSel('new')}>+ 새로</button></li>
        {list.map(([id, n, sub]) => <li key={id}><button className={sel === id ? 'on' : ''} onClick={() => setSel(id)}><b>{n}</b><span className="muted small">{sub}</span></button></li>)}
      </ul>
      <div className="data-edit">{sel ? (
        tab === 'properties' ? <PropertyEditor key={sel} id={sel === 'new' ? null : sel} done={setSel} />
        : tab === 'databases' ? <DatabaseEditor key={sel} id={sel === 'new' ? null : sel} done={setSel} />
        : tab === 'lenses' ? <LensEditor key={sel} id={sel === 'new' ? null : sel} done={setSel} />
        : tab === 'signals' ? <SignalEditor key={sel} id={sel === 'new' ? null : sel} done={setSel} />
        : <RuleEditor key={sel} id={sel === 'new' ? null : sel} done={setSel} />) : <p className="muted">왼쪽에서 고르거나 새로 만들어 보세요.</p>}</div>
    </div>
  </div>;
}

function useDraft<T>(initial: T) { const [d, setD] = useState(initial); return [d, (x: Partial<T>) => setD(c => ({...c, ...x}))] as const; }
function SaveBar({kind, id, body, done, extra}: {kind: v2.V2Kind; id: string | null; body: unknown; done: (id: string | null) => void; extra?: React.ReactNode}) {
  const {save, remove} = useLit();
  return <div className="save-bar">
    <button className="primary" onClick={async () => { const r = await save(kind, body, id ?? undefined); if (r) done(r.id); }}>저장</button>
    {extra}
    {id && <button className="danger" onClick={() => { if (confirm('지울까요? 지워도 이력은 남아요.')) { void remove(id); done(null); } }}>지우기</button>}
  </div>;
}

function PropertyEditor({id, done}: {id: string | null; done: (id: string | null) => void}) {
  const {ws} = useLit(), cur = id ? ws.properties.get(id)?.body : undefined;
  const [d, set] = useDraft<v2.PropertyBody>(cur ?? v2.PropertyBody.parse({name: '새 칸', kind: 'text'}));
  const roles = v2.ROLES.filter(r => v2.ROLE_KINDS[r].includes(d.kind));
  const used = id ? [...ws.items.values()].filter(x => id in x.body.values).length : 0;
  const [mergeInto, setMergeInto] = useState('');
  return <div className="editor">
    <label><span className="k">이름</span><input value={d.name} onChange={e => set({name: e.target.value})} /></label>
    <label><span className="k">종류 <En>Kind</En></span><select value={d.kind} onChange={e => { const kind = e.target.value as v2.PropertyKind; set({kind, role: d.role && v2.ROLE_KINDS[d.role].includes(kind) ? d.role : null, formula: kind === 'formula' ? d.formula ?? {op: 'expr', expr: '0'} : null}); }}>{v2.PROPERTY_KINDS.map(k => <option key={k} value={k}>{KIND_NAMES[k][1]} · {KIND_NAMES[k][0]}</option>)}</select></label>
    {roles.length > 0 && <label><span className="k">역할 <En>Property role</En></span><select value={d.role ?? ''} onChange={e => set({role: (e.target.value || null) as v2.Role | null})}><option value="">(없음)</option>{roles.map(r => <option key={r} value={r}>{ROLE_NAMES[r][1]} · {ROLE_NAMES[r][0]}</option>)}</select></label>}
    {d.role && <p className="hint small">◆ lit이 이 칸의 뜻을 알아요. {d.role === 'done' ? '선택지마다 끝냄 / 안 끝냄 / 세지 않음을 정해 주세요. 진행률·끝낸 비율이 이걸 읽어요.' : d.role === 'start' || d.role === 'end' ? '타임스탬프·10분 칸이 이 칸을 써요 (어느 DB든).' : d.role === 'day' ? '항목이 어느 날의 것인지 정해요. 미루기·오늘 보기·달력이 이걸 써요.' : ''}</p>}
    <label><span className="k">설명</span><input value={d.desc} onChange={e => set({desc: e.target.value})} placeholder="무엇을 적는 칸인지 한 줄 (사람과 AI가 읽어요)" /></label>
    {['number', 'duration', 'formula'].includes(d.kind) && <label><span className="k">단위</span><input value={d.unit} onChange={e => set({unit: e.target.value})} /></label>}
    {d.kind === 'rating' && <label><span className="k">최대</span><input type="number" min={2} max={100} value={d.max} onChange={e => set({max: Number(e.target.value)})} /></label>}
    {(d.kind === 'select' || d.kind === 'multi') && <div className="options"><span className="k">선택지 (달성 단계)</span>
      {d.options.map((o, i) => <div key={o.id} className="row">
        <input value={o.name} onChange={e => set({options: d.options.map((x, j) => j === i ? {...x, name: e.target.value} : x)})} />
        <select value={o.color} onChange={e => set({options: d.options.map((x, j) => j === i ? {...x, color: e.target.value} : x)})} aria-label="색">{COLORS.map(c => <option key={c} value={c}>{c || '색 없음'}</option>)}</select>
        {d.role === 'done' && <select value={o.meaning ?? ''} onChange={e => set({options: d.options.map((x, j) => j === i ? {...x, meaning: (e.target.value || null) as v2.Meaning | null} : x)})} aria-label="뜻">{(['', ...v2.MEANINGS] as const).map(m => <option key={m} value={m}>{m ? MEANING_NAMES[m] : '(뜻 없음)'}</option>)}</select>}
        <button className="ghost small" disabled={i === 0} onClick={() => { const l = [...d.options]; [l[i - 1], l[i]] = [l[i]!, l[i - 1]!]; set({options: l}); }}>↑</button>
        <button className="ghost small" onClick={() => set({options: d.options.filter((_, j) => j !== i)})}>✕</button>
      </div>)}
      <button className="small" onClick={() => set({options: [...d.options, {id: newOptionId(), name: `선택지 ${d.options.length + 1}`, color: '', meaning: d.role === 'done' ? 'open' : null}]})}>+ 선택지</button>
    </div>}
    {d.kind === 'relation' && <><label><span className="k">어느 DB와</span><select value={d.relation?.db ?? ''} onChange={e => set({relation: {db: e.target.value || null, many: d.relation?.many ?? true}})}><option value="">(어느 항목이든)</option>{dbList(ws).map(([i, n]) => <option key={i} value={i}>{n}</option>)}</select></label>
      <label className="inline"><input type="checkbox" checked={d.relation?.many ?? true} onChange={e => set({relation: {db: d.relation?.db ?? null, many: e.target.checked}})} /> 여러 개</label></>}
    {d.kind === 'formula' && d.formula && <FormulaEditor f={d.formula} onChange={formula => set({formula})} />}
    <SaveBar kind="property" id={id} body={d} done={done} />
    {id && <div className="merge"><p className="muted small">이 칸을 쓰는 항목 {used}개</p>
      <label><span className="k">다른 칸에 합치기 <En>Merge</En></span><select value={mergeInto} onChange={e => setMergeInto(e.target.value)}><option value="">고르기</option>{propList(ws, p => p.id !== id).map(([i, n]) => <option key={i} value={i}>{n}</option>)}</select></label>
      {mergeInto && <MergeButton from={id} into={mergeInto} done={() => done(mergeInto)} />}</div>}
  </div>;
}
export function MergeButton({from, into, done}: {from: string; into: string; done: () => void}) {
  const {pull, toast, ws} = useLit();
  return <button className="small" onClick={async () => { if (!confirm(`“${nameOf(ws, from)}”을 “${nameOf(ws, into)}”에 합칠까요? 값과 필터·규칙·계산이 함께 옮겨가요.`)) return; try { const r = await api.merge(from, into); toast(`${r.changed}개를 옮겼어요`); await pull(); done(); } catch (e) { toast((e as Error).message, 'error'); } }}>합치기</button>;
}
const OPS_F: [v2.Formula['op'], string, string][] = [['diff', '차이', 'A − B'], ['rollup', '모아 계산', 'Rollup'], ['latest', '지난번 값', 'Latest'], ['ifThen', '조건', 'If'], ['expr', '직접 식', 'Expression']];
function FormulaEditor({f, onChange}: {f: v2.Formula; onChange: (f: v2.Formula) => void}) {
  const {ws} = useLit(), props = propList(ws), rel = propList(ws, p => p.body.kind === 'relation');
  const pick = (v: string | null, set: (id: string) => void, l = props) => <select value={v ?? ''} onChange={e => set(e.target.value)}><option value="">고르기</option>{l.map(([i, n]) => <option key={i} value={i}>{n}</option>)}</select>;
  return <fieldset className="formula"><legend>계산 <En>Formula</En></legend>
    <div className="chips">{OPS_F.map(([op, n, en]) => <button key={op} className={`chip ${f.op === op ? 'on' : ''}`} onClick={() => onChange(op === 'diff' ? {op, a: '' as never, b: '' as never} : op === 'rollup' ? {op, via: '' as never, back: true, of: null, agg: 'doneRatio'} : op === 'latest' ? {op, of: '' as never, match: '' as never} : op === 'ifThen' ? {op, when: [], then: '', else: null} : {op: 'expr', expr: ''})}>{n} <En>{en}</En></button>)}</div>
    {f.op === 'diff' && <div className="row">{pick(f.a, a => onChange({...f, a}))} − {pick(f.b, b => onChange({...f, b}))}<span className="muted small">시각끼리면 분, 날짜끼리면 일</span></div>}
    {f.op === 'rollup' && <div className="col">
      <label><span className="k">연결</span>{pick(f.via, via => onChange({...f, via}), rel)}</label>
      <label className="inline"><input type="checkbox" checked={f.back} onChange={e => onChange({...f, back: e.target.checked})} /> 반대쪽에서 (이 항목을 가리키는 항목들)</label>
      <label><span className="k">집계</span><select value={f.agg} onChange={e => onChange({...f, agg: e.target.value as v2.Aggregate})}>{v2.AGGREGATES.map(a => <option key={a} value={a}>{AGG_NAMES[a][1]} · {AGG_NAMES[a][0]}</option>)}</select></label>
      {!['count', 'doneRatio', 'days', 'streak'].includes(f.agg) && <label><span className="k">어느 칸</span>{pick(f.of, of => onChange({...f, of}))}</label>}
    </div>}
    {f.op === 'latest' && <div className="col"><label><span className="k">값</span>{pick(f.of, of => onChange({...f, of}))}</label><label><span className="k">같은 것끼리</span>{pick(f.match, match => onChange({...f, match}))}</label></div>}
    {f.op === 'ifThen' && <div className="col"><CondEditor conds={f.when} onChange={when => onChange({...f, when})} /><label><span className="k">이면</span><input value={String(f.then ?? '')} onChange={e => onChange({...f, then: e.target.value})} /></label><label><span className="k">아니면</span><input value={String(f.else ?? '')} onChange={e => onChange({...f, else: e.target.value || null})} /></label></div>}
    {f.op === 'expr' && <div className="col"><textarea className="mono" value={f.expr} onChange={e => onChange({...f, expr: e.target.value})} rows={2} /><div className="chips">{props.map(([i, n]) => <button key={i} className="chip" onClick={() => onChange({...f, expr: `${f.expr} {${i}}`})}>+ {n}</button>)}</div><p className="muted small">숫자, + − * / ( ) 와 칸 {'{…}'} 만 써요.</p></div>}
  </fieldset>;
}

function DatabaseEditor({id, done}: {id: string | null; done: (id: string | null) => void}) {
  const {ws} = useLit(), cur = id ? ws.databases.get(id)?.body : undefined;
  const [d, set] = useDraft<v2.DatabaseBody>(cur ?? v2.DatabaseBody.parse({name: '새 DB'}));
  return <div className="editor">
    <label><span className="k">이름</span><input value={d.name} onChange={e => set({name: e.target.value})} /></label>
    <label><span className="k">아이콘</span><input value={d.icon} onChange={e => set({icon: e.target.value})} placeholder="이모지 하나" maxLength={4} /></label>
    <label><span className="k">설명</span><input value={d.desc} onChange={e => set({desc: e.target.value})} /></label>
    <IdPicker label="이 DB의 항목이 보통 가지는 칸" ids={propList(ws)} value={d.properties} onChange={properties => set({properties})} />
    <AddProperty onAdd={pid => set({properties: [...d.properties, pid]})} />
    <label className="inline"><input type="checkbox" checked={d.focus} onChange={e => set({focus: e.target.checked})} /> 시작~끝 시간을 순집중에 더하기</label>
    {d.from && <p className="muted small">템플릿에서 왔어요 · 마음대로 고쳐도 돼요</p>}
    <SaveBar kind="database" id={id} body={d} done={done} />
  </div>;
}

function LensEditor({id, done}: {id: string | null; done: (id: string | null) => void}) {
  const {ws, ctx} = useLit(), cur = id ? ws.lenses.get(id)?.body : undefined;
  const [d, set] = useDraft<v2.LensBody>(cur ?? v2.LensBody.parse({name: '새 모아보기'}));
  const count = query({...ws, lenses: new Map(ws.lenses).set('__draft', {id: '__draft', body: d} as never)}, {lens: '__draft'}, ctx).length;
  return <div className="editor">
    <label><span className="k">이름</span><input value={d.name} onChange={e => set({name: e.target.value})} /></label>
    <SourceEditor src={{lens: null, dbs: d.dbs, where: d.where}} onChange={s => set({dbs: s.dbs, where: s.where})} />
    <label className="inline"><input type="checkbox" checked={d.archived} onChange={e => set({archived: e.target.checked})} /> 보관한 것만 보기</label>
    <p className="muted small">지금 맞는 항목 {count}개 · 위젯·규칙·상황 어디서나 DB 대신 쓸 수 있어요</p>
    <SaveBar kind="lens" id={id} body={d} done={done} />
  </div>;
}

function SignalEditor({id, done}: {id: string | null; done: (id: string | null) => void}) {
  const {ws, ctx} = useLit(), cur = id ? ws.signals.get(id)?.body : undefined;
  const [d, set] = useDraft<v2.SignalBody>(cur ?? v2.SignalBody.parse({name: '새 상황', measure: {}, op: 'gte', compare: {n: 1}}));
  const m = d.measure, setM = (x: Partial<v2.SignalBody['measure']>) => set({measure: {...m, ...x}});
  const now = evalSignal({...ws, signals: new Map(ws.signals).set('__draft', {id: '__draft', body: d} as never)}, '__draft', ctx);
  return <div className="editor">
    <label><span className="k">이름</span><input value={d.name} onChange={e => set({name: e.target.value})} /></label>
    <fieldset><legend>무엇을 잴까</legend>
      <SourceEditor src={m} onChange={s => setM(s)} />
      <label><span className="k">기간</span><select value={m.period} onChange={e => setM({period: e.target.value as v2.SignalBody['measure']['period']})}>{v2.PERIODS.map(p => <option key={p} value={p}>{PERIOD_NAMES[p]}</option>)}</select></label>
      <label><span className="k">집계</span><select value={m.agg} onChange={e => setM({agg: e.target.value as v2.Aggregate})}>{v2.AGGREGATES.map(a => <option key={a} value={a}>{AGG_NAMES[a][1]}</option>)}</select></label>
      {!['count', 'doneRatio', 'days', 'streak'].includes(m.agg) && <label><span className="k">어느 칸</span><select value={m.of ?? ''} onChange={e => setM({of: e.target.value || null})}><option value="">고르기</option>{propList(ws).map(([i, n]) => <option key={i} value={i}>{n}</option>)}</select></label>}
    </fieldset>
    <div className="row"><select value={d.op} onChange={e => set({op: e.target.value as v2.SignalBody['op']})}>{(['gte', 'gt', 'lte', 'lt', 'is', 'isNot'] as const).map(o => <option key={o} value={o}>{{gte: '≥', gt: '>', lte: '≤', lt: '<', is: '=', isNot: '≠'}[o]}</option>)}</select>
      <select value={'n' in d.compare ? 'n' : 'signal'} onChange={e => set({compare: e.target.value === 'n' ? {n: 0} : {signal: [...ws.signals.keys()][0] ?? ('' as never)}})}><option value="n">숫자</option><option value="signal">다른 상황의 값</option></select>
      {'n' in d.compare ? <input type="number" value={d.compare.n} onChange={e => set({compare: {n: Number(e.target.value)}})} /> : <select value={d.compare.signal} onChange={e => set({compare: {signal: e.target.value}})}>{[...ws.signals.values()].filter(s => s.id !== id).map(s => <option key={s.id} value={s.id}>{s.body.name}</option>)}</select>}</div>
    <p className={`now ${now.met ? 'met' : ''}`}>지금: {String(now.value ?? '–')} {now.target !== null ? `/ ${now.target}` : ''} → {now.met ? '맞음 ✓' : '아직'}</p>
    <SaveBar kind="signal" id={id} body={d} done={done} />
  </div>;
}

const ACTION_NAMES: Record<v2.Action['do'], [string, string]> = {set: ['Update item', '칸 바꾸기'], create: ['Create item', '항목 만들기'], createEach: ['Repeat', '하루에 하나씩 만들기'], archive: ['Archive', '보관'], notify: ['Notify', '알림'], effect: ['Effect', '움직임'], openForm: ['Open form', '기록지 열기'], goTo: ['Go to', '이동']};
const EFFECTS = ['sparkle', 'bounce', 'shake', 'pulse', 'glow', 'pop', 'confetti', 'celebrate'];
function RuleEditor({id, done}: {id: string | null; done: (id: string | null) => void}) {
  const {ws, screen} = useLit(), cur = id ? ws.rules.get(id)?.body : undefined;
  const [d, set] = useDraft<v2.RuleBody>(cur ?? v2.RuleBody.parse({name: '새 규칙', on: {kind: 'enter'}, do: [{do: 'notify', text: '{title}'}]}));
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => setPlans(null), [d]);
  const act = (i: number, a: v2.Action) => set({do: d.do.map((x, j) => j === i ? a : x)});
  return <div className="editor rule">
    <label><span className="k">이름</span><input value={d.name} onChange={e => set({name: e.target.value})} /></label>
    <div className="row"><label className="inline"><input type="checkbox" checked={d.enabled} onChange={e => set({enabled: e.target.checked})} /> 켜기</label>
      <label><span className="k">방식</span><select value={d.mode} onChange={e => set({mode: e.target.value as 'auto' | 'suggest'})}><option value="auto">자동 Auto</option><option value="suggest">제안만 Suggest</option></select></label></div>
    <fieldset><legend>언제 <En>Trigger</En></legend>
      <select value={d.on.kind} onChange={e => set({on: {...d.on, kind: e.target.value as v2.RuleBody['on']['kind']}})}>
        <option value="enter">항목이 조건에 들어오면</option><option value="change">조건에 맞는 항목이 생기거나 바뀔 때마다</option><option value="signal">상황이 되면</option><option value="dayStart">하루가 시작되면</option><option value="time">정한 시각에</option><option value="open">항목을 열면 (화면)</option>
      </select>
      {d.on.kind === 'signal' && <select value={d.on.signal ?? ''} onChange={e => set({on: {...d.on, signal: e.target.value || null}})}><option value="">상황 고르기</option>{[...ws.signals.values()].map(s => <option key={s.id} value={s.id}>{s.body.name}</option>)}</select>}
      {d.on.kind === 'time' && <input type="time" value={d.on.at} onChange={e => set({on: {...d.on, at: e.target.value}})} />}
    </fieldset>
    <fieldset><legend>어떤 항목 <En>Source</En></legend><SourceEditor src={d.source} onChange={source => set({source})} />
      <span className="k">만약 <En>If</En></span><CondEditor conds={d.if} onChange={x => set({if: x})} /></fieldset>
    <fieldset><legend>하면 <En>Action</En></legend>
      {d.do.map((a, i) => <div key={i} className="action">
        <select value={a.do} onChange={e => { const k = e.target.value as v2.Action['do']; act(i, v2.Action.parse(k === 'set' ? {do: k, values: {}} : k === 'create' ? {do: k, dbs: []} : k === 'createEach' ? {do: k, dbs: [], link: [...ws.properties.values()].find(p => p.body.kind === 'relation')?.id ?? '00000000000000000000000000'} : k === 'notify' ? {do: k, text: '{title}'} : k === 'effect' ? {do: k, name: 'sparkle'} : k === 'openForm' ? {do: k, dbs: [], props: []} : k === 'goTo' ? {do: k, page: screen.pages[0]?.id ?? 'x'} : {do: k})); }}>{Object.entries(ACTION_NAMES).map(([k, [en, n]]) => <option key={k} value={k}>{n} · {en}</option>)}</select>
        {(a.do === 'set' || a.do === 'create' || a.do === 'createEach') && <ValuesEditor values={a.values} onChange={values => act(i, {...a, values})} />}
        {(a.do === 'create' || a.do === 'createEach' || a.do === 'openForm') && <IdPicker label="어느 DB에" ids={dbList(ws)} value={a.dbs} onChange={dbs => act(i, {...a, dbs})} />}
        {a.do === 'createEach' && <label><span className="k">원본과 잇는 연결 칸</span><select value={a.link} onChange={e => act(i, {...a, link: e.target.value})}>{propList(ws, p => p.body.kind === 'relation').map(([pid, n]) => <option key={pid} value={pid}>{n}</option>)}</select></label>}
        {a.do === 'notify' && <input value={a.text} onChange={e => act(i, {...a, text: e.target.value})} placeholder="{title} 은 항목 이름" />}
        {a.do === 'effect' && <select value={a.name} onChange={e => act(i, {...a, name: e.target.value})}>{EFFECTS.map(x => <option key={x}>{x}</option>)}</select>}
        {a.do === 'openForm' && <><IdPicker label="채울 칸" ids={propList(ws, p => p.body.kind !== 'formula')} value={a.props} onChange={props => act(i, {...a, props})} />
          <label><span className="k">제목</span><input value={a.title} onChange={e => act(i, {...a, title: e.target.value})} /></label>
          <label><span className="k">원래 항목과 잇는 칸</span><select value={a.link ?? ''} onChange={e => act(i, {...a, link: e.target.value || null})}><option value="">(안 이음)</option>{propList(ws, p => p.body.kind === 'relation').map(([pid, n]) => <option key={pid} value={pid}>{n}</option>)}</select></label></>}
        {a.do === 'goTo' && <><select value={a.page} onChange={e => act(i, {...a, page: e.target.value})}>{screen.pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><label className="inline"><input type="checkbox" checked={a.carry} onChange={e => act(i, {...a, carry: e.target.checked})} /> 항목을 들고 가기</label></>}
        <button className="ghost small" onClick={() => set({do: d.do.filter((_, j) => j !== i)})}>✕</button>
      </div>)}
      <button className="small" onClick={() => set({do: [...d.do, {do: 'notify', text: '{title}'}]})}>+ 하면</button>
    </fieldset>
    <SaveBar kind="rule" id={id} body={d} done={done} extra={id && <button onClick={async () => setPlans((await api.preview(id)).plans)}>미리보기 <En>Preview</En></button>} />
    {plans && <div className="plans"><p><b>지금 켜면 {plans.length}개 항목에</b> (저장한 규칙 기준)</p><PlanList plans={plans} /></div>}
  </div>;
}
export function PlanList({plans, accept}: {plans: Plan[]; accept?: (p: Plan) => void}) {
  const {ws} = useLit();
  return <ul className="plan-list">{plans.slice(0, 50).map((p, i) => <li key={i}>
    <b>{p.item ? nameOf(ws, p.item) : '전체'}</b>
    {p.writes.map((w, j) => <span key={j} className="small"> · {w.op === 'archive' ? '보관' : w.op === 'create' ? `새 항목 (${w.dbs.map(x => nameOf(ws, x)).join(', ')})` : Object.entries(w.values).map(([k, v]) => `${nameOf(ws, k)} → ${v === null ? '비움' : String(Array.isArray(v) ? v.length + '개' : ws.properties.get(k)?.body.options.find(o => o.id === v)?.name ?? v)}`).join(', ')}</span>)}
    {p.effects.map((e, j) => <span key={'e' + j} className="small muted"> · {e.kind === 'notify' ? `알림 “${e.text}”` : e.kind}</span>)}
    {accept && <button className="small" onClick={() => accept(p)}>적용</button>}
  </li>)}</ul>;
}
function ValuesEditor({values, onChange}: {values: Record<string, v2.ValueExpr>; onChange: (v: Record<string, v2.ValueExpr>) => void}) {
  const {ws} = useLit(), [add, setAdd] = useState('');
  return <div className="values">
    {Object.entries(values).map(([pid, e]) => { const p = ws.properties.get(pid); const kind = 'set' in e ? 'set' : 'copy' in e ? 'copy' : 'now' in e ? 'now' : 'today' in e ? 'today' : 'link'; return <div key={pid} className="row">
      <span className="k">{p?.body.name ?? '?'}</span>
      <select value={kind} onChange={ev => { const k = ev.target.value; onChange({...values, [pid]: k === 'set' ? {set: null} : k === 'copy' ? {copy: pid} : k === 'now' ? {now: true} : k === 'today' ? {today: true} : {link: true}}); }}>
        <option value="set">값</option><option value="copy">원래 항목의 같은 칸</option><option value="now">지금 시각</option><option value="today">오늘</option><option value="link">원래 항목과 연결</option></select>
      {'set' in e && p && <ValueInput p={p} value={e.set} onChange={v => onChange({...values, [pid]: {set: v}})} />}
      {'copy' in e && <select value={e.copy} onChange={ev => onChange({...values, [pid]: {copy: ev.target.value}})}>{propList(ws).map(([i, n]) => <option key={i} value={i}>{n}</option>)}</select>}
      <button className="ghost small" onClick={() => { const x = {...values}; delete x[pid]; onChange(x); }}>✕</button></div>; })}
    <div className="row"><select value={add} onChange={e => setAdd(e.target.value)}><option value="">+ 칸</option>{propList(ws, p => p.body.kind !== 'formula' && !(p.id in values)).map(([i, n]) => <option key={i} value={i}>{n}</option>)}</select>{add && <button className="small" onClick={() => { onChange({...values, [add]: {set: null}}); setAdd(''); }}>넣기</button>}</div>
  </div>;
}
