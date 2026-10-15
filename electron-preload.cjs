const { contextBridge, ipcRenderer } = require('electron');

// Exposes only manuscript PDF generation; the renderer never receives filesystem or IPC access.
contextBridge.exposeInMainWorld('novelDesktop', {
  exportPdf: (options) => ipcRenderer.invoke('novel:export-pdf', options),
});
