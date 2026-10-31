import {useEffect, useState} from 'react';
import {useClerk} from '@clerk/react';
import type {AnyRecord, Settings} from '@workspace/life-contract';
import {CHIP_COLORS, dayBoundary, type PlannerSpec} from '@workspace/planner-spec';
import {api, httpBackend, usePlanner} from './data.ts';
import {authEnabled} from './runtime.ts';
import {Moon} from './Moon.tsx';
import {Builder} from './screens/Builder.tsx';
import {PlannerView} from './screens/PlannerView.tsx';

type Loaded = {settings: Settings & {configured: boolean}; planner: {version: number; spec: PlannerSpec} | null; records: AnyRecord[]};
const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export default function App() {
  const [state, setState] = useState<Loaded | null>(null), [error, setError] = useState(''), [editing, setEditing] = useState(false);
  const load = () => Promise.all([api.settings(), api.spec(), api.records()]).then(([settings, planner, records]) => { setState({settings, planner, records}); setError(''); }).catch(e => setError((e as Error).message));
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  return <div className="app" style={{'--accent': CHIP_COLORS[spec.theme.accent]} as React.CSSProperties}>
    <header className="top">
      <Moon size={34} />
      <h1>{spec.name}</h1>
      <button className="ghost small" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}>설정</button>
    </header>
    {settingsOpen ? <SettingsPanel loaded={loaded} edit={edit} close={() => setSettingsOpen(false)} reload={reload} /> : <PlannerView spec={spec} settings={loaded.settings} p={p} />}
  </div>;
}

function SettingsPanel({loaded, edit, close, reload}: {loaded: Loaded & {planner: NonNullable<Loaded['planner']>}; edit: () => void; close: () => void; reload: () => Promise<void>}) {
  const [tz, setTz] = useState(loaded.settings.tz), [boundary, setBoundary] = useState(loaded.settings.dayBoundary), [msg, setMsg] = useState('');
  const save = async () => { try { await api.putSettings({tz, dayBoundary: boundary}); setMsg('저장했어요.'); await reload(); } catch (e) { setMsg((e as Error).message); } };
  return <div className="settings">
    <section className="module"><h3>플래너</h3>
      <p className="muted">버전 {loaded.planner.version} · 화면 구성을 바꿔도 기록은 그대로예요.</p>
      <button className="primary" onClick={edit}>플래너 고치기</button>
    </section>
    <section className="module"><h3>하루의 기준</h3>
      <label>시간대 <input value={tz} onChange={e => setTz(e.target.value)} /></label>
      <label>하루가 바뀌는 시각 <input type="time" value={boundary} onChange={e => setBoundary(e.target.value)} /></label>
      <p className="muted small">새벽 {boundary} 전에 쓴 기록은 전날로 들어가요.</p>
      <button onClick={save}>저장</button> {msg && <span className="muted">{msg}</span>}
    </section>
    <section className="module"><h3>계정</h3>{authEnabled ? <Account /> : <p className="muted">이 서버는 게스트 모드예요. 기록은 이 브라우저에 묶여 있어요.</p>}</section>
    <section className="module"><h3>다른 서비스와 연결</h3>
      <p className="muted">MOONS · 모의 우주 · 에너지긴축모드에 보낼 항목과 기간을 고르는 화면은 다음 단계에서 열려요. 기록은 지금부터 그 형식으로 쌓이고 있어요. 하루 돌아보기에서 "나만 보기"로 둔 글은 어디에도 보내지 않아요.</p>
    </section>
    <button className="ghost" onClick={close}>‹ 플래너로</button>
  </div>;
}

function Account() {
  const clerk = useClerk();
  if (!clerk.loaded) return <p className="muted">확인 중…</p>;
  return clerk.user
    ? <p>{clerk.user.primaryEmailAddress?.emailAddress ?? 'MOONS 계정'}으로 로그인했어요. <button className="ghost small" onClick={async () => { await clerk.signOut(); location.reload(); }}>로그아웃</button></p>
    : <><p className="muted">MOONS 계정(구글 가능)으로 로그인하면 다른 기기와 MOONS·모의 우주에서 같은 기록을 써요.</p><button className="primary" onClick={() => clerk.openSignIn({forceRedirectUrl: location.href})}>MOONS 계정으로 로그인</button></>;
}
