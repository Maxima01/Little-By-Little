const { constants } = require('node:fs');
const { lstat, mkdir, open, readdir, rename, unlink, realpath } = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const BACKUP_FOLDER = 'Little by Little Backups';
const LATEST_FILE = 'little-by-little-latest.json';
const HISTORY_PATTERN = /^little-by-little-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9-]+\.json$/;
const HISTORY_INTERVAL = 5 * 60_000;
const MAX_HISTORY = 30;
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_SETTINGS_BYTES = 16 * 1024;

// Feature: compare filesystem identities across asynchronous operations.
function sameEntry(first, second) {
  return first === null || second === null
    ? first === second
    : first.dev === second.dev && first.ino === second.ino;
}

// Feature: distinguish a known file from an in-place edit to the same entry.
function sameFile(first, second) {
  if (!sameEntry(first, second) || first === null) return first === second;
  return first.size === second.size && first.mtimeNs === second.mtimeNs && first.ctimeNs === second.ctimeNs;
}

// Feature: managed directories must stay at their canonical path and cannot be links or junctions.
async function captureDirectory(directory, allowAlias = false) {
  const location = allowAlias ? await realpath(directory) : directory;
  const info = await lstat(location, { bigint: true });
  if (!info.isDirectory() || path.relative(location, await realpath(location)) !== '') {
    throw new Error('The destination folder is a link or has changed. Choose the folder again.');
  }
  return { location, info };
}

// Feature: detect directory replacement between steps. The parent directory must also be trusted, since
// portable Node filesystem operations cannot lock path resolution against concurrent ancestor renames.
async function verifyDirectory(directory) {
  const current = await captureDirectory(directory.location);
  if (!sameEntry(current.info, directory.info)) throw new Error('The destination folder changed. Choose the folder again.');
}

// Feature: create only the managed child of an already approved directory.
async function createBackupFolder(parent, folder) {
  await verifyDirectory(parent);
  try { await mkdir(folder, { mode: 0o700 }); }
  catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
}

// Feature: reject linked, nonregular and oversized files before reading or replacing them.
async function regularFileInfo(filename, maxBytes) {
  const info = await lstat(filename, { bigint: true });
  if (!info.isFile() || info.nlink !== 1n) throw new Error('The destination contains an unsafe file. Move it aside or choose another folder.');
  if (maxBytes !== undefined && info.size > BigInt(maxBytes)) throw new Error('The existing file is too large. Move it aside or choose another folder.');
  return info;
}

// Feature: distinguish missing destinations from unsafe existing entries.
async function existingFileInfo(filename, maxBytes) {
  try { return await regularFileInfo(filename, maxBytes); }
  catch (failure) { if (failure.code === 'ENOENT') return null; throw failure; }
}

// Feature: verify the opened handle before reading and limit the read even if the file grows.
async function readBoundedFile(filename, expected, maxBytes) {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
  const handle = await open(filename, flags);
  try {
    // Windows may lack O_NOFOLLOW. Compare the opened handle with the pre-open lstat before reading.
    const actual = await handle.stat({ bigint: true });
    if (!sameFile(expected, actual) || !actual.isFile() || actual.nlink !== 1n || actual.size > BigInt(maxBytes)) {
      throw new Error('The existing file changed or is unsafe. Move it aside or choose another folder.');
    }
    const bytes = Buffer.alloc(Number(actual.size) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== Number(actual.size) || !sameFile(actual, await handle.stat({ bigint: true }))) {
      throw new Error('The existing file changed while it was being read.');
    }
    return bytes.toString('utf8', 0, offset);
  } finally { await handle.close(); }
}

// Feature: record the approved destination before asynchronous work such as rendering a PDF.
async function prepareFileWrite(filename, directory, maxBytes) {
  directory ??= await captureDirectory(path.dirname(filename), true);
  await verifyDirectory(directory);
  const destination = path.join(directory.location, path.basename(filename));
  const previous = await existingFileInfo(destination, maxBytes);
  return { directory, destination, previous, maxBytes };
}

