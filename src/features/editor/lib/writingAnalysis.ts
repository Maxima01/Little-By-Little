import type { Chapter, Story } from '../../../domain/model.ts';
import { sceneTimeline } from './manuscriptOperations.ts';
import { decodeText, manuscriptText } from './manuscriptText.ts';
// Feature: existing callers retain the public analysis API while sharing the independent text implementation.
export { decodeText, manuscriptText } from './manuscriptText.ts';

// Feature: counts explicit cast assignments separately from literal name mentions in the entire draft.
export function chapterCharacterAppearances(chapter: Chapter, story: Story) {
  const text = manuscriptText(chapter.html).normalize('NFC');
  return story.characters.map((character) => {
    const name = character.title.trim().normalize('NFC');
    // Feature: character-linked style-guide aliases count as mentions; longest names avoid overlapping double counts.
    const aliases = (story.styleGuide?.rules ?? []).filter((rule) => rule.kind === 'alias' && rule.characterId === character.id).flatMap((rule) => [rule.preferred, ...rule.variants]);
    // Feature: explicitly comma/line-separated profile aliases share mention counting with linked style-guide aliases.
    const profileAliases = (character.characterProfile?.aliases ?? '').split(/[,\r\n]/);
    const names = [...new Set([name, ...aliases, ...profileAliases].map((value) => value.trim().normalize('NFC')).filter(Boolean))].sort((a, b) => b.length - a.length);
    const escaped = names.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped})(?![\\p{L}\\p{N}_])`, 'giu');
    const scenes = (chapter.scenes ?? []).filter((scene) => scene.characterIds.includes(character.id));
    return { character, scenes, mentions: names.length ? [...text.matchAll(pattern)].length : 0 };
  });
}

// Feature: follows linked manuscript order and the previous chapter's final linked scene without guessing unlinked positions.
export function settingContinuity(chapter: Chapter, story: Story) {
  const settings = story.worldbuilding.filter((entry) => entry.category === 'Setting');
  const previousChapter = story.chapters[story.chapters.findIndex((item) => item.id === chapter.id) - 1];
  const previousTimeline = previousChapter ? sceneTimeline(previousChapter) : undefined;
  const previousScene = previousTimeline?.linked.at(-1)?.scene;
  const timeline = sceneTimeline(chapter), scenes = timeline.linked.map((item) => item.scene);
  const trail = scenes.map((scene, index) => {
    const previous = index ? scenes[index - 1] : previousScene;
    const setting = settings.find((item) => item.id === scene.settingId);
    const previousSetting = settings.find((item) => item.id === previous?.settingId);
    // Feature: a saved entry with a changed type is reported separately from a deleted setting.
    const unavailableEntry = !setting && scene.settingId ? story.worldbuilding.find((entry) => entry.id === scene.settingId) : undefined;
    const status = unavailableEntry ? 'recategorized' : scene.settingId && !setting ? 'missing' : !setting ? 'unassigned'
      : !previousSetting ? 'start' : setting.id === previousSetting.id ? 'same' : 'changed';
    return { scene, setting, previousSetting, unavailableEntry, status };
  });
  const unlinked = timeline.unlinked.map(({ scene }) => ({ scene, entry: story.worldbuilding.find((entry) => entry.id === scene.settingId) }));
  return { previousChapter, previousScene, previousSetting: settings.find((item) => item.id === previousScene?.settingId), previousEntry: story.worldbuilding.find((entry) => entry.id === previousScene?.settingId), previousUnlinkedCount: previousTimeline?.unlinked.length ?? 0, trail, unlinked };
}

export type GrammarSuggestion = { start: number; before: string; after: string; context: string };

// Feature: conservative offline suggestions flag lowercase English I and its common contractions.
export function grammarSuggestions(text: string): GrammarSuggestion[] {
  const suggestions: GrammarSuggestion[] = [];
  const pattern = /(?<![\p{L}\p{N}_@/.\-])i(?:['’](?:m|d|ll|ve))?(?![\p{L}\p{N}_@/\-]|['’][\p{L}])/gu;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    suggestions.push({ start, before: match[0], after: 'I' + match[0].slice(1), context: text.slice(Math.max(0, start - 28), start + match[0].length + 36).replace(/\s+/g, ' ') });
  }
  return suggestions;
}

// Only corrects a word just completed by one typed delimiter; pastes, deletions, and undo stay untouched.
export function justTypedPronoun(previous: string, next: string): GrammarSuggestion | undefined {
  let start = 0;
  while (start < previous.length && previous[start] === next[start]) start += 1;
  let end = previous.length;
  let nextEnd = next.length;
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) { end -= 1; nextEnd -= 1; }
  if (end !== start || nextEnd - start !== 1 || !/[\s.,!?;:)"”]/u.test(next[start])) return;
  return grammarSuggestions(next).find((item) => item.start + item.before.length === start);
}

// Maps a visible suggestion back to its raw HTML character while retaining every tag and attribute.
export function capitalizeHtmlPronoun(html: string, suggestion: GrammarSuggestion): string {
  if (manuscriptText(html).slice(suggestion.start, suggestion.start + suggestion.before.length) !== suggestion.before) return html;
  let offset = 0;
  let text = '';
  let hidden = false;
  for (const token of html.matchAll(/<[^>]*>|[^<]+/g)) {
    if (token[0].startsWith('<')) {
      if (/^<(script|style)\b/i.test(token[0])) hidden = true;
      else if (/^<\/(script|style)>/i.test(token[0])) hidden = false;
      if (hidden) continue;
      if (/^<(?:p|div|h[1-6]|li|blockquote|ul|ol)\b/i.test(token[0]) && text && !text.endsWith('\n')) { offset += 1; text += '\n'; }
      else if (/^<br\b|^<\/(?:p|div|h[1-6]|li|blockquote|ul|ol)>/i.test(token[0])) { offset += 1; text += '\n'; }
      continue;
    }
    if (hidden) continue;
    for (const unit of token[0].matchAll(/&(?:#x[\da-f]+|#\d+|[a-z]+);|[\s\S]/gi)) {
      if (offset === suggestion.start) {
        const rawIndex = token.index + unit.index;
        return html.slice(0, rawIndex) + 'I' + html.slice(rawIndex + unit[0].length);
      }
      const decoded = decodeText(unit[0]);
      offset += decoded.length;
      text += decoded;
    }
  }
  return html;
}
