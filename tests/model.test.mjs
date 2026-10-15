import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countWords,
  appendStoryActivity,
  createChapter,
  createEntry,
  createStory,
  createScene,
  createStarterWorkspace,
  describeStoryChange,
  getStoryActivity,
  plainText,
} from '../src/domain/model.ts';

// These checks cover the local story model and the text calculations used by the writing UI.
test('starter workspace contains a story with a first chapter and supporting material', () => {
  const workspace = createStarterWorkspace();
  assert.equal(workspace.version, 1);
  assert.equal(workspace.stories.length, 1);
  assert.equal(workspace.stories[0].chapters.length, 1);
  assert.equal(workspace.stories[0].characters.length, 1);
  assert.equal(workspace.stories[0].worldbuilding.length, 1);
  assert.ok(Date.parse(workspace.updatedAt));
});

test('new stories initialize every collection and valid timestamps', () => {
  const story = createStory('A new story');
  assert.equal(story.title, 'A new story');
  assert.deepEqual(story.chapters, []);
  assert.deepEqual(story.characters, []);
  assert.deepEqual(story.worldbuilding, []);
  assert.deepEqual(story.art, []);
  assert.deepEqual(story.notes, []);
  assert.deepEqual(story.research, []);
  assert.ok(story.id);
  assert.ok(Date.parse(story.createdAt));
  assert.equal(story.createdAt, story.updatedAt);
  assert.equal(story.activity[0].action, 'Story created');
});

test('new chapters start with a blank paragraph', () => {
  const chapter = createChapter('Chapter One');
  assert.equal(chapter.title, 'Chapter One');
  assert.equal(chapter.html, '<p></p>');
  assert.equal(chapter.fontFamily, 'Georgia');
  assert.equal(chapter.fontSize, 16);
  assert.equal(chapter.scenes.length, 1);
  assert.equal(chapter.scenes[0].title, 'Scene 1');
  assert.equal(chapter.activeSceneId, chapter.scenes[0].id);
  assert.ok(chapter.id);
  assert.ok(Date.parse(chapter.updatedAt));
});

test('new entries use the requested category or Reference by default', () => {
  const defaultEntry = createEntry('A note');
  const character = createEntry('Mara', 'Major');
  assert.equal(defaultEntry.category, 'Reference');
  assert.equal(defaultEntry.content, '');
  assert.equal(character.category, 'Major');
  assert.ok(defaultEntry.id);
});

test('word count ignores markup, entities that are punctuation, and empty HTML', () => {
  assert.equal(countWords('<p>Salt &amp; sea</p>'), 2);
  assert.equal(countWords('<p>Well-known writers don’t stop.</p><br/><h2>Next day</h2>'), 6);
  assert.equal(countWords('<p></p><div>&nbsp;</div>'), 0);
});

test('plain text extraction removes markup and decodes common entities', () => {
  assert.equal(plainText('<h1>Mara &amp; the sea</h1><p>Wind&nbsp;and rain</p>'), 'Mara & the sea Wind and rain');
});

test('activity summaries capture chapter changes with a useful word-count detail', () => {
  const story = createStory('A new story');
  const chapter = createChapter('First chapter');
  chapter.html = '<p>Salt and sea</p>';
  story.chapters.push(chapter);
  const changed = { ...story, chapters: story.chapters.map((item) => ({ ...item, html: '<p>Salt and sea return</p>' })) };
  const event = describeStoryChange(story, changed);
  assert.equal(event.action, 'Chapter draft edited');
  assert.equal(event.targetTitle, 'First chapter');
  assert.equal(event.details, 'Draft · 3 → 4 words');
});

test('activity updates within one minute are coalesced into the latest timeline item', () => {
  const now = '2026-10-08T12:00:30.000Z';
  const event = { action: 'Chapter draft edited', targetId: 'chapter-1', targetTitle: 'Chapter One', details: 'Draft updated · 12 words' };
  const first = appendStoryActivity([], event, '2026-10-08T12:00:00.000Z');
  const second = appendStoryActivity(first, { ...event, details: 'Draft updated · 14 words' }, now);
  assert.equal(second.length, 1);
  assert.equal(second[0].details, 'Draft updated · 14 words');
  assert.equal(second[0].createdAt, now);
});

test('legacy stories get a timeline from their existing saved work timestamps', () => {
  const story = createStory('Legacy story');
  const chapter = createChapter('Chapter One');
  chapter.html = '<p>One saved paragraph</p>';
  chapter.updatedAt = '2026-10-07T10:00:00.000Z';
  story.createdAt = '2026-10-06T10:00:00.000Z';
  story.chapters.push(chapter);
  delete story.activity;
  const timeline = getStoryActivity(story);
  assert.equal(timeline[0].action, 'Chapter on file');
  assert.equal(timeline[0].targetTitle, 'Chapter One');
  assert.equal(timeline[0].details, '3 words');
});

test('scene context changes are summarized for the chapter activity history', () => {
  const story = createStory('A new story');
  const chapter = createChapter('Chapter One');
  story.chapters.push(chapter);
  const nextScene = createScene('At the harbor');
  const changed = { ...story, chapters: [{ ...chapter, scenes: [chapter.scenes[0], nextScene], activeSceneId: nextScene.id }] };
  const event = describeStoryChange(story, changed);
  assert.equal(event.action, 'Scene added');
  assert.equal(event.details, 'At the harbor');
});
