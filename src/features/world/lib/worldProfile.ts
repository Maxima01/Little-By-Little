import type { EntryCategory, Story, StoryEntry, WorldProfile } from '../../../domain/model.ts';

export const HISTORY_LINK_KEYS = ['settingIds', 'participantCharacterIds', 'participantGroupIds'] as const;
export type HistoryLinkKey = typeof HISTORY_LINK_KEYS[number];
export type WorldTextKey = Exclude<keyof WorldProfile, 'events' | HistoryLinkKey>;
export type WorldField = { key: WorldTextKey; label: string; placeholder: string };
export type WorldFieldSection = { title: string; fields: WorldField[] };
export const MEMBERSHIP_CATEGORIES: EntryCategory[] = ['Faction', 'Family', 'Organization'];

// Feature: category-specific prompts guide comprehensive world-building without requiring any field.
export const WORLD_FIELDS: Partial<Record<EntryCategory, WorldFieldSection[]>> = {
  Setting: [
    { title: 'Place & atmosphere', fields: [
      { key: 'geography', label: 'Geography & landscape', placeholder: 'Location, terrain, climate, boundaries, and nearby places…' },
      { key: 'atmosphere', label: 'Atmosphere & sensory details', placeholder: 'What does it look, sound, smell, and feel like?' },
    ] },
    { title: 'Life in this setting', fields: [
      { key: 'culture', label: 'Culture', placeholder: 'Values, languages, customs, celebrations, and beliefs…' },
      { key: 'dailyLife', label: 'Daily life', placeholder: 'Work, food, housing, travel, and everyday routines…' },
      { key: 'governance', label: 'Governance', placeholder: 'Who governs, how decisions are made, and how laws are enforced…' },
    ] },
    { title: 'Resources, rules & history', fields: [
      { key: 'resources', label: 'Resources', placeholder: 'Trade, livelihoods, valuable materials, and shortages…' },
      { key: 'rules', label: 'Rules of the setting', placeholder: 'Natural or supernatural rules, limitations, costs, and exceptions…' },
      { key: 'history', label: 'Setting history', placeholder: 'How this place came to be and what shaped it…' },
    ] },
  ],
  Faction: [
    { title: 'Purpose & beliefs', fields: [
      { key: 'purpose', label: 'Purpose', placeholder: 'What does this faction want to achieve?' },
      { key: 'beliefs', label: 'Beliefs & ideology', placeholder: 'Shared convictions, values, and internal disagreements…' },
    ] },
    { title: 'People & power', fields: [
      { key: 'leadership', label: 'Leadership', placeholder: 'Who leads, how they are chosen, and how power changes hands…' },
      { key: 'ranks', label: 'Ranks & hierarchy', placeholder: 'Ranks, responsibilities, branches, and chains of command…' },
      { key: 'recruitment', label: 'Recruitment', placeholder: 'Who can join, entry requirements, and obligations…' },
      { key: 'territory', label: 'Territory', placeholder: 'Where they operate, their strongholds, and contested areas…' },
      { key: 'resources', label: 'Resources', placeholder: 'Funding, equipment, skills, and sources of power…' },
    ] },
    { title: 'Connections & conflicts', fields: [
      { key: 'alliances', label: 'Alliances', placeholder: 'Allies, agreements, and what holds them together…' },
      { key: 'rivals', label: 'Rivals', placeholder: 'Opponents, competing interests, and ongoing conflicts…' },
    ] },
  ],
  Family: [
    { title: 'Origins & lineage', fields: [
      { key: 'origins', label: 'Family origins', placeholder: 'Where this family came from and its founding story…' },
      { key: 'members', label: 'Family members & roles', placeholder: 'Relatives, family roles, and members without character profiles…' },
      { key: 'lineage', label: 'Lineage', placeholder: 'Generations, family branches, ancestry, and kinship…' },
      { key: 'succession', label: 'Succession & inheritance', placeholder: 'How leadership, titles, property, and obligations pass on…' },
    ] },
    { title: 'Identity & holdings', fields: [
      { key: 'traditions', label: 'Family traditions', placeholder: 'Customs, values, rituals, and expectations…' },
      { key: 'reputation', label: 'Reputation', placeholder: 'How others see them and what they are known for…' },
      { key: 'holdings', label: 'Family holdings', placeholder: 'Homes, land, businesses, wealth, and heirlooms…' },
    ] },
    { title: 'Connections & conflicts', fields: [
      { key: 'alliances', label: 'Alliances', placeholder: 'Marriage ties, friendships, agreements, and obligations…' },
      { key: 'feuds', label: 'Family feuds', placeholder: 'Rivalries, disputes, estrangements, and their origins…' },
    ] },
  ],
  History: [
    { title: 'Time & causes', fields: [
      { key: 'period', label: 'Time period', placeholder: 'When it happened, its duration, and the calendar used…' },
      { key: 'causes', label: 'Causes', placeholder: 'What led to this event or era?' },
      { key: 'participants', label: 'Participants', placeholder: 'People, factions, families, and places involved…' },
    ] },
    { title: 'Consequences & legacy', fields: [
      { key: 'consequences', label: 'Consequences', placeholder: 'Immediate outcomes and changes to the world…' },
      { key: 'legacy', label: 'Legacy', placeholder: 'Lasting effects, conflicting accounts, and how it is remembered…' },
    ] },
  ],
  Organization: [
    { title: 'Purpose & structure', fields: [
      { key: 'purpose', label: 'Purpose', placeholder: 'Why this organization exists and what it does…' },
      { key: 'structure', label: 'Organization structure', placeholder: 'Leadership, departments, roles, and decision-making…' },
      { key: 'membership', label: 'Membership requirements', placeholder: 'Who belongs, how they join, and their responsibilities…' },
    ] },
    { title: 'Operations & influence', fields: [
      { key: 'operations', label: 'Operations', placeholder: 'Activities, methods, locations, and day-to-day work…' },
      { key: 'influence', label: 'Influence', placeholder: 'Who they affect, their reach, and their relationships with other groups…' },
    ] },
  ],
};

