const { contextBridge, ipcRenderer } = require('electron');

// Feature: expose scoped PDF and backup commands without granting filesystem or general IPC access.
contextBridge.exposeInMainWorld('novelDesktop', {
  exportPdf: (options) => ipcRenderer.invoke('novel:export-pdf', options),
  getBackupStatus: () => ipcRenderer.invoke('novel:backup-status'),
  saveBackup: (raw, checkpoint) => ipcRenderer.invoke('novel:backup-save', raw, checkpoint),
  chooseBackupFolder: () => ipcRenderer.invoke('novel:backup-folder'),
  setBackupEnabled: (enabled) => ipcRenderer.invoke('novel:backup-enabled', enabled),
  openBackupFolder: () => ipcRenderer.invoke('novel:backup-open'),
});
