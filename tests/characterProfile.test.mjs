import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapter, createEntry, createStarterWorkspace, createStory, describeStoryChange } from '../src/domain/model.ts';
import { characterAppearances, characterSummary, isCharacterProfile } from '../src/features/characters/lib/characterProfile.ts';
import { createWorkspaceStore, isWorkspace, parseWorkspaceBackup } from '../src/features/workspace/lib/saveHistory.ts';

// Feature: verify old descriptions and fully populated dossiers survive backup validation and saving.
test('legacy character bodies and complete dossiers roundtrip through saves and backups', async () => {
  const workspace = createStarterWorkspace();
  const character = workspace.stories[0].characters[0];
  const original = character.content;
  assert.ok(isWorkspace(workspace));
  character.characterProfile = {
    height: '170 cm', weight: '60 kg', bodyType: 'Lean', physicalDetails: 'Grey eyes', personality: 'Reserved',
    relationships: 'A close friend of Elin', abilities: 'Navigation', status: 'Alive', references: 'A childhood friend',
    aliases: 'The Keeper', affiliations: 'Harbour guild', authorNotes: 'Returns in the finale', goal: 'Find home',
    motivation: 'Protect family', fear: 'Abandonment', flaw: 'Distrust', arc: 'Learns to accept help',
    appearances: [{ id: 'appearance-1', chapterId: workspace.stories[0].chapters[0].id, storyTime: 'Day one', note: 'At the harbour' }],
    events: [{ id: 'event-1', title: 'The return', chapterId: null, storyTime: 'Winter', details: 'Chooses to come home' }],
  };
  assert.deepEqual(parseWorkspaceBackup(JSON.stringify(workspace)), workspace);
  let raw = null;
  const adapter = { read: async () => raw, write: async (value) => { raw = value; }, quarantine: async () => {} };
  const store = createWorkspaceStore(adapter);
  await store.load(); await store.save(workspace);
  const reloaded = await createWorkspaceStore(adapter).load();
  assert.deepEqual(reloaded.workspace.stories[0].characters[0].characterProfile, character.characterProfile);
  assert.equal(reloaded.workspace.stories[0].characters[0].content, original);
});

// Feature: malformed imported metadata is rejected before rendering or entering version history.
test('dossier validation rejects malformed optional fields, status and repeated record identities', () => {
  const workspace = createStarterWorkspace();
  const invalid = [null, [], 'profile', { height: 170 }, { status: 'Zombie' }, { events: {} },
    { events: [{ id: 'e', title: ' ', chapterId: null, storyTime: '', details: '' }] },
    { events: [{ id: 'e', title: 'Event', chapterId: 1, storyTime: '', details: '' }] },
    { appearances: [{ id: '', chapterId: 'c', storyTime: '', note: '' }] },
    { appearances: [{ id: 'a', chapterId: '', storyTime: '', note: '' }] },
    { appearances: [{ id: 'a', chapterId: 'c', storyTime: 5, note: '' }] },
    { appearances: [1, 2].map(() => ({ id: 'a', chapterId: 'c', storyTime: '', note: '' })) },
    { events: [1, 2].map(() => ({ id: 'e', title: 'Event', chapterId: null, storyTime: '', details: '' })) },
  ];
  for (const profile of invalid) {
    assert.equal(isCharacterProfile(profile), false, JSON.stringify(profile));
    workspace.stories[0].characters[0].characterProfile = profile;
    assert.equal(isWorkspace(workspace), false, JSON.stringify(profile));
  }
  assert.equal(isCharacterProfile({}), true);
  for (const status of ['Unspecified', 'Alive', 'Dead', 'Missing', 'Unknown']) assert.ok(isCharacterProfile({ status }));
});

// Feature: chapter order defines the last appearance even after editing, renaming or reordering chapters.
test('last seen follows current manuscript order and combines scene presence with manual records', () => {
  const story = createStory('Story');
  const character = createEntry('Mara', 'Major'); story.characters = [character];
  const first = createChapter('The departure'); const second = createChapter('The return');
  first.updatedAt = '2026-10-12T12:00:00Z'; second.updatedAt = '2026-10-10T12:00:00Z';
  first.scenes[0].characterIds = [character.id];
  character.characterProfile = { status: 'Alive', appearances: [{ id: 'a', chapterId: second.id, storyTime: 'Winter', note: '' }, { id: 'b', chapterId: second.id, storyTime: 'Night', note: '' }] };
  story.chapters = [first, second];
  const ledger = characterAppearances(story, character);
  assert.equal(ledger.length, 2); assert.equal(ledger[0].scenes.length, 1); assert.equal(ledger[1].records.length, 2);
  assert.equal(ledger.at(-1).chapter.id, second.id);
  second.title = 'Home again'; assert.equal(characterSummary(story, character), 'Alive · Last seen: Home again');
  story.chapters.reverse(); assert.equal(characterAppearances(story, character).at(-1).chapter.id, first.id);
  assert.equal(characterAppearances(story, character).at(-1).chapterNumber, 2);
});

// Feature: off-page mentions and planned key events cannot incorrectly mark a character as present.
test('mentions, aliases and event chapter links do not imply an actual appearance', () => {
  const story = createStory('Story'); const character = createEntry('Mara', 'Major');
  const chapter = createChapter('A letter'); chapter.html = '<p>They spoke about Mara, the Keeper.</p>';
  character.characterProfile = { aliases: 'The Keeper', events: [{ id: 'e', title: 'Sends a letter', chapterId: chapter.id, storyTime: '', details: 'An off-page event' }] };
  story.chapters = [chapter]; story.characters = [character];
  assert.deepEqual(characterAppearances(story, character), []);
  assert.equal(characterSummary(story, character), 'No appearances recorded');
});

// Feature: deleted references remain recoverable without being used as the latest appearance.
test('deleted chapters and removed scene assignments disappear from the live ledger without data loss', () => {
  const story = createStory('Story'); const character = createEntry('Mara', 'Major');
  const chapter = createChapter('Departure'); chapter.scenes[0].characterIds = [character.id]; story.chapters = [chapter];
  character.characterProfile = { appearances: [{ id: 'a', chapterId: 'deleted', storyTime: 'Yesterday', note: 'Retained context' }] };
  assert.equal(characterAppearances(story, character).length, 1);
  chapter.scenes[0].characterIds = [];
  assert.deepEqual(characterAppearances(story, character), []);
  assert.equal(character.characterProfile.appearances.length, 1);
  assert.ok(isCharacterProfile(character.characterProfile));
});

// Feature: structured character changes appear in the story's existing meaningful activity timeline.
test('profile-only edits generate character activity while viewing does not', () => {
  const story = createStory('Story'); story.characters = [createEntry('Mara', 'Major')];
  const changed = structuredClone(story); changed.characters[0].characterProfile = { authorNotes: 'A future reveal' };
  assert.equal(describeStoryChange(story, changed).action, 'Character updated');
  assert.match(describeStoryChange(story, changed).details, /profile/);
  assert.equal(describeStoryChange(changed, structuredClone(changed)), null);
});
