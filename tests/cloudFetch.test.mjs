import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudFetch } from '../src/features/workspace/lib/cloudFetch.ts';

const origin = 'https://cloud.example.test';
const endpoint = `${origin}/rest/v1/rpc/read_cloud_workspace`;

// Feature: model a response whose headers arrive but whose manuscript download never finishes.
test('the cloud deadline covers a stalled response body and cancels its stream', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const fetch = createCloudFetch(origin, { timeoutMs: 25, fetch: async () => response });
  await assert.rejects(fetch(endpoint), { name: 'TimeoutError' });
  assert.equal(cancelled, true);
});

// Feature: cancellation remains effective even on a native implementation without streaming or working abort.
test('the cloud deadline also bounds native text responses and stalled headers', async () => {
  for (const send of [
    async () => new Promise(() => {}),
    async () => ({ headers: new Headers(), text: () => new Promise(() => {}) }),
  ]) {
    const fetch = createCloudFetch(origin, { timeoutMs: 25, fetch: send });
    await assert.rejects(fetch(endpoint), { name: 'TimeoutError' });
  }
});

// Feature: a Request's own signal and explicit caller cancellation both stop the complete operation.
test('caller cancellation is preserved before sending and during body consumption', async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  let calls = 0;
  const fetch = createCloudFetch(origin, { fetch: async () => { calls++; return new Response('{}'); } });
  await assert.rejects(fetch(new Request(endpoint, { signal: cancelled.signal })), { name: 'AbortError' });
  assert.equal(calls, 0);
  const controller = new AbortController();
  let bodyStarted;
  const started = new Promise((resolve) => { bodyStarted = resolve; });
  const streaming = createCloudFetch(origin, { fetch: async () => new Response(new ReadableStream({ pull() { bodyStarted(); } })) });
  const result = streaming(endpoint, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
});

// Feature: reject oversized downloads before parsing, regardless of whether their size was declared.
test('cloud response limits cover declared, streamed and native UTF-8 bodies', async () => {
  const responses = [
    new Response('{}', { headers: { 'content-length': String(1024 * 1024 + 1) } }),
    new Response('x'.repeat(1024 * 1024 + 1)),
    { headers: new Headers(), text: async () => 'é'.repeat(600_000) },
  ];
  for (const response of responses) {
    const fetch = createCloudFetch(origin, { fetch: async () => response });
    await assert.rejects(fetch(`${origin}/auth/v1/token`), /download limit/);
  }
});

// Feature: credentials are sent only to the configured origin, with redirect/cookie/cache protections.
test('cloud transport restricts destinations and retains valid SDK responses', async () => {
  let calls = 0;
  const fetch = createCloudFetch(origin, { fetch: async (_input, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, 'Bearer test-session');
    return new Response('{"code":"40001"}', { status: 409, headers: { 'content-type': 'application/json', 'retry-after': '60' } });
  } });
  await assert.rejects(fetch('https://other.example.test/auth/v1/token'), /destination rejected/);
  await assert.rejects(fetch('https://user:password@cloud.example.test/auth/v1/token'), /destination rejected/);
  assert.equal(calls, 0);
  const response = await fetch(endpoint, { headers: { Authorization: 'Bearer test-session' } });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(await response.json(), { code: '40001' });
});

// Feature: logout's empty response and native text decoding remain compatible with the Auth SDK.
test('empty and non-streaming responses are preserved', async () => {
  const empty = createCloudFetch(origin, { fetch: async () => new Response(null, { status: 204 }) });
  assert.equal((await empty(`${origin}/auth/v1/logout`)).status, 204);
  const native = createCloudFetch(origin, { fetch: async () => ({
    status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'application/json' }), text: async () => '{"name":"Léa"}',
  }) });
  assert.deepEqual(await (await native(endpoint)).json(), { name: 'Léa' });
});
