import { loadProjectEnv } from '@expo/env';
import { publicCloudConfig } from '../src/features/workspace/lib/cloudConfig.ts';

// Feature: inspect only public deployment responses and Auth settings without creating users or changing data.
loadProjectEnv(process.cwd(), { mode: 'production', silent: true });
const origin = new URL(process.argv[2] || '');
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('Provide the canonical HTTPS website origin without a path or credentials.');
}
const selectedHeaders = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy',
  'permissions-policy', 'strict-transport-security', 'cache-control', 'location'];
// Feature: bound each read-only request and omit bodies, cookies and credential values from the report.
const website = await Promise.all(['/', '/app', '/app/', '/terms', '/privacy', '/security-check-missing-page', '/package.json', '/.env'].map(async (path) => {
  try {
    const response = await fetch(new URL(path, origin), { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(12_000) });
    return { path, status: response.status, headers: Object.fromEntries(selectedHeaders.map((name) => [name, response.headers.get(name)])) };
  } catch { return { path, error: 'Could not read this public URL.' }; }
}));
console.log(JSON.stringify({ website: origin.origin, responses: website }, null, 2));
const cloud = publicCloudConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
if (cloud) {
  try {
    const response = await fetch(`${cloud.url}/auth/v1/settings`, { headers: { apikey: cloud.key }, redirect: 'error', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('Unavailable');
    const settings = await response.json();
    console.log(JSON.stringify({ configuredAuthOrigin: cloud.url, emailAccountsEnabled: settings.external?.email,
      emailConfirmationRequired: settings.mailer_autoconfirm === false, signupDisabled: settings.disable_signup,
      anonymousSignInsEnabled: settings.external?.anonymous_users }, null, 2));
  } catch { console.log('Public Auth settings could not be verified.'); }
}
