import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {FIELD_KINDS, LOGIC_BLOCKS, AGGS, BLOCK_GROUPS, Logic, MadeOptions, PERIODS, TypeDef, VERB_NAMES, blockInfo, checkTemplate, flowSentence, newBlock, newLogicId, tabsOf,
  type Flow, type FieldDef, type LogicBlock, type PlannerSpec, type SavedFilter, type TabSpec, type Widget} from '@workspace/planner-spec';
import {VERBS, type Settings} from '@workspace/life-contract';
import type {Planner} from '../data.ts';
import type {Ctx, Nav} from '../screens/day.ts';
import {MadeWidget} from './MadeWidget.tsx';
import {CondsEditor, FlowEditor, newFlow} from './FlowEditor.tsx';
import {ICON_NAMES, Icon} from './icons.tsx';
import {PRESETS, type Seed} from './presets.ts';
import {importLegacy, legacyCount} from './legacy.ts';
import {THEMES, starterHtml} from './themes.ts';

// The studio (docs/lit/BLOCKS.md §6): where a widget's logic and design are made, next to a live preview
// that writes real entries — building and using are the same screen (Glide/Softr-style builder, Notion "/" palette,
// Shortcuts-style automation sentences). Opened from 메뉴 → 위젯 만들기, or by tapping a made widget twice.
export type StudioOpen = {widgetId?: string} | {pick: true} | {logic: true};
export const openStudio = (detail: StudioOpen) => dispatchEvent(new CustomEvent('lit:studio', {detail}));

type Draft = {widgetId: string | null; title: string; options: MadeOptions; types: TypeDef[]; flows: Flow[]};
const allWidgets = (spec: PlannerSpec) => [...(spec.canvas.day ?? []).map(w => ({w, page: '오늘'})), ...tabsOf(spec).flatMap(t => (t.widgets ?? []).map(w => ({w, page: t.name})))];

export function StudioHost({spec, settings, p, nav, today, tab, saveSpec}: {spec: PlannerSpec; settings: Settings; p: Planner; nav: Nav; today: string; tab: TabSpec; saveSpec?: (change: (s: PlannerSpec) => PlannerSpec) => Promise<void>}) {
  const [open, setOpen] = useState<StudioOpen | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => { const f = (e: Event) => setOpen((e as CustomEvent<StudioOpen>).detail); addEventListener('lit:studio', f); return () => removeEventListener('lit:studio', f); }, []);
  const logic = useMemo(() => Logic.parse(spec.logic ?? {}), [spec.logic]);
  useEffect(() => {
    if (!open || !('widgetId' in open) || !open.widgetId) return;
    const found = allWidgets(spec).find(x => x.w.id === open.widgetId)?.w;
    if (found) setDraft({widgetId: found.id, title: found.title ?? '', options: MadeOptions.parse(found.options), types: logic.types, flows: logic.flows});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !saveSpec) return null;
  const close = () => { setOpen(null); setDraft(null); };
  const ctxBase = {p, nav, now: () => new Date().toISOString(), timer: null, color: () => '#888', settings} as const;
  if ('logic' in open) return createPortal(<LogicPage spec={spec} p={p} saveSpec={saveSpec} close={close} />, document.body);
  // The user's own subjects (from timer widgets) and routines, so block versions start with them.
  const seed: Seed = {subjects: [...new Set(allWidgets(spec).filter(x => x.w.type === 'focus').flatMap(x => ((x.w.options.subjects as {name: string}[] | undefined) ?? []).map(sj => sj.name)))].slice(0, 60),
    routines: [...new Set(p.records.filter(r => r.kind === 'routine' && !r.deletedAt && (r.body as {active: boolean}).active).map(r => (r.body as {title: string}).title.slice(0, 30)))].slice(0, 60)};
  if (!draft) return createPortal(<Picker logic={logic} pick={pr => { const made = pr.make(logic, seed); setDraft({widgetId: null, title: made.title, options: made.options, types: [...logic.types, ...made.types.filter(t => !logic.types.some(x => x.id === t.id))], flows: [...logic.flows, ...made.flows]}); }} close={close} />, document.body);
  const save = async (d: Draft) => {
    await saveSpec(s => {
      const next: PlannerSpec = {...s, logic: {types: d.types, flows: d.flows}};
      const patch = (ws: Widget[]) => ws.map(w => w.id === d.widgetId ? {...w, title: d.title || undefined, options: d.options as unknown as Record<string, unknown>} : w);
      if (d.widgetId) return {...next, canvas: {...next.canvas, day: next.canvas.day ? patch(next.canvas.day) : next.canvas.day}, tabs: next.tabs?.map(t => t.widgets ? {...t, widgets: patch(t.widgets)} : t)};
      const add = (ws: Widget[]): Widget[] => [...ws, {id: `made-${Date.now().toString(36)}`, type: 'made', x: 0, y: ws.reduce((m, w) => Math.max(m, w.y + w.h), 0), w: 24, h: 30, title: d.title || undefined, options: d.options as unknown as Record<string, unknown>}];
      if (tab.kind === 'page') return {...next, tabs: tabsOf(next).map(t => t.id === tab.id ? {...t, widgets: add(t.widgets ?? [])} : t)};
      return {...next, canvas: {day: add(next.canvas.day ?? []), mode: 'free'}};
    });
    close();
  };
  return createPortal(<Studio draft={draft} setDraft={setDraft} spec={spec} ctx={{...ctxBase, day: nav.day, spec: {...spec, logic: {types: draft.types, flows: draft.flows}}}} today={today} save={save} close={close} />, document.body);
}