// Feature: world metadata is validated before backups or saved versions can enter an editor.
export function isWorldProfile(value: unknown): value is WorldProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  const keys = new Set(['authorNotes', ...Object.values(WORLD_FIELDS).flatMap((sections) => sections.flatMap((section) => section.fields.map((field) => field.key)))]);
  if (![...keys].every((key) => profile[key] === undefined || typeof profile[key] === 'string')) return false;
  // Feature: imports retain unavailable history links but reject malformed or duplicate target IDs.
  if (!HISTORY_LINK_KEYS.every((key) => profile[key] === undefined || (Array.isArray(profile[key]) && profile[key].every((id) => typeof id === 'string' && !!id) && new Set(profile[key]).size === profile[key].length))) return false;
  if (profile.events === undefined) return true;
  if (!Array.isArray(profile.events)) return false;
  return profile.events.every((event) => event && typeof event === 'object' && !Array.isArray(event)
    && typeof event.id === 'string' && !!event.id && typeof event.title === 'string' && !!event.title.trim()
    && (event.chapterId === null || (typeof event.chapterId === 'string' && !!event.chapterId))
    && typeof event.storyTime === 'string' && typeof event.details === 'string')
    && new Set(profile.events.map((event) => event.id)).size === profile.events.length;
}

// Feature: group membership is explicit; matching names or freeform affiliation notes never assign a character.
export function worldMembers(story: Story, group: StoryEntry) {
  return MEMBERSHIP_CATEGORIES.includes(group.category) ? story.characters.filter((character) => character.characterProfile?.membershipIds?.includes(group.id)) : [];
}

