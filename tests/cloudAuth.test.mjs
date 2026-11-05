import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudAccountError, signInCloudAccount, signUpCloudAccount, validateCloudCredentials } from '../src/features/workspace/lib/cloudAuth.ts';
import { LEGAL_VERSION } from '../src/features/legal/lib/policyConsent.ts';

const acceptance = { termsAccepted: true, privacyAcknowledged: true };
const newPassword = 'a longer passphrase';

// Feature: verify public account operations reject oversized input before contacting the auth provider.
test('account validation bounds inputs and only requires the new-password minimum for registration', async () => {
  assert.equal(validateCloudCredentials(' writer@example.test ', 'old'), 'writer@example.test');
  assert.throws(() => validateCloudCredentials('bad-address', 'password'), /valid email/);
  assert.throws(() => validateCloudCredentials('a'.repeat(255) + '@example.test', 'password'), /valid email/);
  assert.throws(() => validateCloudCredentials('writer@example.test', 'x'.repeat(1025)), /at most 1024/);
  assert.throws(() => validateCloudCredentials('writer@example.test', 'short', true), /at least 15/);
  // Feature: validate Unicode characters and the bcrypt byte limit without truncating a pasted password.
  assert.throws(() => validateCloudCredentials('writer@example.test', '😀'.repeat(14), true), /at least 15/);
  assert.throws(() => validateCloudCredentials('writer@example.test', '😀'.repeat(19), true), /at most 72 bytes/);
  assert.equal(validateCloudCredentials('writer@example.test', '😀'.repeat(18), true), 'writer@example.test');
  assert.equal(validateCloudCredentials('writer@example.test', '😀'.repeat(19)), 'writer@example.test');
  let calls = 0;
  await assert.rejects(signInCloudAccount({ auth: { signInWithPassword: async () => { calls += 1; } } }, 'invalid', 'password'), /valid email/);
  assert.equal(calls, 0);
});

// Feature: keep authentication errors actionable while withholding raw provider messages and account-existence details.
test('account failures sanitize provider responses', () => {
  const missing = cloudAccountError({ code: 'invalid_credentials', message: 'Account does not exist: private@example.test' });
  const wrong = cloudAccountError({ code: 'email_not_confirmed', message: 'Existing account requires confirmation' });
  assert.equal(missing.message, wrong.message);
  assert.doesNotMatch(missing.message, /private@example|does not exist/);
  assert.match(cloudAccountError({ status: 429 }).message, /Too many account attempts/);
  assert.match(cloudAccountError({ code: 'captcha_failed' }).message, /security check/);
  assert.match(cloudAccountError(new TypeError('Network failed')).message, /connection/);
});

// Feature: forward CAPTCHA and policy acknowledgments through the separate sign-in and registration clients.
test('shared account helpers pass CAPTCHA tokens and accept confirmation-only registration', async () => {
  let signInInput;
  let signUpInput;
  const client = { auth: {
    signInWithPassword: async (input) => { signInInput = input; return { error: null }; },
  } };
  const registration = { signUp: async (input) => { signUpInput = input; return { data: { session: null }, error: null }; } };
  await signInCloudAccount(client, ' writer@example.test ', 'password', 'one-use-token');
  assert.deepEqual(signInInput, { email: 'writer@example.test', password: 'password', options: { captchaToken: 'one-use-token' } });
  await signUpCloudAccount(registration, 'writer@example.test', newPassword, acceptance, 'next-token');
  assert.equal(signUpInput.options.captchaToken, 'next-token');
  assert.deepEqual(signUpInput.options.data.legal_acceptance, {
    terms_version: LEGAL_VERSION, privacy_version: LEGAL_VERSION,
    terms_accepted: true, privacy_acknowledged: true,
    accepted_at: signUpInput.options.data.legal_acceptance.accepted_at,
  });
  assert.ok(Number.isFinite(Date.parse(signUpInput.options.data.legal_acceptance.accepted_at)));
  await signUpCloudAccount(registration, 'writer@example.test', newPassword, acceptance);
  assert.equal(signUpInput.options.captchaToken, undefined);
  assert.equal(signUpInput.options.data.legal_acceptance.terms_version, LEGAL_VERSION);
});

// Feature: a provider misconfiguration must never make signup succeed with an automatic session.
test('registration rejects and revokes an unexpected session', async () => {
  let revoked;
  const client = {
    signUp: async () => ({ data: { session: { access_token: 'fake' } }, error: null }),
    signOut: async (options) => { revoked = options; },
  };
  await assert.rejects(signUpCloudAccount(client, 'writer@example.test', newPassword, acceptance), /registration is temporarily unavailable/);
  assert.deepEqual(revoked, { scope: 'local' });
});

// Feature: duplicate registration and provider-obfuscated confirmation responses reveal the same outcome.
test('registration duplicates remain neutral and unknown provider failures stay private', async () => {
  const client = { signUp: async () => ({ data: null, error: { code: 'user_already_exists', message: 'Sensitive existing-account detail' } }) };
  await signUpCloudAccount(client, 'writer@example.test', newPassword, acceptance);
  client.signUp = async () => ({ data: null, error: { code: 'unexpected_failure', message: 'Private provider configuration' } });
  await assert.rejects(signUpCloudAccount(client, 'writer@example.test', newPassword, acceptance), (error) => !error.message.includes('Private provider configuration'));
  await assert.rejects(signInCloudAccount(null, 'writer@example.test', 'password'), /keep writing on this device/);
});

// Feature: missing or partial policy acknowledgments never contact the account provider.
test('registration requires both policy acknowledgments before any provider request', async () => {
  let calls = 0;
  const client = { signUp: async () => { calls += 1; return { data: { session: null }, error: null }; } };
  for (const choice of [undefined, null, {}, { termsAccepted: true }, { privacyAcknowledged: true }, { termsAccepted: false, privacyAcknowledged: true }, { termsAccepted: true, privacyAcknowledged: false }]) {
    await assert.rejects(signUpCloudAccount(client, 'writer@example.test', newPassword, choice), /Agree to the Terms of Service/);
  }
  assert.equal(calls, 0);
  await assert.rejects(signUpCloudAccount(null, 'writer@example.test', newPassword, acceptance), /keep writing on this device/);
});
