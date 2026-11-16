import {useState} from 'react';
import {v2} from '@workspace/life-contract';
import {useLit} from './store.tsx';
import {PartView} from './Parts.tsx';
import {AGG_NAMES, CondEditor, En, IdPicker, PERIOD_NAMES, SourceEditor, dbList, propList} from './ui.tsx';

const VIEW_KINDS: v2.PartKind[] = ['checklist', 'list', 'table', 'gallery', 'cards', 'calendar', 'timegrid', 'metric', 'chart', 'breakdown'];
const WRITE_KINDS: v2.PartKind[] = ['capture', 'form', 'timestamp', 'timer', 'rating', 'counter'];
const LOOK_NAMES: Record<(typeof v2.LOOKS)[number], string> = {gray: '회색', faded: '흐리게', strike: '줄 긋기', hidden: '숨김', color: '색', bold: '굵게', bottom: '아래로'};

/** A part's settings, with the part itself drawn live underneath. */
export function PartEditor({part, day, onChange}: {part: v2.Part; day: string; onChange: (p: v2.Part) => void}) {
  const {ws} = useLit();
  const set = (x: Partial<v2.Part>) => onChange({...part, ...x});
  const view = (x: Partial<v2.View>) => set({view: {...part.view, ...x}});
  const k = part.kind, numeric = (id: string) => { const p = ws.properties.get(id); return !!p && ['number', 'rating', 'duration', 'formula'].includes(p.body.kind); };
  const choiceProps = propList(ws, p => ['select', 'multi', 'checkbox'].includes(p.body.kind));
  return <div className="part-editor">
    <label><span className="k">이름표</span><input value={part.label} onChange={e => set({label: e.target.value})} /></label>
    {k === 'heading' && <label><span className="k">글</span><textarea value={part.text} onChange={e => set({text: e.target.value})} rows={3} /></label>}
    {VIEW_KINDS.includes(k) && !(k === 'metric' && part.signal) && <fieldset><legend>어떤 항목을 <En>Source</En></legend>
      <SourceEditor src={part.view} onChange={s => view(s)} />
      <label><span className="k">기간</span><select value={part.view.period} onChange={e => view({period: e.target.value as v2.View['period']})}>{Object.entries(PERIOD_NAMES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
    </fieldset>}
    {['checklist', 'list', 'table', 'gallery', 'cards'].includes(k) && <fieldset><legend>보이기 <En>View</En></legend>
      <IdPicker label="줄에 보일 칸" ids={propList(ws)} value={part.view.show} onChange={show => view({show})} />
      <IdPicker label="⋯에서 바로 고칠 칸" ids={propList(ws, p => p.body.kind !== 'formula')} value={part.view.edit} onChange={edit => view({edit})} />
      <IdPicker label="필터 칩 Filter" ids={[...choiceProps, ...dbList(ws).map(([id, n]) => [id, `#${n}`] as [string, string])]} value={part.view.chips} onChange={chips => view({chips})} />
      <label><span className="k">묶기 Group</span><select value={part.view.group ?? ''} onChange={e => view({group: e.target.value || null})}><option value="">(안 묶음)</option>{propList(ws, p => p.body.kind === 'select' || p.body.kind === 'multi').map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
      <label><span className="k">정렬 Sort</span><select value={part.view.sort[0]?.prop ?? ''} onChange={e => view({sort: e.target.value ? [{prop: e.target.value, dir: part.view.sort[0]?.dir ?? 'asc'}] : []})}><option value="">(끌어 놓은 순서)</option>{propList(ws).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        {part.view.sort[0] && <select value={part.view.sort[0].dir} onChange={e => view({sort: [{...part.view.sort[0]!, dir: e.target.value as 'asc' | 'desc'}]})}><option value="asc">오름</option><option value="desc">내림</option></select>}</label>
      <Styles styles={part.view.styles} onChange={styles => view({styles})} />
    </fieldset>}
    {k === 'cards' && <label><span className="k">여는 조건이 든 칸</span><select value={part.signal ?? ''} onChange={e => set({signal: e.target.value || null})}><option value="">고르기</option>{propList(ws, p => p.body.kind === 'signal').map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>}
    {k === 'breakdown' && <label><span className="k">나눌 속성</span><select value={part.view.group ?? ''} onChange={e => view({group: e.target.value || null})}><option value="">고르기</option>{propList(ws, p => p.body.kind === 'select' || p.body.kind === 'multi').map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>}
    {(k === 'metric' || k === 'chart' || k === 'breakdown') && <fieldset><legend>계산 <En>Aggregate</En></legend>
      {k === 'metric' && <label><span className="k">상황 값 쓰기</span><select value={part.signal ?? ''} onChange={e => set({signal: e.target.value || null})}><option value="">(안 씀 — 아래 집계)</option>{[...ws.signals.values()].map(s => <option key={s.id} value={s.id}>{s.body.name}</option>)}</select></label>}
      {!(k === 'metric' && part.signal) && <>
        <label><span className="k">집계</span><select value={part.agg} onChange={e => set({agg: e.target.value as v2.Aggregate})}>{v2.AGGREGATES.map(a => <option key={a} value={a}>{AGG_NAMES[a][1]} · {AGG_NAMES[a][0]}</option>)}</select></label>
        {!['count', 'doneRatio', 'streak', 'days'].includes(part.agg) && <label><span className="k">어느 칸</span><select value={part.of ?? ''} onChange={e => set({of: e.target.value || null})}><option value="">고르기</option>{propList(ws, p => part.agg === 'last' || numeric(p.id)).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>}
      </>}
      <label><span className="k">목표값</span><input type="number" value={part.target ?? ''} onChange={e => set({target: e.target.value === '' ? null : Number(e.target.value)})} /></label>
      {k === 'metric' && <label><span className="k">모양</span><select value={part.show} onChange={e => set({show: e.target.value as v2.Part['show']})}><option value="number">숫자</option><option value="bar">막대</option><option value="ring">링</option><option value="light">신호등</option></select></label>}
      {k === 'metric' && part.show === 'light' && <div className="row"><label><span className="k">초록 이상</span><input type="number" value={part.green ?? ''} onChange={e => set({green: e.target.value === '' ? null : Number(e.target.value)})} /></label><label><span className="k">빨강 이하</span><input type="number" value={part.red ?? ''} onChange={e => set({red: e.target.value === '' ? null : Number(e.target.value)})} /></label></div>}
    </fieldset>}
    {k === 'timegrid' && <label><span className="k">몇 시부터</span><input type="number" min={0} max={23} value={part.startHour} onChange={e => set({startHour: Math.max(0, Math.min(23, Number(e.target.value)))})} /></label>}
    {WRITE_KINDS.includes(k) && <fieldset><legend>어디에 쓸까 <En>Write</En></legend>
      <IdPicker label="DB(태그)" ids={dbList(ws)} value={part.write.dbs} onChange={dbs => set({write: {...part.write, dbs}})} />
      {k === 'rating' && <><label><span className="k">점수 칸</span><select value={part.write.prop ?? ''} onChange={e => set({write: {...part.write, prop: e.target.value || null}})}><option value="">고르기</option>{propList(ws, p => ['rating', 'number'].includes(p.body.kind)).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label><span className="k">최대</span><input type="number" min={2} max={10} value={part.max} onChange={e => set({max: Math.max(2, Math.min(10, Number(e.target.value)))})} /></label></>}
      {k === 'form' && <IdPicker label="채울 칸" ids={propList(ws, p => p.body.kind !== 'formula')} value={part.props} onChange={props => set({props})} />}
      {k === 'counter' && <label><span className="k">하루 목표</span><input type="number" value={part.target ?? ''} onChange={e => set({target: e.target.value === '' ? null : Number(e.target.value)})} /></label>}
      {k === 'timer' && <Steps part={part} set={set} />}
      {k === 'timestamp' && <p className="muted small">고른 DB의 시작(Start)·끝(End) 역할 칸에 시각을 적어요.</p>}
    </fieldset>}
    <div className="preview"><span className="k">미리보기</span><PartView part={part} day={day} setDay={() => {}} /></div>
  </div>;
}
function Steps({part, set}: {part: v2.Part; set: (x: Partial<v2.Part>) => void}) {
  const steps = part.steps.length ? part.steps : [{name: '집중', min: 25}];
  return <div className="steps">{steps.map((s, i) => <div key={i} className="row">
    <input value={s.name} onChange={e => set({steps: steps.map((x, j) => j === i ? {...x, name: e.target.value} : x)})} />
    <input type="number" min={1} value={s.min} onChange={e => set({steps: steps.map((x, j) => j === i ? {...x, min: Math.max(1, Number(e.target.value))} : x)})} />분
    <button className="ghost small" onClick={() => set({steps: steps.filter((_, j) => j !== i)})}>✕</button></div>)}
    <button className="small" onClick={() => set({steps: [...steps, {name: '휴식', min: 5}]})}>+ 단계</button>
    <label><span className="k">반복</span><input type="number" min={1} max={20} value={part.loop} onChange={e => set({loop: Math.max(1, Number(e.target.value))})} />번</label>
  </div>;
}
/** Conditional style (조건부 모양): conditions → a look, chosen by seeing each look. */
function Styles({styles, onChange}: {styles: v2.View['styles']; onChange: (s: v2.View['styles']) => void}) {
  const [picking, setPicking] = useState<number | null>(null);
  return <div className="styles"><span className="k">조건부 모양 <En>Conditional style</En></span>
    {styles.map((s, i) => <div key={i} className="style-rule">
      <CondEditor conds={s.when} onChange={when => onChange(styles.map((x, j) => j === i ? {...x, when} : x))} />
      <div className="row">이면 <button className="small" onClick={() => setPicking(picking === i ? null : i)}>{LOOK_NAMES[s.look]} ▾</button><button className="ghost small" onClick={() => onChange(styles.filter((_, j) => j !== i))}>✕</button></div>
      {picking === i && <div className="look-gallery">{v2.LOOKS.map(l => <button key={l} className={`look-sample ${s.look === l ? 'on' : ''}`} onClick={() => { onChange(styles.map((x, j) => j === i ? {...x, look: l} : x)); setPicking(null); }}>
        <span className="sample-line"><span>○ 보통 항목</span></span>
        <span className={`sample-line look-${l}`} style={l === 'color' ? {'--look': `var(--c-${s.color || 'red'})`} as React.CSSProperties : undefined}><span>○ 조건에 맞는 항목</span></span>
        <b>{LOOK_NAMES[l]}</b></button>)}</div>}
      {s.look === 'color' && <select value={s.color} onChange={e => onChange(styles.map((x, j) => j === i ? {...x, color: e.target.value} : x))}>{['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'].map(c => <option key={c}>{c}</option>)}</select>}
    </div>)}
    <button className="small" onClick={() => onChange([...styles, {when: [], look: 'gray', color: ''}])}>+ 조건부 모양</button>
  </div>;
}
