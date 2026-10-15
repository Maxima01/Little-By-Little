import { manuscriptText } from '../features/editor/lib/manuscriptText.ts';

// Portable workspace data lives here; keep optional additions compatible with older JSON backups.
export type SectionKey = 'chapters' | 'characters' | 'worldbuilding' | 'art' | 'notes' | 'research';
export type EntryCategory = 'Major' | 'Minor' | 'Side character' | 'Setting' | 'History' | 'Faction' | 'Family' | 'Organization' | 'Reference';
export type WritingFontFamily = 'Georgia' | 'Arial' | 'Courier New';
export type WritingBlockStyle = 'Paragraph' | 'Heading 1' | 'Heading 2' | 'Heading 3' | 'Quote';
export type WritingAlignment = 'left' | 'center' | 'right' | 'justify';

// Feature: chapter-level writing preferences keep optional assistance consistent after reopening a draft.
export type WritingPreferences = { grammarSuggestions: boolean; autoCapitalizeI: boolean };

// Feature: text anchors keep passage notes and scene boundaries attached to visible manuscript text.
export type TextAnchor = { start: number; end: number; quote: string; prefix: string; suffix: string; detached?: boolean };
export type PassageTask = { id: string; note: string; anchor: TextAnchor; completed: boolean; createdAt: string };
// Feature: a story-wide style guide distinguishes accepted aliases/vocabulary from spelling corrections.
export type StyleRule = { id: string; kind: 'alias' | 'vocabulary' | 'spelling' | 'capitalization'; preferred: string; variants: string[]; note: string; characterId?: string };
export type StyleGuide = { rules: StyleRule[]; conventions: string; quoteStyle: 'any' | 'curly' | 'straight'; dashStyle: 'any' | 'em' | 'spaced-en'; ellipsisStyle: 'any' | 'character' | 'dots' };
export type ProsePreferences = { repetitions: boolean; openings: boolean; phrases: boolean; lengths: boolean; windowWords: number; longSentenceWords: number; overusedPhrases: string[] };
export const DEFAULT_PROSE: ProsePreferences = { repetitions: true, openings: true, phrases: true, lengths: true, windowWords: 80, longSentenceWords: 35, overusedPhrases: ['all of a sudden', 'for a moment', 'began to', 'started to'] };
export const DEFAULT_STYLE: StyleGuide = { rules: [], conventions: '', quoteStyle: 'any', dashStyle: 'any', ellipsisStyle: 'any' };

export type Chapter = {
  id: string;
  title: string;
  html: string;
  updatedAt: string;
  fontFamily?: WritingFontFamily;
  fontSize?: number;
  scenes?: ChapterScene[];
  activeSceneId?: string;
  writingPreferences?: WritingPreferences;
  // Feature: revision tasks, review ignores and optional writing/release targets travel with backups.
  passageTasks?: PassageTask[];
  ignoredProofreading?: string[];
  chapterGoal?: number;
  releaseStatus?: 'draft' | 'complete' | 'released';
  releaseDate?: string;
};

export type ChapterScene = {
  id: string;
  title: string;
  settingId: string | null;
  characterIds: string[];
  // Feature: authors can record intentional location changes and details to carry between scenes.
  continuityNotes?: string;
  // Feature: outline records locate a real passage and carry viewpoint and synopsis alongside the setting.
  anchor?: TextAnchor;
  viewpoint?: string;
  synopsis?: string;
};

export type StoryEntry = {
  id: string;
  title: string;
  content: string;
  category: EntryCategory;
  updatedAt: string;
  // Feature: optional character dossiers preserve older freeform entries and travel with workspace backups.
  characterProfile?: CharacterProfile;
  // Feature: optional world dossiers add category-specific facts while preserving existing descriptions.
  worldProfile?: WorldProfile;
};

// Feature: world events hold authored history with an optional manuscript chapter and story-time reference.
export type WorldEvent = { id: string; title: string; chapterId: string | null; storyTime: string; details: string };
// Feature: shared optional fields allow recategorising a world entry without discarding its previous facts.
export type WorldProfile = {
  geography?: string; atmosphere?: string; culture?: string; dailyLife?: string;
  governance?: string; resources?: string; rules?: string; history?: string;
  purpose?: string; beliefs?: string; leadership?: string; ranks?: string;
  recruitment?: string; territory?: string; alliances?: string; rivals?: string;
  origins?: string; members?: string; lineage?: string; succession?: string;
  traditions?: string; reputation?: string; holdings?: string; feuds?: string;
  period?: string; causes?: string; participants?: string; consequences?: string; legacy?: string;
  structure?: string; membership?: string; operations?: string; influence?: string;
  authorNotes?: string; events?: WorldEvent[];
  // Feature: optional history links separate places, characters and groups while preserving authored text.
  settingIds?: string[]; participantCharacterIds?: string[]; participantGroupIds?: string[];
};

