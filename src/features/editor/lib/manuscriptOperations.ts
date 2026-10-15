import { decodeText, manuscriptText } from './manuscriptText.ts';
import type { Chapter, ChapterScene, PassageTask, Story, TextAnchor } from '../../../domain/model.ts';

export type TextEdit = { start: number; end: number; before: string; after: string };
export type SearchOptions = { query: string; replacement: string; wholeWord: boolean; matchCase: boolean; scope: 'selection' | 'chapter' | 'story'; chapterId: string; selection?: TextAnchor };
export type SearchMatch = TextEdit & { chapterId: string; chapterTitle: string; context: string; expectedHtml: string };

// Feature: maps decoded manuscript characters to raw HTML without including attributes or executable text.
export function htmlTextMap(html: string) {
  let text = ''; let hidden = false;
  const points: { start: number; end: number }[] = [];
  // Records structural separators with zero-length raw spans, preventing replacement from deleting tags.
  const newline = (position: number) => { text += '\n'; points.push({ start: position, end: position }); };
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+|</g)) {
    const value = token[0];
    if (value.startsWith('<!--')) continue;
    if (value.startsWith('<') && value.length > 1) {
      if (/^<(script|style)\b/i.test(value)) hidden = true;
      else if (/^<\/(script|style)\s*>/i.test(value)) { hidden = false; continue; }
      if (hidden) continue;
      if (/^<(?:p|div|h[1-6]|li|blockquote|ul|ol)\b/i.test(value) && text && !text.endsWith('\n')) newline(token.index);
      else if (/^<br\b|^<\/(?:p|div|h[1-6]|li|blockquote|ul|ol)\s*>/i.test(value)) newline(token.index);
      continue;
    }
    if (hidden) continue;
    for (const unit of value.matchAll(/&(?:#x[\da-f]+|#\d+|[a-z]+);|[\s\S]/gi)) {
      const decoded = decodeText(unit[0]);
      text += decoded;
      for (let i = 0; i < decoded.length; i++) points.push({ start: token.index + unit.index, end: token.index + unit.index + unit[0].length });
    }
  }
  return { text, points };
}

// Feature: construct an exact quote with neighboring text so duplicate passages are not confused later.
export function anchorText(text: string, start: number, end: number): TextAnchor {
  const first = Math.max(0, Math.min(text.length, start)); const last = Math.max(first, Math.min(text.length, end));
  return { start: first, end: last, quote: text.slice(first, last), prefix: text.slice(Math.max(0, first - 32), first), suffix: text.slice(last, last + 32) };
}

// Feature: resolve moved passages only when their quote and context identify a unique safe destination.
export function resolveAnchor(text: string, anchor: TextAnchor): TextAnchor {
  if (anchor.detached || !anchor.quote) return { ...anchor, detached: true };
  const candidates: number[] = [];
  let from = 0;
  while (from <= text.length) { const at = text.indexOf(anchor.quote, from); if (at < 0) break; candidates.push(at); from = at + Math.max(1, anchor.quote.length); }
  const contextual = candidates.filter((at) => (!anchor.prefix || text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix)
    && (!anchor.suffix || text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length) === anchor.suffix));
  const at = contextual.length === 1 ? contextual[0] : candidates.length === 1 ? candidates[0] : -1;
  return at >= 0 ? { ...anchorText(text, at, at + anchor.quote.length), detached: false } : { ...anchor, detached: true };
}

// Feature: shift/resize anchors through the smallest changed text range; deleted passages remain recoverable notes.
export function rebaseAnchor(anchor: TextAnchor, before: string, after: string): TextAnchor {
  if (anchor.detached) return anchor;
  let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length; let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = newEnd - oldEnd;
  if (oldEnd <= anchor.start) return anchorText(after, anchor.start + delta, anchor.end + delta);
  if (start >= anchor.end) return anchorText(after, anchor.start, anchor.end);
  if (start <= anchor.start && oldEnd >= anchor.end && newEnd === start) return { ...anchor, detached: true };
  const moved = resolveAnchor(after, anchor);
  if (!moved.detached && moved.start >= start && moved.end <= newEnd) return moved;
  if (start <= anchor.start && oldEnd >= anchor.end && (start < anchor.start || oldEnd > anchor.end)) return { ...anchor, detached: true };
  const nextStart = anchor.start < start ? anchor.start : start;
  const nextEnd = anchor.end > oldEnd ? anchor.end + delta : newEnd;
  return nextEnd > nextStart ? anchorText(after, nextStart, nextEnd) : { ...anchor, detached: true };
}

