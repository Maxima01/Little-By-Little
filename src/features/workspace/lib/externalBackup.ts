import type { Workspace } from '../../../domain/model';
import { isWorkspace } from './saveHistory';

// Feature: desktop backup health is independent of both portable workspace data and local save success.
export type ExternalBackupStatus = { supported: boolean; enabled: boolean; folder: string; hasBackup: boolean; lastBackupAt: string | null; error: string };
let current: ExternalBackupStatus = { supported: false, enabled: false, folder: '', hasBackup: false, lastBackupAt: null, error: '' };
const listeners = new Set<(status: ExternalBackupStatus) => void>();

// Feature: safely discover the narrow Electron bridge without accessing browser globals on native devices.
function desktop() { return typeof window !== 'undefined' ? window.novelDesktop : undefined; }

// Feature: share backup status between autosave and workspace controls, including background failures.
export function subscribeExternalBackup(listener: (status: ExternalBackupStatus) => void) {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}

// Feature: report bridge failures separately so they cannot turn a successful local save into a failed save.
async function update(action: () => Promise<ExternalBackupStatus>): Promise<ExternalBackupStatus> {
  try { current = await action(); }
  catch (error) { current = { ...current, supported: true, error: error instanceof Error ? error.message : 'Automatic backup failed. Try again or choose another folder.' }; }
  for (const listener of listeners) listener(current);
  return current;
}

// Feature: read persisted preferences and discover surviving copies before creating a new local workspace.
export async function refreshExternalBackup(): Promise<ExternalBackupStatus> {
  const bridge = desktop();
  return bridge ? update(() => bridge.getBackupStatus()) : current;
}

// Feature: export the same validated portable JSON used by manual backup/import after every local commit.
export async function backupWorkspace(workspace: Workspace, checkpoint = false): Promise<ExternalBackupStatus> {
  const bridge = desktop();
  if (!bridge) return current;
  return update(async () => {
    if (!isWorkspace(workspace)) throw new Error('The workspace contains invalid data. The previous external backup has been kept.');
    return bridge.saveBackup(JSON.stringify(workspace, null, 2), checkpoint);
  });
}

// Feature: change the destination using the native folder picker; filesystem access stays in Electron.
export async function chooseExternalBackupFolder(): Promise<ExternalBackupStatus> {
  const bridge = desktop();
  return bridge ? update(() => bridge.chooseBackupFolder()) : current;
}

// Feature: persist pause/resume on this device without changing workspace backups or deleting files.
export async function setExternalBackupEnabled(enabled: boolean): Promise<ExternalBackupStatus> {
  const bridge = desktop();
  return bridge ? update(() => bridge.setBackupEnabled(enabled)) : current;
}

// Feature: reveal the backup files for inspection or recovery through Import backup.
export async function openExternalBackupFolder(): Promise<ExternalBackupStatus> {
  const bridge = desktop();
  return bridge ? update(() => bridge.openBackupFolder()) : current;
}
