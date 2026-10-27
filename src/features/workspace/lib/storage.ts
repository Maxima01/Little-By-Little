import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createWorkspaceStore, type SaveOptions, type StorageAdapter } from './saveHistory';
import type { Workspace } from '../../../domain/model';
import { backupWorkspace, refreshExternalBackup } from './externalBackup';
import { createWebStorageAdapter } from './webStorage';

const STORAGE_KEY = 'little-by-little.workspace.v1';

// Serializes native saves; web commits also compare revisions atomically inside IndexedDB.
const adapter: StorageAdapter = Platform.OS === 'web' ? createWebStorageAdapter(indexedDB, {
  // Access localStorage lazily so blocked browser storage is handled by draft recovery safeguards.
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
}) : {
  read: () => AsyncStorage.getItem(STORAGE_KEY),
  write: async (value, expected) => {
    if (await AsyncStorage.getItem(STORAGE_KEY) !== expected) throw new Error('Newer work was saved in another session. Download a backup, then reopen the workspace.');
    await AsyncStorage.setItem(STORAGE_KEY, value);
  },
  quarantine: (value) => AsyncStorage.setItem(`${STORAGE_KEY}.damaged.${Date.now()}`, value),
};
const workspaceStore = createWorkspaceStore(adapter);

// Feature: protect surviving external backups from a starter workspace after local storage is lost.
export async function loadWorkspace() {
  const backup = await refreshExternalBackup();
  if (backup.supported && (await adapter.read()) === null && (backup.hasBackup || backup.lastBackupAt)) {
    throw new Error('Local stories are missing, and an external backup may contain your work. Open Automatic backups, then use Import backup to preview and restore a copy. Reconnect your backup drive if needed.');
  }
  const loaded = await workspaceStore.load();
  void backupWorkspace(loaded.workspace);
  return loaded;
}

export const stageWorkspace = workspaceStore.stage;

// Feature: send successful commits to external storage without blocking or changing local save status.
export async function writeWorkspace(workspace: Workspace, options: SaveOptions = {}) {
  const result = await workspaceStore.save(workspace, options);
  void backupWorkspace(workspace, !!options.checkpoint || !!options.preservePrevious);
  return result;
}

export const listWorkspaceVersions = workspaceStore.listVersions;

// Feature: retain the preceding external copy when an imported workspace replaces the local library.
export async function replaceWorkspace(workspace: Workspace, previous?: Workspace) {
  const result = await workspaceStore.replace(workspace, previous);
  void backupWorkspace(workspace, true);
  return result;
}