// Feature: bounded character alignment separates multiple edits in one recovered/pasted passage for accurate anchors.
export function textChanges(before: string, after: string): TextEdit[] {
  let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length; let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  if (start === oldEnd && start === newEnd) return [];
  const a = Array.from(before.slice(start, oldEnd)); const b = Array.from(after.slice(start, newEnd));
  // Large rewrites retain a bounded fallback; uncertain enclosed anchors become detached for explicit review.
  if ((a.length + 1) * (b.length + 1) > 1_000_000) return [{ start, end: oldEnd, before: before.slice(start, oldEnd), after: after.slice(start, newEnd) }];
  const cols = b.length + 1; const table = new Uint32Array((a.length + 1) * cols);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i * cols + j] = a[i] === b[j] ? 1 + table[(i + 1) * cols + j + 1] : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
  const edits: TextEdit[] = []; let i = 0; let j = 0; let offset = start; let pending: TextEdit | undefined;
  // Flushes an individual changed range whenever alignment finds unchanged manuscript characters.
  const flush = () => { if (pending) { edits.push(pending); pending = undefined; } };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { flush(); offset += a[i].length; i++; j++; continue; }
    pending ??= { start: offset, end: offset, before: '', after: '' };
    if (j < b.length && (i === a.length || table[i * cols + j + 1] >= table[(i + 1) * cols + j])) pending.after += b[j++];
    else { pending.before += a[i]; offset += a[i++].length; pending.end = offset; }
  }
  flush(); return edits;
}

// Feature: text edits update task and scene anchors together while preserving chapter metadata and formatting.
export function chapterWithHtml(chapter: Chapter, html: string, explicitEdits?: TextEdit[]): Chapter {
  if (html === chapter.html) return chapter;
  const before = manuscriptText(chapter.html); const after = manuscriptText(html);
  const changes = (!explicitEdits && (chapter.passageTasks?.length || chapter.scenes?.some((scene) => scene.anchor)) ? textChanges(before, after) : []).sort((a, b) => b.start - a.start);
  // Replays aligned changes in reverse offset order so anchors follow each real edit instead of a broad diff span.
  const rebase = (anchor: TextAnchor) => {
    if (explicitEdits) return rebaseTextEdits(anchor, after, explicitEdits);
    let text = before; let next = anchor;
    for (const change of changes) { const updated = text.slice(0, change.start) + change.after + text.slice(change.end); next = rebaseAnchor(next, text, updated); text = updated; }
    return next;
  };
  return { ...chapter, html, updatedAt: new Date().toISOString(),
    passageTasks: chapter.passageTasks?.map((task: PassageTask) => ({ ...task, anchor: rebase(task.anchor) })),
    scenes: chapter.scenes?.map((scene: ChapterScene) => scene.anchor ? { ...scene, anchor: rebase(scene.anchor) } : scene) };
}

// Feature: known replacement ranges rebase anchors directly, avoiding repeated whole-chapter scans during bulk edits.
function rebaseTextEdits(anchor: TextAnchor, after: string, edits: TextEdit[]): TextAnchor {
  if (anchor.detached) return anchor;
  let start = anchor.start; let end = anchor.end;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    const replacementLength = edit.after.replace(/\r\n/g, '\n').length;
    const delta = replacementLength - (edit.end - edit.start);
    if (edit.end <= start) { start += delta; end += delta; }
    else if (edit.start < end) {
      if (edit.start <= start && edit.end >= end && !edit.after.length) return { ...anchor, detached: true };
      start = start < edit.start ? start : edit.start;
      end = end > edit.end ? end + delta : edit.start + replacementLength;
    }
  }
  return end > start ? anchorText(after, start, end) : { ...anchor, detached: true };
}

// Feature: literal search supports Unicode word boundaries, case matching and exact selection/chapter/story scope.
export function findStoryMatches(story: Story, options: SearchOptions): SearchMatch[] {
  if (!options.query || options.query.length > 500) return [];
  const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(options.wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped, options.matchCase ? 'gu' : 'giu');
  const matches: SearchMatch[] = [];
  for (const chapter of story.chapters.filter((item) => options.scope === 'story' || item.id === options.chapterId)) {
    const text = manuscriptText(chapter.html);
    const selection = options.scope === 'selection' && options.selection ? resolveAnchor(text, options.selection) : undefined;
    if (options.scope === 'selection' && (!selection || selection.detached)) continue;
    for (const match of text.matchAll(pattern)) {
      const start = match.index; const end = start + match[0].length;
      if (selection && (start < selection.start || end > selection.end)) continue;
      matches.push({ chapterId: chapter.id, chapterTitle: chapter.title, start, end, before: match[0], after: options.replacement,
        context: text.slice(Math.max(0, start - 35), Math.min(text.length, end + 45)).replace(/\n/g, ' '), expectedHtml: chapter.html });
    }
  }
  return matches;
}

