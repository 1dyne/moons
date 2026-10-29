import {useEffect, useState} from 'react';
import {Router, useLocation, Link} from 'wouter';
import AppShell from './components/AppShell';
import {MagicLinkForm,AuthCallback,SsoCallback} from './components/AuthPages';
import {authEnabled} from './lib/runtime-config';
import {accountStatus} from './lib/account';
import SharePage from './components/SharePage';
import {tr} from '@/lib/i18n';

function Screens() {
  const [path] = useLocation();
  useEffect(() => {
    document.title = path === '/universe' ? tr('MOONS · My Space') : 'MOONS';
  }, [path]);
  const share=path.match(/^\/s\/([A-Za-z0-9_-]+)$/);if(share)return <SharePage token={share[1]!}/>;
  if(!authEnabled&&/^\/(sign-in|sign-up|auth)(\/|$)/.test(path))return <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,textAlign:'center'}}><div><h1>{tr('Sign-in is not set up yet')}</h1><p>{tr('You can keep using MOONS as a guest.')}</p><Link href="/">{tr('Go to Home')}</Link></div></main>;
  if(/^\/sign-in(\/|$)/.test(path))return <MagicLinkForm mode="in"/>;
  if(/^\/sign-up(\/|$)/.test(path))return <MagicLinkForm mode="up"/>;
  if(path==='/auth/callback')return <AuthCallback/>;
  if(path==='/auth/sso-callback')return <SsoCallback/>;
  return <SignedIn><AppShell/></SignedIn>;
}

/** Same look as the static loader in index.html, so start-up reads as one screen. */
export function BootLoading() {
  return <div className="boot-loading" role="status" aria-live="polite" style={{minHeight: '100dvh', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 500, color: '#78796e', letterSpacing: '.04em'}}>Loading…</div>;
}

/** With sign-in set up, MOONS opens on the sign-in page until there is an account session.
 *  If the status check itself fails (offline), the app opens rather than locking the user out. */
function SignedIn({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>(authEnabled ? 'checking' : 'in');
  useEffect(() => {
    if (!authEnabled) return;
    accountStatus().then(s => setState(s.signedIn ? 'in' : 'out'), () => setState('in'));
  }, []);
  if (state === 'checking') return <BootLoading/>;
  return state === 'out' ? <MagicLinkForm mode="in"/> : <>{children}</>;
}

export default function App() {
  return <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Screens/></Router>;
}
