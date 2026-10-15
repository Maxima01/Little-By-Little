import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createEntry, createStarterWorkspace, createStory } from '../src/domain/model.ts';
import { filterMentionCandidates, insertCharacterMention, mentionCandidates, mentionQuery, moveCharacterLinks, validCharacterLinks } from '../src/features/characters/lib/characterMentions.ts';
import { mentionCaret, readMentionEditor, renderMentionEditor, selectMentionText } from '../src/features/characters/lib/mentionEditor.ts';
import { isWorkspace, parseWorkspaceBackup } from '../src/features/workspace/lib/saveHistory.ts';

// Feature: verify @/ search works with multiword/Unicode names while email addresses stay plain text.
test('mention search uses the caret and ignores email addresses and existing chips', () => {
  assert.deepEqual(mentionQuery('Member of @/Harbour_Gu', 22), { start: 10, end: 22, query: 'Harbour_Gu' });
  assert.equal(mentionQuery('@Elin', 0), null);
  assert.equal(mentionQuery('Contact mara@example.com', 24), null);
  assert.equal(mentionQuery('@@Guild', 7), null);
  assert.equal(mentionQuery('An @Elin bond', 8, [{ targetId: 'elin', start: 3, end: 8 }]), null);
  assert.deepEqual(mentionQuery('Friend @Él', 10), { start: 7, end: 10, query: 'Él' });
  assert.equal(mentionQuery('Friend @Elin.', 13), null);
  const candidates = [{ id: 'g', title: 'Harbour Guild', description: '', kind: 'organization' }];
  assert.equal(filterMentionCandidates(candidates, 'harbour_gu')[0].id, 'g');
});

// Feature: shared organization entries and character profiles are separate, scoped candidate sources with stable IDs.
test('candidates exclude the current character and use descriptions from their real entry', () => {
  const story = createStory('Story');
  const mara = createEntry('Mara', 'Major'), elin = createEntry('Elin', 'Major'), duplicate = createEntry('Elin', 'Minor');
  elin.content = 'A harbour keeper.'; duplicate.characterProfile = { personality: 'An anxious sailor.' };
  const guild = createEntry('Harbour Guild', 'Organization'); guild.content = 'Maintains the harbour and protects its workers.';
  story.characters = [mara, elin, duplicate]; story.worldbuilding = [guild, createEntry('The quay', 'Setting')];
  assert.deepEqual(mentionCandidates(story, 'character', mara.id).map((entry) => entry.id), [elin.id, duplicate.id]);
  assert.equal(mentionCandidates(story, 'character', mara.id)[1].description, 'An anxious sailor.');
  assert.deepEqual(mentionCandidates(story, 'organization').map((entry) => entry.id), [guild.id]);
  guild.title = 'The Dock Union'; assert.equal(mentionCandidates(story, 'organization')[0].id, guild.id);
  assert.equal(mentionCandidates(story, 'organization')[0].title, 'The Dock Union');
  const faction = createEntry('Tide Wardens', 'Faction'); faction.worldProfile = { purpose: 'Protect the coast.' };
  const family = createEntry('House Vale', 'Family'); family.worldProfile = { origins: 'A family of lighthouse keepers.' };
  story.worldbuilding.push(faction, family);
  assert.deepEqual(mentionCandidates(story, 'organization').map((entry) => entry.description), ['Maintains the harbour and protects its workers.', 'Protect the coast.', 'A family of lighthouse keepers.']);
});

// Feature: mention insertion in the middle of prose preserves existing references and the rest of the sentence.
test('choosing a mention replaces only the typed query and retains surrounding linked text', () => {
  const text = '@Elin trusts @/har with her maps.';
  const links = [{ targetId: 'elin', start: 0, end: 5 }];
  const query = mentionQuery(text, 18, links);
  const next = insertCharacterMention(text, links, query, { id: 'guild', title: 'Harbour Guild', kind: 'organization', description: '' });
  assert.equal(next.value, '@Elin trusts @/Harbour Guild  with her maps.');
  assert.deepEqual(next.links, [{ targetId: 'elin', start: 0, end: 5 }, { targetId: 'guild', start: 13, end: 28 }]);
  assert.ok(validCharacterLinks(next.value, next.links));
});

