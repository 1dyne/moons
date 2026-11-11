import {useEffect, useState} from 'react';
import {BLOCKS, PERMISSIONS, PROP_TYPES, WidgetManifest, codeHash, isCode, placeNew, tabsOf, widgetInfo, type Block, type Column, type LibraryItem, type PlannerSpec, type Widget} from '@workspace/planner-spec';
import {libraryApi, useLibrary} from '../library.tsx';
import {hiddenOnPhone, openByDefault, phoneOrder} from '../phone.tsx';
import {currentTab} from './PlannerView.tsx';
import {canvasOf} from './Canvas.tsx';
import {openStudio} from '../made/Studio.tsx';

// The menu (≡): everything that is not today's planner lives here, out of the way of daily use.
// Sections follow plugin managers (Obsidian: installed list with toggles, code gated until approved;
// Figma: manifest permissions, sandboxed frame) and Notion's sidebar (templates and settings tucked aside).
type Section = 'home' | 'library' | 'make' | 'installed' | 'dev' | 'mobile';
const KIND_NAME = {widget: '저장한 위젯', template: '페이지 틀', skin: '스킨', custom: '내 위젯'} as const;

export function MenuDrawer({open, close, spec, saveSpec, openSettings, openDecorate}: {open: boolean; close: () => void; spec: PlannerSpec; saveSpec: (s: PlannerSpec) => Promise<void>; openSettings: () => void; openDecorate?: () => void}) {
  const [section, setSection] = useState<Section>('home'), lib = useLibrary();
  // Widgets can arrive from elsewhere (Claude, the developer CLI): read the library again whenever the menu opens.
  useEffect(() => { if (!open) setSection('home'); else void lib?.reload(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; if (open) addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open, close]);
  if (!open) return null;
  const title = {home: '메뉴', library: '내 라이브러리', make: '위젯 만들기', installed: '설치한 위젯', dev: '개발자', mobile: '모바일 배치'}[section];
  return <div className="drawer-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <aside className="drawer" role="dialog" aria-label={title}>
      <header className="drawer-head">
        {section !== 'home' && <button className="ghost small" onClick={() => setSection('home')} aria-label="메뉴로">‹</button>}
        <strong>{title}</strong>
        <button className="ghost small" onClick={close} aria-label="닫기">✕</button>
      </header>
      {section === 'home' && <nav className="drawer-nav">
        <button onClick={() => setSection('mobile')}><b>모바일 배치</b><span>폰에서 보일 위젯과 순서, 처음에 펼칠 것</span></button>
        {openDecorate && <button onClick={() => { close(); openDecorate(); }}><b>꾸미기</b><span>PC 배치·스킨·위젯 설정</span></button>}
        <button onClick={() => setSection('library')}><b>내 라이브러리</b><span>저장한 위젯·페이지 틀·스킨</span></button>
        <button onClick={() => { close(); openStudio({pick: true}); }}><b>위젯 만들기</b><span>블록으로 조립하고, 기록·자동화·디자인을 정해요</span></button>
        <button onClick={() => { close(); openStudio({logic: true}); }}><b>로직</b><span>기록 묶음(데이터 사전)과 자동화 전체, 내보내기</span></button>
        <button onClick={() => setSection('installed')}><b>설치한 위젯</b><span>켜고 끄기, 권한 확인</span></button>
        <button onClick={() => setSection('make')}><b>설명서로 위젯 만들기</b><span>위젯 설명서(manifest)를 붙여 넣어요</span></button>
        <button onClick={() => setSection('dev')}><b>개발자</b><span>코드로 위젯 만들기, 개발자 토큰</span></button>
        <button onClick={() => { close(); openSettings(); }}><b>설정</b><span>하루 기준, 화면 구성, 계정</span></button>
      </nav>}
      {section === 'library' && <LibraryView spec={spec} saveSpec={saveSpec} close={close} />}
      {section === 'make' && <MakeWidget done={() => setSection('installed')} />}
      {section === 'installed' && <Installed spec={spec} saveSpec={saveSpec} />}
      {section === 'dev' && <DevView />}
      {section === 'mobile' && <MobileArrange spec={spec} saveSpec={saveSpec} />}
    </aside>
  </div>;
}

/** Put a library widget on the day page (below everything else). */
export function placeCustom(spec: PlannerSpec, item: LibraryItem<'custom'>): PlannerSpec {
  const day = spec.canvas.day ?? [], m = item.data.manifest;
  const w = placeNew(day, 'custom', `custom-${Date.now().toString(36)}`, 'free');
  const sized: Widget = {...w, w: m.size.w * 4, h: m.size.h * 3, title: m.name, options: {ref: item.id}};
  return {...spec, canvas: {day: [...day, sized], mode: 'free'}};
}

function LibraryView({spec, saveSpec, close}: {spec: PlannerSpec; saveSpec: (s: PlannerSpec) => Promise<void>; close: () => void}) {
  const lib = useLibrary();
  const [renaming, setRenaming] = useState<string | null>(null), [confirm, setConfirm] = useState<string | null>(null), [msg, setMsg] = useState('');
  if (!lib) return null;
  const groups = (['template', 'skin', 'widget', 'custom'] as const).map(k => [k, lib.items.filter(x => x.kind === k)] as const);
  const apply = async (it: LibraryItem) => {
    if (it.kind === 'template') { const d = (it as LibraryItem<'template'>).data; await saveSpec({...spec, canvas: {day: d.widgets, mode: 'free'}, ...(d.skin ? {skin: d.skin} : {})}); }
    if (it.kind === 'skin') await saveSpec({...spec, skin: (it as LibraryItem<'skin'>).data.skin});
    if (it.kind === 'custom') await saveSpec(placeCustom(spec, it as LibraryItem<'custom'>));
    setConfirm(null); close();
  };
  return <div className="drawer-body">
    {msg && <p className="muted small">{msg}</p>}
    {lib.items.length === 0 && <p className="muted">아직 비어 있어요. 꾸미기에서 위젯을 고른 뒤 "내 위젯으로 저장", 페이지는 "틀로 저장"을 눌러요.</p>}
    {groups.filter(([, l]) => l.length).map(([k, list]) => <section key={k} className="lib-group"><h3>{KIND_NAME[k]}</h3>
      <ul className="lib-list">{list.map(it => <li key={it.id}>
        {renaming === it.id ? <form className="inline" onSubmit={async e => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('n') ?? ''); setRenaming(null); if (v.trim()) await lib.patch(it.id, {name: v}); }}>
          <input name="n" defaultValue={it.name} autoFocus maxLength={40} aria-label="이름" /><button className="small primary">바꾸기</button></form>
          : <span className="lib-name">{it.name}{it.kind === 'custom' && <em className="muted small"> {(it as LibraryItem<'custom'>).data.manifest.version}</em>}</span>}
        <span className="lib-actions">
          {it.kind === 'template' && (confirm === it.id ? <><span className="small">오늘 페이지를 이 틀로 바꿀까요? 기록은 그대로예요.</span><button className="small primary" onClick={() => void apply(it)}>바꾸기</button><button className="small ghost" onClick={() => setConfirm(null)}>아니요</button></>
            : <button className="small" onClick={() => setConfirm(it.id)}>이 틀 쓰기</button>)}
          {it.kind === 'skin' && <button className="small" onClick={() => void apply(it)}>이 스킨 쓰기</button>}
          {it.kind === 'custom' && <button className="small" onClick={() => void apply(it)}>오늘 페이지에 넣기</button>}
          {it.kind === 'widget' && <span className="muted small">꾸미기 → 내 위젯</span>}
          <button className="ghost small" onClick={() => setRenaming(it.id)}>이름</button>
          <button className="ghost small danger" onClick={async () => { await lib.remove(it.id); setMsg(`${it.name}을(를) 지웠어요.`); }}>지우기</button>
        </span>
      </li>)}</ul></section>)}
  </div>;
}

