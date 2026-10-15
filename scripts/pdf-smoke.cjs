const { app } = require('electron');
const assert = require('node:assert/strict');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { createPdfBuffer } = require('../electron-pdf.cjs');

// Feature: keep the headless test alive after its print window closes until the PDF is written and checked.
app.on('window-all-closed', () => {});

// Runs the production PDF renderer on a generated export fixture without opening a visible window.
app.whenReady().then(async () => {
  try {
    const html = await readFile(path.join(__dirname, '../.local-checks/pdf-smoke.html'), 'utf8');
    const pdf = await createPdfBuffer(html);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.byteLength > 1000);
    await writeFile(path.join(__dirname, '../.local-checks/pdf-smoke.pdf'), pdf);
    console.log(`PDF smoke passed (${pdf.byteLength} bytes).`);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
