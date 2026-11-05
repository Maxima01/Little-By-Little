import 'react-native-url-polyfill/auto';
import { AuthClient, createClient, processLock, type GoTrueClientOptions } from '@supabase/supabase-js';
import { publicCloudConfig } from './cloudConfig';
import { nativeAuthStorage } from './nativeAuthStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Feature: unsafe public configuration disables optional cloud access instead of starting a privileged client.
let configuration: ReturnType<typeof publicCloudConfig> = null;
// Feature: offer browser account forms only on secure pages, including trusted loopback development.
try {
  if (typeof window === 'undefined' || window.isSecureContext !== false) configuration = publicCloudConfig(url, key);
}
catch { console.error('Cloud configuration rejected. Use an HTTPS project origin and a public Supabase key.'); }

// Feature: bound both account and workspace requests when the network stalls.
const cloudFetch: NonNullable<GoTrueClientOptions['fetch']> = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
};

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
