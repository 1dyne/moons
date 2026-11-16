import {useEffect, useState, type ReactNode} from 'react';
import {useClerk} from '@clerk/react';
import {authEnabled} from './runtime.ts';
import {Moon} from './Moon.tsx';
import {ConnectPage} from './screens/Connect.tsx';
import {LitProvider, newLocalId, useLit} from './store.tsx';
import {PageView} from './Page.tsx';
import {DataScreen} from './Data.tsx';
import {FlowScreen, FormModal, SkinScreen, SuggestionsScreen, TemplatesScreen, TidyScreen} from './Screens.tsx';
import {En, Toasts} from './ui.tsx';

type View = 'page' | 'flow' | 'data' | 'tidy' | 'suggest' | 'templates' | 'skin';
const MENU: [View, string, string][] = [['flow', '흐름', 'Timeline'], ['data', '데이터', 'Data'], ['tidy', '정리', 'Tidy'], ['suggest', '제안', 'Suggestions'], ['templates', '템플릿', 'Templates'], ['skin', '꾸미기', 'Design']];
const FONT: Record<string, string> = {pretendard: "'IBM Plex Sans KR', system-ui, sans-serif", plex: "'IBM Plex Sans KR', system-ui, sans-serif", serif: "'Gowun Batang', serif", hand: "'Gaegu', cursive"};

export default function App() {
  const connect = location.pathname.match(/^\/connect\/([\w-]+)$/)?.[1];
  if (connect) return <ConnectPage id={connect} />;
  const body = <LitProvider fallback={(error, retry) => <div className="center"><Moon size={72} />{error ? <><p className="error">{error}</p><button className="primary" onClick={retry}>다시 시도</button></> : <p className="muted">불러오는 중…</p>}</div>}><Shell /></LitProvider>;
  return authEnabled ? <LoginGate>{body}</LoginGate> : body;
}

function Shell() {
  const {screen, page, setPage, saveScreen, editing, setEditing, ws} = useLit();
  const [view, setView] = useState<View>('page'), [menu, setMenu] = useState(false);
  const s = screen.skin;
  useEffect(() => { if (view !== 'page') setEditing(false); }, [view, setEditing]);
  const go = (v: View) => { setView(v); setMenu(false); };
  const suggestCount = [...ws.rules.values()].filter(r => r.body.enabled && r.body.mode === 'suggest').length;
  const pg = screen.pages.find(p => p.id === page);
  return <div className="app" style={{'--accent': s.accent, '--bg': s.background, '--surface': s.surface, '--ink': s.ink, '--radius': `${s.radius}px`, '--font': FONT[s.font] ?? FONT.pretendard} as React.CSSProperties}>
    <header className="top">
      <button className="brand-btn" onClick={() => go('page')} aria-label="lit 홈"><Moon size={28} /><span className="brand">lit</span></button>
      <nav className="tabs" aria-label="페이지">{screen.pages.map(p => <button key={p.id} className={view === 'page' && p.id === page ? 'on' : ''} onClick={() => { setPage(p.id); go('page'); }}>{p.name}</button>)}
        {editing && <button className="ghost" onClick={() => { const id = newLocalId(); void saveScreen({...screen, pages: [...screen.pages, {id, name: `페이지 ${screen.pages.length + 1}`, widgets: []}]}); setPage(id); }}>+ 페이지</button>}</nav>
      {view === 'page' && <button className={`small ${editing ? 'primary' : ''}`} onClick={() => setEditing(!editing)}>{editing ? '편집 끝' : '편집'}</button>}
      <button className="menu-btn" onClick={() => setMenu(!menu)} aria-label="메뉴" aria-expanded={menu}><span /><span /><span /></button>
    </header>
    {menu && <div className="drawer-bg" onClick={() => setMenu(false)}><nav className="drawer" onClick={e => e.stopPropagation()}>
      {MENU.map(([v, n, en]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => go(v)}>{n} <En>{en}</En>{v === 'suggest' && suggestCount > 0 ? <span className="badge">규칙 {suggestCount}</span> : null}</button>)}
    </nav></div>}
    {editing && view === 'page' && pg && <div className="page-edit">
      <label><span className="k">페이지 이름</span><input value={pg.name} onChange={e => void saveScreen({...screen, pages: screen.pages.map(p => p.id === pg.id ? {...p, name: e.target.value || ' '} : p)})} /></label>
      <button className="small" disabled={screen.pages[0]?.id === pg.id} onClick={() => { const l = [...screen.pages], i = l.indexOf(pg); [l[i - 1], l[i]] = [l[i]!, l[i - 1]!]; void saveScreen({...screen, pages: l}); }}>← 앞으로</button>
      <button className="small danger" disabled={screen.pages.length < 2} onClick={() => { if (confirm('이 페이지를 지울까요? 데이터는 그대로예요.')) { void saveScreen({...screen, pages: screen.pages.filter(p => p.id !== pg.id)}); setPage(screen.pages[0]!.id); } }}>페이지 지우기</button>
    </div>}
    <main>{view === 'page' ? <PageView /> : <div className="screen"><h2>{MENU.find(m => m[0] === view)![1]} <En>{MENU.find(m => m[0] === view)![2]}</En></h2>
      {view === 'flow' ? <FlowScreen /> : view === 'data' ? <DataScreen /> : view === 'tidy' ? <TidyScreen /> : view === 'suggest' ? <SuggestionsScreen /> : view === 'templates' ? <TemplatesScreen /> : <SkinScreen />}</div>}</main>
    <FormModal />
    <Toasts />
  </div>;
}

function LoginGate({children}: {children: ReactNode}) {
  const clerk = useClerk();
  const [guest, setGuest] = useState(() => { try { return localStorage.getItem('lit.guest') === '1'; } catch { return false; } });
  const [ready, setReady] = useState(false);
  const user = clerk.loaded ? clerk.user : undefined;
  useEffect(() => {
    if (!user) return;
    const key = `lit.claimed.${user.id}`;
    let done = false; try { done = sessionStorage.getItem(key) === '1'; } catch { /* */ }
    if (done) { setReady(true); return; }
    void fetch('/api/account/claim', {method: 'POST', credentials: 'include', headers: {'content-type': 'application/json'}, body: '{}'})
      .catch(() => null).finally(() => { try { sessionStorage.setItem(key, '1'); localStorage.removeItem('lit.guest'); } catch { /* */ } setReady(true); });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!clerk.loaded || (user && !ready)) return <div className="center"><Moon size={72} /><p className="muted">불러오는 중…</p></div>;
  if (!user && !guest) return <div className="center login">
    <Moon size={96} /><p className="brand big">lit</p>
    <button className="primary login-btn" onClick={() => clerk.openSignIn({forceRedirectUrl: location.href})}>로그인</button>
    <button className="login-btn" onClick={() => clerk.openSignUp({forceRedirectUrl: location.href})}>처음이에요 · 가입하기</button>
    <button className="link small muted" onClick={() => { try { localStorage.setItem('lit.guest', '1'); } catch { /* */ } setGuest(true); }}>로그인 없이 이 기기에서만 쓰기</button>
  </div>;
  return <>{children}</>;
}
