import assert from 'node:assert/strict';
import test from 'node:test';
import { publicCloudConfig } from '../src/features/workspace/lib/cloudConfig.ts';

// Feature: public configuration tests cover credential leakage and transport boundaries without real secrets.
const origin = 'https://example.supabase.co';
const publishable = 'sb_publishable_example';
// Builds a fake legacy JWT; signature validation belongs to Supabase, not this configuration guard.
const legacy = (role) => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'signature'].join('.');

test('offline startup and modern/legacy public credentials are supported', () => {
  assert.equal(publicCloudConfig(), null);
  assert.deepEqual(publicCloudConfig(origin, publishable), { url: origin, key: publishable });
  assert.equal(publicCloudConfig(origin, legacy('anon')).key, legacy('anon'));
});

test('private, service-role, malformed and incomplete keys fail without echoing their value', () => {
  for (const key of ['sb_secret_example_private', legacy('service_role'), 'invalid-secret']) {
    assert.throws(() => publicCloudConfig(origin, key), (error) => !error.message.includes(key) && /public application/.test(error.message));
  }
  assert.throws(() => publicCloudConfig(origin), /both/);
  assert.throws(() => publicCloudConfig(undefined, publishable), /both/);
});

test('HTTPS project origins are enforced while loopback development remains available', () => {
  for (const url of ['http://example.com', 'https://user:password@example.com', origin + '/path', origin + '?token=value', origin + '#fragment', 'javascript:alert(1)']) {
    assert.throws(() => publicCloudConfig(url, publishable));
  }
  assert.equal(publicCloudConfig('http://127.0.0.1:54321', publishable).url, 'http://127.0.0.1:54321');
});
