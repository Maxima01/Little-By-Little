import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { cleanChapterHtml } from '../src/features/workspace/lib/exportDocument.ts';

// Feature: imported and cloud-sourced markup is inert throughout parsing and cannot retain executable attributes.
test('untrusted HTML stays inert before and after manuscript sanitization', () => {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'https://writer.test/' });
  globalThis.document = dom.window.document;
  let constructions = 0;
  dom.window.customElements.define('evil-widget', class extends dom.window.HTMLElement {
    constructor() { super(); constructions += 1; }
  });
  const safe = cleanChapterHtml('<evil-widget><p onclick="window.compromised=true" style="position:fixed;background:url(https://attacker.test/)">Safe <strong>writing</strong></p></evil-widget><img src="https://attacker.test/" onerror="window.compromised=true"><svg onload="window.compromised=true"></svg><a href="javascript:window.compromised=true">link</a><script>window.compromised=true</script>');
  dom.window.document.body.append(safe);
  assert.equal(constructions, 0);
  assert.equal(dom.window.compromised, undefined);
  assert.equal(safe.textContent, 'Safe writinglink');
  assert.match(safe.innerHTML, /<strong>writing<\/strong>/);
  assert.doesNotMatch(safe.innerHTML, /onclick|onerror|onload|javascript:|script|evil-widget|img|svg|attacker|position/);
  dom.window.close();
});
