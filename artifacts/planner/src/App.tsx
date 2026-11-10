import {createContext, useContext, useEffect, useState} from 'react';
import {useClerk} from '@clerk/react';
import {logicalDay, type AnyRecord, type Availability, type Settings} from '@workspace/life-contract';
import {CHIP_COLORS, MOODS, dayBoundary, tabsOf, withMood, type PlannerSpec} from '@workspace/planner-spec';
import {api, flushQueue, httpBackend, ofKind, usePlanner, type Planner} from './data.ts';
import {onQueue, queued} from './offline.ts';
import {authEnabled} from './runtime.ts';
import {Moon} from './Moon.tsx';
import {Builder} from './screens/Builder.tsx';
import {Editor} from './screens/Editor.tsx';
import {ConnectPage} from './screens/Connect.tsx';
import {skinProps} from './screens/Canvas.tsx';
import {PlannerView, currentTab} from './screens/PlannerView.tsx';
import {MenuDrawer} from './screens/Menu.tsx';
import {AvailabilityProvider} from './avail.tsx';
import {AvailabilityEditor} from './screens/AvailabilityEditor.tsx';
import {LibraryProvider, useLibraryState} from './library.tsx';
import {Tip, setTipsOn, useTipsOn} from './Tip.tsx';

type Loaded = {settings: Settings & {configured: boolean; availability?: Availability | null}; planner: {version: number; spec: PlannerSpec} | null; records: AnyRecord[]};
const PlannerCtx = createContext<Planner | null>(null);
const usePersonaPlanner = () => useContext(PlannerCtx);
const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export default function App() {
  // An AI connector's OAuth step lands here: /connect/<request id>.
  const connect = location.pathname.match(/^\/connect\/([\w-]+)$/)?.[1];
  if (connect) return <ConnectPage id={connect} />;
  return <Main />;
}

function Main() {
  const [state, setState] = useState<Loaded | null>(null), [error, setError] = useState(''), [editing, setEditing] = useState(false);
  const load = () => Promise.all([api.settings(), api.spec(), api.recordsWithQueue()]).then(([settings, planner, records]) => { setState({settings, planner, records}); setError(''); }).catch(e => setError((e as Error).message));
  useEffect(() => { void load(); }, []);

  if (error && !state) return <div className="center"><Moon size={72} /><p className="error">{error}</p><button className="primary" onClick={load}>다시 시도</button></div>;
  if (!state) return <div className="center"><Moon size={72} /><p className="muted">불러오는 중…</p></div>;

  const use = async (spec: PlannerSpec) => {
    const tz = state.settings.configured ? state.settings.tz : browserTz();
    await api.putSettings({tz, dayBoundary: dayBoundary(spec)});
    await api.putSpec(spec);
    setEditing(false); await load();
  };
  if (!state.planner || editing) return <div className="app builder-host"><Builder tz={state.settings.configured ? state.settings.tz : browserTz()} current={state.planner?.spec} onUse={use} onCancel={state.planner ? () => setEditing(false) : undefined} /></div>;
  return <Home key={state.planner.version} loaded={state as Loaded & {planner: NonNullable<Loaded['planner']>}} edit={() => setEditing(true)} reload={load} />;
}

function Home({loaded, edit, reload}: {loaded: Loaded & {planner: NonNullable<Loaded['planner']>}; edit: () => void; reload: () => Promise<void>}) {
  const {spec} = loaded.planner;
  const p = usePlanner(httpBackend, loaded.records);
  const [settingsOpen, setSettingsOpen] = useState(false), [decorating, setDecorating] = useState(false), [menu, setMenu] = useState(false);
  const library = useLibraryState();
  const sp = skinProps(spec.skin);
  const sync = useSync(async () => p.setRecords(await api.recordsWithQueue()));
  return <div className={`app mood-${spec.mood} ${sp.className} ${decorating ? 'wide' : ''}`} style={{'--accent': CHIP_COLORS[spec.theme.accent], ...sp.style} as React.CSSProperties}>
    <header className="top">
      <Moon size={34} />
      <span className="brand" aria-label="lit">lit</span>
      <h1>{spec.name}</h1>
      {(!sync.online || sync.waiting > 0) && <span className={`sync ${sync.online ? 'up' : 'off'}`} role="status">{sync.online ? `올리는 중 · ${sync.waiting}` : `오프라인${sync.waiting ? ` · 기록 ${sync.waiting}개 대기` : ''}`}</span>}
      <InstallButton />
      <SleepingBadge p={p} settings={loaded.settings} />
      {!decorating && <button className="small" onClick={() => { setDecorating(true); setSettingsOpen(false); }}>꾸미기</button>}
      {settingsOpen && <button className="ghost small" onClick={() => setSettingsOpen(false)}>‹ 플래너</button>}
      <button className="menu-btn" onClick={() => setMenu(true)} aria-label="메뉴" aria-expanded={menu}><span /><span /><span /></button>
    </header>
    <LibraryProvider value={library}><AvailabilityProvider value={loaded.settings.availability ?? null}>
    <MenuDrawer open={menu} close={() => setMenu(false)} spec={spec} saveSpec={async next => { await api.putSpec(next); await reload(); }} openSettings={() => { setDecorating(false); setSettingsOpen(true); }} />
    <PlannerCtx.Provider value={p}>{decorating ? <Editor spec={spec} settings={loaded.settings} p={p} saveLabel="저장" onCancel={() => setDecorating(false)} pageId={tabsOf(spec).find(t => t.id === currentTab() && t.kind === 'page')?.id}
      onSave={async next => { await api.putSpec(next); setDecorating(false); await reload(); }} hint="지금 기록 그대로 보면서 꾸며요. 저장하면 새 버전이 되고 기록은 그대로예요." /> : settingsOpen ? <SettingsPanel loaded={loaded} edit={edit} close={() => setSettingsOpen(false)} reload={reload} /> : <PlannerView spec={spec} settings={loaded.settings} p={p} saveSpec={async change => { await api.putSpec(change(spec)); await reload(); }} />}</PlannerCtx.Provider>
    </AvailabilityProvider></LibraryProvider>
  </div>;
}

