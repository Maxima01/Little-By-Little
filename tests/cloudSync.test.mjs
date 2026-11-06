import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createStarterWorkspace } from '../src/domain/model.ts';
import { CloudConflictError, cloudFingerprint, cloudSessionScope, createCloudRepository, decideCloudSync, readCloudSyncSettings } from '../src/features/workspace/lib/cloudSync.ts';

// Feature: fixtures model two devices diverging from a shared cloud revision without network calls.
function fixture() {
  const workspace = createStarterWorkspace();
  const baseline = { revision: 4, fingerprint: cloudFingerprint(workspace) };
  const remote = { revision: 4, workspace: structuredClone(workspace), savedAt: workspace.updatedAt };
  return { workspace, baseline, remote };
}

// Gives a detached device copy a visible edit while retaining IDs shared with the baseline.
function edit(workspace, text) {
  const next = structuredClone(workspace);
  next.stories[0].chapters[0].html = '<p>' + text + '</p>';
  return next;
}

// Feature: verify migration against the previous canonical format and an independent SHA-256 implementation.
test('sync baselines use fixed-size hashes and migrate legacy manuscript copies', () => {
  const { workspace } = fixture();
  workspace.stories[0].chapters[0].html = '<p>Private manuscript ' + 'x'.repeat(6 * 1024 * 1024) + '</p>';
  const { updatedAt, ...content } = workspace;
  const canonical = JSON.stringify(content, function (_key, value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value;
  });
  const fingerprint = cloudFingerprint(workspace);
  assert.equal(fingerprint, `sha256:${createHash('sha256').update(canonical).digest('hex')}`);
  assert.equal(fingerprint.length, 71);
  const scope = { userId: 'writer', sessionId: '11111111-1111-4111-8111-111111111111' };
  const migrated = readCloudSyncSettings(JSON.stringify({ ...scope, enabled: false, baseline: { revision: 2, fingerprint: canonical } }), scope);
  assert.deepEqual(migrated, { ...scope, enabled: false, baseline: { revision: 2, fingerprint } });
  assert.ok(JSON.stringify(migrated).length < 300);
  assert.ok(!JSON.stringify(migrated).includes('Private manuscript'));
  assert.equal(decideCloudSync(edit(workspace, 'New local edit'), migrated.baseline, { revision: 2, workspace, savedAt: workspace.updatedAt }), 'upload');
});

test('first sign-in requires linking before any upload or replacement', () => {
  const { workspace, remote } = fixture();
  assert.equal(decideCloudSync(workspace, null, null), 'link');
  assert.equal(decideCloudSync(edit(workspace, 'Local manuscript'), null, remote), 'link');
  assert.equal(decideCloudSync(workspace, null, remote), 'link');
});

// Feature: exercise session rehydration and refresh without contacting the authentication provider.
test('only the login that approved syncing can restore its baseline and paused setting', () => {
  const { workspace, baseline, remote } = fixture();
  const user = { id: 'writer-1' };
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';
  const token = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const initial = cloudSessionScope({ user, access_token: token({ sub: user.id, session_id: sessionId, iat: 1 }) });
  const refreshed = cloudSessionScope({ user, access_token: token({ sub: user.id, session_id: sessionId, iat: 2, name: 'Léa' }) });
  const newLogin = cloudSessionScope({ user, access_token: token({ sub: user.id, session_id: otherId, iat: 3 }) });
  const previous = { userId: user.id, sessionId, baseline, enabled: false };
  assert.deepEqual(initial, { userId: user.id, sessionId });
  assert.deepEqual(readCloudSyncSettings(JSON.stringify(previous), refreshed), previous);
  assert.equal(readCloudSyncSettings(JSON.stringify(previous), newLogin), null);
  assert.equal(readCloudSyncSettings(JSON.stringify(previous), { ...initial, userId: 'writer-2' }), null);
  assert.equal(readCloudSyncSettings(JSON.stringify({ userId: user.id, baseline, enabled: true }), initial), null);
  assert.equal(cloudSessionScope({ user, access_token: token({ sub: user.id }) }), null);
  assert.equal(cloudSessionScope({ user, access_token: token({ sub: 'writer-2', session_id: sessionId }) }), null);
  assert.equal(cloudSessionScope({ user, access_token: 'not-a-jwt' }), null);
  const guestDraft = edit(workspace, 'A private edit made while signed out');
  assert.equal(decideCloudSync(guestDraft, readCloudSyncSettings(JSON.stringify(previous), newLogin)?.baseline ?? null, remote), 'link');
});

