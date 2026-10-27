const { mkdir, open, readFile, readdir, rename, stat, unlink, realpath } = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const LATEST_FILE = 'little-by-little-latest.json';
const HISTORY_PATTERN = /^little-by-little-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9-]+\.json$/;
const HISTORY_INTERVAL = 5 * 60_000;
const MAX_HISTORY = 30;
const MAX_BYTES = 100 * 1024 * 1024;

// Feature: keep portable copies outside Chromium storage, with serialized writes and bounded history.
function createExternalBackup({ app, dialog, shell, getWindow }) {
  const settingsFile = path.join(app.getPath('userData'), 'external-backup-settings.json');
  let settings = { enabled: true, folder: path.join(app.getPath('documents'), 'Little by Little Backups'), hasBackup: false };
  let initialized = false;
  let queue = Promise.resolve();
  let lastBackupAt = null;
  let error = '';
  let digest = '';
  let archivedAt = 0;

  // Feature: failed disk operations never prevent later retries or folder changes.
  function enqueue(action) {
    const operation = queue.catch(() => undefined).then(action);
    queue = operation;
    return operation;
  }

  // Feature: flush a complete temporary file before atomically replacing a backup or settings file.
  async function atomicWrite(destination, contents) {
    const temporary = destination + '.' + randomUUID() + '.tmp';
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, destination);
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
    }
  }

  // Feature: keep device preferences outside portable workspace data, remembering disconnected backups.
  async function initialize() {
    if (initialized) return;
    try {
      const saved = JSON.parse(await readFile(settingsFile, 'utf8'));
      if (typeof saved.enabled !== 'boolean' || typeof saved.folder !== 'string' || !path.isAbsolute(saved.folder)) throw new Error('Invalid backup settings.');
      settings = { enabled: saved.enabled, folder: saved.folder, hasBackup: saved.hasBackup === true };
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw new Error('Could not read automatic backup settings. Choose a backup folder to repair them.');
    }
    initialized = true;
  }

  // Feature: expose backup health independently of local autosave status.
  function status() {
    return { supported: true, enabled: settings.enabled, folder: settings.folder, hasBackup: settings.hasBackup, lastBackupAt, error };
  }

  // Feature: find external copies after application storage was cleared, without automatically restoring them.
  async function inspect() {
    await initialize();
    try {
      const file = await stat(path.join(settings.folder, LATEST_FILE));
      lastBackupAt = file.mtime.toISOString();
      if (!settings.hasBackup) {
        const next = { ...settings, hasBackup: true };
        await atomicWrite(settingsFile, JSON.stringify(next));
        settings = next;
      }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
      lastBackupAt = null;
      // Feature: surviving dated copies still trigger recovery if the latest file was removed.
      let files = [];
      try { files = await readdir(settings.folder); }
      catch (folderFailure) { if (folderFailure.code !== 'ENOENT') throw folderFailure; }
      if (!settings.hasBackup && files.some((name) => HISTORY_PATTERN.test(name))) {
        settings = { ...settings, hasBackup: true };
        await atomicWrite(settingsFile, JSON.stringify(settings));
      }
      if (settings.hasBackup) throw new Error('The latest backup is missing or its drive is disconnected. Open the folder to recover a dated copy.');
    }
  }

  // Feature: surface persistent, actionable disk errors without failing local autosave.
  async function report(action, clearError = true) {
    try { const result = await action(); if (clearError && result !== false) error = ''; }
    catch (failure) {
      error = 'Automatic backup failed. Reconnect your backup drive or choose a writable folder. ' + (failure.message || 'The backup folder is unavailable.');
    }
    return status();
  }

  // Feature: retain 30 older copies; only this feature's exact generated filenames are eligible for removal.
  async function trimHistory() {
    const files = (await readdir(settings.folder)).filter((name) => HISTORY_PATTERN.test(name)).sort().reverse();
    for (const name of files.slice(MAX_HISTORY)) await unlink(path.join(settings.folder, name));
  }

  // Feature: copy each changed commit immediately and archive the preceding copy at five-minute intervals or checkpoints.
  async function write(raw, checkpoint = false) {
    await initialize();
    if (!settings.enabled) return;
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_BYTES) throw new Error('Backups must be smaller than 100 MB.');
    const workspace = JSON.parse(raw);
    if (workspace?.version !== 1 || !Array.isArray(workspace.stories) || !Number.isFinite(Date.parse(workspace.updatedAt))) throw new Error('Invalid workspace backup.');
    const nextDigest = createHash('sha256').update(raw).digest('hex');
    const latest = path.join(settings.folder, LATEST_FILE);
    if (nextDigest === digest && !error && !checkpoint) {
      // Feature: detect a disconnected drive or deleted latest copy even when the manuscript has not changed.
      await stat(latest);
      return;
    }
    await mkdir(settings.folder, { recursive: true });
    const now = Date.now();
    let checkpointSaved = false;
    if (checkpoint || now - archivedAt >= HISTORY_INTERVAL) {
      try {
        const previous = await readFile(latest, 'utf8');
        if (checkpoint || previous !== raw) {
          const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
          await atomicWrite(path.join(settings.folder, 'little-by-little-' + stamp + '-' + randomUUID() + '.json'), previous);
          archivedAt = now;
          checkpointSaved = previous === raw;
        }
      } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
    }
    await atomicWrite(latest, raw);
    // Feature: explicit checkpoints also keep the requested draft in a dated file, even if local saving failed.
    // A subsequent automatic retry of the last committed workspace cannot erase this manual recovery copy.
    if (checkpoint && !checkpointSaved) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await atomicWrite(path.join(settings.folder, 'little-by-little-' + stamp + '-' + randomUUID() + '.json'), raw);
      archivedAt = Date.now();
    }
    digest = nextDigest;
    lastBackupAt = new Date().toISOString();
    if (!settings.hasBackup) {
      const next = { ...settings, hasBackup: true };
      await atomicWrite(settingsFile, JSON.stringify(next));
      settings = next;
    }
    await trimHistory();
  }

  // Feature: select an external drive or synced directory, keeping backup files outside the app data profile.
  async function chooseFolder() {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Choose where to keep automatic backups', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return false;
    const parent = await realpath(result.filePaths[0]);
    const profile = await realpath(app.getPath('userData'));
    // Feature: selecting the existing managed folder does not create a nested backup directory.
    const folder = path.basename(parent) === 'Little by Little Backups' ? parent : path.join(parent, 'Little by Little Backups');
    await mkdir(folder, { recursive: true });
    const resolved = await realpath(folder);
    const relative = path.relative(profile, resolved);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Choose a folder outside the application data folder.');
    const next = { enabled: true, folder: resolved, hasBackup: false };
    await atomicWrite(settingsFile, JSON.stringify(next));
    settings = next;
    initialized = true;
    digest = '';
    archivedAt = 0;
    lastBackupAt = null;
    await inspect();
  }

  return {
    // Feature: serialize status reads with writes so displayed timestamps describe completed copies.
    getStatus: () => enqueue(() => report(inspect, false)),
    save: (raw, checkpoint) => enqueue(() => report(() => write(raw, checkpoint))),
    chooseFolder: () => enqueue(() => report(chooseFolder)),
    // Feature: pause/resume automatic copies while retaining all existing backup files.
    setEnabled: (enabled) => enqueue(() => report(async () => {
      await initialize();
      if (typeof enabled !== 'boolean') throw new Error('Invalid backup preference.');
      const next = { ...settings, enabled };
      await atomicWrite(settingsFile, JSON.stringify(next));
      settings = next;
    })),
    // Feature: open the configured directory for recovery using the existing Import backup preview.
    openFolder: () => enqueue(() => report(async () => {
      await initialize();
      const failure = await shell.openPath(settings.folder);
      if (failure) throw new Error(failure);
    }, false)),
    // Feature: let Electron drain pending backup writes before quitting normally.
    flush: () => queue.catch(() => undefined),
  };
}

module.exports = { createExternalBackup };
