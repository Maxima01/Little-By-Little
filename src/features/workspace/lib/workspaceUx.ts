import { createStarterWorkspace, type Chapter, type Story, type Workspace } from '../../../domain/model.ts';

// Feature: recent work follows edit timestamps, with stable ordering for simultaneous edits.
export function recentlyEdited(stories: Story[]) {
  return stories.flatMap((story) => story.chapters.map((chapter) => ({ story, chapter })))
    .sort((a, b) => Date.parse(b.chapter.updatedAt) - Date.parse(a.chapter.updatedAt)
      || a.story.id.localeCompare(b.story.id) || a.chapter.id.localeCompare(b.chapter.id));
}

// Feature: resume uses the last opened chapter, then the latest edit, including deleted-ID fallbacks.
export function resumeChapter(story: Story): Chapter | undefined {
  return story.chapters.find((chapter) => chapter.id === story.lastOpenedChapterId)
    ?? recentlyEdited([story])[0]?.chapter ?? story.chapters[0];
}

// Feature: viewing a chapter records navigation without changing draft timestamps or edit activity.
export function rememberChapter(workspace: Workspace, storyId: string, chapterId: string): Workspace {
  const story = workspace.stories.find((item) => item.id === storyId);
  if (!story?.chapters.some((chapter) => chapter.id === chapterId) || story.lastOpenedChapterId === chapterId) return workspace;
  return { ...workspace, stories: workspace.stories.map((item) => item.id === storyId
    ? { ...item, lastOpenedChapterId: chapterId, isExample: isExampleStory(item) } : item) };
}

// Feature: recognize only an untouched legacy example using its full content, never its title alone.
export function isExampleStory(story: Story) {
  if (story.isExample !== undefined) return story.isExample;
  const example = createStarterWorkspace().stories[0];
  return story.title === example.title && story.description === example.description
    && story.chapters.length === 1 && story.chapters[0].html === example.chapters[0].html
    && story.characters.length === 1 && story.characters[0].content === example.characters[0].content
    && story.worldbuilding.length === 1 && story.worldbuilding[0].content === example.worldbuilding[0].content
    && !story.art.length && !story.notes.length && !story.research.length;
}

// Feature: every export scope resolves chapter IDs in manuscript order without mutating story data.
export function exportSelection(story: Story, ids: string[]): Story {
  const selected = new Set(ids);
  return { ...story, chapters: story.chapters.filter((chapter) => selected.has(chapter.id)) };
}
