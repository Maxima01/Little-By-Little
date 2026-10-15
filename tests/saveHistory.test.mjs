import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createWorkspaceStore, isWorkspace, MAX_VERSIONS, parseWorkspaceBackup, retainVersions, VERSION_INTERVAL } from '../src/features/workspace/lib/saveHistory.ts';
import { createWebStorageAdapter } from '../src/features/workspace/lib/webStorage.ts';
import { createStarterWorkspace } from '../src/domain/model.ts';

// Supplies isolated records, crash drafts, and failure injection for durable-save regression checks.
function fixture(raw = null) {
  const state = { raw, draft: null, quarantine: [], fail: false };
  const adapter = {
    read: async () => state.raw,
    write: async (next, expected) => { if (state.fail) throw new Error('Disk full'); assert.equal(state.raw, expected); state.raw = next; },
    quarantine: async (value) => { state.quarantine.push(value); },
    readDraft: () => state.draft,
    writeDraft: (value) => { state.draft = value; },
    clearDraft: (id) => { if (JSON.parse(state.draft ?? 'null')?.id === id) state.draft = null; },
  };
  return { state, adapter };
}

// Produces a detached draft with a visible chapter edit for recovery comparisons.
function edit(workspace, text) {
  const next = structuredClone(workspace);
  next.stories[0].chapters[0].html = `<p>${text}</p>`;
  return next;
}

test('legacy saves migrate while preserving chapters and all supporting collections', async () => {
  const workspace = createStarterWorkspace();
  const { state, adapter } = fixture(JSON.stringify(workspace));
  const loaded = await createWorkspaceStore(adapter).load();
  assert.deepEqual(loaded.workspace, workspace);
  assert.equal(JSON.parse(state.raw).format, 2);
  assert.deepEqual(JSON.parse(state.raw).workspace, workspace);
});

test('the first edit preserves the opening draft and automatic versions are spaced five minutes apart', async () => {
  let time = Date.parse('2026-10-09T00:00:00Z');
  const { adapter } = fixture();
  const store = createWorkspaceStore(adapter, () => new Date(time).toISOString());
  const original = (await store.load()).workspace;
  await store.save(edit(original, 'First edit'));
  await store.save(edit(original, 'Second edit'));
  assert.equal((await store.listVersions()).length, 1);
  assert.deepEqual((await store.listVersions())[0].workspace, original);
  time += VERSION_INTERVAL;
  await store.save(edit(original, 'Later edit'));
  assert.equal((await store.listVersions()).length, 2);
  assert.equal((await store.listVersions())[0].workspace.stories[0].chapters[0].html, '<p>Second edit</p>');
});

test('recovering an interrupted typing session preserves the previous committed version', async () => {
  const { state, adapter } = fixture();
  const store = createWorkspaceStore(adapter);
  const original = (await store.load()).workspace;
  store.stage(edit(original, 'Typed just before crash'));
  const reopened = createWorkspaceStore(adapter);
  const loaded = await reopened.load();
  assert.match(loaded.recoveryMessage, /Recovered/);
  assert.equal(loaded.workspace.stories[0].chapters[0].html, '<p>Typed just before crash</p>');
  assert.deepEqual((await reopened.listVersions())[0].workspace, original);
  assert.equal(state.draft, null);
});

test('failed saves retain both the last commit and the staged recovery draft; retry succeeds', async () => {
  const { state, adapter } = fixture();
  const store = createWorkspaceStore(adapter);
  const original = (await store.load()).workspace;
  const committed = state.raw;
  const next = edit(original, 'Unsaved during failure');
  store.stage(next);
  state.fail = true;
  await assert.rejects(store.save(next), /Disk full/);
  assert.equal(state.raw, committed);
  assert.equal(JSON.parse(state.draft).workspace.stories[0].chapters[0].html, '<p>Unsaved during failure</p>');
  state.fail = false;
  await store.save(next);
  assert.equal(state.draft, null);
});

test('a newer keystroke survives an older in-flight save and recovers after a crash', async () => {
  const { state, adapter } = fixture();
  const store = createWorkspaceStore(adapter);
  const original = (await store.load()).workspace;
  const older = edit(original, 'Older edit');
  store.stage(older);
  const saving = store.save(older);
  store.stage(edit(original, 'Newest edit'));
  await saving;
  assert.ok(state.draft);
  assert.equal(JSON.parse(state.draft).baseRevision, JSON.parse(state.raw).revision);
  assert.equal((await createWorkspaceStore(adapter).load()).workspace.stories[0].chapters[0].html, '<p>Newest edit</p>');
});

test('damaged primary data recovers from a valid version and preserves the damaged raw value', async () => {
  const original = createStarterWorkspace();
  const raw = JSON.stringify({ format: 2, revision: 'old', workspace: { version: 1, stories: [null] }, versions: [{ id: 'v1', label: 'Manual checkpoint', savedAt: original.updatedAt, workspace: original }] });
  const { state, adapter } = fixture(raw);
  const loaded = await createWorkspaceStore(adapter).load();
  assert.deepEqual(loaded.workspace, original);
  assert.match(loaded.recoveryMessage, /intact version/);
  assert.deepEqual(state.quarantine, [raw]);
});