// Feature: appearances record an actual chapter presence, with optional time and context in the story.
export type CharacterAppearance = { id: string; chapterId: string; storyTime: string; note: string };
// Feature: expandable character events keep participation details and an optional chapter reference together.
export type CharacterEvent = { id: string; title: string; chapterId: string | null; storyTime: string; details: string };
export type CharacterStatus = 'Unspecified' | 'Alive' | 'Dead' | 'Missing' | 'Unknown';
// Feature: inline mentions bind visible text ranges to a saved entry ID, surviving duplicate names and renames.
export type CharacterLink = { targetId: string; start: number; end: number };
// Feature: structured reference fields, author plans and character arcs sit alongside the existing detailed body.
export type CharacterProfile = {
  height?: string; weight?: string; bodyType?: string; physicalDetails?: string;
  personality?: string; relationships?: string; abilities?: string; status?: CharacterStatus;
  references?: string; aliases?: string; affiliations?: string; authorNotes?: string;
  goal?: string; motivation?: string; fear?: string; flaw?: string; arc?: string;
  appearances?: CharacterAppearance[]; events?: CharacterEvent[];
  relationshipLinks?: CharacterLink[]; affiliationLinks?: CharacterLink[];
  // Feature: explicit memberships use group IDs and remain separate from written affiliation notes.
  membershipIds?: string[];
};

export type StoryActivity = {
  id: string;
  action: string;
  targetId: string;
  targetTitle: string;
  details: string;
  createdAt: string;
};

export type Story = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  chapters: Chapter[];
  characters: StoryEntry[];
  worldbuilding: StoryEntry[];
  art: StoryEntry[];
  notes: StoryEntry[];
  research: StoryEntry[];
  activity?: StoryActivity[];
  // Feature: optional navigation and example metadata survive reloads and older backups.
  lastOpenedChapterId?: string;
  isExample?: boolean;
  // Feature: shared editorial choices and prose signals apply consistently across every chapter.
  styleGuide?: StyleGuide;
  prosePreferences?: ProsePreferences;
  sessionGoal?: { target: number; baseline: number; startedAt: string };
};

// Backup schema version is separate from the local save-history wrapper's format/revision.
export type Workspace = {
  version: 1;
  stories: Story[];
  updatedAt: string;
  // Feature: wide context visibility and narrow expansion are remembered independently.
  contextVisibility?: { wide?: boolean; narrow?: boolean };
};

export const SECTION_INFO: Record<SectionKey, { title: string; subtitle: string; icon: string }> = {
  chapters: { title: 'Chapters', subtitle: 'Write the pages of your story.', icon: '▤' },
  characters: { title: 'Characters', subtitle: 'Keep the people in your story close.', icon: '◉' },
  worldbuilding: { title: 'World Building', subtitle: 'Settings, history, factions, families, and organizations.', icon: '⌂' },
  art: { title: 'Art', subtitle: 'Visual references and inspiration.', icon: '▧' },
  notes: { title: 'Notes', subtitle: 'Small ideas worth keeping.', icon: '✎' },
  research: { title: 'Research', subtitle: 'Sources and details to return to.', icon: '⌕' },
};

export const CHARACTER_GROUPS: EntryCategory[] = ['Major', 'Minor', 'Side character'];
// Feature: factions and families have their own profiles alongside existing settings, history and organizations.
export const WORLD_GROUPS: EntryCategory[] = ['Setting', 'History', 'Faction', 'Family', 'Organization'];

export function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createStory(title: string): Story {
  const now = new Date().toISOString();
  return {
    id: createId(), title, description: '', createdAt: now, updatedAt: now,
    chapters: [], characters: [], worldbuilding: [], art: [], notes: [], research: [],
    activity: [{ id: createId(), action: 'Story created', targetId: '', targetTitle: title, details: 'A new writing space was created.', createdAt: now }],
  };
}

