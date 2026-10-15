import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapter, createStory, createStarterWorkspace, describeStoryChange } from '../src/domain/model.ts';
import { exportSelection, isExampleStory, recentlyEdited, rememberChapter, resumeChapter } from '../src/features/workspace/lib/workspaceUx.ts';
import { isWorkspace, parseWorkspaceBackup } from '../src/features/workspace/lib/saveHistory.ts';

// Feature: verify resume and recent edit behavior independently of display order and duplicate titles.
test('remembered chapter survives serialization and viewing does not reorder edits or add activity', () => {
  const workspace = createStarterWorkspace();
  const story = workspace.stories[0];
  story.chapters = Array.from({ length: 5 }, (_, i) => ({ ...createChapter('Same title'), id: `chapter-${i}`, updatedAt: `2026-10-09T0${i}:00:00Z` }));
  const before = structuredClone(workspace);
  const remembered = rememberChapter(workspace, story.id, story.chapters[1].id);
  const restored = parseWorkspaceBackup(JSON.stringify(remembered));
  assert.equal(resumeChapter(restored.stories[0]).id, story.chapters[1].id);
  assert.equal(recentlyEdited(restored.stories)[0].chapter.id, story.chapters[4].id);
  assert.deepEqual(restored.stories[0].chapters, before.stories[0].chapters);
  assert.deepEqual(restored.stories[0].activity, before.stories[0].activity);
  assert.equal(restored.stories[0].updatedAt, story.updatedAt);
  assert.equal(describeStoryChange(story, restored.stories[0]), null);
  assert.equal(rememberChapter(remembered, story.id, story.chapters[1].id), remembered);
  assert.equal(rememberChapter(workspace, story.id, 'missing'), workspace);
});

test('resume handles missing metadata, deleted chapters, reordering, ties and empty stories', () => {
  const story = createStory('Story');
  assert.equal(resumeChapter(story), undefined);
  story.chapters = ['c', 'b', 'a'].map((id) => ({ ...createChapter('Same title'), id, updatedAt: '2026-10-09T01:00:00Z' }));
  assert.equal(resumeChapter(story).id, 'a');
  story.lastOpenedChapterId = 'b';
  story.chapters.reverse();
  assert.equal(resumeChapter(story).id, 'b');
  story.chapters = story.chapters.filter((chapter) => chapter.id !== 'b');
  assert.equal(resumeChapter(story).id, 'a');
});

test('optional navigation and responsive preference metadata roundtrip without breaking old backups', () => {
  const workspace = createStarterWorkspace();
  assert.ok(isWorkspace(workspace));
  workspace.contextVisibility = { wide: false, narrow: true };
  workspace.stories[0].lastOpenedChapterId = 'deleted-reference';
  assert.deepEqual(parseWorkspaceBackup(JSON.stringify(workspace)), workspace);
  for (const invalid of [null, 'true', { wide: 'false' }, { narrow: 1 }]) assert.equal(isWorkspace({ ...workspace, contextVisibility: invalid }), false);
  assert.equal(isWorkspace({ ...workspace, stories: [{ ...workspace.stories[0], isExample: 'yes' }] }), false);
  assert.equal(isWorkspace({ ...workspace, stories: [{ ...workspace.stories[0], lastOpenedChapterId: 123 }] }), false);
});

test('examples have explicit identity and legacy detection checks full manuscript content', () => {
  const example = createStarterWorkspace().stories[0];
  assert.equal(isExampleStory(example), true);
  delete example.isExample;
  assert.equal(isExampleStory(example), true);
  example.chapters[0].html += '<p>My own addition.</p>';
  assert.equal(isExampleStory(example), false);
  assert.equal(isExampleStory(createStory('The House by the Sea')), false);
});

test('export selection ignores unknown and duplicate IDs, retains formatting and manuscript order', () => {
  const story = createStory('Story');
  story.chapters = ['one', 'two', 'three'].map((id) => ({ ...createChapter(id), id, html: `<p><strong>${id}</strong></p>` }));
  const before = structuredClone(story);
  assert.deepEqual(exportSelection(story, ['three', 'one', 'one', 'unknown']).chapters.map((chapter) => chapter.id), ['one', 'three']);
  assert.deepEqual(exportSelection(story, ['two']).chapters, [story.chapters[1]]);
  assert.deepEqual(exportSelection(story, []).chapters, []);
  assert.deepEqual(story, before);
});
