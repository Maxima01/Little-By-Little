import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createWorkspaceStore } from './saveHistory';
import { createWebStorageAdapter } from './webStorage';

const STORAGE_KEY = 'little-by-little.workspace.v1';

// Serializes native saves; web commits also compare revisions atomically inside IndexedDB.
const workspaceStore = createWorkspaceStore(Platform.OS === 'web' ? createWebStorageAdapter(indexedDB, {
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
});

export const loadWorkspace = workspaceStore.load;
export const stageWorkspace = workspaceStore.stage;
export const writeWorkspace = workspaceStore.save;
export const listWorkspaceVersions = workspaceStore.listVersions;
export const replaceWorkspace = workspaceStore.replace;