// Feature: edits before or after a mention retain its binding; replacing part of a label removes only that binding.
test('text edits safely move or remove native link ranges', () => {
  const before = 'Friend @Elin returns.'; const links = [{ targetId: 'elin', start: 7, end: 12 }];
  assert.deepEqual(moveCharacterLinks(before, 'Close ' + before, links), [{ targetId: 'elin', start: 13, end: 18 }]);
  assert.deepEqual(moveCharacterLinks(before, before + ' Soon.', links), links);
  assert.deepEqual(moveCharacterLinks(before, 'Friend @Eli returns.', links), []);
  assert.deepEqual(moveCharacterLinks(before, 'Friend returns.', links), []);
});

// Feature: link metadata and organization descriptions travel through backups without requiring old profiles to migrate.
test('organizations and links roundtrip; overlapping, out-of-bounds and invalid ranges are rejected', () => {
  const workspace = createStarterWorkspace(); const story = workspace.stories[0];
  const organization = createEntry('Harbour Guild', 'Organization'); organization.content = 'A guild for sailors.'; story.worldbuilding.push(organization);
  const profile = { affiliations: '@/Harbour Guild', affiliationLinks: [{ targetId: organization.id, start: 0, end: 15 }] };
  story.characters[0].characterProfile = profile;
  assert.ok(isWorkspace(workspace)); assert.deepEqual(parseWorkspaceBackup(JSON.stringify(workspace)), workspace);
  const invalid = [null, {}, [{ targetId: '', start: 0, end: 15 }], [{ targetId: 'g', start: -1, end: 15 }], [{ targetId: 'g', start: 0, end: 100 }], [{ targetId: 'g', start: 0.5, end: 15 }], [{ targetId: 'g', start: 0, end: 0 }], [{ targetId: 'g', start: 1, end: 15 }], [{ targetId: 'g', start: 0, end: 15 }, { targetId: 'g', start: 0, end: 15 }]];
  for (const links of invalid) { profile.affiliationLinks = links; assert.equal(isWorkspace(workspace), false, JSON.stringify(links)); }
  profile.affiliationLinks = [{ targetId: 'deleted-entry', start: 0, end: 15 }]; assert.ok(isWorkspace(workspace));
});

// Feature: DOM serialization stores visible text and explicit references rather than rich or executable HTML.
test('inline mention DOM preserves multiline text, safe literal markup and entry identities', () => {
  const dom = new JSDOM('<div id="editor" contenteditable="true"></div>'); const root = dom.window.document.getElementById('editor');
  const value = 'Friend @<Elin>\nMember of @/Harbour Guild.';
  const links = [{ targetId: 'elin', start: 7, end: 14 }, { targetId: 'guild', start: 25, end: 40 }];
  renderMentionEditor(root, value, links);
  assert.equal(root.querySelector('elin'), null); assert.deepEqual(readMentionEditor(root), { value, links });
  assert.equal(root.querySelectorAll('[data-reference-id]').length, 2);
  root.prepend(dom.window.document.createTextNode('Dear '));
  assert.deepEqual(readMentionEditor(root).links, links.map((link) => ({ ...link, start: link.start + 5, end: link.end + 5 })));
  root.querySelector('[data-reference-id="elin"]').remove();
  assert.deepEqual(readMentionEditor(root).links.map((link) => link.targetId), ['guild']);
});

// Feature: middle-of-field and multiline caret positions match the text used by picker replacement.
test('DOM caret and range selection follow browser paragraph separators', () => {
  const dom = new JSDOM('<div id="editor" contenteditable="true">First line<div>Friend @El and more</div></div>'); const root = dom.window.document.getElementById('editor');
  assert.equal(readMentionEditor(root).value, 'First line\nFriend @El and more');
  assert.ok(selectMentionText(root, 18, 21));
  assert.equal(dom.window.document.getSelection().toString(), '@El');
  dom.window.document.getSelection().collapseToEnd();
  assert.equal(mentionCaret(root), 21);
});
