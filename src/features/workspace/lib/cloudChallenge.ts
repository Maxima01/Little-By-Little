// Feature: one public-key validator is shared by build checks and optional account bot protection.
export function publicCloudChallengeKey(rawKey?: string): string | null {
  if (!rawKey) return null;
  const key = rawKey.trim();
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(key)) {
    throw new Error('Use a valid public Turnstile site key; never put the verification secret in the application.');
  }
  return key;
}

const rawKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
let validatedKey: string | null = null;
try { validatedKey = publicCloudChallengeKey(rawKey); }
catch { /* Feature: invalid runtime configuration keeps authentication gated rather than bypassing verification. */ }

export const cloudChallengeSiteKey = validatedKey;
export const cloudChallengeRequired = Boolean(rawKey);
// Feature: Turnstile cannot run on file:// or native clients; those builds must not silently bypass the provider challenge.
export const cloudChallengeSupported = typeof window !== 'undefined' && typeof document !== 'undefined'
  && ['http:', 'https:'].includes(window.location.protocol) && !window.novelDesktop;