/** While a sleep is running, the header offers "일어났어요" from any screen. */
function SleepingBadge({p, settings}: {p: Planner; settings: Settings}) {
  const running = ofKind(p.records, 'sleep').find(r => r.body.start && !r.body.end);
  if (!running) return null;
  const wake = () => { const at = new Date().toISOString(); return p.write(running.id, {kind: 'sleep', logicalDay: logicalDay(at, settings), body: {...running.body, end: at}, baseRevision: running.revision}); };
  return <button className="sleeping" onClick={wake}>☾ 자는 중 · 일어났어요</button>;
}

/** Offline queue status; flushes when the connection returns (and every 30s while writes wait). */
function useSync(refresh: () => Promise<void>) {
  const [waiting, setWaiting] = useState(queued()), [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const off = onQueue(() => setWaiting(queued()));
    const up = async () => { setOnline(true); if (queued() && (await flushQueue()) > 0) await refresh(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    const t = setInterval(() => { if (queued() && navigator.onLine) void up(); }, 30_000);
    if (queued() && navigator.onLine) void up();
    return () => { off(); window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(t); };
  }, []);
  return {waiting, online};
}

// The browser offers installation once ("beforeinstallprompt"); keep it so the button can use it later.
type InstallPrompt = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome: string}>};
let deferred: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPrompt; installListeners.forEach(f => f()); });
function InstallButton() {
  const [, bump] = useState(0), [hint, setHint] = useState(false);
  useEffect(() => { const f = () => bump(n => n + 1); installListeners.add(f); return () => { installListeners.delete(f); }; }, []);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as {standalone?: boolean}).standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone || (!deferred && !ios)) return null;
  return <span className="install">
    <button className="small" onClick={async () => { if (deferred) { await deferred.prompt(); deferred = null; bump(n => n + 1); } else setHint(!hint); }}>앱으로 설치</button>
    {hint && <span className="install-hint">Safari 아래 공유 버튼 → "홈 화면에 추가"를 누르세요.</span>}
  </span>;
}