// Summarizes one meaningful story mutation for the local activity timeline.
export function describeStoryChange(before: Story, after: Story): Omit<StoryActivity, 'id' | 'createdAt'> | null {
  if (before.title !== after.title) return { action: 'Story renamed', targetId: after.id, targetTitle: after.title, details: `Now “${after.title}”` };
  if (before.description !== after.description) return { action: 'Story premise updated', targetId: after.id, targetTitle: after.title, details: `Description · ${before.description.trim().split(/\s+/).filter(Boolean).length} → ${after.description.trim().split(/\s+/).filter(Boolean).length} words` };

  // Feature: editorial settings and goals appear in the local activity timeline without changing chapter edit order.
  if (JSON.stringify(before.styleGuide) !== JSON.stringify(after.styleGuide)) return { action: 'Project style guide updated', targetId: after.id, targetTitle: after.title, details: 'Spelling, aliases or punctuation conventions saved.' };
  if (JSON.stringify(before.prosePreferences) !== JSON.stringify(after.prosePreferences)) return { action: 'Prose analysis configured', targetId: after.id, targetTitle: after.title, details: 'Fiction signals and thresholds saved.' };
  if (JSON.stringify(before.sessionGoal) !== JSON.stringify(after.sessionGoal)) return { action: 'Session target updated', targetId: after.id, targetTitle: after.title, details: after.sessionGoal ? `${after.sessionGoal.target} net words` : 'Session target ended.' };

  const beforeChapterIds = before.chapters.map((chapter) => chapter.id);
  const afterChapterIds = after.chapters.map((chapter) => chapter.id);
  const addedChapter = after.chapters.find((chapter) => !beforeChapterIds.includes(chapter.id));
  if (addedChapter) return { action: 'Chapter created', targetId: addedChapter.id, targetTitle: addedChapter.title, details: 'A new chapter was added to the story.' };
  const deletedChapter = before.chapters.find((chapter) => !afterChapterIds.includes(chapter.id));
  if (deletedChapter) return { action: 'Chapter deleted', targetId: deletedChapter.id, targetTitle: deletedChapter.title, details: 'The chapter was removed from the story.' };
  if (beforeChapterIds.join('|') !== afterChapterIds.join('|')) return { action: 'Chapters reordered', targetId: after.id, targetTitle: after.title, details: after.chapters.map((chapter) => chapter.title).join(' → ') };

  for (const nextChapter of after.chapters) {
    const oldChapter = before.chapters.find((chapter) => chapter.id === nextChapter.id);
    if (!oldChapter) continue;
    if (oldChapter.title !== nextChapter.title) return { action: 'Chapter renamed', targetId: nextChapter.id, targetTitle: nextChapter.title, details: `Now “${nextChapter.title}”` };
    if (oldChapter.html !== nextChapter.html) return { action: 'Chapter draft edited', targetId: nextChapter.id, targetTitle: nextChapter.title, details: `Draft · ${countWords(oldChapter.html).toLocaleString()} → ${countWords(nextChapter.html).toLocaleString()} words` };
    if (oldChapter.fontFamily !== nextChapter.fontFamily || oldChapter.fontSize !== nextChapter.fontSize) {
      return { action: 'Chapter formatting changed', targetId: nextChapter.id, targetTitle: nextChapter.title, details: `${nextChapter.fontFamily ?? 'Georgia'} · ${nextChapter.fontSize ?? 16} px` };
    }
    if (JSON.stringify(oldChapter.writingPreferences) !== JSON.stringify(nextChapter.writingPreferences)) {
      return { action: 'Writing tools updated', targetId: nextChapter.id, targetTitle: nextChapter.title, details: 'Grammar and capitalization preferences saved.' };
    }
    if (JSON.stringify(oldChapter.passageTasks) !== JSON.stringify(nextChapter.passageTasks)) return { action: 'Passage tasks updated', targetId: nextChapter.id, targetTitle: nextChapter.title, details: `${(nextChapter.passageTasks ?? []).filter((task) => !task.completed).length} unresolved tasks` };
    if (oldChapter.chapterGoal !== nextChapter.chapterGoal) return { action: 'Chapter target updated', targetId: nextChapter.id, targetTitle: nextChapter.title, details: nextChapter.chapterGoal ? `${nextChapter.chapterGoal} words` : 'Target removed.' };
    if (oldChapter.releaseStatus !== nextChapter.releaseStatus || oldChapter.releaseDate !== nextChapter.releaseDate) return { action: 'Release plan updated', targetId: nextChapter.id, targetTitle: nextChapter.title, details: `${nextChapter.releaseStatus ?? 'draft'}${nextChapter.releaseDate ? ' / ' + nextChapter.releaseDate : ''}` };
    const oldScenes = oldChapter.scenes ?? [];
    const nextScenes = nextChapter.scenes ?? [];
    const oldSceneIds = oldScenes.map((scene) => scene.id);
    const nextSceneIds = nextScenes.map((scene) => scene.id);
    const addedScene = nextScenes.find((scene) => !oldSceneIds.includes(scene.id));
    if (addedScene) return { action: 'Scene added', targetId: nextChapter.id, targetTitle: nextChapter.title, details: addedScene.title };
    const removedScene = oldScenes.find((scene) => !nextSceneIds.includes(scene.id));
    if (removedScene) return { action: 'Scene removed', targetId: nextChapter.id, targetTitle: nextChapter.title, details: removedScene.title };
    // Feature: selecting the current scene is remembered navigation and does not create an edit activity.
    for (const scene of nextScenes) {
      const oldScene = oldScenes.find((candidate) => candidate.id === scene.id);
      if (!oldScene) continue;
      if (oldScene.title !== scene.title) return { action: 'Scene renamed', targetId: nextChapter.id, targetTitle: nextChapter.title, details: `Now “${scene.title}”` };
      if (oldScene.settingId !== scene.settingId || oldScene.characterIds.join('|') !== scene.characterIds.join('|') || oldScene.continuityNotes !== scene.continuityNotes || oldScene.viewpoint !== scene.viewpoint || oldScene.synopsis !== scene.synopsis || JSON.stringify(oldScene.anchor) !== JSON.stringify(scene.anchor)) {
        return { action: 'Scene context updated', targetId: nextChapter.id, targetTitle: nextChapter.title, details: `${scene.title} · ${scene.settingId ? 'setting assigned' : 'no setting'} · ${scene.characterIds.length} characters` };
      }
    }
  }

  const collections: { key: Exclude<SectionKey, 'chapters'>; label: string }[] = [
    { key: 'characters', label: 'Character' }, { key: 'worldbuilding', label: 'Worldbuilding' },
    { key: 'art', label: 'Art reference' }, { key: 'notes', label: 'Note' }, { key: 'research', label: 'Research item' },
  ];
  for (const { key, label } of collections) {
    const previous = before[key];
    const next = after[key];
    const previousIds = previous.map((entry) => entry.id);
    const nextIds = next.map((entry) => entry.id);
    const added = next.find((entry) => !previousIds.includes(entry.id));
    if (added) return { action: `${label} added`, targetId: added.id, targetTitle: added.title, details: `Added to ${key === 'worldbuilding' ? 'world building' : key}.` };
    const deleted = previous.find((entry) => !nextIds.includes(entry.id));
    if (deleted) return { action: `${label} deleted`, targetId: deleted.id, targetTitle: deleted.title, details: `Removed from ${key === 'worldbuilding' ? 'world building' : key}.` };
    for (const entry of next) {
      const oldEntry = previous.find((candidate) => candidate.id === entry.id);
      if (!oldEntry || (oldEntry.title === entry.title && oldEntry.content === entry.content && oldEntry.category === entry.category && JSON.stringify(oldEntry.characterProfile) === JSON.stringify(entry.characterProfile) && JSON.stringify(oldEntry.worldProfile) === JSON.stringify(entry.worldProfile))) continue;
      const changed: string[] = [];
      if (oldEntry.title !== entry.title) changed.push(`Title → “${entry.title}”`);
      if (oldEntry.content !== entry.content) changed.push(`Details · ${oldEntry.content.trim().split(/\s+/).filter(Boolean).length} → ${entry.content.trim().split(/\s+/).filter(Boolean).length} words`);
      if (oldEntry.category !== entry.category) changed.push(`Category · ${oldEntry.category} → ${entry.category}`);
      // Feature: dossier edits participate in the same autosave activity history as character descriptions.
      if (JSON.stringify(oldEntry.characterProfile) !== JSON.stringify(entry.characterProfile)) changed.push('Character profile, appearances or key events updated');
      // Feature: world facts, author plans and key events participate in the story activity timeline.
      if (JSON.stringify(oldEntry.worldProfile) !== JSON.stringify(entry.worldProfile)) changed.push('World profile or key events updated');
      return { action: `${label} updated`, targetId: entry.id, targetTitle: entry.title, details: changed.join(' · ') };
    }
  }
  return null;
}

