import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { createStory, createChapter } from '../src/domain/model.ts';
import { exportSelection } from '../src/features/workspace/lib/workspaceUx.ts';
import { cleanChapterHtml, exportFileName, storyDocx, storyEpub, storyHtml, storyText } from '../src/features/workspace/lib/exportDocument.ts';

const dom = new JSDOM();
globalThis.document = dom.window.document;
globalThis.XMLSerializer = dom.window.XMLSerializer;

// Feature: chapter scope is applied once before the PDF/HTML, Word, EPUB, Markdown and TXT generators.
test('every export generator includes only selected chapter titles and passages', async () => {
  const story = manuscript();
  const selected = exportSelection(story, [story.chapters[1].id]);
  for (const text of [storyText(selected), storyText(selected, true), storyHtml(selected)]) {
    assert.match(text, /Second/);
    assert.match(text, /Final paragraph/);
    assert.doesNotMatch(text, /First|Hello|Quoted words/);
  }
  const word = await JSZip.loadAsync(await storyDocx(selected));
  const documentXml = await word.file('word/document.xml').async('string');
  assert.match(documentXml, /Second/);
  assert.match(documentXml, /Final paragraph/);
  assert.doesNotMatch(documentXml, /First|Hello|Quoted words/);
  const epub = await JSZip.loadAsync(await storyEpub(selected));
  assert.equal(epub.file('OEBPS/chapter-1.xhtml'), null);
  const chapter = await epub.file('OEBPS/chapter-0.xhtml').async('string');
  assert.match(chapter, /Second/);
  assert.match(chapter, /Final paragraph/);
  assert.doesNotMatch(chapter, /Hello|Quoted words/);
});

// Provides Unicode, rich formatting, and hostile pasted content for export compatibility checks.
function manuscript() {
  const story = createStory('Mara & the sea 海');
  const first = createChapter('First <chapter>');
  first.html = '<p style="text-align:center">Hello <strong>world</strong> &amp; <em>海</em><br/>Next line</p><h2>Inside</h2><ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><blockquote><p>Quoted words</p></blockquote><p><u>Underlined</u> <s>Gone</s> <a href="https://example.com">Source</a></p>';
  const second = createChapter('Second');
  second.html = '<p>Final paragraph</p>';
  story.chapters = [first, second];
  return story;
}

// Rejects XML parser errors in generated EPUB and OOXML files.
function xml(value) {
  const parsed = new dom.window.DOMParser().parseFromString(value, 'application/xml');
  assert.equal(parsed.querySelector('parsererror'), null, value.slice(0, 300));
  return parsed;
}

test('text exports preserve paragraphs, list nesting, Unicode, line breaks, and chapter order', () => {
  const story = manuscript();
  const text = storyText(story);
  assert.match(text, /Hello world & 海\nNext line/);
  assert.match(text, /- One\n\n  - Nested/);
  assert.ok(text.indexOf('First <chapter>') < text.indexOf('Second'));
  assert.doesNotMatch(text, /<strong>|&amp;/);
  const markdown = storyText(story, true);
  assert.match(markdown, /\*\*world\*\*/);
  assert.match(markdown, /\*海\*/);
  assert.match(markdown, /\[Source\]\(https:\/\/example.com\)/);
  assert.match(markdown, /#### Inside/);
});

test('safe HTML retains writing styles while excluding executable content and remote media', () => {
  const html = cleanChapterHtml('<script>bad()</script><p onclick="bad()" style="text-align:right;background:url(https://bad.test)">Safe <a href="javascript:bad()">link</a><img src="https://bad.test"/><iframe src="file:///secret">hidden</iframe><span style="font-weight:bold">bold</span></p>').innerHTML;
  assert.match(html, /text-align:right/);
  assert.match(html, /font-weight:bold/);
  assert.doesNotMatch(html, /bad|script|onclick|img|iframe|file:/);
  const document = storyHtml(manuscript());
  assert.match(document, /First &lt;chapter&gt;/);
  assert.match(document, /break-before:page/);
  assert.match(document, /Content-Security-Policy/);
});

test('Word output is editable OOXML with rich text, page breaks, lists, and external link relationships', async () => {
  const bytes = await storyDocx(manuscript());
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file('[Content_Types].xml'));
  const documentXml = await zip.file('word/document.xml').async('string');
  const document = xml(documentXml);
  assert.match(documentXml, /海/);
  assert.match(documentXml, /Hello /);
  assert.ok(document.getElementsByTagName('w:b').length);
  assert.ok(document.getElementsByTagName('w:i').length);
  assert.ok(document.getElementsByTagName('w:u').length);
  assert.ok(document.getElementsByTagName('w:numPr').length);
  assert.ok(document.getElementsByTagName('w:pageBreakBefore').length);
  assert.ok(document.getElementsByTagName('w:br').length);
  assert.ok(document.getElementsByTagName('w:jc').length);
  const relationships = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.match(relationships, /https:\/\/example.com/);
  xml(relationships);
  xml(await zip.file('word/numbering.xml').async('string'));
});

test('EPUB has the first uncompressed mimetype, valid XML, navigation, metadata, and ordered spine', async () => {
  const bytes = await storyEpub(manuscript(), 'zh');
  const buffer = Buffer.from(bytes);
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.equal(buffer.readUInt16LE(8), 0);
  assert.equal(buffer.toString('utf8', 30, 38), 'mimetype');
  assert.equal(buffer.readUInt16LE(28), 0);
  const zip = await JSZip.loadAsync(bytes);
  assert.equal(await zip.file('mimetype').async('string'), 'application/epub+zip');
  for (const name of Object.keys(zip.files).filter((name) => /\.(xhtml|opf|xml)$/.test(name))) xml(await zip.file(name).async('string'));
  const opf = xml(await zip.file('OEBPS/content.opf').async('string'));
  assert.equal(opf.getElementsByTagName('dc:language')[0].textContent, 'zh');
  assert.deepEqual(Array.from(opf.getElementsByTagName('itemref')).map((item) => item.getAttribute('idref')), ['title', 'chapter-0', 'chapter-1']);
  const navigation = await zip.file('OEBPS/nav.xhtml').async('string');
  assert.match(navigation, /epub:type="toc"/);
  assert.match(navigation, /chapter-1.xhtml/);
  assert.match(await zip.file('OEBPS/chapter-0.xhtml').async('string'), /海/);
});

test('empty manuscripts still produce readable DOCX and EPUB title pages', async () => {
  const empty = createStory('Empty draft');
  assert.ok((await storyDocx(empty)).byteLength > 0);
  const epub = await JSZip.loadAsync(await storyEpub(empty));
  const opf = xml(await epub.file('OEBPS/content.opf').async('string'));
  assert.equal(opf.getElementsByTagName('itemref').length, 1);
});

test('filenames retain non-Latin titles and remove Windows reserved characters', () => {
  assert.equal(exportFileName(' 海: Home? '), '海- Home-');
  assert.equal(exportFileName('...'), 'story');
  assert.equal(exportFileName('CON'), 'story-CON');
  assert.equal(exportFileName('aux.draft'), 'story-aux.draft');
});
