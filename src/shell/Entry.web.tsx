import { useEffect } from 'react';
import App from './App';
import { LandingPage, NotFoundPage } from '../features/website/Website';
import LegalPage from '../features/website/LegalPage';

// Feature: clear unused confirmation codes and old session-token links before showing the site.
if (typeof window !== 'undefined' && ['http:', 'https:'].includes(window.location.protocol)) {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const hasCode = url.searchParams.has('code');
  const hasTokens = fragment.has('access_token') || fragment.has('refresh_token');
  if (hasCode || hasTokens) {
    if (hasCode) {
      url.searchParams.delete('code');
      url.searchParams.delete('sb_flow_id');
    }
    if (hasTokens) url.hash = '';
    window.history.replaceState(window.history.state, '', url.href);
  }
}

// Feature: browser routes introduce the product while Electron retains its direct workspace launch.
export default function WebEntry() {
  const desktop = Boolean(window.novelDesktop) || window.location.protocol === 'file:';
  const path = window.location.pathname;
  const workspace = desktop || path === '/app' || path === '/app/';
  const home = path === '/' || path === '/index.html';
  // Feature: terms and privacy have stable public URLs while desktop keeps its workspace entry point.
  const policy = /^\/terms\/?$/.test(path) ? 'terms' : /^\/privacy\/?$/.test(path) ? 'privacy' : null;
  useEffect(() => {
    document.title = workspace ? 'Little by Little — Writing desk' : policy ? `${policy === 'terms' ? 'Terms of Service' : 'Privacy Notice'} — Little by Little` : home ? 'Little by Little — A little more story' : 'Page not found — Little by Little';
  }, [workspace, home, policy]);
  if (workspace) return <App />;
  if (policy) return <LegalPage document={policy} />;
  return home ? <LandingPage /> : <NotFoundPage />;
}