test('unrecoverable data is never replaced by a starter story; explicit backup recovery is possible', async () => {
  const { state, adapter } = fixture('{broken');
  const store = createWorkspaceStore(adapter);
  await assert.rejects(store.load(), /Import a workspace backup/);
  assert.equal(state.raw, '{broken');
  assert.deepEqual(state.quarantine, ['{broken']);
  const backup = createStarterWorkspace();
  await store.replace(backup);
  assert.deepEqual(JSON.parse(state.raw).workspace, backup);
});

test('restoration keeps a checkpoint of the current workspace and deletion keeps unsaved prior content', async () => {
  const { adapter } = fixture();
  const store = createWorkspaceStore(adapter);
  const original = (await store.load()).workspace;
  const beforeDelete = edit(original, 'Content before delete');
  const deleted = structuredClone(beforeDelete);
  deleted.stories[0].chapters = [];
  await store.save(deleted, { preservePrevious: { label: 'Before deleting chapter', workspace: beforeDelete } });
  assert.deepEqual((await store.listVersions())[0].workspace, beforeDelete);
  await store.replace(original, deleted);
  assert.deepEqual((await store.listVersions()).find((version) => version.label === 'Before restoring workspace').workspace, deleted);
});

test('history retention is bounded and returned versions cannot mutate persisted checkpoints', async () => {
  const { adapter } = fixture();
  const store = createWorkspaceStore(adapter);
  const workspace = (await store.load()).workspace;
  for (let index = 0; index < 35; index++) await store.save(edit(workspace, String(index)), { checkpoint: 'Manual checkpoint' });
  const versions = await store.listVersions();
  assert.equal(versions.length, MAX_VERSIONS);
  versions[0].workspace.stories = [];
  assert.equal((await store.listVersions())[0].workspace.stories.length, 1);
  const huge = edit(workspace, 'x'.repeat(6 * 1024 * 1024));
  assert.equal(retainVersions([0, 1, 2].map((index) => ({ id: String(index), label: '', savedAt: '', workspace: huge }))).length, 1);
});

test('backup validation rejects missing collections, duplicate IDs, malformed scenes, and invalid timestamps', () => {
  const workspace = createStarterWorkspace();
  assert.ok(isWorkspace(workspace));
  assert.deepEqual(parseWorkspaceBackup(JSON.stringify(workspace)), workspace);
  for (const mutation of [
    (copy) => { delete copy.stories[0].notes; },
    (copy) => { copy.stories.push(copy.stories[0]); },
    (copy) => { copy.stories[0].chapters[0].scenes[0].characterIds = [42]; },
    (copy) => { copy.updatedAt = 'invalid'; },
    (copy) => { copy.stories[0].chapters[0].fontSize = null; },
  ]) {
    const copy = structuredClone(workspace); mutation(copy);
    assert.equal(isWorkspace(copy), false);
    assert.throws(() => parseWorkspaceBackup(JSON.stringify(copy)), /valid/);
  }
});

test('real IndexedDB transactions preserve the latest commit and reject stale windows', async () => {
  const factory = new IDBFactory();
  const drafts = new Map();
  const draftAdapter = { getItem: (key) => drafts.get(key) ?? null, setItem: (key, value) => drafts.set(key, value), removeItem: (key) => drafts.delete(key) };
  const firstAdapter = createWebStorageAdapter(factory, draftAdapter);
  const first = createWorkspaceStore(firstAdapter);
  const original = (await first.load()).workspace;
  const second = createWorkspaceStore(createWebStorageAdapter(factory, draftAdapter));
  await second.load();
  await first.save(edit(original, 'Newer window'));
  await assert.rejects(second.save(edit(original, 'Stale window')), /Another window/);
  assert.equal(JSON.parse(await firstAdapter.read()).workspace.stories[0].chapters[0].html, '<p>Newer window</p>');
});

test('blocked crash-draft storage still permits normal IndexedDB saves', async () => {
  const adapter = createWebStorageAdapter(new IDBFactory(), { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Quota'); }, removeItem: () => undefined });
  const store = createWorkspaceStore(adapter);
  const original = (await store.load()).workspace;
  assert.equal(store.stage(original), false);
  await store.save(edit(original, 'Durable without draft storage'));
});

test('a draft based on an older commit remains accessible without replacing the newer workspace', async () => {
  const { state, adapter } = fixture();
  const store = createWorkspaceStore(adapter);
  const original = (await store.load()).workspace;
  const oldRevision = JSON.parse(state.raw).revision;
  await store.save(edit(original, 'New durable work'));
  state.draft = JSON.stringify({ id: 'alternate-draft', baseRevision: oldRevision, workspace: edit(original, 'Alternate unsaved work') });
  const reopened = createWorkspaceStore(adapter);
  assert.equal((await reopened.load()).workspace.stories[0].chapters[0].html, '<p>New durable work</p>');
  const recovered = (await reopened.listVersions()).find((version) => version.label === 'Recovered alternate draft');
  assert.equal(recovered.workspace.stories[0].chapters[0].html, '<p>Alternate unsaved work</p>');
  assert.equal(state.draft, null);
});

test('malformed draft metadata cannot replace an intact commit or seed recovery from damaged data', async () => {
  const workspace = createStarterWorkspace();
  const { state, adapter } = fixture(JSON.stringify(workspace));
  state.draft = JSON.stringify({ workspace: edit(workspace, 'Unidentified draft') });
  assert.deepEqual((await createWorkspaceStore(adapter).load()).workspace, workspace);
  state.raw = '{broken';
  await assert.rejects(createWorkspaceStore(adapter).load(), /Import a workspace backup/);
  assert.equal(state.raw, '{broken');
});
