import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapter, createEntry, createScene, createStarterWorkspace, createStory } from '../src/domain/model.ts';
import { capitalizeHtmlPronoun, chapterCharacterAppearances, grammarSuggestions, justTypedPronoun, manuscriptText, settingContinuity } from '../src/features/editor/lib/writingAnalysis.ts';
import { isWorkspace } from '../src/features/workspace/lib/saveHistory.ts';
import { anchorText } from '../src/features/editor/lib/manuscriptOperations.ts';

// Verifies character counts against cast assignments and real text boundaries rather than HTML substrings.
test('character ledger counts scenes once and matches full Unicode names through formatting', () => {
  const story = createStory('Cast');
  const mara = createEntry('Mara', 'Major');
  const li = createEntry('李明', 'Minor');
  const dot = createEntry('A. B', 'Minor');
  story.characters = [mara, li, dot, createEntry('', 'Side character')];
  const chapter = createChapter('One');
  chapter.html = '<p><strong>Mar</strong>a met MARAMA. Mara’s coat. 李明 met 李明光. A. B smiled.</p><p title="Mara">mara returned.</p>';
  chapter.scenes = [{ ...createScene('First'), characterIds: [mara.id, mara.id] }, { ...createScene('Second'), characterIds: [mara.id, li.id] }];
  const ledger = chapterCharacterAppearances(chapter, story);
  assert.equal(ledger[0].scenes.length, 2);
  assert.equal(ledger[0].mentions, 3);
  assert.equal(ledger[1].mentions, 1);
  assert.equal(ledger[2].mentions, 1);
  assert.equal(ledger[3].mentions, 0);
});

test('setting trail respects chapter order, unassigned scenes, deleted settings, and location changes', () => {
  const story = createStory('Places');
  const harbor = createEntry('Harbor', 'Setting');
  const house = createEntry('House', 'Setting');
  story.worldbuilding = [harbor, house];
  const previous = createChapter('Previous');
  previous.html = '<p>Before.</p>';
  previous.scenes[0].anchor = anchorText(manuscriptText(previous.html), 0, 6);
  previous.scenes[0].settingId = harbor.id;
  const chapter = createChapter('Now');
  chapter.scenes = [
    { ...createScene('Arrival'), settingId: harbor.id },
    { ...createScene('Home'), settingId: house.id, continuityNotes: 'One hour later' },
    createScene('Unknown'),
    { ...createScene('Removed'), settingId: 'deleted' },
  ];
  chapter.html = '<p>Arrival.</p><p>Home.</p><p>Unknown.</p><p>Removed.</p>';
  const text = manuscriptText(chapter.html);
  chapter.scenes.forEach((scene) => { const start = text.indexOf(scene.title); scene.anchor = anchorText(text, start, start + scene.title.length); });
  story.chapters = [previous, chapter];
  const trail = settingContinuity(chapter, story);
  assert.equal(trail.previousSetting.id, harbor.id);
  assert.deepEqual(trail.trail.map((item) => item.status), ['same', 'changed', 'unassigned', 'missing']);
  assert.equal(trail.trail[1].scene.continuityNotes, 'One hour later');
  assert.equal(settingContinuity(previous, story).previousChapter, undefined);
});

test('grammar suggests I contractions without matching names, URLs, email, identifiers, or another language', () => {
  const text = "i said i’m ready. i’ll go, i’d wait; i've returned. Iris, mini, xi, 李i明, i@example.com, /i/path, var_i, i-test, i's.";
  assert.deepEqual(grammarSuggestions(text).map((item) => item.after), ['I', 'I’m', 'I’ll', 'I’d', "I've"]);
  assert.equal(grammarSuggestions('I am ready.').length, 0);
});

test('auto capitalization acts only on a just-completed typed pronoun', () => {
  assert.equal(justTypedPronoun('Today i', 'Today i ').after, 'I');
  assert.equal(justTypedPronoun('i’ll', 'i’ll,').after, 'I’ll');
  assert.equal(justTypedPronoun('', 'i'), undefined);
  assert.equal(justTypedPronoun('', 'i am here'), undefined);
  assert.equal(justTypedPronoun('I ', 'i '), undefined);
  assert.equal(justTypedPronoun('i’m ', 'i’m'), undefined);
  assert.equal(justTypedPronoun('mini', 'mini '), undefined);
});

test('individual HTML corrections preserve emphasis, attributes, entities, paragraphs, and stale-text safety', () => {
  const html = '<p title="i">海 &amp; <strong>i</strong>’m here.</p><p>&#105; wait.</p>';
  const suggestions = grammarSuggestions(manuscriptText(html));
  const first = capitalizeHtmlPronoun(html, suggestions[0]);
  assert.equal(first, '<p title="i">海 &amp; <strong>I</strong>’m here.</p><p>&#105; wait.</p>');
  assert.equal(capitalizeHtmlPronoun(first, suggestions[1]), '<p title="i">海 &amp; <strong>I</strong>’m here.</p><p>I wait.</p>');
  assert.equal(capitalizeHtmlPronoun('<p>Different text</p>', suggestions[0]), '<p>Different text</p>');
  assert.equal(manuscriptText('<p>Mar<em>a</em> &quot;hello&quot;</p><p>Next</p>'), 'Mara "hello"\nNext\n');
});

test('new settings roundtrip through backup validation and legacy workspaces remain valid', () => {
  const workspace = createStarterWorkspace();
  assert.equal(isWorkspace(workspace), true);
  const chapter = workspace.stories[0].chapters[0];
  chapter.writingPreferences = { grammarSuggestions: false, autoCapitalizeI: true };
  chapter.scenes[0].continuityNotes = 'A storm is approaching.';
  assert.equal(isWorkspace(JSON.parse(JSON.stringify(workspace))), true);
  chapter.writingPreferences.autoCapitalizeI = 'yes';
  assert.equal(isWorkspace(workspace), false);
  chapter.writingPreferences.autoCapitalizeI = true;
  chapter.scenes[0].continuityNotes = 42;
  assert.equal(isWorkspace(workspace), false);
});
