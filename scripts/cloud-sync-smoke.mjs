import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';

// Feature: exercise the complete cloud account/save/pull flow without contacting Supabase or a writer's profile.
const output = resolve('.local-checks/cloud');
const root = resolve('dist');
const origin = 'http://127.0.0.1:8095';
const cloudOrigin = 'https://yheuhwrooefcemrqjqqv.supabase.co';
const owner = '11111111-1111-4111-8111-111111111111';
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'cloud-smoke@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
const errors = [];
const requests = [];
let row = null;
let uploadCount = 0;
let cachedReadCount = 0;
let browser;
let failurePage;

// Feature: a fake JWT models a distinct login and keeps the same session ID on refresh.
function session(sessionId) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, session_id: sessionId, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now })}.mock-signature`, refresh_token: `mock-${sessionId}`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user };
}

// Feature: serve the exported app with explicit MIME types and reject paths outside the build directory.
async function serve(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  // Feature: browser smoke enters the writing workspace at /app while the website root serves its landing page.
  const file = resolve(root, ['/', '/app', '/app/'].includes(pathname) ? 'index.html' : `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
  try { await access(file); }
  catch { response.writeHead(404); response.end('Not found'); return; }
  const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }[extname(file)] ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': type });
  createReadStream(file).pipe(response);
}

// Feature: model revision-checked cloud saves and ordinary auth responses entirely inside the browser route handler.
async function mockSupabase(route) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  requests.push({ path: url.pathname, method });
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' };
  const reply = (body, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(body) });
  if (method === 'OPTIONS') return reply({});
  if (url.pathname === '/auth/v1/token') {
    const sessionId = url.searchParams.get('grant_type') === 'refresh_token'
      ? request.postDataJSON().refresh_token.slice('mock-'.length) : randomUUID();
    return reply(session(sessionId));
  }
  if (url.pathname === '/auth/v1/user') return reply(user);
  if (url.pathname === '/auth/v1/logout') return reply({});
  if (url.pathname === '/rest/v1/rpc/read_cloud_workspace') {
    const body = request.postDataJSON();
    assert.equal(method, 'POST', 'Private workspace reads use the authenticated RPC');
    assert.equal(body.p_user_id, owner, 'Reads carry the signed-in account');
    assert.ok(body.p_known_revision === null || Number.isSafeInteger(body.p_known_revision), 'Cached reads carry a valid known revision');
    // Feature: a matching revision returns a null manuscript plus the unchanged server timestamp.
    if (row && body.p_known_revision === row.revision) cachedReadCount += 1;
    return reply(row ? [{ revision: row.revision, updated_at: row.updated_at, workspace: body.p_known_revision === row.revision ? null : row.workspace }] : []);
  }
  if (url.pathname === '/rest/v1/rpc/save_cloud_workspace') {
    const body = request.postDataJSON();
    assert.equal(body.p_user_id, owner, 'Writes carry the signed-in account');
    if (body.p_expected_revision !== (row?.revision ?? 0)) return reply({ code: '40001', message: 'Cloud revision changed' }, 409);
    row = { user_id: owner, revision: (row?.revision ?? 0) + 1, workspace: structuredClone(body.p_workspace), updated_at: new Date().toISOString() };
    uploadCount += 1;
    return reply([row]);
  }
  throw new Error(`Unexpected Supabase request: ${method} ${url.pathname}`);
}

// Feature: every test page records runtime failures and rejects horizontal overflow before screenshot capture.
async function capture(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow in ${name}`);
  await page.screenshot({ path: resolve(output, name) });
}

// Feature: verify nested cloud panels can scroll every action into view even when other toolbar rows are open.
async function reachable(page, name) {
  const action = page.getByRole('button', { name, exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport({ ratio: 1 });
  await action.click({ trial: true });
}

// Feature: keep both browser devices independent while intercepting every request to the real cloud host.
async function device(viewport) {
  const context = await browser.newContext({ viewport });
  // Feature: fail closed on unmocked external requests so a changed cloud URL cannot reach a real project.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin === cloudOrigin) return mockSupabase(route);
    errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  failurePage = page;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/app`);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  return { page, context };
}

