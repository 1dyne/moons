import {useMemo, useState} from 'react';
import {logicalDay, type Settings} from '@workspace/life-contract';
import {CHECKS, DONE_STYLES, FONTS, METRICS, isCode as isCodeManifest, type LibraryItem, WIDGET_LABELS, tabsOf, type PropDef, PALETTE, SKIN_PRESETS, Skin, WIDGETS, applyCanvas, fontInfo, isDecor, minSize, placeNew, settle, toFree, toGrid, widgetInfo, type CanvasMode, type PlannerSpec, type WidgetType, type Widget} from '@workspace/planner-spec';
import {useFontFamily} from '../fonts.ts';
import {ofKind, type Planner} from '../data.ts';
import {DayCanvas, canvasOf, skinProps} from './Canvas.tsx';
import {useLibrary} from '../library.tsx';
import {GaugePicker, GaugeProvider} from '../Gauge.tsx';
import {Tip} from '../Tip.tsx';
import {WidgetOptions} from './WidgetOptions.tsx';

// DIY editor: add widgets, drag to place, drag the corner to size, style each one, and dress the page with a skin.
// It edits the live page (real records in the planner, sample records in the builder), so what you see is what you use.
const SWATCHES = PALETTE;
let seq = 0;
const newId = (type: string) => `${type}-${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 40);

export function Editor({spec, settings, p, saveLabel, onSave, onCancel, hint, pageId, modeId}: {spec: PlannerSpec; settings: Settings; p: Planner; saveLabel: string; onSave: (spec: PlannerSpec) => Promise<void> | void; onCancel?: () => void; hint?: string; pageId?: string; modeId?: string}) {
  const today = logicalDay(new Date(), settings);
  // A page tab is edited the same way. One placement mode (the fine lattice); old 정리형 pages arrive converted.
  const pageTab = pageId ? tabsOf(spec).find(t => t.id === pageId) : undefined;
  // A built-in tab (주간·월·목표·분석) becomes a page holding that view as a widget, so it can be decorated too.
  const viewOf = {week: 'week-view', month: 'month-view', goals: 'goals-view', insights: 'insights-view'} as const;
  // A mode's own day page (the second template) is edited the same way.
  const modeEdit = modeId ? (spec.modes ?? []).find(m => m.id === modeId) : undefined;
  const [widgets, setWidgets] = useState<Widget[]>(() => modeEdit ? modeEdit.widgets ?? canvasOf(spec) : !pageTab ? canvasOf(spec) : pageTab.kind === 'page' ? pageTab.widgets ?? []
    : [{id: newId(viewOf[pageTab.kind as keyof typeof viewOf]), type: viewOf[pageTab.kind as keyof typeof viewOf], x: 0, y: 0, w: 48, h: 72, options: {}}]);
  const mode: CanvasMode = 'free', M = METRICS[mode];
  const [skin, setSkin] = useState<Skin>(() => spec.skin ?? Skin.parse({}));
  const [selected, setSelected] = useState<string | null>(null), [panel, setPanel] = useState<'widgets' | 'skin'>(widgets.length ? 'skin' : 'widgets');
  const [history, setHistory] = useState<Widget[][]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const change = (ws: Widget[]) => { setHistory(h => [...h.slice(-30), widgets]); setWidgets(ws); };
  const undo = () => { const prev = history.at(-1); if (prev) { setWidgets(prev); setHistory(h => h.slice(0, -1)); } };
  const add = (type: WidgetType) => { const w = placeNew(widgets, type, newId(type), mode); change([...widgets, w]); setSelected(w.id); };
  // 내 라이브러리: saved widgets come back as copies; library widgets are placed by reference.
  const lib = useLibrary(), [savedMsg, setSavedMsg] = useState('');
  const addFrom = (base: Widget) => { const at = placeNew(widgets, base.type, newId(base.type), mode); const w = {...base, id: at.id, x: at.x, y: at.y}; change([...widgets, w]); setSelected(w.id); };
  const addCustom = (it: LibraryItem<'custom'>) => { const m = it.data.manifest, at = placeNew(widgets, 'custom', newId('custom'), mode); addFrom({...at, w: m.size.w * 4, h: m.size.h * 3, title: m.name, options: {ref: it.id}}); };
  const keep = async (item: Parameters<NonNullable<typeof lib>['save']>[0], what: string) => { if (!lib) return; try { await lib.save(item); setSavedMsg(`${what} 저장했어요 (메뉴 → 내 라이브러리)`); } catch (e) { setSavedMsg((e as Error).message); } setTimeout(() => setSavedMsg(''), 3000); };
  const sel = widgets.find(w => w.id === selected);
  const patch = (id: string, patch: Partial<Widget>) => change(settle(widgets.map(w => w.id === id ? {...w, ...patch} : w), id, mode));
  const opt = (id: string, key: string, value: unknown) => change(widgets.map(w => w.id === id ? {...w, options: {...w.options, [key]: value}} : w));
  const nav = useMemo(() => ({day: today, setDay: () => {}, openGoal: () => {}}), [today]);
  const sp = skinProps(skin);
  const save = async () => { setBusy(true); setError(''); try { await onSave(modeEdit ? {...spec, skin, modes: (spec.modes ?? []).map(m => m.id === modeEdit.id ? {...m, widgets} : m)} : pageTab ? {...spec, skin, tabs: tabsOf(spec).map(t => t.id === pageTab.id ? {...t, kind: 'page' as const, widgets} : t)} : applyCanvas(spec, widgets, skin, mode)); } catch (e) { setError((e as Error).message); setBusy(false); } };
  const goals = ofKind(p.records, 'goal');

  return <div className="editor">
    <div className="ed-bar">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={panel === 'widgets'} className={panel === 'widgets' ? 'on' : ''} onClick={() => setPanel('widgets')}>＋ 위젯</button>
        <button role="tab" aria-selected={panel === 'skin'} className={panel === 'skin' ? 'on' : ''} onClick={() => setPanel('skin')}>스킨</button>
      </div>
      {pageTab && <strong className="ed-page">{pageTab.name} 페이지</strong>}
      <span className="muted small ed-hint"><Tip id={hint ? `editor-${hint.slice(0, 12)}` : 'editor-drag'}>{hint ?? '위젯 머리(⠿)를 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿔요.'}</Tip></span>
      {savedMsg && <span className="small saved-msg" role="status">{savedMsg}</span>}
      {lib && <button className="ghost small" onClick={() => void keep({kind: 'template', name: `${pageTab?.name ?? spec.name} 틀`, data: {widgets, skin}}, '페이지 틀을')}>틀로 저장</button>}
      <button className="ghost small" onClick={undo} disabled={!history.length}>되돌리기</button>
      {onCancel && <button className="ghost small" onClick={onCancel}>취소</button>}
      <button className="primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : saveLabel}</button>
    </div>
    {error && <p className="error">{error}</p>}
    <div className="ed-body">
      <aside className="ed-side" aria-label={panel === 'widgets' ? '위젯 고르기' : '스킨'}>
        {panel === 'widgets' ? <>
          {(['기록', '시간', '목표', '나', '보기', '꾸미기'] as const).map(g => <div key={g} className="ed-group"><span className="muted small">{g}</span>
            {WIDGETS.filter(w => w.group === g).map(w => <button key={w.type} className="ed-widget" onClick={() => add(w.type)}>
              <strong>＋ {w.label}</strong><span>{w.desc}</span>{widgets.some(x => x.type === w.type) && <em>사용 중</em>}
            </button>)}
          </div>)}
          {lib && <div className="ed-group"><span className="muted small">내 위젯</span>
            {lib.items.filter((x): x is LibraryItem<'custom'> => x.kind === 'custom' && x.enabled).map(it => <button key={it.id} className="ed-widget" onClick={() => addCustom(it)}><strong>＋ {it.name}</strong><span>{it.data.manifest.description || (isCodeManifest(it.data.manifest) ? '코드 위젯' : '블록 위젯')}</span></button>)}
            {lib.items.filter((x): x is LibraryItem<'widget'> => x.kind === 'widget').map(it => <button key={it.id} className="ed-widget" onClick={() => addFrom(it.data.widget)}><strong>＋ {it.name}</strong><span>저장한 {widgetInfo(it.data.widget.type).label}</span></button>)}
            {!lib.items.some(x => x.kind === 'custom' || x.kind === 'widget') && <span className="muted small">메뉴 → 위젯 만들기, 또는 위젯을 고르고 "내 위젯으로 저장"</span>}
          </div>}
        </> : <SkinPanel skin={skin} setSkin={setSkin} />}
      </aside>
      <div className={`ed-canvas ${sp.className}`} style={sp.style}><GaugeProvider value={skin.gauge ?? 'segment'}>
        <DayCanvas spec={{...spec, skin}} settings={settings} p={p} today={today} day={today} nav={nav}
          edit={{widgets, mode, selected, select: setSelected, change: ws => change(ws)}} />
      </GaugeProvider></div>
      {!sel && <aside className="ed-inspect empty" aria-label="위젯 설정"><p className="muted small">위젯을 누르면 여기서 설정해요.</p></aside>}
      {sel && <aside className="ed-inspect" aria-label="위젯 설정">
        <div className="ed-inspect-head"><strong>{widgetInfo(sel.type).label}</strong><button className="ghost small" onClick={() => setSelected(null)} aria-label="닫기">✕</button></div>
        <label>제목 <input value={sel.title ?? widgetInfo(sel.type).label} onChange={e => patch(sel.id, {title: e.target.value})} /></label>
        <label className="row-check"><input type="checkbox" checked={sel.title === ''} onChange={e => patch(sel.id, {title: e.target.checked ? '' : undefined})} /> 제목 숨기기</label>
        <span className="muted small">색</span>
        <div className="swatches">{SWATCHES.map(c => <button key={c} className={`swatch ${sel.color === c ? 'on' : ''}`} style={{background: c}} onClick={() => patch(sel.id, {color: c})} aria-label={`색 ${c}`} />)}
          <input type="color" value={sel.color ?? skin.accent} onChange={e => patch(sel.id, {color: e.target.value})} aria-label="직접 고르기" />
          {sel.color && <button className="ghost small" onClick={() => patch(sel.id, {color: undefined})}>스킨 색</button>}</div>
        <FontSelect label="글꼴" value={sel.font} onChange={f => patch(sel.id, {font: f})} allowInherit />
        <div className="inline color-pair">
          <label className="sk-color">위젯 바탕<input type="color" value={sel.background ?? skin.surface} onChange={e => patch(sel.id, {background: e.target.value})} /></label>
          <label className="sk-color">글자<input type="color" value={sel.ink ?? skin.ink} onChange={e => patch(sel.id, {ink: e.target.value})} /></label>
          {(sel.background || sel.ink) && <button className="ghost small" onClick={() => patch(sel.id, {background: undefined, ink: undefined})}>스킨대로</button>}
        </div>
        {isDecor(sel.type) && <div className="decor-tools">
          <label>기울기 <input type="range" min={-45} max={45} value={Number(sel.options.rotate ?? 0)} onChange={e => opt(sel.id, 'rotate', Number(e.target.value))} /> {Number(sel.options.rotate ?? 0)}°</label>
          <label>가로 미세 조정 <input type="range" min={-40} max={40} value={Number(sel.options.dx ?? 0)} onChange={e => opt(sel.id, 'dx', Number(e.target.value))} /></label>
          <label>세로 미세 조정 <input type="range" min={-30} max={30} value={Number(sel.options.dy ?? 0)} onChange={e => opt(sel.id, 'dy', Number(e.target.value))} /></label>
          <div className="inline"><button className="small" onClick={() => opt(sel.id, 'layer', Number(sel.options.layer ?? 0) + 1)}>앞으로</button><button className="small" onClick={() => opt(sel.id, 'layer', Number(sel.options.layer ?? 0) - 1)}>뒤로</button></div>
        </div>}
        {!isDecor(sel.type) && mode === 'free' && <div className="inline"><button className="small" onClick={() => opt(sel.id, 'layer', Number(sel.options.layer ?? 0) + 1)}>앞으로</button><button className="small" onClick={() => opt(sel.id, 'layer', Number(sel.options.layer ?? 0) - 1)}>뒤로</button>
          {sel.type === 'text' && <label>기울기 <input type="range" min={-20} max={20} value={Number(sel.options.rotate ?? 0)} onChange={e => opt(sel.id, 'rotate', Number(e.target.value))} /></label>}</div>}
        {!isDecor(sel.type) && <label className="row-check"><input type="checkbox" checked={sel.options.toggle === true} onChange={e => opt(sel.id, 'toggle', e.target.checked)} /> 토글로 접고 펴기</label>}
        {!isDecor(sel.type) && <label>모양 <select value={sel.style ?? ''} onChange={e => patch(sel.id, {style: (e.target.value || undefined) as Widget['style']})}>
          <option value="">스킨 따라가기</option><option value="card">카드(그림자)</option><option value="line">선</option><option value="filled">색 채움</option><option value="plain">테두리 없음</option></select></label>}
        <div className="inline"><label>너비 <input type="number" min={minSize(sel.type, mode).w} max={M.cols} value={sel.w} onChange={e => patch(sel.id, {w: Number(e.target.value)})} className="num" /></label>
          <label>높이 <input type="number" min={minSize(sel.type, mode).h} max={240} value={sel.h} onChange={e => patch(sel.id, {h: Number(e.target.value)})} className="num" /></label></div>
        <WidgetOptions w={sel} opt={(k, v) => opt(sel.id, k, v)} goals={goals.map(g => ({id: g.id, title: g.body.title}))} props={spec.props?.task ?? []}
          tables={[...widgets, ...(spec.canvas.day ?? []), ...(spec.tabs ?? []).flatMap(t => t.widgets ?? [])].filter((x, i, all) => (x.type === 'table' || x.type === 'wishes') && all.findIndex(y => y.id === x.id) === i).map(x => ({id: x.id, title: x.title || x.id}))} />
        {WIDGET_LABELS[sel.type] && <details className="ed-labels"><summary>버튼·칸 문구 바꾸기</summary>
          {WIDGET_LABELS[sel.type]!.map(l => { const cur = (sel.options.labels as Record<string, string> | undefined) ?? {}; return <label key={l.key}>{l.name ?? (l.def || '(빈 칸)')}
            <input value={cur[l.key] ?? ''} placeholder={l.def} maxLength={60} onChange={e => opt(sel.id, 'labels', {...cur, [l.key]: e.target.value})} /></label>; })}
        </details>}
        <div className="inline">
          <button className="small" onClick={() => { const c = {...sel, id: newId(sel.type), y: sel.y + sel.h}; change(settle([...widgets, c], c.id, mode)); setSelected(c.id); }}>복제</button>
          {lib && sel.type !== 'custom' && <button className="small" onClick={() => void keep({kind: 'widget', name: sel.title || widgetInfo(sel.type).label, data: {widget: sel}}, '위젯을')}>내 위젯으로 저장</button>}
          <button className="small danger" onClick={() => { change(widgets.filter(w => w.id !== sel.id)); setSelected(null); }}>지우기</button>
        </div>
      </aside>}
    </div>
  </div>;
}

function SkinPanel({skin, setSkin}: {skin: Skin; setSkin: (s: Skin) => void}) {
  const lib = useLibrary();
  const set = (p: Partial<Skin>) => setSkin({...skin, ...p});
  const color = (key: 'accent' | 'background' | 'surface' | 'ink', label: string) => <label className="sk-color">{label}<input type="color" value={skin[key]} onChange={e => set({[key]: e.target.value})} /></label>;
  return <div className="skin-panel">
    <span className="muted small">프리셋</span>
    {lib && lib.items.some(x => x.kind === 'skin') && <><span className="muted small">내 스킨</span>
      <div className="sk-presets">{lib.items.filter((x): x is LibraryItem<'skin'> => x.kind === 'skin').map(it => <button key={it.id} className="sk-preset" onClick={() => setSkin(it.data.skin)} style={{background: it.data.skin.background, color: it.data.skin.ink, borderColor: it.data.skin.accent}}><i style={{background: it.data.skin.accent}} />{it.name}</button>)}</div></>}
    {lib && <button className="small" onClick={async () => { await lib.save({kind: 'skin', name: `내 스킨 ${lib.items.filter(x => x.kind === 'skin').length + 1}`, data: {skin}}); }}>지금 스킨 저장</button>}
    <div className="sk-presets">{SKIN_PRESETS.map(pr => <button key={pr.id} className="sk-preset" onClick={() => setSkin(pr.skin)} style={{background: pr.skin.background, color: pr.skin.ink, borderColor: pr.skin.accent}}><i style={{background: pr.skin.accent}} />{pr.name}</button>)}</div>
    <span className="muted small">진행률 모양 <Tip id="skin-gauge">목표·월간·진행률 위젯이 모두 이 모양으로 보여요</Tip></span>
    <GaugePicker value={skin.gauge ?? 'segment'} onChange={g => set({gauge: g})} />
    <span className="muted small">체크 모양</span>
    <div className="style-pick" role="radiogroup" aria-label="체크 모양">
      {CHECKS.map(c => <button key={c.id} type="button" role="radio" aria-checked={(skin.check ?? 'box') === c.id} className={`check-${c.id} ${(skin.check ?? 'box') === c.id ? 'on' : ''}`} onClick={() => set({check: c.id})}>
        <span className="prow done"><span className="mark">○</span></span><span className="prow"><span className="mark" /></span><span>{c.name}</span>
      </button>)}
    </div>
    <span className="muted small">완료한 일 표시</span>
    <div className="style-pick" role="radiogroup" aria-label="완료한 일 표시">
      {DONE_STYLES.map(d => <button key={d.id} type="button" role="radio" aria-checked={(skin.done ?? 'red-strike') === d.id} className={`done-${d.id} ${(skin.done ?? 'red-strike') === d.id ? 'on' : ''}`} onClick={() => set({done: d.id})}>
        <span className="prow done"><span className="pname">단어 30개</span></span><span>{d.name}</span>
      </button>)}
    </div>
    <span className="muted small">강조 색 <Tip id="skin-accent">계기판의 지금 채우는 칸·넘친 시간에 쓰여요</Tip></span>
    <div className="swatches">{SWATCHES.map(c => <button key={c} className={`swatch ${skin.accent === c ? 'on' : ''}`} style={{background: c}} onClick={() => set({accent: c})} aria-label={`강조 색 ${c}`} />)}</div>
    <div className="sk-colors">{color('accent', '강조')}{color('background', '바탕')}{color('surface', '위젯')}{color('ink', '글자')}</div>
    <label>종이 <select value={skin.paper} onChange={e => set({paper: e.target.value as Skin['paper']})}><option value="plain">민무늬</option><option value="grid">모눈</option><option value="dot">도트</option><option value="lined">줄</option></select></label>
    <FontSelect label="글꼴 (전체)" value={skin.font} onChange={f => set({font: f ?? 'pretendard'})} />
    <label>위젯 모양 <select value={skin.card} onChange={e => set({card: e.target.value as Skin['card']})}><option value="line">선</option><option value="card">카드(그림자)</option><option value="filled">색 채움</option><option value="plain">테두리 없음</option></select></label>
    <label>제목 모양 <select value={skin.heading} onChange={e => set({heading: e.target.value as Skin['heading']})}><option value="rule">밑줄</option><option value="pill">태그</option><option value="plain">글자만</option></select></label>
    <label>모서리 <input type="range" min={0} max={28} value={skin.radius} onChange={e => set({radius: Number(e.target.value)})} /> {skin.radius}px</label>
  </div>;
}


/** Fonts grouped by kind, with a live sample in the chosen face. */
function FontSelect({label, value, onChange, allowInherit}: {label: string; value: string | undefined; onChange: (id: string | undefined) => void; allowInherit?: boolean}) {
  const family = useFontFamily(value);
  const kinds = [...new Set(FONTS.map(f => f.kind))];
  return <label className="font-select">{label}
    <select value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
      {allowInherit && <option value="">스킨 글꼴 따라가기</option>}
      {kinds.map(k => <optgroup key={k} label={k}>{FONTS.filter(f => f.kind === k).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>)}
    </select>
    <span className="font-sample" style={{fontFamily: family}}>{value ? fontInfo(value).name : '오늘의 다짐'} — 가나다 하루 한 걸음 123</span>
  </label>;
}

