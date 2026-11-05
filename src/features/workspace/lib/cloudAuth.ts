import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountPolicyRecord, type AccountPolicyAcceptance } from '../../legal/lib/policyConsent.ts';
import { cloudChallengeRequired } from './cloudChallenge.ts';

export const CLOUD_EMAIL_MAX_LENGTH = 254;
export const CLOUD_PASSWORD_MAX_LENGTH = 1024;
// Feature: require longer passwords for new accounts within the provider's bcrypt byte limit.
export const CLOUD_PASSWORD_MIN_LENGTH = 15;
export const CLOUD_NEW_PASSWORD_MAX_BYTES = 72;
export const CLOUD_REGISTRATION_NOTICE = 'If this address can be registered, you’ll receive a confirmation email. Follow its link, then sign in with your password.';

// Feature: bound account inputs before sending them to the provider; provider validation remains authoritative.
export function validateCloudCredentials(email: string, password: string, registering = false): string {
  const address = email.trim();
  if (!address || address.length > CLOUD_EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error('Enter a valid email address.');
  }
  if (registering) {
    if (password.length > CLOUD_NEW_PASSWORD_MAX_BYTES || new TextEncoder().encode(password).length > CLOUD_NEW_PASSWORD_MAX_BYTES) {
      throw new Error(`Choose a password of at most ${CLOUD_NEW_PASSWORD_MAX_BYTES} bytes. Some characters use more than one byte.`);
    }
    if ([...password].length < CLOUD_PASSWORD_MIN_LENGTH) {
      throw new Error(`Choose a password with at least ${CLOUD_PASSWORD_MIN_LENGTH} characters.`);
    }
  } else if (!password || password.length > CLOUD_PASSWORD_MAX_LENGTH) {
    throw new Error(`Enter a password with at most ${CLOUD_PASSWORD_MAX_LENGTH} characters.`);
  }
  return address;
}

// Feature: require a challenge token in both account requests when the build enables Turnstile.
function requireCloudChallenge(token?: string): void {
  if (cloudChallengeRequired && !token) throw new Error('Complete the security check and try again.');
}

// Feature: public account forms show useful recovery guidance without exposing provider internals or account existence.
export function cloudAccountError(failure: unknown, registering = false): Error {
  const detail = failure && typeof failure === 'object' ? failure as { code?: string; status?: number; name?: string } : {};
  if (detail.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(detail.code ?? '')) {
    return new Error('Too many account attempts. Wait a moment before trying again.');
  }
  if (detail.code === 'captcha_failed') return new Error('Complete the security check and try again.');
  if (registering && detail.code === 'weak_password') return new Error('Choose a longer or less common password.');
  if (detail.name === 'AuthRetryableFetchError' || failure instanceof TypeError) {
    return new Error('Could not reach cloud saves. Check your connection and try again.');
  }
  return new Error(registering
    ? 'Could not register. Check your details and try again, or sign in if you already have an account.'
    : 'Could not sign in. Check your email and password, and confirm your email if needed.');
}

// Feature: shared optional sign-in works on the landing page and writing desk without uploading local stories.
export async function signInCloudAccount(client: SupabaseClient | null, email: string, password: string, captchaToken?: string): Promise<void> {
  if (!client) throw new Error('Cloud saves are unavailable right now. You can keep writing on this device.');
  const address = validateCloudCredentials(email, password);
  requireCloudChallenge(captchaToken);
  try {
    const { error } = await client.auth.signInWithPassword({ email: address, password, ...(captchaToken ? { options: { captchaToken } } : {}) });
    if (error) throw error;
  } catch (failure) { throw cloudAccountError(failure); }
}

// Feature: use the isolated registration client and report the same confirmation step for new and existing addresses.
export async function signUpCloudAccount(client: Pick<SupabaseClient['auth'], 'signUp' | 'signOut'> | null, email: string, password: string, acceptance: AccountPolicyAcceptance, captchaToken?: string): Promise<void> {
  const legalAcceptance = createAccountPolicyRecord(acceptance);
  if (!client) throw new Error('Cloud saves are unavailable right now. You can keep writing on this device.');
  const address = validateCloudCredentials(email, password, true);
  requireCloudChallenge(captchaToken);
  let receivedSession: boolean;
  try {
    const result = await client.signUp({
      email: address, password,
      options: { data: { legal_acceptance: legalAcceptance }, ...(captchaToken ? { captchaToken } : {}) },
    });
    if (result.error) {
      if (['user_already_exists', 'email_exists'].includes(result.error.code ?? '')) return;
      throw result.error;
    }
    receivedSession = Boolean(result.data.session);
  } catch (failure) { throw cloudAccountError(failure, true); }

  if (receivedSession) {
    // Feature: discard an unexpected automatic login without affecting the writer's regular session.
    try { await client.signOut({ scope: 'local' }); }
    catch { /* The isolated client keeps any failed-to-revoke session in memory only. */ }
    throw new Error('Account registration is temporarily unavailable. Please try again later.');
  }
}