function Picker({logic, pick, close}: {logic: Logic; pick: (p: (typeof PRESETS)[number]) => void; close: () => void}) {
  return <div className="studio-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="picker" role="dialog" aria-label="위젯 만들기">
      <header className="studio-bar"><button className="ghost" onClick={close} aria-label="닫기">←</button><h2>위젯 만들기</h2></header>
      {([['old', '기존 위젯을 블록으로'], ['new', '새로 만들기']] as const).map(([g, n]) => <section key={g} className="picker-sec"><h3>{n}</h3>
        <ul className="picker-grid">{PRESETS.filter(pr => pr.group === g || (g === 'new' && pr.id === 'blank' && false)).map(pr => <li key={pr.id}><button className="picker-card" onClick={() => pick(pr)}><Icon name={pr.icon} size={26} /><b>{pr.name}</b><span>{pr.desc}</span></button></li>)}</ul></section>)}
      {logic.types.length > 0 && <p className="muted small">지금 있는 기록 묶음: {logic.types.map(t => t.name).join(' · ')}</p>}
    </div>
  </div>;
}

const STEPS = [['data', '데이터'], ['blocks', '블록'], ['links', '연결·자동화'], ['design', '디자인'], ['preview', '미리보기']] as const;
type Step = (typeof STEPS)[number][0];

function Studio({draft, setDraft, spec, ctx, today, save, close}: {draft: Draft; setDraft: (d: Draft) => void; spec: PlannerSpec; ctx: Ctx; today: string; save: (d: Draft) => Promise<void>; close: () => void}) {
  const [step, setStep] = useState<Step>(draft.options.blocks.length ? 'blocks' : 'data'), [busy, setBusy] = useState(false);
  const type = draft.types.find(t => t.id === draft.options.type);
  const put = (p: Partial<Draft>) => setDraft({...draft, ...p});
  const setOpts = (p: Partial<MadeOptions>) => put({options: {...draft.options, ...p}});
  const setType = (t: TypeDef) => put({types: draft.types.map(x => x.id === t.id ? t : x)});
  const preview = <div className="studio-device"><MadeWidget w={{id: draft.widgetId ?? 'preview', options: {}}} options={draft.options} logic={{types: draft.types, flows: draft.flows}} ctx={ctx} today={today} /></div>;
  return <div className="studio-wrap">
    <div className="studio" role="dialog" aria-label="위젯 스튜디오">
      <header className="studio-bar">
        <button className="ghost" onClick={close} aria-label="닫기">←</button>
        <input className="studio-title" value={draft.title} onChange={e => put({title: e.target.value})} placeholder={type?.name ?? '위젯 이름'} maxLength={40} aria-label="위젯 이름" />
        <button className="primary" disabled={busy || !type} onClick={async () => { setBusy(true); await save(draft); }}>저장</button>
      </header>
      <nav className="studio-steps" role="tablist">{STEPS.map(([k, n]) => <button key={k} role="tab" aria-selected={step === k} className={`${step === k ? 'on' : ''} ${k === 'preview' ? 'only-phone' : ''}`} onClick={() => setStep(k)}>{n}</button>)}</nav>
      <div className="studio-body">
        <section className={`studio-panel ${step === 'preview' ? 'hide-phone' : ''}`}>
          {step === 'data' && <DataPanel draft={draft} put={put} type={type} setType={setType} spec={spec} />}
          {step === 'blocks' && type && <BlocksPanel blocks={draft.options.blocks} type={type} setType={setType} onChange={blocks => setOpts({blocks})} />}
          {step === 'links' && type && <LinksPanel draft={draft} put={put} type={type} setType={setType} spec={spec} />}
          {step === 'design' && <DesignPanel draft={draft} setOpts={setOpts} type={type} />}
          {step === 'preview' && <div className="only-phone">{preview}</div>}
        </section>
        <aside className={`studio-preview ${step === 'preview' ? '' : 'hide-phone'}`}><span className="k">미리보기 · 실제 기록</span>{preview}</aside>
      </div>
    </div>
  </div>;
}