/** Block builder for non-developers, plus a manifest box for what Claude or a developer wrote. */
function MakeWidget({done}: {done: () => void}) {
  const lib = useLibrary();
  const [mode, setMode] = useState<'blocks' | 'json'>('blocks');
  const [name, setName] = useState(''), [cols, setCols] = useState<Column[]>([{name: '이름', type: 'text', options: []}, {name: '값', type: 'number', options: []}]);
  const [scope, setScope] = useState<'all' | 'day'>('all'), [blocks, setBlocks] = useState<Block[]>([{block: 'form'}, {block: 'table'}]);
  const [json, setJson] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (!lib) return null;
  const keys = cols.map(c => c.name), numCols = cols.filter(c => c.type === 'number').map(c => c.name), checkCols = cols.filter(c => c.type === 'check').map(c => c.name);
  const newBlock = (b: Block['block']): Block => b === 'text' ? {block: 'text', text: ''} : b === 'form' ? {block: 'form'} : b === 'table' ? {block: 'table'}
    : b === 'list' ? {block: 'list', title: keys[0] ?? ''} : b === 'chart' ? {block: 'chart', x: keys[0] ?? '', y: numCols[0] ?? '', kind: 'bar', last: 14}
    : b === 'gauge' ? {block: 'gauge', value: numCols[0] ?? '', target: 100, agg: 'sum'} : {block: 'stat', value: numCols[0] ?? '', agg: 'sum'};
  const setB = (i: number, p: Partial<Block>) => setBlocks(blocks.map((b, j) => j === i ? {...b, ...p} as Block : b));
  const save = async (raw: unknown) => {
    setError('');
    const m = WidgetManifest.safeParse(raw);
    if (!m.success) { setError(m.error.issues.slice(0, 3).map(i => `${i.path.join('.') || '설명서'}: ${i.message}`).join(' · ')); return; }
    setBusy(true);
    try { await lib.save({kind: 'custom', data: {manifest: m.data}}); done(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const fromBlocks = () => ({id: (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'w') .slice(0, 24) + '-' + Date.now().toString(36).slice(-4),
    name: name.trim() || '내 위젯', permissions: ['table:read', 'table:write'], data: {columns: cols.filter(c => c.name.trim()), scope}, view: blocks});
  return <div className="drawer-body">
    <div className="seg" role="tablist">
      <button role="tab" aria-selected={mode === 'blocks'} className={mode === 'blocks' ? 'on' : ''} onClick={() => setMode('blocks')}>블록으로</button>
      <button role="tab" aria-selected={mode === 'json'} className={mode === 'json' ? 'on' : ''} onClick={() => setMode('json')}>설명서 붙여넣기</button>
    </div>
    {mode === 'blocks' ? <div className="mk">
      <label>위젯 이름 <input value={name} onChange={e => setName(e.target.value)} maxLength={40} /></label>
      <fieldset><legend>열 (이 위젯이 모으는 칸)</legend>
        {cols.map((c, i) => <div key={i} className="inline mk-col">
          <input value={c.name} onChange={e => setCols(cols.map((x, j) => j === i ? {...x, name: e.target.value} : x))} aria-label="열 이름" maxLength={30} />
          <select value={c.type} onChange={e => setCols(cols.map((x, j) => j === i ? {...x, type: e.target.value as Column['type']} : x))} aria-label="종류">{PROP_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          {c.type === 'select' && <input value={c.options.join(', ')} onChange={e => setCols(cols.map((x, j) => j === i ? {...x, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)} : x))} aria-label="선택지 (쉼표)" />}
          <button className="ghost small" onClick={() => setCols(cols.filter((_, j) => j !== i))} aria-label="열 지우기">×</button>
        </div>)}
        <button className="small" onClick={() => setCols([...cols, {name: '', type: 'text', options: []}])}>+ 열</button>
        <label className="small-label"><input type="checkbox" checked={scope === 'day'} onChange={e => setScope(e.target.checked ? 'day' : 'all')} /> 그날 쓴 줄만 보기</label>
      </fieldset>
      <fieldset><legend>블록 (보이는 순서)</legend>
        {blocks.map((b, i) => <div key={i} className="mk-block">
          <strong className="small">{BLOCKS.find(x => x.id === b.block)?.name}</strong>
          {b.block === 'text' && <input value={b.text} onChange={e => setB(i, {text: e.target.value})} aria-label="글" />}
          {b.block === 'list' && <><Pick label="목록 열" v={b.title} list={keys} set={v => setB(i, {title: v})} /><Pick label="체크 열" v={b.check ?? ''} list={['', ...checkCols]} set={v => setB(i, {check: v || undefined})} /></>}
          {b.block === 'chart' && <><Pick label="가로" v={b.x} list={keys} set={v => setB(i, {x: v})} /><Pick label="세로(숫자)" v={b.y} list={numCols} set={v => setB(i, {y: v})} />
            <Pick label="모양" v={b.kind} list={['bar', 'line']} names={{bar: '막대', line: '선'}} set={v => setB(i, {kind: v as 'bar'})} /></>}
          {(b.block === 'gauge' || b.block === 'stat') && <><Pick label="숫자 열" v={b.value} list={numCols} set={v => setB(i, {value: v})} />
            <Pick label="계산" v={b.agg} list={['sum', 'avg', 'last', 'max', 'count']} names={{sum: '합계', avg: '평균', last: '마지막', max: '최대', count: '개수'}} set={v => setB(i, {agg: v as 'sum'})} />
            {b.block === 'gauge' && <label className="small">목표 <input className="num" inputMode="decimal" value={b.target} onChange={e => setB(i, {target: Math.max(1, Number(e.target.value) || 1)})} /></label>}</>}
          <span className="mk-move"><button className="ghost small" disabled={i === 0} onClick={() => { const n = [...blocks]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setBlocks(n); }} aria-label="위로">↑</button>
            <button className="ghost small" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))} aria-label="블록 지우기">×</button></span>
        </div>)}
        <div className="mk-add">{BLOCKS.map(b => <button key={b.id} className="small" title={b.desc} onClick={() => setBlocks([...blocks, newBlock(b.id)])}>+ {b.name}</button>)}</div>
      </fieldset>
      <button className="primary" disabled={busy} onClick={() => void save(fromBlocks())}>라이브러리에 저장</button>
    </div> : <div className="mk">
      <textarea rows={14} value={json} onChange={e => setJson(e.target.value)} spellCheck={false} className="mono" aria-label="위젯 설명서 JSON" />
      <button className="primary" disabled={busy || !json.trim()} onClick={() => { try { void save(JSON.parse(json)); } catch { setError('JSON 형식이 아니에요.'); } }}>라이브러리에 저장</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

function Pick({label, v, list, set, names}: {label: string; v: string; list: string[]; set: (v: string) => void; names?: Record<string, string>}) {
  return <label className="small">{label} <select value={v} onChange={e => set(e.target.value)}>{list.map(x => <option key={x} value={x}>{names?.[x] ?? (x || '없음')}</option>)}</select></label>;
}

function Installed({spec, saveSpec}: {spec: PlannerSpec; saveSpec: (s: PlannerSpec) => Promise<void>}) {
  const lib = useLibrary();
  if (!lib) return null;
  const list = lib.items.filter((x): x is LibraryItem<'custom'> => x.kind === 'custom');
  const used = new Set([...(spec.canvas.day ?? []), ...(spec.tabs ?? []).flatMap(t => t.widgets ?? [])].filter(w => w.type === 'custom').map(w => String(w.options.ref)));
  return <div className="drawer-body">
    {list.length === 0 && <p className="muted">설치한 위젯이 없어요. 위젯 만들기, Claude(lit 커넥터), 개발자 도구로 넣을 수 있어요.</p>}
    <ul className="inst-list">{list.map(it => { const m = it.data.manifest, code = isCode(m), ok = !code || it.approved === codeHash(m);
      return <li key={it.id}>
        <div className="inst-head"><strong>{m.name}</strong><label className="switch"><input type="checkbox" checked={it.enabled} onChange={e => void lib.patch(it.id, {enabled: e.target.checked})} /><span>{it.enabled ? '켜짐' : '꺼짐'}</span></label></div>
        <p className="muted small">{m.version} · {code ? '코드' : '블록'} · {it.source === 'claude' ? 'Claude' : it.source === 'developer' ? '개발자 도구' : '직접'}{used.has(it.id) ? ' · 페이지에 있음' : ''}{m.description ? ` · ${m.description}` : ''}</p>
        {code && <p className="small">권한: {m.permissions.length ? m.permissions.map(p => PERMISSIONS.find(x => x.id === p)?.name ?? p).join(', ') : '없음'} · 인터넷 접속 없음</p>}
        <div className="inline">
          {code && (ok ? <button className="small ghost" onClick={() => void lib.patch(it.id, {approve: false})}>승인 거두기</button> : <button className="small primary" onClick={() => void lib.patch(it.id, {approve: true, enabled: true})}>코드 승인하고 켜기</button>)}
          {!used.has(it.id) && <button className="small" onClick={() => void saveSpec(placeCustom(spec, it))}>오늘 페이지에 넣기</button>}
        </div>
      </li>; })}</ul>
  </div>;
}

function DevView() {
  const [tokens, setTokens] = useState<{id: string; label: string; createdAt: string; lastUsedAt: string | null}[]>([]), [fresh, setFresh] = useState(''), [label, setLabel] = useState(''), [error, setError] = useState('');
  const load = () => libraryApi.tokens().then(setTokens).catch(e => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  const origin = location.origin;
  return <div className="drawer-body dev">
    <p className="small">코드 위젯은 HTML·CSS·TypeScript(JavaScript)로 만들어요. lit 안의 격리된 칸에서 돌고, 인터넷 없이 <code>lit</code> API로만 기록을 읽고 써요.</p>
    <pre className="mono dev-cmd">{`# lit 저장소에서
node lib/lit-widget-sdk/bin/lit-widget.mjs create my-widget
cd my-widget
node ../lib/lit-widget-sdk/bin/lit-widget.mjs dev      # 예시 데이터로 미리보기
node ../lib/lit-widget-sdk/bin/lit-widget.mjs publish --url ${origin} --token <토큰>`}</pre>
    <p className="small muted">문서: docs/lit/WIDGET_PLATFORM.md · docs/lit/DEVELOPER_GUIDE.md</p>
    <h3>개발자 토큰</h3>
    <p className="small muted">publish에 써요. 토큰으로 올린 위젯도 여기서 승인하기 전에는 실행되지 않아요.</p>
    <form className="inline" onSubmit={async e => { e.preventDefault(); try { const t = await libraryApi.newToken(label || '개발 도구'); setFresh(t.token); setLabel(''); await load(); } catch (err) { setError((err as Error).message); } }}>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="토큰 이름" aria-label="토큰 이름" maxLength={40} /><button className="small primary">만들기</button></form>
    {fresh && <p className="dev-token"><span className="small">지금만 보여요. 복사해 두세요:</span><code>{fresh}</code><button className="small" onClick={() => { void navigator.clipboard?.writeText(fresh).catch(() => {}); }}>복사</button></p>}
    <ul className="lib-list">{tokens.map(t => <li key={t.id}><span className="lib-name">{t.label} <em className="muted small">{t.lastUsedAt ? `마지막 사용 ${t.lastUsedAt.slice(0, 10)}` : '아직 안 씀'}</em></span>
      <button className="ghost small danger" onClick={async () => { await libraryApi.revokeToken(t.id); await load(); }}>취소</button></li>)}</ul>
    {error && <p className="error">{error}</p>}
  </div>;
}


/** 모바일 배치: which widgets a phone shows, in what order, and which start open. Per page (오늘 or the open page tab). */
function MobileArrange({spec, saveSpec}: {spec: PlannerSpec; saveSpec: (s: PlannerSpec) => Promise<void>}) {
  const tabs = tabsOf(spec), cur = tabs.find(t => t.id === currentTab());
  const pageTab = cur && cur.kind === 'page' ? cur : undefined;
  const source = pageTab ? pageTab.widgets ?? [] : canvasOf(spec);
  const [list, setList] = useState(() => phoneOrder(source)), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const set = (id: string, patch: Record<string, unknown>) => setList(l => l.map(w => w.id === id ? {...w, options: {...w.options, ...patch}} : w));
  const move = (i: number, d: number) => setList(l => { const n = [...l], j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const save = async () => {
    setBusy(true);
    const ordered = list.map((w, i) => ({...w, options: {...w.options, mOrder: i}}));
    const byId = new Map(ordered.map(w => [w.id, w]));
    const apply = (ws: Widget[]) => ws.map(w => byId.get(w.id) ?? w);
    try {
      await saveSpec(pageTab ? {...spec, tabs: tabs.map(t => t.id === pageTab.id ? {...t, widgets: apply(t.widgets ?? [])} : t)} : {...spec, canvas: {...spec.canvas, day: apply(canvasOf(spec)), mode: 'free'}});
      setMsg('저장했어요');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="drawer-body">
    <p className="small"><b>{pageTab ? pageTab.name : '오늘'}</b> 페이지</p>
    <ul className="m-arrange">{list.map((w, i) => <li key={w.id} className={hiddenOnPhone(w) ? 'off' : ''}>
      <span className="m-name">{w.title || widgetInfo(w.type).label}</span>
      <label className="small-label"><input type="checkbox" checked={!hiddenOnPhone(w)} onChange={e => set(w.id, {mHide: !e.target.checked})} /> 보이기</label>
      <label className="small-label"><input type="checkbox" checked={openByDefault(w)} disabled={hiddenOnPhone(w)} onChange={e => set(w.id, {mOpen: e.target.checked})} /> 펼침</label>
      <span className="m-move"><button className="ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">↑</button><button className="ghost small" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="아래로">↓</button></span>
    </li>)}</ul>
    <div className="inline"><button className="primary" disabled={busy} onClick={() => void save()}>저장</button>{msg && <span className="small muted">{msg}</span>}</div>
  </div>;
}
