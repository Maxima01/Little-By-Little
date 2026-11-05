import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { createDesktopSecurity } = createRequire(import.meta.url)('../electron-security.cjs');
const entryPath = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const entryUrl = pathToFileURL(entryPath).href;

// Feature: hostile navigation cannot inherit desktop filesystem privileges even when it shares an origin or filename.
test('desktop trust accepts only the application document and its local hashes', () => {
  const security = createDesktopSecurity(entryPath);
  assert.equal(security.isTrustedDocument(entryUrl), true);
  assert.equal(security.isTrustedDocument(entryUrl + '#chapter'), true);
  for (const url of ['https://example.com/', 'data:text/html,bad', 'file:///other/index.html', entryUrl + '?remote=true', 'invalid']) {
    assert.equal(security.isTrustedDocument(url), false, url);
  }
  const development = createDesktopSecurity(entryPath, true);
  assert.equal(development.isTrustedDocument('http://127.0.0.1:8081/'), true);
  for (const url of ['http://127.0.0.1:8081/evil', 'http://127.0.0.1:8081/?evil', 'http://127.0.0.1:8081.evil.test/', 'http://user:pass@127.0.0.1:8081/', 'http://localhost:8081/']) {
    assert.equal(development.isTrustedDocument(url), false, url);
  }
});

// Feature: IPC authorization rejects subframes, replacement pages and destroyed windows before running any action.
test('desktop IPC requires the live application main frame and trusted URL', () => {
  const security = createDesktopSecurity(entryPath);
  const mainFrame = { url: entryUrl };
  const webContents = { mainFrame };
  const window = { webContents, isDestroyed: () => false };
  const event = { sender: webContents, senderFrame: mainFrame };
  assert.equal(security.isTrustedSender(event, window), true);
  assert.equal(security.isTrustedSender({ ...event, sender: {} }, window), false);
  assert.equal(security.isTrustedSender({ ...event, senderFrame: { url: entryUrl } }, window), false);
  mainFrame.url = 'https://attacker.test/';
  assert.equal(security.isTrustedSender(event, window), false);
  assert.equal(security.isTrustedSender(event, null), false);
});
