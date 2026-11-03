import {createRoot} from 'react-dom/client';
import type {ReactNode} from 'react';
import {ClerkProvider} from '@clerk/react';
import App from './App.tsx';
import {authEnabled, clerkProxyUrl, clerkPublishableKey} from './runtime.ts';
import './styles.css';

// Guest first: without a Clerk key the planner runs on a guest cookie, like MOONS.
const Auth = ({children}: {children: ReactNode}) => authEnabled ? <ClerkProvider publishableKey={clerkPublishableKey} proxyUrl={clerkProxyUrl}>{children}</ClerkProvider> : <>{children}</>;
createRoot(document.getElementById('root')!).render(<Auth><App /></Auth>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); });
}
