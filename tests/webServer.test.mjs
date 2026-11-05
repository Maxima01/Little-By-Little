import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { contentSecurityPolicy, createRequestGate, createWebServer } from '../server/web.mjs';

// Feature: raw HTTP targets retain encoded traversal attempts that browser fetch would normalize away.
function get(port, path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, method, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('web host serves only published routes and bounded assets with security headers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-web-'));
  const dist = join(directory, 'dist');
  await mkdir(join(dist, '_expo/static/js/web'), { recursive: true });
  await mkdir(join(dist, 'website'), { recursive: true });
  await Promise.all([
    writeFile(join(dist, 'index.html'), '<h1>Website</h1>'),
    writeFile(join(dist, '404.html'), '<h1>Page not found</h1>'),
    writeFile(join(dist, '_expo/static/js/web/index-123.js'), 'console.log("published")'),
    writeFile(join(dist, '_expo/static/js/web/index-123.js.map'), 'private source map'),
    writeFile(join(dist, '.env'), 'SECRET=private'),
    writeFile(join(directory, 'outside.css'), 'PRIVATE'),
  ]);
  const server = await createWebServer({ directory: dist, supabaseUrl: 'https://example.supabase.co' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  try {
    // Feature: signup policies remain directly readable before authentication, including trailing-slash URLs.
    for (const path of ['/', '/app', '/app/', '/terms', '/terms/', '/privacy', '/privacy/']) {
      const page = await get(port, path);
      assert.equal(page.status, 200, path);
      assert.match(page.body, /Website/);
      assert.equal(page.headers['x-robots-tag'], undefined);
    }
    const missing = await get(port, '/missing?x=%3Cscript%3E');
    assert.equal(missing.status, 404);
    assert.match(missing.body, /Page not found/);
    assert.doesNotMatch(missing.body, /script/);
    assert.equal(missing.headers['x-content-type-options'], 'nosniff');
    assert.equal(missing.headers['x-frame-options'], 'DENY');
    assert.match(missing.headers['content-security-policy'], /script-src 'self';/);
    assert.match(missing.headers['content-security-policy'], /form-action 'none';/);
    assert.match(missing.headers['content-security-policy'], /https:\/\/example.supabase.co/);
    assert.equal(missing.headers['x-robots-tag'], 'noindex');
    const asset = await get(port, '/_expo/static/js/web/index-123.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers['content-type'], /javascript/);
    assert.match(asset.headers['cache-control'], /immutable/);
    for (const path of ['/.env', '/%2e%2e/outside.css', '/website/%2e%2e/.env', '/website/%252e%252e/private.css', '/website/%5cprivate.css', '/%00', '/%zz']) {
      assert.equal((await get(port, path)).status, 400, path);
    }
    for (const path of ['/package.json', '/src/shell/App.tsx', '/metadata.json', '/_expo/static/js/web/index-123.js.map', '/api/admin']) {
      const response = await get(port, path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.body, /private|SECRET/);
    }
    assert.equal((await get(port, '/app', 'POST')).status, 405);
    assert.equal((await get(port, '/app', 'GET', { 'Content-Length': '2' })).status, 400);
    const head = await get(port, '/missing', 'HEAD');
    assert.equal(head.status, 404);
    assert.equal(head.body, '');
    assert.ok(Number(head.headers['content-length']) > 0);
    // Windows can require administrator/developer mode for symlinks; test containment whenever permitted.
    try {
      await symlink(join(directory, 'outside.css'), join(dist, 'website/escape.css'));
      const escaped = await get(port, '/website/escape.css');
      assert.equal(escaped.status, 404);
      assert.doesNotMatch(escaped.body, /PRIVATE/);
    } catch (error) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('CSP accepts only an exact HTTPS provider origin', () => {
  for (const value of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com/?anything', "https://example.com/#'unsafe-inline'"]) {
    assert.throws(() => contentSecurityPolicy(value));
  }
  assert.doesNotMatch(contentSecurityPolicy(), /supabase\.co/);
  assert.doesNotMatch(contentSecurityPolicy('https://project.supabase.co'), /unsafe-eval/);
});

// Feature: bot challenges open only the required script/frame origin without loosening executable inline policy.
test('CSP allows configured Turnstile challenges without arbitrary remote code or inline scripts', () => {
  assert.doesNotMatch(contentSecurityPolicy(), /challenges\.cloudflare\.com/);
  const policy = contentSecurityPolicy('https://project.supabase.co', '1x00000000000000000000AA');
  assert.match(policy, /script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
  assert.match(policy, /frame-src 'self' https:\/\/challenges\.cloudflare\.com;/);
  assert.doesNotMatch(policy, /script-src[^;]*(?:unsafe-inline|unsafe-eval|\*)/);
  assert.doesNotMatch(policy, /connect-src[^;]*challenges\.cloudflare\.com/);
  for (const key of ['short', "key; script-src *", 'https://untrusted.example/widget', 'x'.repeat(101), true]) {
    assert.throws(() => contentSecurityPolicy(undefined, key), /public Turnstile site key/);
  }
});

test('request limits refill, cap peer storage, and apply a shared traffic bound', () => {
  let time = 0;
  const gate = createRequestGate({ burst: 2, perSecond: 1, maxClients: 2, now: () => time });
  assert.equal(gate('first'), 0);
  assert.equal(gate('first'), 0);
  assert.equal(gate('first'), 1);
  time = 1_000;
  assert.equal(gate('first'), 0);
  assert.equal(gate('second'), 0);
  assert.ok(gate('third') >= 60, 'new peers cannot grow a full limiter table');
  time = 62_000;
  assert.equal(gate('third'), 0, 'idle peers expire before admitting a new one');
  const shared = createRequestGate({ burst: 1000, now: () => 0 });
  for (let index = 0; index < 600; index += 1) assert.equal(shared(`peer-${index % 3}`), 0);
  assert.equal(shared('another'), 1, 'all peers share a bounded process budget');
});

test('loopback requests receive 429 and cannot evade the peer limit using forwarded headers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-volume-'));
  await Promise.all([writeFile(join(directory, 'index.html'), 'home'), writeFile(join(directory, '404.html'), 'missing')]);
  const server = await createWebServer({ directory, requestLimits: { burst: 2, perSecond: 0.01 } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  try {
    assert.equal((await get(port, '/')).status, 200);
    assert.equal((await get(port, '/app')).status, 200);
    const blocked = await get(port, '/', 'GET', { 'X-Forwarded-For': '192.0.2.4', 'X-Novel-Client-IP': '192.0.2.4' });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.match(blocked.headers['cache-control'], /no-store/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

// Feature: trusted proxy requests get independent client budgets and reject spoofed or malformed addresses.
test('proxy mode requires its trusted peer and one valid client address', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-proxy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all([writeFile(join(directory, 'index.html'), 'home'), writeFile(join(directory, '404.html'), 'missing')]);
  const listen = async (trustedProxyIp) => {
    const server = await createWebServer({ directory, trustedProxyIp, requestLimits: { burst: 1, perSecond: 0.01 } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    return server.address().port;
  };
  await assert.rejects(createWebServer({ directory, trustedProxyIp: '127.0.0.1/8' }), /TRUSTED_PROXY_IP/);
  const port = await listen('127.0.0.1');
  for (const address of [undefined, '192.0.2.4:443', '192.0.2.4, 198.51.100.5', ['192.0.2.4', '198.51.100.5']]) {
    assert.equal((await get(port, '/', 'GET', address === undefined ? {} : { 'X-Novel-Client-IP': address })).status, 400);
  }
  assert.equal((await get(port, '/', 'GET', { 'X-Novel-Client-IP': '2001:0db8:0:0::1' })).status, 200);
  assert.equal((await get(port, '/', 'GET', { 'X-Novel-Client-IP': '2001:db8::1', 'X-Forwarded-For': '192.0.2.4' })).status, 429);
  assert.equal((await get(port, '/', 'GET', { 'X-Novel-Client-IP': '198.51.100.5' })).status, 200);
  const untrusted = await listen('127.0.0.2');
  assert.equal((await get(untrusted, '/', 'GET', { 'X-Novel-Client-IP': '198.51.100.5' })).status, 403);
});
