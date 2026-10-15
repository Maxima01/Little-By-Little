const { BrowserWindow } = require('electron');

// Renders manuscripts offline with Chromium's typography in an isolated, non-scriptable print window.
async function createPdfBuffer(html) {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { partition: `pdf-${Date.now()}-${Math.random()}`, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  try {
    // Blocks embedded network/local resources without changing the main app's session.
    printWindow.webContents.session.webRequest.onBeforeRequest((request, callback) => callback({ cancel: !request.url.startsWith('data:text/html') }));
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally { printWindow.destroy(); }
}

module.exports = { createPdfBuffer };
