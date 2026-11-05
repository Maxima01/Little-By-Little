import { useLayoutEffect, useRef, useState } from 'react';
import { cloudChallengeRequired, cloudChallengeSiteKey, cloudChallengeSupported } from '../lib/cloudChallenge';
import type { CloudChallengeProps } from './CloudChallenge';

type Turnstile = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: {
    sitekey: string; theme: 'auto'; size: 'flexible' | 'compact'; 'response-field': boolean;
    callback: (token: string) => void; 'expired-callback': () => void;
    'error-callback': () => boolean; 'timeout-callback': () => void; 'unsupported-callback': () => void;
  }) => string | undefined;
  remove: (widgetId: string) => void;
};
const scriptId = 'little-cloud-challenge-script';
// Feature: keep the provider API type local instead of altering global browser declarations.
const apiWindow = () => window as Window & { turnstile?: Turnstile };
let loading: Promise<Turnstile> | null = null;

// Feature: share a bounded, explicitly rendered provider script across account forms without caching failed loads.
function loadChallenge(): Promise<Turnstile> {
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    let script: HTMLScriptElement | undefined;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Verification timed out.')), 15_000);
    // Feature: clear load listeners and discard failed scripts so an explicit retry can recover.
    const finish = (failure?: Error, api?: Turnstile) => {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      if (script) { script.onload = null; script.onerror = null; }
      if (failure || !api) { script?.remove(); reject(failure ?? new Error('Verification unavailable.')); }
      else resolve(api);
    };
    const existing = apiWindow().turnstile;
    if (existing) { existing.ready(() => finish(undefined, existing)); return; }
    script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const api = apiWindow().turnstile;
      if (api) api.ready(() => finish(undefined, api));
      else finish(new Error('Verification unavailable.'));
    };
    script.onerror = () => finish(new Error('Verification unavailable.'));
    document.head.appendChild(script);
  }).catch((failure) => { loading = null; throw failure; });
  return loading;
}

// Feature: account challenges expire, reset after every submission, and never load for ordinary guest writing.
export default function CloudChallenge({ onToken, resetKey, color }: CloudChallengeProps) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [retry, setRetry] = useState(0);
  // Feature: deactivate old widget callbacks before a changed or reopened form can receive their tokens.
  useLayoutEffect(() => {
    if (!cloudChallengeRequired || !cloudChallengeSupported || !cloudChallengeSiteKey) return;
    let active = true;
    let widgetId: string | undefined;
    let api: Turnstile | undefined;
    onToken(''); setError(''); setVerified(false);
    // Feature: clear single-use tokens immediately when provider verification expires or fails.
    const clearToken = (message: string) => {
      if (!active) return;
      onToken(''); setVerified(false); setError(message);
    };
    void loadChallenge().then((loaded) => {
      if (!active || !container.current) return;
      api = loaded;
      widgetId = loaded.render(container.current, {
        sitekey: cloudChallengeSiteKey!, theme: 'auto',
        size: container.current.clientWidth >= 300 ? 'flexible' : 'compact', 'response-field': false,
        callback: (token) => { if (active) { onToken(token); setVerified(true); setError(''); } },
        'expired-callback': () => clearToken('Verification expired. Complete the security check again.'),
        'error-callback': () => { clearToken('Verification could not finish. Check your connection and try again.'); return true; },
        'timeout-callback': () => clearToken('Verification timed out. Please try again.'),
        'unsupported-callback': () => clearToken('Account verification is unavailable in this browser.'),
      });
      if (!widgetId) clearToken('Verification could not start. Please try again.');
    }).catch(() => clearToken('Verification could not load. Check your connection and try again.'));
    return () => {
      active = false;
      if (widgetId) api?.remove(widgetId);
    };
  }, [onToken, resetKey, retry]);
  if (!cloudChallengeRequired) return null;
  if (!cloudChallengeSupported || !cloudChallengeSiteKey) return <p role="alert" style={{ color, fontSize: 14, lineHeight: 1.5 }}>
    Account verification needs the website in a supported browser. You can keep writing and saving on this device.
  </p>;
  return <div style={{ color, maxWidth: '100%', minWidth: 0 }}>
    <div ref={container} />
    <p role={error ? 'alert' : 'status'} style={{ fontSize: 14, lineHeight: 1.5, margin: '8px 0' }}>
      {error || (verified ? 'Security check complete.' : 'Complete the security check to continue.')}
    </p>
    {!!error && <button type="button" onClick={() => { onToken(''); setRetry((value) => value + 1); }} style={{ cursor: 'pointer', color: 'inherit', background: 'transparent', border: 0, textDecoration: 'underline', minHeight: 44, padding: '8px 0', font: 'inherit' }}>Try verification again</button>}
  </div>;
}