// Keeps repeated keystroke-level updates together as one recent activity item.
export function appendStoryActivity(activity: StoryActivity[] = [], event: Omit<StoryActivity, 'id' | 'createdAt'>, now = new Date().toISOString()) {
  const latest = activity[0];
  if (latest && latest.action === event.action && latest.targetId === event.targetId && Date.parse(now) - Date.parse(latest.createdAt) < 60_000) {
    return [{ ...latest, ...event, createdAt: now }, ...activity.slice(1)];
  }
  return [{ id: createId(), ...event, createdAt: now }, ...activity].slice(0, 50);
}

// Builds a useful timeline for older stories that predate activity recording.
export function getStoryActivity(story: Story): StoryActivity[] {
  if (story.activity?.length) return story.activity;
  const history: StoryActivity[] = [{ id: `created-${story.id}`, action: 'Story created', targetId: story.id, targetTitle: story.title, details: 'A writing space was created.', createdAt: story.createdAt }];
  story.chapters.forEach((chapter) => history.push({ id: `chapter-${chapter.id}`, action: 'Chapter on file', targetId: chapter.id, targetTitle: chapter.title, details: `${countWords(chapter.html).toLocaleString()} words`, createdAt: chapter.updatedAt }));
  for (const { key, label } of [
    { key: 'characters' as const, label: 'Character on file' }, { key: 'worldbuilding' as const, label: 'Worldbuilding on file' },
    { key: 'art' as const, label: 'Art reference on file' }, { key: 'notes' as const, label: 'Note on file' }, { key: 'research' as const, label: 'Research item on file' },
  ]) story[key].forEach((entry) => history.push({ id: `${key}-${entry.id}`, action: label, targetId: entry.id, targetTitle: entry.title, details: entry.content ? `${entry.content.trim().split(/\s+/).filter(Boolean).length} words` : 'Saved in this story.', createdAt: entry.updatedAt }));
  return history.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 50);
}

