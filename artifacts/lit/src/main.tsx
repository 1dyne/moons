import {createRoot} from 'react-dom/client';
import type {ReactNode} from 'react';
import {ClerkProvider} from '@clerk/react';
import App from './App.tsx';
import {authEnabled, clerkProxyUrl, clerkPublishableKey} from './runtime.ts';
import './styles.css';

// Guest first: without a Clerk key the planner runs on a guest cookie, like MOONS.
const Auth = ({children}: {children: ReactNode}) => authEnabled ? <ClerkProvider publishableKey={clerkPublishableKey} proxyUrl={clerkProxyUrl}>{children}</ClerkProvider> : <>{children}</>;
createRoot(document.getElementById('root')!).render(<Auth><App /></Auth>);

// Installed app (PWA) updates by itself: the page and code come from the network first, so a new version arrives
// on the next open. While it stays open, it checks again whenever it comes back to the front and offers a reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(reg => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => {}); });
    }).catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.getElementById('lit-update')) return;
    const bar = document.createElement('button');
    bar.id = 'lit-update'; bar.className = 'update-bar'; bar.textContent = '새 버전이 있어요 · 눌러서 다시 열기';
    bar.onclick = () => location.reload();
    document.body.appendChild(bar);
  });
}
