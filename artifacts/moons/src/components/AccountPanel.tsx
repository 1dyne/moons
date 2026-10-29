import {useState} from 'react';
import {useClerk} from '@clerk/react';
import {LogOut, UserRound} from 'lucide-react';
import {claimGuestData, homeUrl} from '@/lib/account';
import {useAccountStatus} from '@/hooks/use-account-status';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {authEnabled} from '@/lib/runtime-config';
import {tr} from '@/lib/i18n';

type Props = {ws: WorkspaceApi; go: (url: string) => void};

// useClerk needs ClerkProvider, which only mounts when a publishable key is configured.
export default function AccountPanel(props: Props) {
  if (!authEnabled) return <section className="settings-card" aria-label={tr('Account')}><h2><UserRound size={17}/>{tr('Account')}</h2><p>{tr('You are using MOONS as a guest. Sign-in is not set up on this server yet.')}</p></section>;
  return <ClerkAccountPanel {...props}/>;
}

function ClerkAccountPanel({ws, go}: Props) {
  const status = useAccountStatus(), clerk = useClerk();
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const saving = ws.sync === 'saving' || ws.busy > 0;
  async function claim() {
    setBusy(true); setMessage('');
    try {await claimGuestData(); window.location.replace(homeUrl());} catch (e) {setMessage((e as Error).message); setBusy(false);}
  }
  async function signOut() {
    try {await clerk.signOut();} catch {/* fall through to reload */}
    window.location.replace(homeUrl());
  }
  return <>
    <section className="settings-card" aria-label={tr('Account')}><h2><UserRound size={17}/>{tr('Account')}</h2>
      {!status ? <p>{tr('Checking account...')}</p> : status.signedIn ? <><p>{status.claimed ? tr('Signed in. Your notes are saved to your account.') : tr('Signed in. Guest notes on this device are not yet saved to your account.')}</p>
        <div className="settings-actions">{!status.claimed && <button className="primary" disabled={busy || saving} data-testid="button-claim-guest" onClick={() => void claim()}>{tr('Save guest data to my account')}</button>}<button className="secondary" onClick={() => void signOut()}><LogOut size={15}/>{tr('Sign out')}</button></div></>
      : <><p>{tr('You are using MOONS as a guest. Sign in with an email link to keep your notes across devices.')}</p>
        {saving && <p role="status">{tr('Saving... wait for it to finish before signing in so nothing is lost.')}</p>}
        <div className="settings-actions"><button className="primary" disabled={saving} onClick={() => go('/sign-in')}>{tr('Sign in with email link')}</button><button className="secondary" disabled={saving} onClick={() => go('/sign-up')}>{tr('Create account')}</button></div></>}
      {message && <p role="status">{message}</p>}
    </section>
  </>;
}
