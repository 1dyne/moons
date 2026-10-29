import {useEffect, useRef, useState} from 'react';
import {useClerk} from '@clerk/react';
import {Link} from 'wouter';
import {claimGuestData, homeUrl} from '@/lib/account';
import {tr} from '@/lib/i18n';

const callbackUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`;
const ssoUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}auth/sso-callback`;
function clerkMessage(e: unknown) {
  const x = e as {errors?: {code?: string; longMessage?: string; message?: string}[]; message?: string; code?: string};
  const first = x.errors?.[0];
  const text = first?.longMessage ?? first?.message ?? x.message ?? tr('Something went wrong.');
  if (first?.code === 'strategy_for_user_invalid' || first?.code === 'form_param_value_invalid' || /email_link|email link/i.test(text))
    return `${text} Email link sign-in may not be enabled for this Clerk instance. An operator must enable "Email verification link" in the Clerk dashboard.`;
  return text;
}
const Shell = ({title, children, back = true}: {title: string; children: React.ReactNode; back?: boolean}) =>
  <main className="auth-page" style={{minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24}}>
    <div className="settings-card" style={{width: 'min(440px,100%)'}}><img src={`${import.meta.env.BASE_URL}moons-logo-600.webp`} alt="MOONS" width={600} height={450} style={{display: 'block', width: 'min(240px,70%)', height: 'auto', margin: '0 auto 12px'}}/><h1>{title}</h1>{children}{back && <p><Link href="/">{tr('Back to Home')}</Link></p>}</div>
  </main>;

// Activate the session, then claim guest data using cookies only, then reload so the server resolves the right owner.
async function finish(clerk: ReturnType<typeof useClerk>, sessionId?: string | null) {
  const id = sessionId ?? clerk.session?.id;
  if (!id) throw new Error(tr('Sign-in was not completed.'));
  await clerk.setActive({session: id});
  await claimGuestData();
  window.location.replace(homeUrl());
}

export function MagicLinkForm({mode}: {mode: 'in' | 'up'}) {
  const clerk = useClerk();
  const [email, setEmail] = useState(''), [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle'), [error, setError] = useState('');
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setPhase('sending');
    try {
      if (!clerk.loaded || !clerk.client) throw new Error(tr('The sign-in service is still loading. Try again in a moment.'));
      if (mode === 'in') {
        const attempt = await clerk.client.signIn.create({identifier: email.trim()});
        const factor = attempt.supportedFirstFactors?.find(f => f.strategy === 'email_link') as {emailAddressId?: string} | undefined;
        if (!factor?.emailAddressId) throw new Error(tr('Email link sign-in is not available for this account or is not enabled for this Clerk instance.'));
        const flow = attempt.createEmailLinkFlow(); cancel.current = flow.cancelEmailLinkFlow;
        setPhase('sent');
        const result = await flow.startEmailLinkFlow({emailAddressId: factor.emailAddressId, redirectUrl: callbackUrl()});
        if (result.status === 'complete') await finish(clerk, result.createdSessionId);
      } else {
        const attempt = await clerk.client.signUp.create({emailAddress: email.trim()});
        const flow = attempt.createEmailLinkFlow(); cancel.current = flow.cancelEmailLinkFlow;
        setPhase('sent');
        const result = await flow.startEmailLinkFlow({redirectUrl: callbackUrl()});
        if (result.status === 'complete') await finish(clerk, result.createdSessionId);
      }
    } catch (e) {setPhase('idle'); setError(clerkMessage(e));}
  }
  async function google() {
    setError('');
    try {
      if (!clerk.loaded || !clerk.client) throw new Error(tr('The sign-in service is still loading. Try again in a moment.'));
      const target = mode === 'in' ? clerk.client.signIn : clerk.client.signUp;
      await target.authenticateWithRedirect({strategy: 'oauth_google', redirectUrl: ssoUrl(), redirectUrlComplete: callbackUrl()});
    } catch (e) {setError(clerkMessage(e));}
  }
  // The app opens on this page until the user signs in, so there is no Home to go back to.
  return <Shell back={false} title={mode === 'in' ? tr('Sign in with an email link') : tr('Create your account with an email link')}>
    <p>{mode === 'in' ? tr('Enter your email and MOONS will send a one-time link. No password.') : tr('Your guest notes can be saved to the account after you confirm the link.')}</p>
    <button type="button" className="secondary google-button" onClick={() => void google()} data-testid="button-google">{tr('Continue with Google')}</button>
    <p className="auth-or">{tr('or')}</p>
    <form onSubmit={submit}><label className="form-label">{tr('Email')}<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={phase !== 'idle'} data-testid="input-email"/></label>
      <button className="primary" disabled={phase !== 'idle' || !email.trim()} data-testid="button-send-link">{phase === 'sending' ? tr('Sending...') : tr('Send email link')}</button></form>
    {phase === 'sent' && <p role="status">{tr('Check your inbox for the link. Keep this tab open, or open the link on this device.')}</p>}
    {error && <p role="alert" className="field-error">{error}</p>}
    <p>{mode === 'in' ? <>{tr('New here?')} <Link href="/sign-up">{tr('Create an account')}</Link></> : <>{tr('Already have an account?')} <Link href="/sign-in">{tr('Sign in')}</Link></>}</p>
  </Shell>;
}

export function AuthCallback() {
  const clerk = useClerk();
  const [error, setError] = useState(''), started = useRef(false);
  useEffect(() => {
    if (!clerk.loaded || started.current) return;
    started.current = true;
    (async () => {
      try {
        if (new URLSearchParams(window.location.search).has('__clerk_status'))
          await clerk.handleEmailLinkVerification({redirectUrlComplete: callbackUrl(), redirectUrl: callbackUrl()}, async () => undefined);
        await finish(clerk);
      } catch (e) {
        const code = (e as {code?: string})?.code;
        setError(code === 'expired' ? tr('This link has expired. Request a new one.') : code === 'client_mismatch' ? tr('Open the link in the same browser where you asked for it, or request a new one.') : clerkMessage(e));
      }
    })();
  }, [clerk, clerk.loaded]);
  return <Shell title={tr('Finishing sign-in')}>{error ? <><p role="alert" className="field-error">{error}</p><p><Link href="/sign-in">{tr('Request a new link')}</Link></p></> : <p role="status" aria-busy="true">{tr('Confirming your link...')}</p>}</Shell>;
}

/** Google returns here; Clerk finishes the OAuth handshake, then continues to /auth/callback. */
export function SsoCallback() {
  const clerk = useClerk();
  const [error, setError] = useState(''), started = useRef(false);
  useEffect(() => {
    if (!clerk.loaded || started.current) return;
    started.current = true;
    clerk.handleRedirectCallback({signInFallbackRedirectUrl: callbackUrl(), signUpFallbackRedirectUrl: callbackUrl()}).catch(e => setError(clerkMessage(e)));
  }, [clerk, clerk.loaded]);
  return <Shell title={tr('Finishing sign-in')}>{error ? <p role="alert" className="field-error">{error}</p> : <p role="status" aria-busy="true">{tr('Confirming your link...')}</p>}</Shell>;
}