test('offline edits upload when the cloud copy still matches the acknowledged baseline', () => {
  const { workspace, baseline, remote } = fixture();
  assert.equal(decideCloudSync(edit(workspace, 'Written while offline'), baseline, remote), 'upload');
});

test('an unchanged device downloads a newer cloud manuscript', () => {
  const { workspace, baseline, remote } = fixture();
  remote.workspace = edit(workspace, 'Written on another device');
  remote.revision += 1;
  assert.equal(decideCloudSync(workspace, baseline, remote), 'download');
});

test('two devices editing offline require a conflict choice', () => {
  const { workspace, baseline, remote } = fixture();
  remote.workspace = edit(workspace, 'Second device');
  remote.revision += 1;
  assert.equal(decideCloudSync(edit(workspace, 'First device'), baseline, remote), 'conflict');
});

test('matching content is synced despite a stale revision or a changed restore timestamp', () => {
  const { workspace, baseline, remote } = fixture();
  remote.revision += 3;
  remote.workspace.updatedAt = '2026-11-02T02:00:00.000Z';
  assert.equal(decideCloudSync(workspace, baseline, remote), 'synced');
});

test('a missing cloud row or revision rollback never silently recreates or overwrites it', () => {
  const { workspace, baseline, remote } = fixture();
  assert.equal(decideCloudSync(workspace, baseline, null), 'conflict');
  remote.revision -= 1;
  assert.equal(decideCloudSync(edit(workspace, 'Local changes'), baseline, remote), 'conflict');
});

test('fingerprints tolerate JSONB key reordering and ignore only the root timestamp', () => {
  const { workspace } = fixture();
  const reversed = JSON.parse(JSON.stringify(workspace, function (_key, value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse()) : value;
  }));
  assert.equal(cloudFingerprint(workspace), cloudFingerprint(reversed));
  reversed.updatedAt = '2026-11-02T03:00:00.000Z';
  assert.equal(cloudFingerprint(workspace), cloudFingerprint(reversed));
  reversed.stories[0].chapters[0].updatedAt = '2026-11-02T03:00:00.000Z';
  assert.notEqual(cloudFingerprint(workspace), cloudFingerprint(reversed));
});

test('fingerprints retain chapter order and navigation preferences', () => {
  const { workspace } = fixture();
  const next = structuredClone(workspace);
  next.contextVisibility = { wide: false };
  assert.notEqual(cloudFingerprint(workspace), cloudFingerprint(next));
  next.stories[0].chapters.push({ ...next.stories[0].chapters[0], id: 'another-chapter' });
  const before = cloudFingerprint(next);
  next.stories[0].chapters.reverse();
  assert.notEqual(before, cloudFingerprint(next));
});

// Feature: a client double verifies account scoping and rejects unsafe cloud responses.
function clientFixture(readResponses, writeResponse = null) {
  const calls = [];
  const responses = Array.isArray(readResponses) ? [...readResponses] : [readResponses];
  const client = {
    rpc: async (name, params) => {
      calls.push(['rpc', name, params]);
      return name === 'read_cloud_workspace' ? responses.shift() : writeResponse;
    },
  };
  return { client, calls };
}

test('cloud reads are scoped to the signed-in account and validate every returned row', async () => {
  const { workspace } = fixture();
  const row = { revision: 1, workspace, updated_at: workspace.updatedAt };
  const { client, calls } = clientFixture({ data: [row], error: null });
  assert.deepEqual(await createCloudRepository(client, 'writer-1').read(), { revision: 1, workspace, savedAt: workspace.updatedAt });
  assert.deepEqual(calls, [['rpc', 'read_cloud_workspace', { p_user_id: 'writer-1', p_known_revision: null }]]);
  for (const invalid of [{ ...row, workspace: {} }, { ...row, revision: 0 }, { ...row, revision: '1' }, { ...row, updated_at: 'invalid' }]) {
    const invalidClient = clientFixture({ data: [invalid], error: null }).client;
    await assert.rejects(createCloudRepository(invalidClient, 'writer-1').read(), /validated/);
  }
  const missingClient = clientFixture({ data: [], error: null }).client;
  assert.equal(await createCloudRepository(missingClient, 'writer-1').read(), null);
});