// Feature: replace visible text only; inserted characters inherit the first matched run and HTML tags remain intact.
export function replaceHtmlText(html: string, edits: TextEdit[]): string {
  const map = htmlTextMap(html); const operations: { start: number; end: number; after: string }[] = [];
  let previousStart = Infinity;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (edit.end > previousStart || edit.end <= edit.start) throw new Error('Replacement ranges overlap or are empty. Refresh the preview.');
    if (map.text.slice(edit.start, edit.end) !== edit.before) throw new Error('The passage changed. Refresh the replacement preview.');
    if (edit.start < 0 || edit.end > map.text.length || /[\uDC00-\uDFFF]/.test(map.text[edit.start] ?? '') || /[\uDC00-\uDFFF]/.test(map.text[edit.end] ?? '')) throw new Error('Select complete characters before replacing.');
    const points = map.points.slice(edit.start, edit.end);
    if (!points.length || points.some((point) => point.start === point.end)) throw new Error('Replace text within a passage rather than across paragraph breaks.');
    const spans: { start: number; end: number }[] = [];
    for (const point of points) {
      const last = spans.at(-1);
      if (last && point.start <= last.end) last.end = Math.max(last.end, point.end);
      else spans.push({ ...point });
    }
    const replacement = edit.after.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!).replace(/\r?\n/g, '<br>');
    spans.forEach((span, index) => operations.push({ ...span, after: index === 0 ? replacement : '' }));
    previousStart = edit.start;
  }
  // Feature: assemble one HTML result so story-wide replacements scale with the draft instead of rescanning per match.
  const chunks: string[] = []; let cursor = 0;
  for (const operation of operations.sort((a, b) => a.start - b.start)) {
    if (operation.start < cursor) throw new Error('Replacement text spans overlap. Select complete characters and refresh the preview.');
    chunks.push(html.slice(cursor, operation.start), operation.after); cursor = operation.end;
  }
  chunks.push(html.slice(cursor)); return chunks.join('');
}

// Feature: apply a reviewed match set atomically and reject stale previews without touching unrelated chapters.
export function replaceStoryMatches(story: Story, matches: SearchMatch[]): Story {
  const byChapter = new Map<string, SearchMatch[]>();
  for (const match of matches) { const rows = byChapter.get(match.chapterId) ?? []; rows.push(match); byChapter.set(match.chapterId, rows); }
  for (const [id, rows] of byChapter) if (!story.chapters.some((chapter) => chapter.id === id && rows.every((row) => row.expectedHtml === chapter.html))) throw new Error('The draft changed after preview. Search again before replacing.');
  return { ...story, chapters: story.chapters.map((chapter) => {
    const rows = byChapter.get(chapter.id) ?? [];
    return rows.length ? chapterWithHtml(chapter, replaceHtmlText(chapter.html, rows), rows) : chapter;
  }) };
}

// Feature: linked scene ranges end at the next linked scene, with counts from real manuscript text.
export function sceneRanges(chapter: Chapter) {
  const text = manuscriptText(chapter.html);
  const linked = (chapter.scenes ?? []).map((scene) => ({ scene, anchor: scene.anchor ? resolveAnchor(text, scene.anchor) : undefined }))
    .filter((item) => item.anchor && !item.anchor.detached).sort((a, b) => a.anchor!.start - b.anchor!.start);
  return (chapter.scenes ?? []).map((scene) => {
    const at = linked.findIndex((item) => item.scene.id === scene.id); const start = at >= 0 ? linked[at].anchor!.start : undefined;
    const end = at >= 0 ? linked[at + 1]?.anchor!.start ?? text.length : undefined;
    const words = start === undefined || end === undefined ? undefined : text.slice(start, end).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    return { scene, start, end, words };
  });
}

// Feature: resolved manuscript starts define continuity order; unlinked/detached scenes remain separate for review.
export function sceneTimeline(chapter: Chapter) {
  const ranges = sceneRanges(chapter);
  const linked = ranges.filter((item) => item.start !== undefined).sort((a, b) => a.start! - b.start!);
  const unlinked = ranges.filter((item) => item.start === undefined);
  return { linked, unlinked, ordered: [...linked, ...unlinked] };
}

// Feature: scene navigation preserves edit timestamps; real scene-content changes timestamp the chapter once.
export function chapterWithScenes(chapter: Chapter, scenes: ChapterScene[], activeSceneId: string | undefined, now = new Date().toISOString()): Chapter {
  const changed = JSON.stringify(chapter.scenes ?? []) !== JSON.stringify(scenes);
  if (!changed && chapter.activeSceneId === activeSceneId) return chapter;
  return { ...chapter, scenes, activeSceneId, updatedAt: changed ? now : chapter.updatedAt };
}
