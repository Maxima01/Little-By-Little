import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { createExternalBackup, prepareFileWrite, atomicWrite } = createRequire(import.meta.url)('../electron-backup.cjs');
const backupFolder = 'Little by Little Backups';
const latestFile = 'little-by-little-latest.json';

// Feature: exercise real files in an isolated backup directory without launching Electron.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'novel-desktop-files-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = { userData: join(root, 'profile'), documents: join(root, 'documents') };
  await Promise.all(Object.values(paths).map((directory) => mkdir(directory)));
  let opened;
  const backup = createExternalBackup({
    app: { getPath: (name) => paths[name] },
    dialog: { showOpenDialog: async () => ({ filePaths: [paths.documents] }) },
    shell: { openPath: async (directory) => { opened = directory; return ''; } },
    getWindow: () => undefined,
  });
  return { root, documents: paths.documents, folder: join(paths.documents, backupFolder), backup, opened: () => opened };
}

// Feature: generate distinct snapshots using the current backup format.
function snapshot(id) {
  return JSON.stringify({ version: 1, updatedAt: '2026-11-04T00:00:00Z', stories: [{ id }] });
}

// Feature: preserve genuine history while refusing to copy or overwrite a substituted backup entry.
test('backup checkpoints archive valid snapshots and preserve unsafe prior files', async (t) => {
  const { root, folder, backup } = await fixture(t);
  const first = snapshot('first');
  const second = snapshot('second');
  const latest = join(folder, latestFile);
  assert.equal((await backup.save(first)).error, '');
  assert.equal((await backup.save(second, true)).error, '');
  assert.equal(await readFile(latest, 'utf8'), second);
  const history = (await readdir(folder)).filter((name) => name !== latestFile);
  const copies = await Promise.all(history.map((name) => readFile(join(folder, name), 'utf8')));
  assert.deepEqual(new Set(copies), new Set([first, second]));

  await writeFile(latest, 'corrupt recovery copy');
  assert.match((await backup.save(second)).error, /existing backup is invalid/);
  assert.equal(await readFile(latest, 'utf8'), 'corrupt recovery copy');

  const privateFile = join(root, 'private.json');
  await writeFile(privateFile, snapshot('private content'));
  await unlink(latest);
  await link(privateFile, latest);
  assert.match((await backup.save(second, true)).error, /unsafe file/);
  assert.equal(await readFile(privateFile, 'utf8'), snapshot('private content'));
  assert.deepEqual((await readdir(folder)).filter((name) => name !== latestFile).sort(), history.sort());
});

// Feature: a junction is refused during folder selection and after an approved folder is replaced.
test('backup destination cannot be redirected to a different directory', async (t) => {
  const { root, folder, backup, opened } = await fixture(t);
  const outside = join(root, 'other-directory');
  await mkdir(outside);
  await symlink(outside, folder, 'junction');
  assert.match((await backup.chooseFolder()).error, /destination folder is a link/);
  assert.match((await backup.save(snapshot('first'))).error, /destination folder is a link/);
  assert.deepEqual(await readdir(outside), []);
  await unlink(folder);

  assert.equal((await backup.save(snapshot('first'))).error, '');
  const original = join(root, 'original-backup');
  await rename(folder, original);
  await symlink(outside, folder, 'junction');
  assert.match((await backup.save(snapshot('second'))).error, /destination folder is a link/);
  assert.match((await backup.openFolder()).error, /destination folder is a link/);
  assert.equal(opened(), undefined);
  assert.equal(await readFile(join(original, latestFile), 'utf8'), snapshot('first'));
  assert.deepEqual(await readdir(outside), []);
});

// Feature: PDF writes can replace an approved file, and a substituted destination leaves other files untouched.
test('atomic export checks the selected entry after rendering', async (t) => {
  const { root } = await fixture(t);
  const destination = join(root, 'story.pdf');
  const protectedFile = join(root, 'private.txt');
  await writeFile(destination, 'old PDF');
  await atomicWrite(await prepareFileWrite(destination), Buffer.from('%PDF-new'));
  assert.equal(await readFile(destination, 'utf8'), '%PDF-new');

  const approved = await prepareFileWrite(destination);
  await writeFile(protectedFile, 'unchanged');
  await unlink(destination);
  await link(protectedFile, destination);
  await assert.rejects(atomicWrite(approved, Buffer.from('%PDF-attacker')), /unsafe file/);
  assert.equal(await readFile(protectedFile, 'utf8'), 'unchanged');
  assert.deepEqual((await readdir(root)).filter((name) => name.endsWith('.tmp')), []);
});
