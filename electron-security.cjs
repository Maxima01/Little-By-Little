const { pathToFileURL } = require('node:url');

// Feature: bind privileged desktop operations to the exact local document, never an arbitrary page on its origin.
function createDesktopSecurity(entryPath, development = false) {
  const entry = new URL(development ? 'http://127.0.0.1:8081/' : pathToFileURL(entryPath).href);

  // Feature: hashes are safe in-document navigation; credentials, extra paths, queries and remote documents are rejected.
  function isTrustedDocument(value) {
    try {
      const candidate = new URL(value);
      candidate.hash = '';
      return candidate.href === entry.href;
    } catch { return false; }
  }

  // Feature: a matching WebContents alone is insufficient after navigation; verify the active main frame's URL too.
  function isTrustedSender(event, window) {
    return !!window && !window.isDestroyed()
      && event.sender === window.webContents
      && event.senderFrame === window.webContents.mainFrame
      && isTrustedDocument(event.senderFrame?.url);
  }

  return { isTrustedDocument, isTrustedSender };
}

module.exports = { createDesktopSecurity };
