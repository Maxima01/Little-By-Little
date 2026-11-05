// Feature: shared build/runtime validation prevents private Supabase credentials being used by public clients.
export type PublicCloudConfig = { url: string; key: string };

// Decodes only the legacy key's public role claim; this is a credential-type check, never authentication.
function isLegacyAnonKey(key: string): boolean {
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || typeof atob !== 'function') return false;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return !!claims && typeof claims === 'object' && 'role' in claims && claims.role === 'anon';
  } catch { return false; }
}

// Accepts an HTTPS project origin (or explicit loopback development) and a publishable/legacy anon key.
export function publicCloudConfig(rawUrl?: string, rawKey?: string): PublicCloudConfig | null {
  if (!rawUrl && !rawKey) return null;
  if (!rawUrl || !rawKey) throw new Error('Set both public Supabase configuration values, or leave both unset for offline use.');
  const key = rawKey.trim();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !isLegacyAnonKey(key)) {
    throw new Error('Only a Supabase publishable key or legacy anon key may be included in a public application.');
  }
  let parsed: URL;
  try { parsed = new URL(rawUrl.trim()); }
  catch { throw new Error('The public Supabase URL must be a valid project origin.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))
    || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('The public Supabase URL must be an HTTPS origin; HTTP is allowed only on loopback for development.');
  }
  return { url: parsed.origin, key };
}