// Feature: sign in through the same labeled fields and keyboard submission available to writers.
async function signIn(page, openPanel = true) {
  if (openPanel) await page.getByRole('button', { name: 'Cloud saves', exact: true }).click();
  await page.getByRole('textbox', { name: 'Cloud account email address', exact: true }).fill(user.email);
  await page.getByRole('textbox', { name: 'Cloud account password', exact: true }).fill('mock-password-123');
  await page.getByRole('textbox', { name: 'Cloud account password', exact: true }).press('Enter');
  await expect(page.getByText(`Signed in as ${user.email}`, { exact: true })).toBeVisible();
}

// Feature: inspect the isolated durable record to confirm pulls preserve the displaced local workspace in history.
async function localRecord(page) {
  return page.evaluate(() => new Promise((resolveRecord, reject) => {
    const opening = indexedDB.open('little-by-little', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction('workspace').objectStore('workspace').get('little-by-little.workspace.v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { db.close(); resolveRecord(JSON.parse(request.result)); };
    };
  }));
}

await mkdir(output, { recursive: true });
await access(resolve(root, 'index.html'));
const server = createServer((request, response) => { void serve(request, response).catch((error) => { response.writeHead(500); response.end(error.message); }); });
await new Promise((resolveServer) => server.listen(8095, '127.0.0.1', resolveServer));
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const desktop = await device({ width: 1440, height: 900 });
  const page = desktop.page;
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Start cloud sync', exact: true })).toBeVisible();
  assert.equal(uploadCount, 0, 'Signing in does not upload before the writer chooses');
  await page.getByRole('button', { name: 'Start cloud sync', exact: true }).click();
  await expect(page.getByText('Saved in cloud', { exact: true })).toBeVisible();
  assert.equal(uploadCount, 1, 'First link uploads exactly one complete workspace');
  assert.ok(row.workspace.stories[0].chapters.length > 0, 'Full manuscripts are in the uploaded workspace');
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect.poll(() => cachedReadCount).toBeGreaterThan(0);
  await expect(page.getByText('Saved in cloud', { exact: true })).toBeVisible();
  assert.equal(uploadCount, 1, 'An unchanged metadata-only poll does not upload the workspace again');
  const originalTitle = row.workspace.stories[0].title;
  row = structuredClone(row);
  row.revision += 1;
  row.updated_at = new Date(Date.now() + 1000).toISOString();
  row.workspace.stories[0].title = 'Cloud smoke: received from another device';
  row.workspace.stories[0].updatedAt = row.updated_at;
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(page.getByText('Cloud smoke: received from another device', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Saved in cloud', { exact: true })).toBeVisible();
  const pulled = await localRecord(page);
  assert.equal(pulled.workspace.stories[0].title, row.workspace.stories[0].title);
  assert.ok(pulled.versions.some((version) => version.workspace.stories.some((story) => story.title === originalTitle)), 'Cloud pull preserves the previous local draft in history');
  await page.getByRole('button', { name: 'Pause sync', exact: true }).click();
  await expect(page.getByText('Cloud sync paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Start my story', exact: true }).click();
  await page.getByRole('textbox', { name: 'New story title', exact: true }).fill('Cloud smoke: local draft while paused');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true }).first()).toBeVisible();
  row = structuredClone(row);
  row.revision += 1;
  row.updated_at = new Date(Date.now() + 2000).toISOString();
  row.workspace.stories[0].title = 'Cloud smoke: competing remote draft';
  row.workspace.stories[0].updatedAt = row.updated_at;
  await page.getByRole('button', { name: 'Resume sync', exact: true }).click();
  await expect(page.getByText('Both workspaces need review', { exact: true })).toBeVisible();
  assert.equal(uploadCount, 1, 'Competing offline edits cannot silently overwrite the cloud');
  assert.ok((await localRecord(page)).workspace.stories.some((story) => story.title === 'Cloud smoke: local draft while paused'), 'Conflict preserves local work until a choice is made');
  await capture(page, 'desktop-conflict.png');
  await page.getByRole('button', { name: 'Use cloud workspace', exact: true }).click();
  await expect(page.getByText('Saved in cloud', { exact: true })).toBeVisible();
  assert.ok((await localRecord(page)).versions.some((version) => version.workspace.stories.some((story) => story.title === 'Cloud smoke: local draft while paused')), 'Explicit conflict resolution preserves the displaced local draft');
  await capture(page, 'desktop.png');
  const settingsKey = `little-by-little.cloud.v1:${cloudOrigin}`;
  const oldSettings = await page.evaluate((key) => localStorage.getItem(key), settingsKey);
  assert.ok(oldSettings, 'The approved session remembers its sync settings');
  // Feature: the browser persists a compact digest, never a second manuscript in its sync preferences.
  assert.match(JSON.parse(oldSettings).baseline.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.ok(oldSettings.length < 400, 'Sync preferences fit independently of manuscript size');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  assert.equal((await localRecord(page)).workspace.stories[0].title, row.workspace.stories[0].title, 'Sign-out preserves local stories');
  // Feature: a new login still requires a choice when storage retains an old link and both copies match.
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), settingsKey)).toBeNull();
  await page.evaluate(({ key, old }) => localStorage.setItem(key, old), { key: settingsKey, old: oldSettings });
  await signIn(page, false);
  await expect(page.getByText('Choose your starting workspace', { exact: true })).toBeVisible();
  assert.equal(uploadCount, 1, 'A previous login cannot authorize uploads in a new session');
  await desktop.context.close();

  const mobile = await device({ width: 390, height: 844 });
  const mobilePage = mobile.page;
  await mobilePage.getByRole('button', { name: 'Cloud saves', exact: true }).click();
  await capture(mobilePage, 'mobile.png');
  const inputBorder = await mobilePage.getByRole('textbox', { name: 'Cloud account email address', exact: true }).evaluate((input) => ({ color: getComputedStyle(input).borderLeftColor, width: getComputedStyle(input).borderLeftWidth }));
  assert.equal(inputBorder.color, 'rgb(98, 92, 107)', 'Account input boundary uses the readable muted theme ink');
  assert.equal(inputBorder.width, '1px');
  await mobilePage.getByRole('textbox', { name: 'Cloud account email address', exact: true }).fill(user.email);
  await mobilePage.getByRole('textbox', { name: 'Cloud account password', exact: true }).fill('mock-password-123');
  await mobilePage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(mobilePage.getByRole('button', { name: 'Use cloud workspace', exact: true })).toBeVisible();
  for (const name of ['Use this device’s workspace', 'Use cloud workspace', 'Sign out']) await reachable(mobilePage, name);
  await capture(mobilePage, 'mobile-conflict.png');
  await mobilePage.setViewportSize({ width: 390, height: 600 });
  for (const name of ['Use this device’s workspace', 'Use cloud workspace', 'Sign out']) await reachable(mobilePage, name);
  await capture(mobilePage, 'mobile-short.png');
  await mobilePage.getByRole('button', { name: 'Workspace backups and history', exact: true }).click();
  for (const name of ['Use this device’s workspace', 'Use cloud workspace', 'Sign out']) await reachable(mobilePage, name);
  await capture(mobilePage, 'mobile-short-menu.png');
  await mobilePage.getByRole('button', { name: 'Workspace backups and history', exact: true }).click();
  await mobilePage.getByRole('button', { name: 'Use cloud workspace', exact: true }).click();
  await expect(mobilePage.getByText('Saved in cloud', { exact: true })).toBeVisible();
  assert.equal((await localRecord(mobilePage)).workspace.stories[0].title, row.workspace.stories[0].title, 'A second device downloads the same cloud workspace');
  assert.equal(uploadCount, 1, 'Pulling and connecting another device does not upload over cloud changes');
  await mobile.context.close();
  assert.deepEqual(errors, [], 'No console errors or unhandled page errors');
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: true, uploadCount, cachedReadCount, requests, errors, captures: ['desktop.png', 'desktop-conflict.png', 'mobile.png', 'mobile-conflict.png', 'mobile-short.png', 'mobile-short-menu.png'] }, null, 2));
  console.log('PASS: mocked sign-in, explicit initial upload, remote pull with local history, pause/resume conflict protection, sign-out preservation, second-device download, desktop/mobile overflow, short-window nested scrolling, input borders, no runtime errors.');
} catch (error) {
  if (failurePage && !failurePage.isClosed()) await failurePage.screenshot({ path: resolve(output, 'failure.png') }).catch(() => undefined);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: false, message: error.message, uploadCount, requests, errors }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolveServer) => server.close(resolveServer));
}


