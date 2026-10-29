import { createRoot } from 'react-dom/client';

import App from './App';
import AuthRoot from '@/components/AuthRoot';
import { ErrorBoundary } from '@/components/error-boundary';

import './styles/globals.css';
import './styles/refinement.css';
import './styles/workspace.css';
import './styles/event.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <AuthRoot><App /></AuthRoot>
  </ErrorBoundary>,
);

// Installable app (home screen). Production only, so dev reloads never hit a stale worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