// Feature: settings expose actual scene use in manuscript order without inferring presence from text or events.
export function settingChapters(story: Story, entry: StoryEntry) {
  return entry.category === 'Setting' ? story.chapters.flatMap((chapter, index) => {
    const scenes = (chapter.scenes ?? []).filter((scene) => scene.settingId === entry.id);
    return scenes.length ? [{ chapter, chapterNumber: index + 1, scenes }] : [];
  }) : [];
}

// Feature: collection previews and chapter context can show structured facts even before a long description is written.
export function worldReference(entry: StoryEntry) {
  return [entry.content.trim(), ...(WORLD_FIELDS[entry.category] ?? []).flatMap((section) => section.fields.flatMap((field) => {
    const value = entry.worldProfile?.[field.key]?.trim();
    return value ? [`${field.label}: ${value}`] : [];
  }))].filter(Boolean).join('\n\n');
}

// Feature: world rows summarize authored connections and events while keeping a useful description preview.
export function worldSummary(story: Story, entry: StoryEntry) {
  const members = worldMembers(story, entry), chapters = settingChapters(story, entry), events = entry.worldProfile?.events ?? [];
  return [MEMBERSHIP_CATEGORIES.includes(entry.category) ? `${members.length} linked ${members.length === 1 ? 'member' : 'members'}` : '',
    chapters.length ? `${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}` : '',
    events.length ? `${events.length} key ${events.length === 1 ? 'event' : 'events'}` : '', worldReference(entry) || 'Add notes and details…'].filter(Boolean).join(' · ');
}

// Feature: inverse history links follow saved IDs and only active History entries appear on related profiles.
export function relatedHistory(story: Story, entryId: string, kind: 'character' | 'world') {
  return story.worldbuilding.filter((entry) => entry.category === 'History' && (kind === 'character'
    ? entry.worldProfile?.participantCharacterIds?.includes(entryId)
    : entry.worldProfile?.settingIds?.includes(entryId) || entry.worldProfile?.participantGroupIds?.includes(entryId)));
}

// Feature: a type-change preview reports facts hidden by the new form and references that become unavailable.
export function worldTypeImpact(story: Story, entry: StoryEntry, category: EntryCategory) {
  const nextKeys = new Set((WORLD_FIELDS[category] ?? []).flatMap((section) => section.fields.map((field) => field.key)));
  const allFields = new Map(Object.values(WORLD_FIELDS).flatMap((sections) => sections.flatMap((section) => section.fields.map((field) => [field.key, field.label] as const))));
  const hiddenFacts = [...allFields].filter(([key]) => !nextKeys.has(key) && !!entry.worldProfile?.[key]?.trim()).map(([, label]) => label);
  const scenes = category !== 'Setting' ? story.chapters.flatMap((chapter) => (chapter.scenes ?? []).filter((scene) => scene.settingId === entry.id).map((scene) => `${chapter.title}: ${scene.title}`)) : [];
  const members = !MEMBERSHIP_CATEGORIES.includes(category) ? story.characters.filter((character) => character.characterProfile?.membershipIds?.includes(entry.id)).map((character) => character.title) : [];
  const affiliations = !MEMBERSHIP_CATEGORIES.includes(category) ? story.characters.filter((character) => character.characterProfile?.affiliationLinks?.some((link) => link.targetId === entry.id)).map((character) => character.title) : [];
  const history = story.worldbuilding.filter((item) => item.category === 'History' && ((category !== 'Setting' && item.worldProfile?.settingIds?.includes(entry.id)) || (!MEMBERSHIP_CATEGORIES.includes(category) && item.worldProfile?.participantGroupIds?.includes(entry.id)))).map((item) => item.title);
  const hidesHistoryLinks = entry.category === 'History' && category !== 'History' && HISTORY_LINK_KEYS.some((key) => entry.worldProfile?.[key]?.length);
  return { hiddenFacts, scenes, members, affiliations, history, hidesHistoryLinks };
}
