import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { loadProjectEnv } from '@expo/env';
import { mkdir } from 'node:fs/promises';

loadProjectEnv(process.cwd(), { mode: 'production', silent: true });

// Feature: a bounded production smoke check verifies routing, live controls, CSP and responsive integration.
// Run against npm run serve:web; a disposable browser context never opens the writer's stored library.
const origin = process.env.NOVEL_WEBSITE_URL ?? 'http://127.0.0.1:8093';
const cloudOrigin = process.env.EXPO_PUBLIC_SUPABASE_URL;
const output = '.local-checks/optional-login';
const owner = '11111111-1111-4111-8111-111111111111';
const loginSessionId = '22222222-2222-4222-8222-222222222222';
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'writer@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
let accountAttempts = 0;
let uploads = 0;
let acceptSignIn = false;
let signupChallengeMethod;
// Feature: keep signup pending long enough to exercise the header links during an account request.
const signupResponse = Promise.withResolvers();
// Feature: all account responses are synthetic; browser checks never register users or upload real manuscripts.
function session() {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, session_id: loginSessionId, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now })}.mock`, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user };
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  await mkdir(output, { recursive: true });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    assert.equal(url.origin, cloudOrigin, 'No unmocked external requests');
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') return reply({});
    if (url.pathname === '/auth/v1/signup') {
      accountAttempts += 1;
      signupChallengeMethod = route.request().postDataJSON().code_challenge_method;
      await signupResponse.promise;
      return reply({ user, session: null });
    }
    if (url.pathname === '/auth/v1/token') { accountAttempts += 1; return acceptSignIn ? reply(session()) : reply({ code: 'invalid_credentials', msg: 'Private provider details must never appear' }, 400); }
    if (url.pathname === '/auth/v1/user') return reply(user);
    if (url.pathname === '/rest/v1/rpc/read_cloud_workspace') return reply([]);
    if (url.pathname === '/rest/v1/rpc/save_cloud_workspace') { uploads += 1; return reply({ message: 'Unexpected upload' }, 403); }
    throw new Error(`Unexpected provider path: ${url.pathname}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Feature: configured CAPTCHA is simulated locally; no testing token can reach a real provider endpoint.
    window.turnstile = { ready: (callback) => callback(), render: (_container, options) => { options.callback('mock-verification-token'); return 'mock-widget'; }, remove: () => {} };
    window.__websiteCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__websiteCspViolations.push(event.violatedDirective));
  });
  // Feature: unused confirmation credentials are removed without exchanging a code or accepting a session.
  const response = await page.goto(`${origin}/?code=synthetic&sb_flow_id=abc#access_token=synthetic`);
  assert.equal(response.status(), 200);
  assert.match(response.headers()['content-security-policy'], /script-src 'self'/);
  await expect(page).toHaveURL(`${origin}/`);
  assert.equal(accountAttempts, 0);
  await expect(page.getByRole('heading', { name: 'A little more story', exact: true })).toBeVisible();
  const sample = page.getByRole('textbox', { name: 'Edit this sample draft', exact: true });
  await sample.fill('One little sentence.');
  await expect(page.locator('output')).toHaveText('3 words');
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chapter context', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show context', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chapter context', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Where does my writing go?', exact: false }).click();
  await expect(page.locator('#question-answer')).toContainText('clearing browser data');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    await expect(page.getByRole('navigation', { name: 'Website' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    if ([1440, 390].includes(width)) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `${output}/landing-${width}.png` });
      await page.locator('#account').screenshot({ path: `${output}/account-${width}.png` });
    }
  }
  assert.equal(await page.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), true, 'All four product screenshots load');
  const missing = await page.goto(`${origin}/missing-chapter`);
  assert.equal(missing.status(), 404);
  await expect(page.getByRole('heading', { name: 'A page out of place', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home', exact: true }).click();
  // Feature: registration and failed sign-in stay on the landing page and clear submitted passwords.
  if (cloudOrigin) {
    await page.getByRole('navigation', { name: 'Website' }).getByRole('link', { name: 'Register', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill(user.email);
    await page.getByLabel('Password · at least 15 characters', { exact: true }).fill('mock-password-123');
    // Feature: registration remains blocked until terms acceptance and privacy acknowledgment are both explicit.
    const register = page.locator('#account form').getByRole('button', { name: 'Register', exact: true });
    await expect(page.locator('#account-terms')).not.toBeChecked();
    await expect(page.locator('#account-privacy')).not.toBeChecked();
    await expect(register).toBeDisabled();
    await page.locator('#account-terms').check();
    await expect(register).toBeDisabled();
    await page.locator('#account-privacy').check();
    await expect(register).toBeEnabled();
    await expect(page.locator('#account form')).toHaveAttribute('method', 'post');
    await register.click();
    const header = page.getByRole('navigation', { name: 'Website' });
    await header.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Register for cloud saves', exact: true })).toBeVisible();
    await expect(page.locator('#account form')).toHaveAttribute('aria-busy', 'true');
    await header.getByRole('link', { name: 'Register', exact: true }).click();
    signupResponse.resolve();
    await expect(page.locator('#account .account-notice')).toContainText('receive a confirmation email');
    assert.equal(accountAttempts, 1);
    assert.equal(signupChallengeMethod, 's256');
    assert.equal(new URL(page.url()).pathname, '/');
    await expect(page.locator('#account-password')).toHaveValue('');
    await expect(page.locator('#account-terms')).not.toBeChecked();
    await expect(page.locator('#account-privacy')).not.toBeChecked();
    await page.getByRole('navigation', { name: 'Website' }).getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.locator('#account form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Could not sign in');
    await expect(page.getByRole('alert')).not.toContainText('Private provider');
    await expect(page.locator('#account-password')).toHaveValue('');
  }
  await page.getByRole('link', { name: 'Continue without an account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start my story', exact: true })).toBeVisible();
  assert.equal(new URL(page.url()).pathname, '/app');
  const attemptsBeforeWriting = accountAttempts;
  await page.getByRole('button', { name: 'Start my story', exact: true }).click();
  await page.getByRole('textbox', { name: 'New story title', exact: true }).fill('Guest story kept after sign-in');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true }).first()).toBeVisible();
  assert.equal(accountAttempts, attemptsBeforeWriting, 'Guest writing never contacts an account endpoint');
  await page.reload();
  await expect(page.getByText('Guest story kept after sign-in', { exact: true }).first()).toBeVisible();
  // Feature: logging in later preserves the guest story and requires explicit consent before any upload.
  if (cloudOrigin) {
    acceptSignIn = true;
    await page.goto(origin);
    await page.getByRole('navigation', { name: 'Website' }).getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('mock-password-123');
    await page.locator('#account form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/app`);
    await expect(page.getByRole('button', { name: 'Start cloud sync', exact: true })).toBeVisible();
    await expect(page.getByText('Guest story kept after sign-in', { exact: true }).first()).toBeVisible();
    assert.equal(uploads, 0, 'Sign-in never uploads without choosing Start cloud sync');
  }
  assert.deepEqual(await page.evaluate(() => window.__websiteCspViolations), []);
  assert.deepEqual(errors, []);
  console.log('PASS: landing controls, four widths, guest story persistence, optional registration/sign-in, sanitized errors, no automatic uploads, 404 recovery and CSP.');
} finally {
  signupResponse.resolve();
  await browser.close();
}
