import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { applyEditorSuggestion, autoCapitalizeEditor, editorTextSelection, selectEditorText, applyEditorTextEdit } from '../src/features/editor/lib/editorAssistance.ts';
import { grammarSuggestions, manuscriptText } from '../src/features/editor/lib/writingAnalysis.ts';

// Uses real DOM ranges; JSDOM needs a small insertText substitute because it has no browser editing engine.
function editorFixture(html) {
  const dom = new JSDOM('<div contenteditable="true" tabindex="0"></div>');
  const root = dom.window.document.querySelector('div');
  root.innerHTML = html;
  dom.window.document.execCommand = (command, unused, text) => {
    assert.equal(command, 'insertText');
    const selection = dom.window.getSelection();
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(dom.window.document.createTextNode(text));
    return true;
  };
  return { root, dom };
}

test('typed capitalization handles browser nonbreaking spaces, inline formatting, and caret restoration', () => {
  const { root, dom } = editorFixture('<p>Mara&nbsp;said <strong>i&nbsp;</strong></p>');
  const textNode = root.querySelector('strong').firstChild;
  const caret = dom.window.document.createRange();
  caret.setStart(textNode, 2); caret.collapse(true);
  dom.window.getSelection().addRange(caret);
  assert.equal(autoCapitalizeEditor(root, 'Mara said i\n'), true);
  assert.equal(manuscriptText(root.innerHTML), 'Mara said I \n');
  assert.equal(root.querySelector('strong').textContent, 'I\u00a0');
  assert.equal(dom.window.getSelection().getRangeAt(0).startContainer.parentElement.tagName, 'STRONG');
  assert.equal(dom.window.getSelection().getRangeAt(0).startOffset, 1);
});

test('corrections map across mixed pasted text and block boundaries and reject a stale suggestion', () => {
  const { root } = editorFixture('Mara&nbsp;waited.<div>Sea &amp; <em>i</em>’m home.</div>');
  const suggestion = grammarSuggestions(manuscriptText(root.innerHTML))[0];
  assert.equal(applyEditorSuggestion(root, suggestion), true);
  assert.equal(root.querySelector('em').textContent, 'I');
  assert.match(root.innerHTML, /^Mara&nbsp;waited\./);
  assert.equal(applyEditorSuggestion(root, suggestion), false);
});

// Feature: passage selection/navigation and generic proofreading retain actual rich DOM ranges.
test('passage selection is captured across inline formatting and general edits reject stale text', () => {
 const {root,dom}=editorFixture('<p>First.</p><p><b>Mara</b> waits.</p>'); const node=root.querySelector('b').firstChild;
 const range=dom.window.document.createRange();range.setStart(node,0);range.setEnd(node,4);dom.window.getSelection().addRange(range);
 const anchor=editorTextSelection(root,range);assert.equal(anchor.quote,'Mara');assert.equal(anchor.start,7);
 root.querySelector('p').scrollIntoView=()=>{};root.querySelectorAll('p')[1].scrollIntoView=()=>{};
 assert.equal(selectEditorText(root,7,11),true);assert.equal(dom.window.getSelection().toString(),'Mara');
 const edit={start:7,end:11,before:'Mara',after:'Nora'};assert.equal(applyEditorTextEdit(root,edit),true);assert.equal(root.querySelector('b').textContent,'Nora');assert.equal(applyEditorTextEdit(root,edit),false);
});