// ── 1. 데이터: the type (collection) this widget reads and writes ─────────────────────────────────
function DataPanel({draft, put, type, setType, spec}: {draft: Draft; put: (p: Partial<Draft>) => void; type: TypeDef | undefined; setType: (t: TypeDef) => void; spec: PlannerSpec}) {
  const sharing = type ? allWidgets(spec).filter(x => x.w.type === 'made' && x.w.options.type === type.id && x.w.id !== draft.widgetId) : [];
  const newType = () => { let id = 'mine', n = 2; while (draft.types.some(t => t.id === id)) id = `mine${n++}`; const t = TypeDef.parse({id, name: '새 기록'}); put({types: [...draft.types, t], options: {...draft.options, type: id}}); };
  const field = (i: number, p: Partial<FieldDef>) => type && setType({...type, fields: type.fields.map((f, j) => j === i ? {...f, ...p} : f)});
  return <div className="sp">
    <label className="sp-row"><span className="k">기록 묶음</span>
      <span className="inline"><select value={draft.options.type} onChange={e => put({options: {...draft.options, type: e.target.value}})}><option value="" disabled>고르기</option>{draft.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <button className="ghost small" onClick={newType}>+ 새 묶음</button></span></label>
    {sharing.length > 0 && <p className="sp-share"><Icon name="people" size={14} /> 같은 기록을 보는 위젯: {sharing.map(x => `${x.w.title || '만든 위젯'}(${x.page})`).join(', ')}</p>}
    {type && <>
      <div className="sp-grid">
        <label><span className="k">이름</span><input value={type.name} maxLength={30} onChange={e => setType({...type, name: e.target.value || ' '})} /></label>
        <label><span className="k">단위</span><input value={type.unit} maxLength={12} onChange={e => setType({...type, unit: e.target.value})} placeholder="잔 · 쪽 · 분" /></label>
        <label className="wide"><span className="k">설명 (사람과 AI가 읽어요)</span><input value={type.desc} maxLength={300} onChange={e => setType({...type, desc: e.target.value})} /></label>
        <label><span className="k">아이콘</span><IconPick value={type.icon} onChange={icon => setType({...type, icon})} /></label>
      </div>
      <h4 className="sp-h">속성</h4>
      <ul className="sp-fields">{type.fields.map((f, i) => <li key={f.id} className="sp-field">
        <div className="inline"><input value={f.name} maxLength={30} onChange={e => field(i, {name: e.target.value || ' '})} aria-label="속성 이름" />
          <select value={f.kind} onChange={e => field(i, {kind: e.target.value as FieldDef['kind']})} aria-label="종류">{FIELD_KINDS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
          <button className="ghost small" onClick={() => setType({...type, fields: type.fields.filter((_, j) => j !== i)})} aria-label={`${f.name} 지우기`}>×</button></div>
        <div className="inline">
          {(f.kind === 'number' || f.kind === 'duration') && <input className="num" value={f.unit} maxLength={12} onChange={e => field(i, {unit: e.target.value})} placeholder="단위" aria-label="단위" />}
          {f.kind === 'score' && <label className="inline">최고 <input className="num" type="number" min={2} max={100} value={f.max} onChange={e => field(i, {max: Math.max(2, Math.min(100, Number(e.target.value) || 10))})} /></label>}
          {(f.kind === 'choice' || f.kind === 'multi') && <input className="wide" value={f.options.join(', ')} onChange={e => field(i, {options: e.target.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 60)})} placeholder="선택지, 쉼표로" aria-label="선택지" />}
          {f.kind === 'link' && <select value={f.to} onChange={e => field(i, {to: e.target.value})} aria-label="무엇과 연결"><option value="goal">목표</option><option value="task">할 일</option><option value="persona">페르소나</option>{draft.types.filter(t => t.id !== type.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          <input className="wide" value={f.desc} maxLength={200} onChange={e => field(i, {desc: e.target.value})} placeholder="설명" aria-label="속성 설명" />
        </div></li>)}</ul>
      <button className="small" disabled={type.fields.length >= 30} onClick={() => setType({...type, fields: [...type.fields, {id: newLogicId(), name: '새 속성', kind: 'text', desc: '', unit: '', options: [], max: 10, to: 'goal'}]})}>+ 속성</button>
    </>}
  </div>;
}

function IconPick({value, onChange}: {value: string; onChange: (v: string) => void}) {
  const [open, setOpen] = useState(false);
  return <span className="icon-pick"><button type="button" className="small" onClick={() => setOpen(!open)} aria-expanded={open}>{value ? <Icon name={value} size={16} /> : '없음'}</button>
    {open && <span className="icon-grid" role="listbox">{['', ...ICON_NAMES].map(n => <button type="button" key={n || 'none'} className={value === n ? 'on' : ''} onClick={() => { onChange(n); setOpen(false); }} aria-label={n || '없음'} title={n}>{n ? <Icon name={n} size={16} /> : '–'}</button>)}</span>}</span>;
}

// ── 2. 블록 ──────────────────────────────────────────────────────────────────────────────────────
function BlocksPanel({blocks, type, setType, onChange}: {blocks: LogicBlock[]; type: TypeDef; setType: (t: TypeDef) => void; onChange: (b: LogicBlock[]) => void}) {
  const [open, setOpen] = useState<string | null>(null), [palette, setPalette] = useState(blocks.length === 0);
  const set = (id: string, p: Partial<LogicBlock>) => onChange(blocks.map(b => b.id === id ? {...b, ...p} : b));
  const move = (i: number, by: number) => { const j = i + by; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j]!, n[i]!]; onChange(n); };
  const add = (kind: LogicBlock['kind']) => {
    const b = newBlock(kind, kind === 'score' ? {field: type.fields.find(f => f.kind === 'score')?.id ?? ''} : kind === 'stat' ? {label: '오늘', agg: 'count'} : {});
    onChange([...blocks, b]); setOpen(b.id); setPalette(false);
  };
  return <div className="sp">
    <ol className="sp-blocks">{blocks.map((b, i) => <li key={b.id} className={`sp-block ${open === b.id ? 'open' : ''}`}>
      <div className="sp-bhead"><button className="link" onClick={() => setOpen(open === b.id ? null : b.id)} aria-expanded={open === b.id}><b>{blockInfo(b.kind).name}</b> <span className="muted">{b.label || b.text || ''}</span></button>
        <span className="mono muted small" title="HTML 디자인에서 부르는 이름">{b.id}</span>
        <button className="ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">↑</button><button className="ghost small" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="아래로">↓</button>
        <button className="ghost small danger" onClick={() => onChange(blocks.filter(x => x.id !== b.id))} aria-label="블록 지우기">×</button></div>
      {open === b.id && <BlockConfig b={b} type={type} setType={setType} set={p => set(b.id, p)} />}
    </li>)}</ol>
    {palette ? <div className="palette">{(Object.keys(BLOCK_GROUPS) as (keyof typeof BLOCK_GROUPS)[]).map(g => <div key={g}><h4 className="sp-h">{BLOCK_GROUPS[g]}</h4>
      <div className="palette-row">{LOGIC_BLOCKS.filter(x => x.group === g).map(x => <button key={x.kind} className="palette-item" onClick={() => add(x.kind)}><b>{x.name}</b><span>{x.desc}</span></button>)}</div></div>)}
      {blocks.length > 0 && <button className="ghost small" onClick={() => setPalette(false)}>닫기</button>}</div>
      : <button className="small" onClick={() => setPalette(true)}>+ 블록</button>}
  </div>;
}

function BlockConfig({b, type, setType, set}: {b: LogicBlock; type: TypeDef; setType: (t: TypeDef) => void; set: (p: Partial<LogicBlock>) => void}) {
  const fs = type.fields, nums = fs.filter(f => ['number', 'score', 'duration'].includes(f.kind));
  const input = ['button', 'toggle', 'counter', 'check', 'score', 'form', 'stopwatch', 'timer'].includes(b.kind), view = ['list', 'table', 'gallery', 'timeline'].includes(b.kind), calc = ['stat', 'calendar', 'chart'].includes(b.kind);
  const addField = (kind: FieldDef['kind'], name: string) => { const id = newLogicId(); setType({...type, fields: [...fs, {id, name, kind, desc: '', unit: '', options: kind === 'choice' ? ['집중', '휴식'] : [], max: 10, to: 'goal'}]}); return id; };
  const ofSel = <select value={b.of} onChange={e => set({of: e.target.value})} aria-label="무엇의"><option value="">값{type.unit ? `(${type.unit})` : ''}</option><option value="duration">걸린 시간</option>{nums.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>;
  return <div className="sp-bconf">
    {b.kind !== 'note' && b.kind !== 'heading' && <div className="inline"><label><span className="k">이름</span><input value={b.label} maxLength={40} onChange={e => set({label: e.target.value})} /></label><label><span className="k">아이콘</span><IconPick value={b.icon} onChange={icon => set({icon})} /></label></div>}
    {b.kind === 'heading' && <div className="inline"><input className="wide" value={b.text} maxLength={500} onChange={e => set({text: e.target.value})} aria-label="문구" /><select value={b.style || 'm'} onChange={e => set({style: e.target.value})} aria-label="크기"><option value="s">작게</option><option value="m">보통</option><option value="l">크게</option></select></div>}
    {input && <label className="inline"><span className="k">기록할 동작</span><select value={b.verb ?? ''} onChange={e => set({verb: (e.target.value || undefined) as LogicBlock['verb']})}><option value="">기본</option>{VERBS.map(v => <option key={v} value={v}>{VERB_NAMES[v]}</option>)}</select></label>}
    {(b.kind === 'toggle' || b.kind === 'stopwatch') && <div className="inline"><label><span className="k">시작 버튼</span><input value={b.startLabel} maxLength={20} onChange={e => set({startLabel: e.target.value})} placeholder="시작" /></label><label><span className="k">끝 버튼</span><input value={b.endLabel} maxLength={20} onChange={e => set({endLabel: e.target.value})} placeholder="끝" /></label></div>}
    {(b.kind === 'button' || b.kind === 'toggle' || b.kind === 'counter' || b.kind === 'stopwatch') && <label className="inline"><span className="k">모양</span><select value={b.style} onChange={e => set({style: e.target.value})}><option value="">기본</option><option value="pill">알약</option><option value="big">크게</option><option value="round">동그랗게</option><option value="flat">납작하게</option></select></label>}
    {(b.kind === 'toggle' || b.kind === 'stopwatch' || b.kind === 'check') && <label className="inline"><span className="k">{b.kind === 'check' ? '항목별로 (선택 속성)' : '과목별로 나누기 (선택 속성)'}</span>
      <select value={b.field} onChange={e => set({field: e.target.value === '+' ? addField('choice', b.kind === 'check' ? '항목' : '과목') : e.target.value})}><option value="">하나로</option>{fs.filter(f => f.kind === 'choice').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}<option value="+">+ 새 선택 속성</option></select></label>}
    {(b.kind === 'toggle' || b.kind === 'stopwatch') && <label className="inline"><span className="k">끝나면 물어볼 점수</span>
      <select value={b.ask} onChange={e => set({ask: e.target.value === '+' ? addField('score', '컨디션') : e.target.value})}><option value="">묻지 않기</option>{fs.filter(f => f.kind === 'score').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}<option value="+">+ 새 점수 속성</option></select></label>}
    {b.kind === 'stat' && b.show === 'light' && <><div className="inline"><label><span className="k">파랑 (이상)</span><input className="num" value={b.green} onChange={e => set({green: Number(e.target.value) || 0})} /></label>
      <label><span className="k">빨강 (이하)</span><input className="num" value={b.red} onChange={e => set({red: Number(e.target.value) || 0})} /></label></div>
      <details><summary>점수별 메시지</summary>{Array.from({length: fs.find(f => f.id === b.of)?.max ?? 10}, (_, i) => (fs.find(f => f.id === b.of)?.max ?? 10) - i).map(n => <label key={n} className="score-msg"><span className={`m-light ${n >= b.green ? 'blue' : n <= b.red ? 'red' : 'amber'}`} />{n}
        <input value={b.msgs[String(n)] ?? ''} maxLength={160} onChange={e => set({msgs: {...b.msgs, [String(n)]: e.target.value}})} aria-label={`${n}점 메시지`} /></label>)}</details></>}
    {b.kind === 'grid10' && <div className="inline"><select value={b.scope} onChange={e => set({scope: e.target.value as LogicBlock['scope']})} aria-label="무엇을 칠할지"><option value="all">잰 시간 전부 (타이머·다른 위젯 포함)</option><option value="type">이 기록 묶음만</option></select>
      <label><span className="k">시작 시각</span><select value={b.startHour} onChange={e => set({startHour: Number(e.target.value)})}>{[0, 4, 5, 6, 7, 8, 9, 10].map(h => <option key={h} value={h}>{h}시</option>)}</select></label></div>}
    {b.kind === 'breakdown' && <div className="inline wrap">
      <select value={b.field} onChange={e => set({field: e.target.value})} aria-label="무엇으로 나눌지"><option value="">나눌 속성</option>{fs.filter(f => f.kind === 'choice' || f.kind === 'multi').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <select value={b.agg} onChange={e => set({agg: e.target.value as LogicBlock['agg']})} aria-label="계산">{AGGS.filter(a => ['count', 'sum', 'avg', 'max', 'min'].includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      {b.agg !== 'count' && ofSel}
      <select value={b.period} onChange={e => set({period: e.target.value as LogicBlock['period']})} aria-label="기간">{PERIODS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select value={b.show} onChange={e => set({show: e.target.value as LogicBlock['show']})} aria-label="모양"><option value="list">막대 목록</option><option value="donut">원형</option></select></div>}
    {b.kind === 'counter' && <div className="inline"><label><span className="k">한 번에</span><input className="num" value={b.amount} onChange={e => set({amount: Number(e.target.value) || 1})} /></label><label><span className="k">하루 목표</span><input className="num" value={b.target ?? ''} onChange={e => set({target: e.target.value ? Number(e.target.value) : null})} /></label></div>}
    {b.kind === 'score' && <label className="inline"><span className="k">점수 속성</span><select value={b.field} onChange={e => set({field: e.target.value === '+' ? addField('score', '점수') : e.target.value})}><option value="">값으로</option>{fs.filter(f => f.kind === 'score' || f.kind === 'number').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}<option value="+">+ 새 점수 속성</option></select></label>}
    {b.kind === 'form' && <div className="checks"><span className="k">칸</span>{fs.map(f => <label key={f.id} className="row-check"><input type="checkbox" checked={b.fields.includes(f.id)} onChange={e => set({fields: e.target.checked ? [...b.fields, f.id] : b.fields.filter(x => x !== f.id)})} /> {f.name}</label>)}{!fs.length && <span className="muted small">데이터에서 속성을 먼저 만들어요</span>}</div>}
    {b.kind === 'timer' && <>
      {(b.steps.length ? b.steps : [{name: '집중', min: 25}]).map((s, i, all) => <div key={i} className="inline"><input value={s.name} maxLength={20} onChange={e => set({steps: all.map((x, j) => j === i ? {...x, name: e.target.value || ' '} : x)})} aria-label="단계 이름" />
        <input className="num" inputMode="decimal" value={s.min} onChange={e => set({steps: all.map((x, j) => j === i ? {...x, min: Math.max(0.1, Number(e.target.value) || 1)} : x)})} aria-label="분" />분
        {all.length > 1 && <button className="ghost small" onClick={() => set({steps: all.filter((_, j) => j !== i)})} aria-label="단계 빼기">×</button>}</div>)}
      <div className="inline"><button className="ghost small" onClick={() => set({steps: [...(b.steps.length ? b.steps : [{name: '집중', min: 25}]), {name: '휴식', min: 5}]})}>+ 단계</button>
        <label><span className="k">반복</span><input className="num" type="number" min={1} max={20} value={b.loop} onChange={e => set({loop: Math.max(1, Math.min(20, Number(e.target.value) || 1))})} /></label>
        <label><span className="k">단계 이름을 적을 속성</span><select value={b.field} onChange={e => set({field: e.target.value === '+' ? addField('choice', '단계') : e.target.value})}><option value="">없음</option>{fs.filter(f => f.kind === 'choice' || f.kind === 'text').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}<option value="+">+ 새 속성</option></select></label></div>
    </>}
    {calc && <div className="inline">
      {b.kind !== 'calendar' || true ? <select value={b.agg} onChange={e => set({agg: e.target.value as LogicBlock['agg']})} aria-label="계산">{AGGS.filter(a => b.kind === 'stat' || !['streak', 'days', 'last'].includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select> : null}
      {!['count', 'streak', 'days'].includes(b.agg) && ofSel}
      {b.kind !== 'calendar' && <select value={b.period} onChange={e => set({period: e.target.value as LogicBlock['period']})} aria-label="기간">{PERIODS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      {b.kind !== 'calendar' && <label><span className="k">목표</span><input className="num" value={b.target ?? ''} onChange={e => set({target: e.target.value ? Number(e.target.value) : null})} /></label>}
      {b.kind === 'stat' && <select value={b.show} onChange={e => set({show: e.target.value as LogicBlock['show']})} aria-label="모양"><option value="number">숫자</option><option value="gauge">게이지</option><option value="ring">원</option><option value="bar">막대</option><option value="light">신호등</option></select>}
    </div>}
    {view && <div className="inline">
      <select value={b.period} onChange={e => set({period: e.target.value as LogicBlock['period']})} aria-label="기간">{PERIODS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      {b.kind !== 'timeline' && <select value={b.sort} onChange={e => set({sort: e.target.value as LogicBlock['sort']})} aria-label="정렬"><option value="new">최근 먼저</option><option value="old">오래된 먼저</option><option value="value">값 큰 순</option></select>}
      <label><span className="k">최대</span><input className="num" type="number" min={1} max={200} value={b.limit} onChange={e => set({limit: Math.max(1, Math.min(200, Number(e.target.value) || 20))})} /></label></div>}
    {view && fs.length > 0 && <div className="checks"><span className="k">보일 속성</span>{fs.map(f => <label key={f.id} className="row-check"><input type="checkbox" checked={!b.fields.length || b.fields.includes(f.id)} onChange={e => { const cur = b.fields.length ? b.fields : fs.map(x => x.id); set({fields: e.target.checked ? [...cur, f.id] : cur.filter(x => x !== f.id)}); }} /> {f.name}</label>)}</div>}
    {(view || calc) && <><span className="k">항상 거는 조건</span><CondsEditor conds={b.conds} type={type} onChange={conds => set({conds})} /></>}
    {view && <SavedFilters filters={b.filters} type={type} onChange={filters => set({filters})} />}
  </div>;
}

/** Filter chips the user prepares; on the widget, one tap switches between them. */
function SavedFilters({filters, type, onChange}: {filters: SavedFilter[]; type: TypeDef; onChange: (f: SavedFilter[]) => void}) {
  return <div className="sp-filters"><span className="k">필터 칩</span>
    {filters.map((f, i) => <div key={f.id} className="sp-filter"><div className="inline"><input value={f.name} maxLength={20} onChange={e => onChange(filters.map((x, j) => j === i ? {...x, name: e.target.value || ' '} : x))} aria-label="칩 이름" />
      <button className="ghost small" onClick={() => onChange(filters.filter((_, j) => j !== i))} aria-label="칩 지우기">×</button></div>
      <CondsEditor conds={f.conds} type={type} onChange={conds => onChange(filters.map((x, j) => j === i ? {...x, conds} : x))} /></div>)}
    <button className="ghost small" disabled={filters.length >= 8} onClick={() => onChange([...filters, {id: newLogicId(), name: `필터 ${filters.length + 1}`, conds: []}])}>+ 필터 칩</button>
  </div>;
}

// ── 3. 연결·자동화 ────────────────────────────────────────────────────────────────────────────────
function LinksPanel({draft, put, type, setType, spec}: {draft: Draft; put: (p: Partial<Draft>) => void; type: TypeDef; setType: (t: TypeDef) => void; spec: PlannerSpec}) {
  const [edit, setEdit] = useState<string | null>(null);
  const sharing = allWidgets(spec).filter(x => x.w.type === 'made' && x.w.options.type === type.id && x.w.id !== draft.widgetId);
  const related = draft.flows.filter(f => f.on.type === type.id || f.do.some(a => 'type' in a && a.type === type.id));
  const links = type.fields.filter(f => f.kind === 'link');
  const setFlow = (f: Flow) => put({flows: draft.flows.map(x => x.id === f.id ? f : x)});
  return <div className="sp">
    <h4 className="sp-h">같은 기록을 보는 위젯</h4>
    {sharing.length ? <ul className="sp-list">{sharing.map(x => <li key={x.w.id}>{x.w.title || '만든 위젯'} <span className="muted small">{x.page}</span></li>)}</ul> : <p className="muted small">아직 없어요. 다른 위젯에서 이 묶음({type.name})을 고르면 기록을 함께 봐요.</p>}
    <h4 className="sp-h">연결 속성</h4>
    <ul className="sp-list">{links.map(f => <li key={f.id}>{f.name} → {({goal: '목표', task: '할 일', persona: '페르소나'} as Record<string, string>)[f.to] ?? draft.types.find(t => t.id === f.to)?.name ?? f.to}</li>)}</ul>
    <button className="ghost small" onClick={() => setType({...type, fields: [...type.fields, {id: newLogicId(), name: '목표', kind: 'link', to: 'goal', desc: '', unit: '', options: [], max: 10}]})}>+ 연결 속성</button>
    <h4 className="sp-h">자동화</h4>
    <ul className="sp-flows">{related.map(f => <li key={f.id} className={f.enabled ? '' : 'off'}>
      {edit === f.id ? <FlowEditor flow={f} types={draft.types} onChange={setFlow} onDelete={() => { put({flows: draft.flows.filter(x => x.id !== f.id)}); setEdit(null); }} />
        : <button className="link flow-line" onClick={() => setEdit(f.id)}>{f.name && <b>{f.name} · </b>}{flowSentence(f, draft.types)}</button>}
      {edit === f.id && <button className="ghost small" onClick={() => setEdit(null)}>접기</button>}</li>)}</ul>
    <button className="small" onClick={() => { const f = newFlow(type.id); put({flows: [...draft.flows, f]}); setEdit(f.id); }}>+ 자동화</button>
  </div>;
}

// ── 4. 디자인 ────────────────────────────────────────────────────────────────────────────────────
function DesignPanel({draft, setOpts, type}: {draft: Draft; setOpts: (p: Partial<MadeOptions>) => void; type: TypeDef | undefined}) {
  const d = draft.options.design, set = (p: Partial<typeof d>) => setOpts({design: {...d, ...p}});
  const err = d.mode === 'html' ? checkTemplate(d.html) : '';
  const color = (k: 'accent' | 'bg' | 'ink', label: string) => <label className="sk-color">{label}<input type="color" value={d[k] || (k === 'bg' ? '#ffffff' : '#151515')} onChange={e => set({[k]: e.target.value})} />{d[k] && <button className="ghost small" onClick={() => set({[k]: ''})} aria-label={`${label} 기본으로`}>↺</button>}</label>;
  return <div className="sp">
    <div className="seg" role="radiogroup" aria-label="디자인 방식">{([['blocks', '블록 그대로'], ['html', 'HTML · CSS']] as const).map(([k, n]) => <button key={k} role="radio" aria-checked={d.mode === k} className={d.mode === k ? 'on' : ''} onClick={() => set({mode: k, ...(k === 'html' && !d.html ? {html: starterHtml(draft.options.blocks), css: THEMES[0]!.css} : {})})}>{n}</button>)}</div>
    <h4 className="sp-h">색·모양 (디자인 토큰)</h4>
    <div className="inline wrap">{color('accent', '강조')}{color('bg', '배경')}{color('ink', '글자')}
      <label><span className="k">모서리</span><input type="range" min={0} max={40} value={d.radius ?? 10} onChange={e => set({radius: Number(e.target.value)})} /></label>
      <select value={d.density} onChange={e => set({density: e.target.value as typeof d.density})} aria-label="간격"><option value="compact">촘촘</option><option value="normal">보통</option><option value="airy">여유</option></select>
      <select value={d.align} onChange={e => set({align: e.target.value as typeof d.align})} aria-label="정렬"><option value="left">왼쪽</option><option value="center">가운데</option></select></div>
    {d.mode === 'html' && <>
      <div className="inline wrap"><span className="k">테마</span>{THEMES.map(t => <button key={t.id} className="small" onClick={() => set({css: t.css, ...(t.html ? {html: t.html(draft.options.blocks)} : {})})}>{t.name}</button>)}
        <button className="ghost small" onClick={() => set({html: starterHtml(draft.options.blocks)})}>블록으로 다시 시작</button></div>
      <label className="code-ed"><span className="k">HTML</span><textarea spellCheck={false} rows={12} value={d.html} onChange={e => set({html: e.target.value})} /></label>
      {err && <p className="error small">{err}</p>}
      <label className="code-ed"><span className="k">CSS</span><textarea spellCheck={false} rows={10} value={d.css} onChange={e => set({css: e.target.value})} /></label>
      <details className="cheat"><summary>쓸 수 있는 값</summary>
        <ul className="mono small">
          <li>{'{{title}}'} {'{{desc}}'} {'{{day}}'} {'{{today}}'} (오늘 기록 수)</li>
          <li>{'{{#each entries}} {{time}} {{end}} {{duration}} {{value}}{{unit}} '}{type?.fields.map(f => `{{${f.name}}}`).join(' ')}{' {{/each}}'}</li>
          <li>{'{{#if last}} {{last.time}} {{/if}}'}</li>
          {draft.options.blocks.map(b => <li key={b.id}>{blockInfo(b.kind).name} {b.label}: {`<lit-block ref="${b.id}"></lit-block>`} · {`data-lit-press="${b.id}"`}{b.kind === 'stat' ? ` · {{blocks.${b.id}.text}} {{blocks.${b.id}.pct}}` : ['list', 'table', 'gallery', 'timeline'].includes(b.kind) ? ` · {{#each blocks.${b.id}}}…{{/each}}` : b.kind === 'counter' ? ` · {{blocks.${b.id}.count}}` : ['toggle', 'stopwatch'].includes(b.kind) ? ` · {{blocks.${b.id}.label}} {{#if blocks.${b.id}.running}}` : ''}</li>)}
          <li>{'{{icon "moon"}}'} — {ICON_NAMES.join(' ')}</li>
        </ul></details>
    </>}
  </div>;
}

// ── 로직: every type (the data dictionary people and AI read) and every automation, in one place ────────
export function LogicPage({spec, p, saveSpec, close}: {spec: PlannerSpec; p: Planner; saveSpec: (change: (s: PlannerSpec) => PlannerSpec) => Promise<void>; close: () => void}) {
  const [tab, setTab] = useState<'types' | 'flows'>('types'), [edit, setEdit] = useState<string | null>(null);
  const [logic, setLogic] = useState(() => Logic.parse(spec.logic ?? {})), [dirty, setDirty] = useState(false);
  const put = (l: Logic) => { setLogic(l); setDirty(true); };
  const count = (id: string) => p.records.filter(r => r.kind === 'entry' && !r.deletedAt && (r.body as {type: string}).type === id).length;
  const exportAll = () => {
    const lines = p.records.filter(r => r.kind === 'entry' && !r.deletedAt).map(r => { const b = r.body as {type: string; fields: Record<string, unknown>}; const t = logic.types.find(x => x.id === b.type);
      return JSON.stringify({id: r.id, day: r.logicalDay, ...b, type: t?.name ?? b.type, fields: Object.fromEntries(Object.entries(b.fields).map(([k, v]) => [t?.fields.find(f => f.id === k)?.name ?? k, v]))}); });
    const dict = JSON.stringify({types: logic.types, flows: logic.flows.map(f => ({...f, sentence: flowSentence(f, logic.types)}))}, null, 2);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`// lit logic\n${dict}\n// entries (JSON Lines)\n${lines.join('\n')}\n`], {type: 'text/plain'})); a.download = `lit-${new Date().toISOString().slice(0, 10)}.jsonl`; a.click();
  };
  return <div className="studio-wrap"><div className="studio logic-page" role="dialog" aria-label="로직">
    <header className="studio-bar"><button className="ghost" onClick={close} aria-label="닫기">←</button><h2>로직</h2>
      <button className="ghost small" onClick={exportAll}>내보내기</button>
      <button className="primary" disabled={!dirty} onClick={async () => { await saveSpec(s => ({...s, logic})); setDirty(false); close(); }}>저장</button></header>
    <nav className="studio-steps" role="tablist">{([['types', '기록 묶음'], ['flows', '자동화']] as const).map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</nav>
    <div className="studio-body single">
      {tab === 'types' && <ul className="dict">{logic.types.map(t => <li key={t.id}>
        <div className="dict-head">{t.icon && <Icon name={t.icon} size={18} />}<b>{t.name}</b><span className="mono muted small">{t.id} · {count(t.id)}줄</span>
          <span className="muted small">{allWidgets(spec).filter(x => x.w.type === 'made' && x.w.options.type === t.id).map(x => x.w.title || '만든 위젯').join(', ')}</span></div>
        {t.desc && <p className="small">{t.desc}</p>}
        {t.from && legacyCount(p.records, t) > 0 && <ImportButton t={t} p={p} />}
        <ul className="dict-fields">{t.fields.map(f => <li key={f.id}><b>{f.name}</b> <span className="muted">{FIELD_KINDS.find(k => k.id === f.kind)?.name}{f.unit ? ` · ${f.unit}` : ''}{f.options.length ? ` · ${f.options.join('/')}` : ''}</span>{f.desc && <span className="small"> — {f.desc}</span>}</li>)}</ul>
      </li>)}{!logic.types.length && <li className="muted">아직 만든 기록 묶음이 없어요.</li>}</ul>}
      {tab === 'flows' && <><ul className="sp-flows">{logic.flows.map(f => <li key={f.id} className={f.enabled ? '' : 'off'}>
        {edit === f.id ? <><FlowEditor flow={f} types={logic.types} onChange={x => put({...logic, flows: logic.flows.map(y => y.id === x.id ? x : y)})} onDelete={() => { put({...logic, flows: logic.flows.filter(y => y.id !== f.id)}); setEdit(null); }} /><button className="ghost small" onClick={() => setEdit(null)}>접기</button></>
          : <div className="inline"><input type="checkbox" checked={f.enabled} onChange={e => put({...logic, flows: logic.flows.map(y => y.id === f.id ? {...y, enabled: e.target.checked} : y)})} aria-label="켜기" />
            <button className="link flow-line" onClick={() => setEdit(f.id)}>{f.name && <b>{f.name} · </b>}{flowSentence(f, logic.types)}</button></div>}</li>)}</ul>
        {logic.types.length > 0 && <button className="small" onClick={() => { const f = newFlow(logic.types[0]!.id); put({...logic, flows: [...logic.flows, f]}); setEdit(f.id); }}>+ 자동화</button>}</>}
    </div>
  </div></div>;
}

/** Copies records lit kept before blocks (timer sessions, sleep, condition checks) into a type, once. */
function ImportButton({t, p}: {t: TypeDef; p: Planner}) {
  const [busy, setBusy] = useState<string | null>(null);
  const n = legacyCount(p.records, t);
  return <div className="inline"><button className="small" disabled={!!busy} onClick={async () => { setBusy('0'); const done = await importLegacy(p, t, k => setBusy(String(k))); setBusy(null); alert(`${done}개를 가져왔어요`); }}>
    {busy ? `가져오는 중 ${busy}/${n}` : `예전 기록 ${n}개 가져오기`}</button></div>;
}
