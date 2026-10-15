import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapter, createStarterWorkspace, createStory } from '../src/domain/model.ts';
import { chapterPassages, compareChapterPassages, recoverChapterInWorkspace } from '../src/features/editor/lib/chapterRecovery.ts';
import { createWorkspaceStore } from '../src/features/workspace/lib/saveHistory.ts';

// Supplies changed chapter text alongside other work that partial recovery must leave untouched.
function fixture() {
  const workspace = createStarterWorkspace();
  workspace.stories.push(createStory('Other story'));
  const story = workspace.stories[0];
  const chapter = story.chapters[0];
  chapter.html = '<p>Keep <strong>this</strong>.</p><p>New passage.</p><p>Keep the ending 海.</p>';
  story.chapters.push(createChapter('Other chapter'));
  const source = { ...chapter, title: 'Old title', html: '<p>Keep <strong>this</strong>.</p><p><em>Lost passage.</em></p><p>Keep the ending 海.</p>', scenes: [] };
  const request = { storyId: story.id, source, expectedHtml: chapter.html, mode: 'replace', savedIndices: [1], currentIndices: [1] };
  return { workspace, chapter, story, request };
}

test('passages retain complete nested lists, quotes, headings, formatting, and line breaks', () => {
  const html = '<h2>Title</h2><ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><blockquote><p>A<br/>B</p></blockquote><p><em>End</em></p>';
  const passages = chapterPassages(html);
  assert.equal(passages.length, 4);
  assert.equal(passages.map((item) => item.html).join(''), html);
  assert.equal(passages[2].text, 'A\nB');
});

test('comparison aligns inserted/removed passages and repeated paragraphs', () => {
  const rows = compareChapterPassages('<p>A</p><p>B</p><p>A</p><p>C</p>', '<p>A</p><p>New</p><p>B</p><p>A</p>');
  assert.deepEqual(rows.map((row) => row.status), ['unchanged', 'current-only', 'unchanged', 'unchanged', 'saved-only']);
  assert.equal(compareChapterPassages('<p><b>A</b></p>', '<p><i>A</i></p>')[0].status, 'changed');
  assert.deepEqual(compareChapterPassages('', ''), []);
});

test('pasted plain text and formatted inline text remain separate from later block passages', () => {
  const html = 'Opening <em>line</em>.<div>Next line.</div><div>Ending.</div>';
  const passages = chapterPassages(html);
  assert.equal(passages.length, 3);
  assert.deepEqual(passages.map((item) => item.text), ['Opening line.', 'Next line.', 'Ending.']);
  assert.equal(passages.map((item) => item.html).join(''), html);
});

test('partial replacement changes exactly the selected passage and preserves all other work', () => {
  const { workspace, chapter, story, request } = fixture();
  const recovered = recoverChapterInWorkspace(workspace, request);
  const next = recovered.stories[0].chapters[0];
  assert.equal(next.html, request.source.html);
  assert.equal(next.title, chapter.title);
  assert.deepEqual(next.scenes, chapter.scenes);
  assert.equal(recovered.stories[1], workspace.stories[1]);
  assert.equal(recovered.stories[0].chapters[1], story.chapters[1]);
  assert.equal(recovered.stories[0].characters, story.characters);
  assert.equal(recovered.stories[0].notes, story.notes);
  assert.equal(recovered.stories[0].activity[0].action, 'Chapter recovered');
  assert.notEqual(workspace.stories[0].chapters[0].html, request.source.html);
});

test('append and full chapter recovery retain current chapter details', () => {
  const { workspace, chapter, request } = fixture();
  const appended = recoverChapterInWorkspace(workspace, { ...request, mode: 'append' });
  assert.equal(appended.stories[0].chapters[0].html, chapter.html + '<p><em>Lost passage.</em></p>');
  const restored = recoverChapterInWorkspace(workspace, { ...request, mode: 'chapter' });
  assert.equal(restored.stories[0].chapters[0].html, request.source.html);
  assert.equal(restored.stories[0].chapters[0].title, chapter.title);
});

test('recovery refuses stale drafts, nonconsecutive targets, invalid selections, and a deleted story', () => {
  const { workspace, request } = fixture();
  assert.throws(() => recoverChapterInWorkspace(workspace, { ...request, expectedHtml: '<p>Stale</p>' }), /changed while/);
  assert.throws(() => recoverChapterInWorkspace(workspace, { ...request, currentIndices: [0, 2] }), /consecutive/);
  assert.throws(() => recoverChapterInWorkspace(workspace, { ...request, savedIndices: [90] }), /Select at least/);
  assert.throws(() => recoverChapterInWorkspace(workspace, { ...request, savedIndices: [] }), /Select at least/);
  assert.throws(() => recoverChapterInWorkspace(workspace, { ...request, storyId: 'missing' }), /story is no longer/);
});

test('a deleted chapter can be recovered without duplicating or restoring other chapters', () => {
  const { workspace, story, request } = fixture();
  story.chapters = story.chapters.slice(1);
  const recovered = recoverChapterInWorkspace(workspace, { ...request, expectedHtml: null, mode: 'chapter' });
  assert.equal(recovered.stories[0].chapters.length, 2);
  assert.equal(recovered.stories[0].chapters[1].id, request.source.id);
  assert.throws(() => recoverChapterInWorkspace(workspace, { ...request, expectedHtml: null }), /Recover the deleted/);
});

test('pre-recovery checkpoint retains the exact current draft after restart', async () => {
  const { workspace, request } = fixture();
  let raw = JSON.stringify(workspace);
  const adapter = { read: async () => raw, write: async (value) => { raw = value; }, quarantine: async () => {} };
  const store = createWorkspaceStore(adapter);
  await store.load();
  await store.save(workspace, { checkpoint: 'Before chapter recovery' });
  await store.save(recoverChapterInWorkspace(workspace, request));
  const restarted = createWorkspaceStore(adapter);
  const loaded = await restarted.load();
  assert.equal(loaded.workspace.stories[0].chapters[0].html, request.source.html);
  const checkpoint = (await restarted.listVersions()).find((version) => version.label === 'Before chapter recovery');
  assert.equal(checkpoint.workspace.stories[0].chapters[0].html, request.expectedHtml);
});
