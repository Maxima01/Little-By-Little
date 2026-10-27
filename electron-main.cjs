const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { createPdfBuffer } = require('./electron-pdf.cjs');
const { createExternalBackup } = require('./electron-backup.cjs');
let mainWindow;
let externalBackup;
let quittingAfterBackup = false;

// Feature: one desktop instance owns local saves and the shared automatic backup files.
const ownsWorkspace = app.requestSingleInstanceLock();
if (!ownsWorkspace) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });

// Feature: give packaged Windows builds a stable application identity for shortcuts, notifications and persisted app data.
app.setAppUserModelId('com.littlebylittle.desktop');

// Opens the development server only with --dev; packaged and preview runs load the local bundle.
function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 760,
    minHeight: 620,
    title: 'Little by Little',
    backgroundColor: '#FAF7F2',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });
  mainWindow = window;

  window.once('ready-to-show', () => window.show());

  if (process.argv.includes('--dev')) {
    window.loadURL('http://127.0.0.1:8081');
  } else {
    window.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// Prints a safe manuscript in an isolated hidden window, then saves to the writer's chosen PDF path.
ipcMain.handle('novel:export-pdf', async (event, options) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('PDF export is only available from the writing workspace.');
  if (!options || typeof options.html !== 'string' || options.html.length > 50 * 1024 * 1024 || typeof options.filename !== 'string') throw new Error('Invalid PDF export request.');
  const destination = await dialog.showSaveDialog(mainWindow, { title: 'Export story as PDF', defaultPath: path.basename(options.filename), filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
  if (destination.canceled || !destination.filePath) return { canceled: true };
  const pdf = await createPdfBuffer(options.html);
  await writeFile(destination.filePath, pdf);
  return { canceled: false };
});

// Feature: expose scoped backup operations only to the trusted workspace's main frame.
for (const [channel, action] of Object.entries({
  'novel:backup-status': () => externalBackup.getStatus(),
  'novel:backup-save': (raw, checkpoint) => externalBackup.save(raw, checkpoint === true),
  'novel:backup-folder': () => externalBackup.chooseFolder(),
  'novel:backup-enabled': (enabled) => externalBackup.setEnabled(enabled),
  'novel:backup-open': () => externalBackup.openFolder(),
})) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Backups are only available from the writing workspace.');
    return action(...args);
  });
}

// Feature: complete pending filesystem writes before normal application shutdown.
app.on('before-quit', (event) => {
  if (!externalBackup || quittingAfterBackup) return;
  event.preventDefault();
  void externalBackup.flush().then(() => { quittingAfterBackup = true; app.quit(); });
});

app.whenReady().then(() => {
  if (!ownsWorkspace) return;
  externalBackup = createExternalBackup({ app, dialog, shell, getWindow: () => mainWindow });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
