const { app } = require('electron');
const path = require('node:path');
const { mkdirSync } = require('node:fs');

// Feature: launch the real desktop entry point with a fresh, retained test profile before Chromium starts.
// Only profiles inside this project's validation runs are accepted; the normal writer's data is never loaded.
const root = path.resolve(__dirname, '../.local-checks/desktop');
const profile = process.env.NOVEL_DESKTOP_TEST_PROFILE;
if (!profile || !path.isAbsolute(profile)) throw new Error('A desktop validation profile is required.');
const relative = path.relative(root, profile);
if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).length !== 2 || path.basename(profile) !== 'profile') {
  throw new Error('The desktop validation profile must be inside .local-checks/desktop/<run>/profile.');
}
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', profile);
// Feature: unattended audits can keep isolated QA windows hidden while allowing rendering and autosave to run.
if (process.env.NOVEL_DESKTOP_TEST_HIDDEN === '1') app.on('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.on('show', () => window.hide());
});
require('../electron-main.cjs');