export function createChapter(title: string): Chapter {
  const scene = createScene('Scene 1');
  return { id: createId(), title, html: '<p></p>', updatedAt: new Date().toISOString(), fontFamily: 'Georgia', fontSize: 16, scenes: [scene], activeSceneId: scene.id };
}

// Creates a named scene record for the setting and cast tracked inside a chapter.
export function createScene(title: string): ChapterScene {
  return { id: createId(), title, settingId: null, characterIds: [] };
}

export function createEntry(title: string, category: EntryCategory = 'Reference'): StoryEntry {
  return { id: createId(), title, content: '', category, updatedAt: new Date().toISOString() };
}

export function createStarterWorkspace(): Workspace {
  const now = new Date().toISOString();
  const story = createStory('The House by the Sea');
  story.isExample = true;
  story.description = 'A story about returning home, old promises, and the things the tide brings back.';
  story.createdAt = now;
  story.updatedAt = now;
  const chapter = createChapter('Chapter One');
  chapter.html = '<p>By the time the fog lifted, the house had turned its windows toward her.</p><p>Mara stopped at the edge of the lane. Salt wind tugged at her coat, and somewhere below, the tide worried at the rocks. She had not planned to come back. Not today, at least.</p><p>The key was still where her mother had left it: beneath the blue flowerpot, its brass gone green with weather. The front door opened before she could decide whether she was ready.</p>';
  chapter.updatedAt = now;
  story.chapters.push(chapter);
  story.characters.push({ ...createEntry('Mara', 'Major'), content: 'Returns to the house by the sea after her mother’s death.\n\nWants: to understand why she was called home.\n\nFear: that the house remembers more than she does.' });
  story.worldbuilding.push({ ...createEntry('The house by the sea', 'Setting'), content: 'A weathered house above a rocky shoreline. Its windows seem to face the tide.' });
  return { version: 1, stories: [story], updatedAt: now };
}

export function countWords(html: string) {
  // Feature: totals count decoded visible words without splitting a word at inline formatting boundaries.
  return countTextWords(manuscriptText(html));
}

// Feature: editor text is already decoded, so literal angle brackets and entity-like prose stay countable.
export function countTextWords(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function plainText(html: string) {
  // Feature: collection excerpts use the same visible text as manuscript review and word totals.
  return manuscriptText(html).replace(/\s+/g, ' ').trim();
}