// Feature: flush an exclusive temporary file, then replace the approved entry without following its leaf path.
async function atomicWrite({ directory, destination, previous, maxBytes }, contents) {
  const temporary = path.join(directory.location, `.${randomUUID()}.tmp`);
  let temporaryInfo;
  await verifyDirectory(directory);
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      temporaryInfo = await handle.stat({ bigint: true });
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    await verifyDirectory(directory);
    if (!sameEntry(temporaryInfo, await regularFileInfo(temporary))
      || !sameFile(previous, await existingFileInfo(destination, maxBytes))) {
      throw new Error('The destination file changed while it was being saved. Try again.');
    }
    await rename(temporary, destination);
    const written = await regularFileInfo(destination, maxBytes);
    if (!sameEntry(temporaryInfo, written)) throw new Error('The destination file changed while it was being saved. Try again.');
    temporaryInfo = undefined;
    return written;
  } finally {
    if (temporaryInfo) {
      try {
        await verifyDirectory(directory);
        if (sameEntry(temporaryInfo, await existingFileInfo(temporary))) await unlink(temporary);
      } catch { /* Preserve a replaced entry or a temporary file on a disconnected drive. */ }
    }
  }
}

// Feature: archive only recognizable workspace backups, preserving suspect files for manual recovery.
function validateWorkspaceBackup(raw) {
  const workspace = JSON.parse(raw);
  if (workspace?.version !== 1 || !Array.isArray(workspace.stories) || !Number.isFinite(Date.parse(workspace.updatedAt))) {
    throw new Error('Invalid workspace backup.');
  }
}

// Feature: keep automatic backup destinations outside the Electron profile.
function assertOutsideProfile(profile, folder) {
  const relative = path.relative(profile, folder);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Choose a folder outside the application data folder.');
  }
}

