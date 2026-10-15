const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { createPdfBuffer } = require('./electron-pdf.cjs');
let mainWindow;

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
