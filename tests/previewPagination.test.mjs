import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { estimatedPreviewPages } from '../src/features/editor/lib/previewPagination.ts';
import { cleanChapterHtml } from '../src/features/workspace/lib/exportDocument.ts';

globalThis.document = new JSDOM().window.document;

// Feature: regress the audited omission and verify the renderer's whole sanitized fragment.
test('both reading and estimated page fragments retain loose text before empty and nested blocks', () => {
  for (const html of ['Mira waited.<p></p><div>Fog fell.</div>', 'Mira waited.<p></p>', '<b>Mira waited.</b><p>Fog fell.</p>', '<div>海 <em>wind</em><div>Inside</div>End</div><p>Final</p>']) {
    const pages = estimatedPreviewPages(html);
    assert.equal(pages.join(''), html);
    assert.equal(pages.map((page) => cleanChapterHtml(page).textContent).join(''), cleanChapterHtml(html).textContent);
  }
});

test('page groups retain complete nested lists, quote formatting, Unicode and long paragraphs', () => {
  const first = `<p>${'Word '.repeat(420)}</p>`;
  const rich = '<ul><li><b>First</b><ul><li><i>Nested 海</i></li></ul></li><li>Second</li></ul><blockquote><p style="text-align:right">Quoted<br>passage</p></blockquote>';
  const long = `<p><u>${'Long '.repeat(1000)}</u></p>`;
  const html = first + rich + long;
  const pages = estimatedPreviewPages(html);
  assert.ok(pages.length > 1);
  assert.equal(pages.join(''), html);
  assert.ok(pages.some((page) => page.includes('<ul><li><b>First</b><ul>') && page.includes('</ul></li><li>Second</li></ul>')));
  const root = cleanChapterHtml(pages.join(''));
  assert.equal(root.querySelectorAll('ul').length, 2);
  assert.equal(root.querySelector('blockquote p').style.textAlign, 'right');
  assert.equal(root.querySelector('u').textContent, 'Long '.repeat(1000));
});

test('preview sanitizing removes executable markup without changing the saved manuscript', () => {
  const html = 'Leading <strong>text</strong><script>bad()</script><p onclick="bad()">Safe <a href="javascript:bad()">link</a></p>';
  const before = html;
  const root = cleanChapterHtml(estimatedPreviewPages(html).join(''));
  assert.equal(root.querySelector('script'), null);
  assert.equal(root.querySelector('[onclick]'), null);
  assert.equal(root.querySelector('a').getAttribute('href'), null);
  assert.equal(root.textContent, 'Leading textSafe link');
  assert.equal(html, before);
});
