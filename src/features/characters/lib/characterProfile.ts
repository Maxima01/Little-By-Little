import type { CharacterProfile, Story, StoryEntry } from '../../../domain/model.ts';
import { validCharacterLinks } from './characterMentions.ts';

export const CHARACTER_STATUSES = ['Unspecified', 'Alive', 'Dead', 'Missing', 'Unknown'] as const;
export const CHARACTER_TEXT_FIELDS = ['height', 'weight', 'bodyType', 'physicalDetails', 'personality', 'relationships', 'abilities', 'references', 'aliases', 'affiliations', 'authorNotes', 'goal', 'motivation', 'fear', 'flaw', 'arc'] as const;

// Feature: validates optional dossiers on import without requiring migration of existing character notes.
export function isCharacterProfile(value: unknown): value is CharacterProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  const text = (item: unknown) => typeof item === 'string';
  // Feature: repeated records need stable, unique identities so editing one cannot overwrite another.
  const records = (items: unknown, validate: (item: Record<string, unknown>) => boolean) => items === undefined || (Array.isArray(items) && items.every((item) => object(item) && text(item.id) && !!item.id && validate(item)) && new Set(items.map((item) => item.id)).size === items.length);
  return CHARACTER_TEXT_FIELDS.every((key) => profile[key] === undefined || text(profile[key]))
    && (profile.status === undefined || CHARACTER_STATUSES.includes(profile.status as typeof CHARACTER_STATUSES[number]))
    && records(profile.appearances, (item) => text(item.chapterId) && !!item.chapterId && text(item.storyTime) && text(item.note))
    && records(profile.events, (item) => text(item.title) && !!(item.title as string).trim() && (item.chapterId === null || (text(item.chapterId) && !!item.chapterId)) && text(item.storyTime) && text(item.details))
    // Feature: validate linked ranges without requiring their targets to still exist in the story.
    && (profile.relationshipLinks === undefined || validCharacterLinks(profile.relationships ?? '', profile.relationshipLinks))
    && (profile.affiliationLinks === undefined || validCharacterLinks(profile.affiliations ?? '', profile.affiliationLinks))
    // Feature: membership imports allow deleted group references but reject duplicates and malformed IDs.
    && (profile.membershipIds === undefined || (Array.isArray(profile.membershipIds) && profile.membershipIds.every((id) => text(id) && !!id) && new Set(profile.membershipIds).size === profile.membershipIds.length));
}

// Feature: actual scene assignments and manual records form a chapter ledger in manuscript order, never edit-date order.
export function characterAppearances(story: Story, character: StoryEntry) {
  return story.chapters.flatMap((chapter, index) => {
    const scenes = (chapter.scenes ?? []).filter((scene) => scene.characterIds.includes(character.id));
    const records = (character.characterProfile?.appearances ?? []).filter((appearance) => appearance.chapterId === chapter.id);
    return scenes.length || records.length ? [{ chapter, chapterNumber: index + 1, scenes, records }] : [];
  });
}

// Feature: cast summaries keep life status and the latest confirmed appearance visible before opening a dossier.
export function characterSummary(story: Story, character: StoryEntry) {
  const appearances = characterAppearances(story, character);
  const latest = appearances.at(-1);
  return [character.characterProfile?.status && character.characterProfile.status !== 'Unspecified' ? character.characterProfile.status : '', latest ? `Last seen: ${latest.chapter.title}` : 'No appearances recorded'].filter(Boolean).join(' · ');
}
