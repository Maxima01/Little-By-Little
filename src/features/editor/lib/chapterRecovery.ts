import type { Chapter, Workspace } from '../../../domain/model.ts';
import { manuscriptText } from './writingAnalysis.ts';
import { chapterWithHtml } from './manuscriptOperations.ts';

export type Passage = { index: number; html: string; text: string };
export type ComparisonRow = { saved: Passage | null; current: Passage | null; status: 'unchanged' | 'changed' | 'saved-only' | 'current-only' };
export type ChapterRecoveryRequest = {
  storyId: string;
  source: Chapter;
  expectedHtml: string | null;
  mode: 'chapter' | 'append' | 'replace';
  savedIndices: number[];
  currentIndices: number[];
};

// Feature: splits rich text into complete top-level passages, retaining lists, quotes, and inline formatting.
export function chapterPassages(html: string): Passage[] {
  const fragments: string[] = [];
  let start = 0;
  let depth = 0;
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    const value = token[0];
    if (value.startsWith('<!--')) continue;
    const tag = value.match(/^<(\/)?([\w-]+)/);
    if (tag) {
      if (/^(br|hr|img|input|meta|link|wbr)$/i.test(tag[2]) || /\/>$/.test(value)) continue;
      // Keep leading plain/inline text separate from a following top-level block (common in pasted drafts).
      const block = /^(p|div|h[1-6]|ul|ol|blockquote)$/i.test(tag[2]);
      if (!tag[1] && block && depth === 0 && token.index > start) {
        fragments.push(html.slice(start, token.index)); start = token.index;
      }
      depth = Math.max(0, depth + (tag[1] ? -1 : 1));
      if (depth === 0 && tag[1] && block) {
        const end = token.index + value.length;
        fragments.push(html.slice(start, end)); start = end;
      }
    }
  }
  if (start < html.length) fragments.push(html.slice(start));
  return fragments.filter((value) => value.trim()).map((value, index) => ({ index, html: value, text: manuscriptText(value).trim() }));
}

// Aligns unchanged passages around edited regions, with a bounded fallback for book-sized chapters.
export function compareChapterPassages(savedHtml: string, currentHtml: string): ComparisonRow[] {
  const saved = chapterPassages(savedHtml);
  const current = chapterPassages(currentHtml);
  const rows: ComparisonRow[] = [];
  // Pairs passages inside one changed region without treating repeated paragraphs as unique identifiers.
  const addChanged = (oldStart: number, oldEnd: number, nextStart: number, nextEnd: number) => {
    for (let offset = 0; offset < Math.max(oldEnd - oldStart, nextEnd - nextStart); offset += 1) {
      const before = oldStart + offset < oldEnd ? saved[oldStart + offset] : null;
      const after = nextStart + offset < nextEnd ? current[nextStart + offset] : null;
      rows.push({ saved: before, current: after, status: !before ? 'current-only' : !after ? 'saved-only' : before.html === after.html ? 'unchanged' : 'changed' });
    }
  };
  if ((saved.length + 1) * (current.length + 1) > 250_000) {
    addChanged(0, saved.length, 0, current.length);
    return rows;
  }
  const lengths = Array.from({ length: saved.length + 1 }, () => new Uint32Array(current.length + 1));
  for (let old = saved.length - 1; old >= 0; old -= 1) {
    for (let next = current.length - 1; next >= 0; next -= 1) {
      lengths[old][next] = saved[old].html === current[next].html ? 1 + lengths[old + 1][next + 1] : Math.max(lengths[old + 1][next], lengths[old][next + 1]);
    }
  }
  let old = 0; let next = 0; let oldStart = 0; let nextStart = 0;
  while (old < saved.length && next < current.length) {
    if (saved[old].html === current[next].html) {
      addChanged(oldStart, old, nextStart, next);
      rows.push({ saved: saved[old], current: current[next], status: 'unchanged' });
      old += 1; next += 1; oldStart = old; nextStart = next;
    } else if (lengths[old + 1][next] >= lengths[old][next + 1]) old += 1;
    else next += 1;
  }
  addChanged(oldStart, saved.length, nextStart, current.length);
  return rows;
}

// Verifies selected passage indices instead of silently accepting a stale or malformed selection.
function selectedPassages(passages: Passage[], indices: number[]): Passage[] {
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  if (!unique.length || unique.some((index) => !Number.isInteger(index) || !passages[index])) throw new Error('Select at least one passage from the comparison.');
  return unique.map((index) => passages[index]);
}

// Feature: recovers only the chosen draft or passages and protects unrelated stories, chapters, and notes.
export function recoverChapterInWorkspace(workspace: Workspace, request: ChapterRecoveryRequest): Workspace {
  const story = workspace.stories.find((item) => item.id === request.storyId);
  if (!story) throw new Error('This story is no longer in the workspace. Use workspace recovery to restore a deleted story.');
  const current = story.chapters.find((item) => item.id === request.source.id);
  if ((current?.html ?? null) !== request.expectedHtml) throw new Error('The chapter changed while you were comparing. Reopen the comparison before recovering.');
  if (!current && request.mode !== 'chapter') throw new Error('Recover the deleted chapter before adding or replacing passages.');
  let html = request.source.html;
  if (request.mode !== 'chapter' && current) {
    const saved = selectedPassages(chapterPassages(request.source.html), request.savedIndices).map((passage) => passage.html).join('');
    if (request.mode === 'append') html = current.html + saved;
    else {
      const passages = chapterPassages(current.html);
      const selected = selectedPassages(passages, request.currentIndices);
      const first = selected[0].index;
      const last = selected.at(-1)!.index;
      if (last - first + 1 !== selected.length) throw new Error('Select consecutive current passages to replace.');
      html = passages.slice(0, first).map((passage) => passage.html).join('') + saved + passages.slice(last + 1).map((passage) => passage.html).join('');
    }
  }
  if (current && html === current.html) throw new Error('The chosen recovery is identical to the current draft.');
  const now = new Date().toISOString();
  // Feature: passage recovery also rebases comments and outline links on the recovered manuscript.
  const chapter = { ...chapterWithHtml(current ?? request.source, html), updatedAt: now };
  // Preserves the rest of the workspace and records the recovery as a meaningful local activity.
  const updated = { ...story, updatedAt: now, chapters: current ? story.chapters.map((item) => item.id === current.id ? chapter : item) : [...story.chapters, chapter], activity: [{ id: `recovery-${now}-${chapter.id}`, action: 'Chapter recovered', targetId: chapter.id, targetTitle: chapter.title, details: request.mode === 'chapter' ? 'Saved chapter draft recovered.' : 'Selected saved passages recovered.', createdAt: now }, ...(story.activity ?? [])].slice(0, 100) };
  return { ...workspace, updatedAt: now, stories: workspace.stories.map((item) => item.id === story.id ? updated : item) };
}
