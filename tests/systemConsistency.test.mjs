import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { countWords, countTextWords, plainText, createStarterWorkspace, createEntry, createScene, createChapter, describeStoryChange } from '../src/domain/model.ts';
import { anchorText, sceneTimeline, chapterWithScenes } from '../src/features/editor/lib/manuscriptOperations.ts';
import { manuscriptText, chapterCharacterAppearances, settingContinuity } from '../src/features/editor/lib/writingAnalysis.ts';
import { HISTORY_LINK_KEYS, isWorldProfile, relatedHistory, worldTypeImpact } from '../src/features/world/lib/worldProfile.ts';
import { isWorkspace, parseWorkspaceBackup, createWorkspaceStore } from '../src/features/workspace/lib/saveHistory.ts';
import { storyHtml, storyDocx } from '../src/features/workspace/lib/exportDocument.ts';

// Feature: regression coverage checks user-visible consistency failures found in the system audit.
test('formatted words, encoded apostrophes, hidden text and visible excerpts use one manuscript', () => {
  const html = '<p>Ma<strong>ra</strong> said don&#39;t.</p><!--hidden words--><script>hidden words</script><p>Next&nbsp;day.</p>';
  assert.equal(countWords(html), 5);
  assert.equal(countWords(html), countTextWords(manuscriptText(html)));
  assert.equal(plainText(html), "Mara said don't. Next day.");
  assert.equal(countTextWords('Read <king> &amp; aloud.'), 4);
});

test('profile and style aliases count once per occurrence with longest-name matching', () => {
  const story = createStarterWorkspace().stories[0], character = story.characters[0];
  character.characterProfile = { aliases: 'Keeper, The Keeper\nMara\nKEEPER' };
  story.styleGuide = { rules: [{ id: 'a', kind: 'alias', preferred: 'Mara', variants: ['Keeper'], note: '', characterId: character.id }], conventions: '', quoteStyle: 'any', dashStyle: 'any', ellipsisStyle: 'any' };
  story.chapters[0].html = '<p>The Keeper met Keeper. Ma<b>ra</b> waited. Keepers left.</p>';
  assert.equal(chapterCharacterAppearances(story.chapters[0], story)[0].mentions, 3);
  assert.equal(chapterCharacterAppearances(story.chapters[0], story)[0].scenes.length, 0);
});

test('history links roundtrip through local save and backup without changing written history or presence', async () => {
  const workspace = createStarterWorkspace(), story = workspace.stories[0], group = createEntry('House Grey', 'Family'), history = createEntry('Founding', 'History');
  history.content = 'The original account.';
  history.worldProfile = { participants: 'Unnamed relatives', settingIds: [story.worldbuilding[0].id], participantCharacterIds: [story.characters[0].id], participantGroupIds: [group.id], authorNotes: 'A future reveal' };
  story.worldbuilding.push(group, history);
  let raw = null;
  const adapter = { read: async () => raw, write: async (value) => { raw = value; }, quarantine: async () => {} };
  const store = createWorkspaceStore(adapter); await store.load(); await store.save(workspace);
  const restored = (await createWorkspaceStore(adapter).load()).workspace;
  assert.deepEqual(restored, workspace);
  assert.deepEqual(parseWorkspaceBackup(JSON.stringify(workspace)), workspace);
  assert.equal(relatedHistory(story, story.characters[0].id, 'character')[0].id, history.id);
  assert.equal(relatedHistory(story, group.id, 'world')[0].id, history.id);
  assert.equal(relatedHistory(story, story.worldbuilding[0].id, 'world')[0].id, history.id);
  assert.equal(chapterCharacterAppearances(story.chapters[0], story)[0].scenes.length, 0);
  group.title = 'Renamed family'; assert.deepEqual(history.worldProfile.participantGroupIds, [group.id]);
  history.category = 'Setting'; assert.deepEqual(relatedHistory(story, group.id, 'world'), []);
  assert.equal(history.content, 'The original account.');
});

test('history links reject malformed imports while retaining deleted target IDs', () => {
  for (const key of HISTORY_LINK_KEYS) {
    for (const value of [null, '', [1], [''], ['same', 'same']]) assert.equal(isWorldProfile({ [key]: value }), false, `${key}: ${JSON.stringify(value)}`);
    assert.equal(isWorldProfile({ [key]: ['deleted-id'] }), true);
  }
  const workspace = createStarterWorkspace(); workspace.stories[0].worldbuilding[0].worldProfile = { settingIds: [null] };
  assert.equal(isWorkspace(workspace), false);
});

