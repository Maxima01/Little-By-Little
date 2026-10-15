import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapter, createEntry, createStarterWorkspace, createStory, describeStoryChange, WORLD_GROUPS } from '../src/domain/model.ts';
import { isCharacterProfile } from '../src/features/characters/lib/characterProfile.ts';
import { mentionCandidates } from '../src/features/characters/lib/characterMentions.ts';
import { createWorkspaceStore, isWorkspace, parseWorkspaceBackup } from '../src/features/workspace/lib/saveHistory.ts';
import { isWorldProfile, settingChapters, worldMembers, worldReference, worldSummary } from '../src/features/world/lib/worldProfile.ts';

// Feature: comprehensive world profiles and explicit memberships survive saves, backups and older freeform entries.
test('world dossiers, events and memberships roundtrip without replacing legacy descriptions', async () => {
  const workspace = createStarterWorkspace(), story = workspace.stories[0];
  const original = story.worldbuilding[0].content;
  assert.ok(isWorkspace(workspace));
  assert.deepEqual(WORLD_GROUPS, ['Setting', 'History', 'Faction', 'Family', 'Organization']);
  story.worldbuilding[0].worldProfile = { geography: 'Rocky coast', atmosphere: 'Salt and fog', culture: 'Seafaring', dailyLife: 'Fishing', governance: 'Council', resources: 'Salt', rules: 'The tide remembers', history: 'Built a century ago' };
  const family = createEntry('House Grey', 'Family');
  family.worldProfile = { origins: 'Refugees', members: 'Mara and her aunt', lineage: 'Three branches', succession: 'Chosen heir', traditions: 'Annual homecoming', reputation: 'Secretive', holdings: 'The old house', alliances: 'Harbour guild', feuds: 'House Vale', authorNotes: 'Reveal the founding promise', events: [{ id: 'e', title: 'The founding', chapterId: story.chapters[0].id, storyTime: 'Year 12', details: 'They settle on the coast' }] };
  const faction = createEntry('Tidewatch', 'Faction'); faction.worldProfile = { purpose: 'Guard the coast', beliefs: 'Never abandon the shore', leadership: 'An elected captain', ranks: 'Watchers and scouts', recruitment: 'Open to sailors', territory: 'The bay', resources: 'Signal towers', alliances: 'The council', rivals: 'The raiders' };
  const history = createEntry('The flood', 'History'); history.worldProfile = { period: 'Year 11', causes: 'Broken sea wall', participants: 'Coastal villages', consequences: 'Migration', legacy: 'A yearly vigil' };
  const organization = createEntry('Harbour guild', 'Organization'); organization.worldProfile = { purpose: 'Manage shipping', structure: 'Trade council', membership: 'Apprenticeships', operations: 'Dock work', influence: 'Coastal trade' };
  story.worldbuilding.push(family, faction, history, organization);
  story.characters[0].characterProfile = { affiliations: 'Written loyalties', membershipIds: [family.id, faction.id] };
  assert.deepEqual(parseWorkspaceBackup(JSON.stringify(workspace)), workspace);
  let raw = null;
  const adapter = { read: async () => raw, write: async (value) => { raw = value; }, quarantine: async () => {} };
  const store = createWorkspaceStore(adapter); await store.load(); await store.save(workspace);
  const reloaded = await createWorkspaceStore(adapter).load();
  assert.deepEqual(reloaded.workspace, workspace);
  assert.equal(reloaded.workspace.stories[0].worldbuilding[0].content, original);
});

// Feature: invalid import shapes cannot break facts, event editing or membership selection.
test('world and membership metadata reject malformed fields, records and duplicate identities', () => {
  const workspace = createStarterWorkspace();
  for (const profile of [null, [], 'profile', { geography: 5 }, { authorNotes: [] }, { events: null }, { events: [null] },
    { events: [{ id: '', title: 'Event', chapterId: null, storyTime: '', details: '' }] },
    { events: [{ id: 'e', title: ' ', chapterId: null, storyTime: '', details: '' }] },
    { events: [{ id: 'e', title: 'Event', chapterId: '', storyTime: '', details: '' }] },
    { events: [{ id: 'e', title: 'Event', chapterId: null, storyTime: 2, details: '' }] },
    { events: [1, 2].map(() => ({ id: 'e', title: 'Event', chapterId: null, storyTime: '', details: '' })) },
  ]) {
    assert.equal(isWorldProfile(profile), false, JSON.stringify(profile));
    workspace.stories[0].worldbuilding[0].worldProfile = profile;
    assert.equal(isWorkspace(workspace), false, JSON.stringify(profile));
  }
  assert.ok(isWorldProfile({}));
  assert.ok(isWorldProfile({ events: [{ id: 'e', title: 'Event', chapterId: 'deleted', storyTime: '', details: '' }] }));
  for (const membershipIds of [null, 'group', [1], [''], ['a', 'a']]) assert.equal(isCharacterProfile({ membershipIds }), false);
  assert.ok(isCharacterProfile({ membershipIds: ['deleted'] }));
});