function SettingsPanel({loaded, edit, close, reload}: {loaded: Loaded & {planner: NonNullable<Loaded['planner']>}; edit: () => void; close: () => void; reload: () => Promise<void>}) {
  const [tz, setTz] = useState(loaded.settings.tz), [boundary, setBoundary] = useState(loaded.settings.dayBoundary), [msg, setMsg] = useState('');
  const save = async () => { try { await api.putSettings({tz, dayBoundary: boundary}); setMsg('저장했어요.'); await reload(); } catch (e) { setMsg((e as Error).message); } };
  const spec = loaded.planner.spec, checkin = spec.modules.find(m => m.type === 'checkin');
  const [wake, setWake] = useState(String(checkin?.options.wake ?? '07:00')), [sleep, setSleep] = useState(String(checkin?.options.sleep ?? '00:00'));
  // Changing the window is a spec change: a new version, records untouched.
  const saveLayout = async (patch: Partial<NonNullable<typeof spec.layout>>) => { await api.putSpec({...spec, layout: {...spec.layout, ...patch} as typeof spec.layout}); await reload(); };
  const saveWindow = async () => { await api.putSpec({...spec, modules: spec.modules.map(m => m.type === 'checkin' ? {...m, options: {...m.options, wake, sleep}} : m)}); await reload(); };
  return <div className="settings">
    <section className="module"><h3>화면 구성 <Tip id="settings-layout">바꿔도 기록은 그대로예요</Tip></h3>
      <label>하루 페이지 <select value={spec.layout?.day ?? 'sheet'} onChange={e => saveLayout({day: e.target.value as 'sheet'})}>
        <option value="sheet">스터디 타임테이블 (할 일 + 10분 칸)</option><option value="hourly">시간대별 타임라인 (계획 vs 실제)</option>
        <option value="bullet">불렛저널 빠른 기록</option><option value="onepage">한 장 자유 데일리 (모눈)</option></select></label>
      <label>무드 <select value={spec.mood} onChange={e => void api.putSpec(withMood(spec, e.target.value)).then(reload)}>{MOODS.map(m => <option key={m.id} value={m.id}>{m.name} — {m.feel}</option>)}</select></label>
      <label>주간 페이지 <select value={spec.layout?.week ?? 'horizontal'} onChange={e => saveLayout({week: e.target.value as 'horizontal'})}>
        <option value="horizontal">가로형 (7일 칸, 끌어서 옮기기)</option><option value="vertical">세로형 (시간 눈금)</option></select></label>
    </section>
    <TipsReset />
    <section className="module"><h3>플래너</h3>
      <p className="muted">버전 {loaded.planner.version}</p>
      <button className="primary" onClick={edit}>플래너 고치기</button>
    </section>
    <section className="module"><h3>하루의 기준</h3>
      <label>시간대 <input value={tz} onChange={e => setTz(e.target.value)} /></label>
      <label>하루가 바뀌는 시각 <input type="time" value={boundary} onChange={e => setBoundary(e.target.value)} /></label>
      <Tip id="settings-boundary" block>새벽 {boundary} 전에 쓴 기록은 전날로 들어가요.</Tip>
      <button onClick={save}>저장</button> {msg && <span className="muted">{msg}</span>}
    </section>
    <AvailabilityEditor value={loaded.settings.availability ?? null} saved={reload} />
    <Personas />
    {checkin && <section className="module"><h3>아침 점검 시간</h3>
      <label>보통 일어나는 시각 <input type="time" value={wake} onChange={e => setWake(e.target.value)} /></label>
      <label>보통 자는 시각 <input type="time" value={sleep} onChange={e => setSleep(e.target.value)} /></label>
      <Tip id="settings-capacity" block>깨어 있는 시간에서 고정 일정을 빼고, 아침 에너지로 오늘 현실적으로 집중할 수 있는 양을 계산해요.</Tip>
      <button onClick={saveWindow}>저장</button>
    </section>}
    <section className="module"><h3>계정</h3>{authEnabled ? <Account /> : <p className="muted">이 서버는 게스트 모드예요. 기록은 이 브라우저에 묶여 있어요.</p>}</section>
    <section className="module"><h3>다른 서비스와 연결</h3>
      <p className="muted">MOONS · 모의 우주 · 에너지긴축모드에 보낼 항목과 기간을 고르는 화면은 다음 단계에서 열려요. 기록은 지금부터 그 형식으로 쌓이고 있어요. 하루 돌아보기에서 "나만 보기"로 둔 글은 어디에도 보내지 않아요.</p>
    </section>
    <button className="ghost" onClick={close}>‹ 플래너로</button>
  </div>;
}

const PERSONA_COLORS = ['#8aaaf8', '#2f9585', '#e9b949', '#b05a57', '#00838f', '#3a66b8', '#c9a98a'];
/** Personas are records (kind 'persona'), so consumers can read "who you've been lately" too. */
function Personas() {
  const p = usePersonaPlanner();
  const [name, setName] = useState(''), [color, setColor] = useState(PERSONA_COLORS[0]!);
  if (!p) return null;
  const list = ofKind(p.records, 'persona');
  return <section className="module"><h3>페르소나 <span className="muted small">내가 맡고 있는 역할</span></h3>
    <ul className="prows">{list.map(x => <li key={x.id} className="prow">
      <i className="dot" style={{background: x.body.color}} /><span className="ptitle">{x.body.name}</span>
      <button className="ghost small" onClick={() => p.write(x.id, {kind: 'persona', body: {...x.body, active: !x.body.active}, baseRevision: x.revision})}>{x.body.active ? '쉬게 하기' : '다시 쓰기'}</button>
    </li>)}</ul>
    <form className="padd" onSubmit={async e => { e.preventDefault(); if (name.trim() && await p.write(null, {kind: 'persona', body: {name: name.trim(), color}})) setName(''); }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="역할 이름" aria-label="페르소나 이름" />
      <span className="swatches">{PERSONA_COLORS.map(c => <button type="button" key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{background: c}} onClick={() => setColor(c)} aria-label={`색 ${c}`} />)}</span>
      <button className="small">추가</button>
    </form>
  </section>;
}

function Account() {
  const clerk = useClerk();
  if (!clerk.loaded) return <p className="muted">확인 중…</p>;
  return clerk.user
    ? <p>{clerk.user.primaryEmailAddress?.emailAddress ?? 'MOONS 계정'}으로 로그인했어요. <button className="ghost small" onClick={async () => { await clerk.signOut(); location.reload(); }}>로그아웃</button></p>
    : <><p className="muted">MOONS 계정(구글 가능)으로 로그인하면 다른 기기와 MOONS·모의 우주에서 같은 기록을 써요.</p><button className="primary" onClick={() => clerk.openSignIn({forceRedirectUrl: location.href})}>MOONS 계정으로 로그인</button></>;
}

function TipsReset() {
  const on = useTipsOn();
  return <section className="module"><h3>안내</h3>
    <label className="small-label"><input type="checkbox" checked={on} onChange={e => setTipsOn(e.target.checked)} /> 사용 안내 보기</label>
  </section>;
}