test('type change previews identify actual affected scenes, memberships, affiliations and history', () => {
  const story = createStarterWorkspace().stories[0], setting = story.worldbuilding[0], character = story.characters[0];
  story.chapters[0].scenes[0].settingId = setting.id;
  setting.worldProfile = { geography: 'Rocky shore', authorNotes: 'Keep this' };
  const history = createEntry('Flood', 'History'); history.worldProfile = { settingIds: [setting.id] }; story.worldbuilding.push(history);
  const impact = worldTypeImpact(story, setting, 'History');
  assert.deepEqual(impact.hiddenFacts, ['Geography & landscape']); assert.equal(impact.scenes.length, 1); assert.deepEqual(impact.history, ['Flood']);
  const group = createEntry('House Grey', 'Family'); story.worldbuilding.push(group);
  character.characterProfile = { membershipIds: [group.id], affiliations: '@/Grey', affiliationLinks: [{ targetId: group.id, start: 0, end: 6 }] };
  assert.deepEqual(worldTypeImpact(story, group, 'Setting').members, ['Mara']);
  assert.deepEqual(worldTypeImpact(story, group, 'Setting').affiliations, ['Mara']);
  assert.deepEqual(worldTypeImpact(story, group, 'Faction').members, []);
  assert.equal(setting.category, 'Setting'); assert.equal(setting.worldProfile.authorNotes, 'Keep this');
});

test('continuity distinguishes a changed type from deletion, including the previous chapter', () => {
  const story = createStarterWorkspace().stories[0], setting = story.worldbuilding[0], chapter = story.chapters[0];
  chapter.scenes[0].anchor = anchorText(manuscriptText(chapter.html), 0, 6);
  chapter.scenes[0].settingId = setting.id; setting.category = 'History';
  const trail = settingContinuity(chapter, story).trail;
  assert.equal(trail[0].status, 'recategorized'); assert.equal(trail[0].unavailableEntry.title, setting.title);
  story.worldbuilding = []; assert.equal(settingContinuity(chapter, story).trail[0].status, 'missing');
});

test('continuity sorts linked scenes by manuscript position and keeps unlinked scenes out of chronology', () => {
  const story = createStarterWorkspace().stories[0], chapter = story.chapters[0], shore = story.worldbuilding[0], town = createEntry('Town', 'Setting');
  story.worldbuilding.push(town);
  chapter.html = '<p>First scene.</p><p>Second scene.</p>';
  const text = manuscriptText(chapter.html), first = createScene('First'), second = createScene('Second'), unlinked = createScene('Unplaced');
  first.settingId = shore.id; first.anchor = anchorText(text, 0, 5);
  second.settingId = town.id; second.anchor = anchorText(text, text.indexOf('Second'), text.indexOf('Second') + 6);
  unlinked.settingId = shore.id; chapter.scenes = [second, unlinked, first];
  assert.deepEqual(sceneTimeline(chapter).linked.map((item) => item.scene.id), [first.id, second.id]);
  const continuity = settingContinuity(chapter, story);
  assert.deepEqual(continuity.trail.map((item) => item.setting.id), [shore.id, town.id]);
  assert.equal(continuity.trail[1].status, 'changed'); assert.equal(continuity.unlinked[0].scene.id, unlinked.id);
  const next = createChapter('Next'); story.chapters.push(next);
  assert.equal(settingContinuity(next, story).previousSetting.id, town.id);
  assert.equal(settingContinuity(next, story).previousUnlinkedCount, 1);
  assert.deepEqual(chapter.scenes.map((scene) => scene.id), [second.id, unlinked.id, first.id]);
});

test('scene viewing preserves edit timestamps and activity while authored scene edits still update them', () => {
  const story = createStarterWorkspace().stories[0], chapter = story.chapters[0], other = createScene('Second');
  chapter.scenes.push(other);
  const selected = chapterWithScenes(chapter, chapter.scenes, other.id, '2030-01-01T00:00:00.000Z');
  assert.equal(selected.updatedAt, chapter.updatedAt);
  assert.equal(describeStoryChange(story, { ...story, chapters: [selected] }), null);
  assert.equal(chapterWithScenes(selected, selected.scenes, other.id), selected);
  const edited = chapterWithScenes(selected, selected.scenes.map((scene) => scene.id === other.id ? { ...scene, continuityNotes: 'Evening' } : scene), other.id, '2030-01-01T00:00:00.000Z');
  assert.equal(edited.updatedAt, '2030-01-01T00:00:00.000Z');
  assert.equal(describeStoryChange(story, { ...story, chapters: [edited] }).action, 'Scene context updated');
});

test('print HTML and Word inherit the editor pixel size while explicit inline points retain their size', async () => {
  const dom = new JSDOM();
  const previous = { document: globalThis.document, XMLSerializer: globalThis.XMLSerializer };
  globalThis.document = dom.window.document; globalThis.XMLSerializer = dom.window.XMLSerializer;
  try {
    const story = createStarterWorkspace().stories[0]; story.chapters[0].fontSize = 16;
    story.chapters[0].html = '<p>Inherited <span style="font-size:18pt">Explicit</span></p>';
    assert.match(storyHtml(story), /font-size:16px/);
    const zip = await JSZip.loadAsync(await storyDocx(story)), xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /w:sz w:val="24"/); assert.match(xml, /w:sz w:val="36"/);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    dom.window.close();
  }
});