// Feature: only chosen IDs connect members; names, affiliation prose and inline references do not imply membership.
test('memberships distinguish duplicate names and survive group and character renames', () => {
  const story = createStory('Story'), family = createEntry('Grey', 'Family'), other = createEntry('Grey', 'Faction');
  const mara = createEntry('Mara', 'Major'), elin = createEntry('Elin', 'Minor');
  story.worldbuilding = [family, other]; story.characters = [mara, elin];
  mara.characterProfile = { membershipIds: [family.id] };
  elin.characterProfile = { affiliations: '@/Grey', affiliationLinks: [{ targetId: family.id, start: 0, end: 6 }] };
  assert.deepEqual(worldMembers(story, family).map((entry) => entry.id), [mara.id]);
  assert.deepEqual(worldMembers(story, other), []);
  family.title = 'House Grey'; mara.title = 'Mara Grey';
  assert.equal(worldMembers(story, family)[0].title, 'Mara Grey');
  family.category = 'Setting'; assert.deepEqual(worldMembers(story, family), []);
  family.category = 'Family'; assert.equal(worldMembers(story, family).length, 1);
  story.worldbuilding = []; assert.deepEqual(mara.characterProfile.membershipIds, [family.id]);
  mara.characterProfile.membershipIds = []; assert.deepEqual(worldMembers(story, family), []);
});

// Feature: setting connections follow explicit scene assignments in chapter order, excluding event-only references.
test('setting chapter references combine scene use and follow renaming, reordering and deletion', () => {
  const story = createStory('Story'), setting = createEntry('Coast', 'Setting');
  const first = createChapter('Arrival'), second = createChapter('Departure');
  first.scenes[0].settingId = setting.id; second.scenes[0].settingId = setting.id;
  story.chapters = [first, second];
  setting.worldProfile = { events: [{ id: 'e', title: 'A plan', chapterId: 'unassigned', storyTime: '', details: '' }] };
  assert.deepEqual(settingChapters(story, setting).map((item) => item.chapter.id), [first.id, second.id]);
  story.chapters.reverse(); second.title = 'Leaving home';
  assert.equal(settingChapters(story, setting)[0].chapter.title, 'Leaving home');
  assert.equal(settingChapters(story, setting)[0].chapterNumber, 1);
  second.scenes[0].settingId = null; story.chapters = [second];
  assert.deepEqual(settingChapters(story, setting), []);
});

// Feature: references expose structured setting facts without exposing author plans or overwriting detailed descriptions.
test('world references and collection summaries show facts, membership counts and saved events', () => {
  const story = createStory('Story'), setting = createEntry('Coast', 'Setting');
  setting.content = 'The old coast.'; setting.worldProfile = { geography: 'Rocky shore', rules: 'No boats after dusk', authorNotes: 'Secret twist' };
  assert.match(worldReference(setting), /The old coast/);
  assert.match(worldReference(setting), /Geography & landscape: Rocky shore/);
  assert.doesNotMatch(worldReference(setting), /Secret twist/);
  setting.content = ''; assert.match(worldSummary(story, setting), /Rocky shore/);
  const family = createEntry('House Grey', 'Family'); story.characters = [createEntry('Mara', 'Major')];
  story.characters[0].characterProfile = { membershipIds: [family.id] };
  family.worldProfile = { events: [{ id: 'e', title: 'Founding', chapterId: null, storyTime: '', details: '' }] };
  assert.match(worldSummary(story, family), /1 linked member · 1 key event/);
});

// Feature: profile-only world edits and membership changes appear in the activity history.
test('structured world facts and memberships create meaningful activity without changing chapter drafts', () => {
  const story = createStory('Story'); story.worldbuilding = [createEntry('Coast', 'Setting')]; story.characters = [createEntry('Mara', 'Major')];
  const changed = structuredClone(story); changed.worldbuilding[0].worldProfile = { atmosphere: 'Fog' };
  assert.equal(describeStoryChange(story, changed).action, 'Worldbuilding updated');
  assert.match(describeStoryChange(story, changed).details, /World profile/);
  assert.equal(describeStoryChange(changed, structuredClone(changed)), null);
  const member = structuredClone(changed); member.characters[0].characterProfile = { membershipIds: ['group'] };
  assert.equal(describeStoryChange(changed, member).action, 'Character updated');
  assert.deepEqual(member.chapters, story.chapters);
});

// Feature: existing @ affiliation search also discovers the newly added group categories.
test('affiliation suggestions include families, factions and organizations but exclude settings and history', () => {
  const story = createStory('Story'); story.worldbuilding = WORLD_GROUPS.map((category) => createEntry(category, category));
  assert.deepEqual(mentionCandidates(story, 'organization').map((item) => item.title), ['Faction', 'Family', 'Organization']);
});