test('unchanged polls fetch only metadata while changed revisions load the validated manuscript', async () => {
  const { workspace, remote } = fixture();
  const row = { revision: remote.revision, updated_at: remote.savedAt, workspace: null };
  const unchanged = clientFixture({ data: [row], error: null });
  assert.equal(await createCloudRepository(unchanged.client, 'writer-1').read(remote), remote);
  assert.deepEqual(unchanged.calls, [['rpc', 'read_cloud_workspace', { p_user_id: 'writer-1', p_known_revision: 4 }]]);
  const changed = clientFixture({ data: [{ ...row, revision: 5, workspace: edit(workspace, 'New cloud draft') }], error: null });
  const latest = await createCloudRepository(changed.client, 'writer-1').read(remote);
  assert.equal(latest.revision, 5);
  assert.equal(latest.workspace.stories[0].chapters[0].html, '<p>New cloud draft</p>');
  assert.equal(changed.calls.length, 1);
});

test('uploads bind the expected account and revision and require a valid acknowledgement', async () => {
  const { workspace } = fixture();
  const row = { revision: 5, workspace, updated_at: workspace.updatedAt };
  const { client, calls } = clientFixture(null, { data: [row], error: null });
  assert.equal((await createCloudRepository(client, 'writer-1').write(workspace, 4)).revision, 5);
  assert.deepEqual(calls, [['rpc', 'save_cloud_workspace', { p_workspace: workspace, p_expected_revision: 4, p_user_id: 'writer-1' }]]);
  const invalidClient = clientFixture(null, { data: [], error: null }).client;
  await assert.rejects(createCloudRepository(invalidClient, 'writer-1').write(workspace, 4), /not acknowledged/);
});

// Feature: requests keep the approved session's bearer even if the SDK would choose a different stored token.
test('cloud RPC requests pin the current approved access token, including after refresh', async () => {
  const { workspace } = fixture();
  const row = { revision: 1, workspace, updated_at: workspace.updatedAt };
  const headers = [];
  const client = { rpc: (rpcName) => ({
    setHeader: (name, value) => {
      headers.push([rpcName, name, value]);
      return Promise.resolve({ data: [row], error: null });
    },
  }) };
  let accessToken = 'access-before-refresh';
  const repository = createCloudRepository(client, 'writer-1', () => accessToken);
  await repository.read();
  accessToken = 'access-after-refresh';
  await repository.write(workspace, 0);
  assert.deepEqual(headers, [
    ['read_cloud_workspace', 'Authorization', 'Bearer access-before-refresh'],
    ['save_cloud_workspace', 'Authorization', 'Bearer access-after-refresh'],
  ]);
});

test('concurrent uploads surface a conflict without being mistaken for an offline error', async () => {
  const { workspace } = fixture();
  const { client } = clientFixture(null, { data: null, error: { code: '40001', message: 'stale revision' } });
  await assert.rejects(createCloudRepository(client, 'writer-1').write(workspace, 4), CloudConflictError);
  const failure = clientFixture(null, { data: null, error: { code: 'OTHER', message: 'Connection lost' } }).client;
  await assert.rejects(createCloudRepository(failure, 'writer-1').write(workspace, 4), /temporarily unavailable/);
});

test('backend errors are redacted and quota failures remain actionable', async () => {
  const { workspace } = fixture();
  const failure = clientFixture({ data: null, error: { code: 'OTHER', message: 'private table diagnostics and credentials' } });
  await assert.rejects(createCloudRepository(failure.client, 'writer-1').read(), (error) => !error.message.includes('diagnostics') && error.message.includes('local stories'));
  const quota = clientFixture(null, { data: null, error: { code: 'P0429', message: 'internal detail' } });
  await assert.rejects(createCloudRepository(quota.client, 'writer-1').write(workspace, 4), /Wait a minute/);
});

test('oversized uploads stop before issuing a cloud request', async () => {
  const { workspace } = fixture();
  workspace.stories[0].chapters[0].html = '<p>' + 'x'.repeat(20 * 1024 * 1024) + '</p>';
  const { client, calls } = clientFixture(null);
  await assert.rejects(createCloudRepository(client, 'writer-1').write(workspace, 0), /20 MiB/);
  assert.equal(calls.length, 0);
});