// Feature: keep portable copies outside Chromium storage, with serialized writes and bounded history.
function createExternalBackup({ app, dialog, shell, getWindow }) {
  const profilePath = app.getPath('userData');
  const settingsFile = path.join(profilePath, 'external-backup-settings.json');
  const defaultFolder = path.join(app.getPath('documents'), BACKUP_FOLDER);
  let settings = { enabled: true, folder: defaultFolder, hasBackup: false };
  let approvedFolder;
  let initialized = false;
  let queue = Promise.resolve();
  let lastBackupAt = null;
  let error = '';
  let digest = '';
  let lastWritten = null;
  let archivedAt = 0;

  // Feature: failed disk operations never prevent later retries or folder changes.
  function enqueue(action) {
    const operation = queue.catch(() => undefined).then(action);
    queue = operation;
    return operation;
  }

  // Feature: save the device preferences with the same safe replacement rules as a manuscript.
  async function writeSettings(next) {
    await atomicWrite(await prepareFileWrite(settingsFile, undefined, MAX_SETTINGS_BYTES), JSON.stringify(next));
    settings = next;
  }

  // Feature: verify the selected folder before each operation. Resolve the OS Documents alias for the default.
  async function backupDirectory(create = false) {
    const parent = path.relative(defaultFolder, settings.folder) === ''
      ? await captureDirectory(path.dirname(defaultFolder), true)
      : null;
    const folder = parent ? path.join(parent.location, BACKUP_FOLDER) : settings.folder;
    assertOutsideProfile(await realpath(profilePath), folder);
    if (approvedFolder) {
      if (path.relative(approvedFolder.location, folder) !== '') throw new Error('The backup folder changed. Choose it again.');
      await verifyDirectory(approvedFolder);
    } else {
      if (create && parent) await createBackupFolder(parent, folder);
      approvedFolder = await captureDirectory(folder);
    }
    return approvedFolder;
  }

  // Feature: keep device preferences outside portable workspace data, remembering disconnected backups.
  async function initialize() {
    if (initialized) return;
    try {
      const file = await prepareFileWrite(settingsFile, undefined, MAX_SETTINGS_BYTES);
      if (!file.previous) { initialized = true; return; }
      const saved = JSON.parse(await readBoundedFile(file.destination, file.previous, MAX_SETTINGS_BYTES));
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
    let directory;
    try {
      directory = await backupDirectory();
      const file = await regularFileInfo(path.join(directory.location, LATEST_FILE), MAX_BYTES);
      lastBackupAt = file.mtime.toISOString();
      if (!settings.hasBackup) {
        await writeSettings({ ...settings, folder: directory.location, hasBackup: true });
      }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
      lastBackupAt = null;
      // Feature: surviving dated copies still trigger recovery if the latest file was removed.
      if (directory) {
        await verifyDirectory(directory);
        const files = await readdir(directory.location, { withFileTypes: true });
        if (!settings.hasBackup && files.some((entry) => entry.isFile() && HISTORY_PATTERN.test(entry.name))) {
          await writeSettings({ ...settings, folder: directory.location, hasBackup: true });
        }
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
  async function trimHistory(directory) {
    await verifyDirectory(directory);
    const files = (await readdir(directory.location, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && HISTORY_PATTERN.test(entry.name))
      .map((entry) => entry.name).sort().reverse();
    for (const name of files.slice(MAX_HISTORY)) {
      await verifyDirectory(directory);
      const filename = path.join(directory.location, name);
      const info = await lstat(filename, { bigint: true });
      if (info.isFile() && info.nlink === 1n) await unlink(filename);
    }
  }

  // Feature: save dated history only within the approved backup directory.
  async function writeHistory(directory, raw, timestamp) {
    const stamp = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
    const filename = path.join(directory.location, 'little-by-little-' + stamp + '-' + randomUUID() + '.json');
    await atomicWrite(await prepareFileWrite(filename, directory), raw);
  }

  // Feature: copy each changed commit immediately and archive the preceding copy at five-minute intervals or checkpoints.
  async function write(raw, checkpoint = false) {
    await initialize();
    if (!settings.enabled) return;
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_BYTES) throw new Error('Backups must be smaller than 100 MB.');
    validateWorkspaceBackup(raw);
    const nextDigest = createHash('sha256').update(raw).digest('hex');
    const directory = await backupDirectory(true);
    const latest = await prepareFileWrite(path.join(directory.location, LATEST_FILE), directory, MAX_BYTES);
    const knownLatest = latest.previous && sameFile(lastWritten, latest.previous);
    if (knownLatest && nextDigest === digest && !error && !checkpoint) return;
    const now = Date.now();
    const archive = checkpoint || now - archivedAt >= HISTORY_INTERVAL;
    let checkpointSaved = false;
    if (latest.previous && (archive || !knownLatest)) {
      await verifyDirectory(directory);
      const previous = await readBoundedFile(latest.destination, latest.previous, MAX_BYTES);
      try { validateWorkspaceBackup(previous); }
      catch { throw new Error('The existing backup is invalid. Move it aside for recovery or choose another folder.'); }
      if (archive && (checkpoint || previous !== raw)) {
        await writeHistory(directory, previous, now);
        archivedAt = now;
        checkpointSaved = previous === raw;
      }
    }
    lastWritten = await atomicWrite(latest, raw);
    // Feature: explicit checkpoints also keep the requested draft in a dated file, even if local saving failed.
    // A subsequent automatic retry of the last committed workspace cannot erase this manual recovery copy.
    if (checkpoint && !checkpointSaved) {
      await writeHistory(directory, raw, Date.now());
      archivedAt = Date.now();
    }
    digest = nextDigest;
    lastBackupAt = new Date().toISOString();
    if (!settings.hasBackup) {
      await writeSettings({ ...settings, folder: directory.location, hasBackup: true });
    }
    await trimHistory(directory);
  }

  // Feature: select an external drive or synced directory, keeping backup files outside the app data profile.
  async function chooseFolder() {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Choose where to keep automatic backups', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return false;
    const selection = result.filePaths[0];
    const selectedManagedFolder = path.basename(selection) === BACKUP_FOLDER;
    const parent = await captureDirectory(selection, !selectedManagedFolder);
    const profile = await realpath(profilePath);
    // Feature: selecting the existing managed folder does not create a nested backup directory.
    const folder = path.basename(parent.location) === BACKUP_FOLDER ? parent.location : path.join(parent.location, BACKUP_FOLDER);
    assertOutsideProfile(profile, folder);
    if (folder !== parent.location) await createBackupFolder(parent, folder);
    const approved = await captureDirectory(folder);
    await writeSettings({ enabled: true, folder: approved.location, hasBackup: false });
    approvedFolder = approved;
    initialized = true;
    digest = '';
    lastWritten = null;
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
      await writeSettings({ ...settings, enabled });
    })),
    // Feature: open the configured directory for recovery using the existing Import backup preview.
    openFolder: () => enqueue(() => report(async () => {
      await initialize();
      const directory = await backupDirectory();
      const failure = await shell.openPath(directory.location);
      if (failure) throw new Error(failure);
    }, false)),
    // Feature: let Electron drain pending backup writes before quitting normally.
    flush: () => queue.catch(() => undefined),
  };
}

module.exports = { createExternalBackup, prepareFileWrite, atomicWrite };
