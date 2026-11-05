import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { prepareVercelOutput, vercelConfiguration } from '../scripts/vercel-output.mjs';
import { securityHeaders } from '../server/web.mjs';

// Feature: verify that Vercel keeps browser restrictions, genuine missing-page responses and account destinations.
test('Vercel routing preserves security headers and explicit documents without a catch-all 200', () => {
  const { routes } = vercelConfiguration('https://example.supabase.co', '0x' + 'a'.repeat(22));
  assert.deepEqual(routes[0].headers, securityHeaders('https://example.supabase.co', '0x' + 'a'.repeat(22)));
  assert.match(routes[0].headers['Content-Security-Policy'], /script-src 'self' https:\/\/challenges.cloudflare.com;/);
  assert.doesNotMatch(routes[0].headers['Content-Security-Policy'], /unsafe-eval|script-src \*/);
  const documents = new RegExp(routes.find((route) => route.dest === '/index.html').src);
  for (const path of ['/', '/app', '/app/', '/terms', '/privacy']) assert.ok(documents.test(path), path);
  for (const path of ['/missing', '/.env', '/src/index.js', '/api/admin']) assert.ok(!documents.test(path), path);
  assert.equal(routes.at(-1).status, 404);
  assert.equal(routes.at(-1).headers['Cache-Control'], 'no-store');
  assert.equal(routes.find((route) => route.methods?.includes('POST')).status, 405);
  assert.throws(() => vercelConfiguration('https://user:password@example.com'), /without credentials/);
});

// Feature: exercise packaging against private files and stale artifacts so an export cannot accidentally publish them.
test('Vercel output copies only public artifacts and removes stale output on rebuild', async (t) => {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, 'novel-vercel-'));
  t.after(async () => {
    assert.equal(dirname(root), parent);
    await rm(root, { recursive: true, force: true });
  });
  for (const name of ['index.html', '404.html', 'app/index.html', 'website/icon.png', '_expo/static/js/web/index-123.js',
    'metadata.json', '.env', '_expo/static/js/web/index-123.js.map', 'downloads/private.json', 'downloads/latest.json']) {
    const file = join(root, 'dist', name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, name);
  }
  await mkdir(join(root, '.vercel/output/static'), { recursive: true });
  await writeFile(join(root, '.vercel/output/static/old-secret.txt'), 'stale');
  const result = await prepareVercelOutput(root, 'https://example.supabase.co');
  const published = (await readdir(join(result.output, 'static'), { recursive: true })).map((name) => name.replaceAll('\\', '/'));
  for (const name of ['index.html', '404.html', 'website/icon.png', '_expo/static/js/web/index-123.js', 'downloads/latest.json']) assert.ok(published.includes(name), name);
  for (const name of ['metadata.json', '.env', 'app/index.html', 'old-secret.txt', '_expo/static/js/web/index-123.js.map', 'downloads/private.json']) assert.ok(!published.includes(name), name);
  assert.equal(JSON.parse(await readFile(join(result.output, 'config.json'), 'utf8')).version, 3);
  assert.equal(await readFile(join(root, 'dist/.env'), 'utf8'), '.env');
  // Feature: linked build entries fail closed instead of copying files outside the export.
  try { await symlink(join(root, 'dist/.env'), join(root, 'dist/website/linked.png')); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return; throw error; }
  await assert.rejects(() => prepareVercelOutput(root, 'https://example.supabase.co'), /linked files/);
});
