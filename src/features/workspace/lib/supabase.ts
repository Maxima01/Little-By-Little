import 'react-native-url-polyfill/auto';
import { AuthClient, createClient, processLock } from '@supabase/supabase-js';
import { publicCloudConfig } from './cloudConfig';
import { nativeAuthStorage } from './nativeAuthStorage';
import { createCloudFetch } from './cloudFetch';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Feature: unsafe public configuration disables optional cloud access instead of starting a privileged client.
let configuration: ReturnType<typeof publicCloudConfig> = null;
// Feature: offer browser account forms only on secure pages, including trusted loopback development.
try {
  if (typeof window === 'undefined' || window.isSecureContext !== false) configuration = publicCloudConfig(url, key);
}
catch { console.error('Cloud configuration rejected. Use an HTTPS project origin and a public Supabase key.'); }

// Feature: share full-response deadlines and provider-origin checks across authentication and workspace requests.
const cloudFetch = configuration ? createCloudFetch(configuration.url) : undefined;

// Feature: cloud access is optional; only the public project key belongs in the renderer bundle.
export const cloudProjectKey = configuration?.url ?? 'unconfigured';
export const supabase = configuration ? createClient(configuration.url, configuration.key, {
  auth: {
    ...(nativeAuthStorage ? { storage: nativeAuthStorage, lock: processLock } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: { fetch: cloudFetch },
}) : null;

// Feature: confirmation returns a PKCE code instead of bearer tokens. Signup never writes to the writing desk's session.
export const cloudRegistration = configuration ? new AuthClient({
  url: `${configuration.url}/auth/v1`,
  headers: { apikey: configuration.key, Authorization: `Bearer ${configuration.key}` },
  fetch: cloudFetch,
  storageKey: 'little-by-little-registration',
  flowType: 'pkce',
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}) : null;
