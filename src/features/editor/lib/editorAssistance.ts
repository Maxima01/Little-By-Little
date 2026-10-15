import { grammarSuggestions, justTypedPronoun, type GrammarSuggestion } from './writingAnalysis.ts';
import { anchorText, type TextEdit } from './manuscriptOperations.ts';

// Maps visible text to DOM nodes using the same block separators as manuscriptText.
function snapshot(root: HTMLElement) {
  let text = '';
  const segments: { node: Text; start: number; end: number }[] = [];
  // Visits inline text without breaking words that cross emphasis spans.
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const start = text.length;
      // Browsers use nonbreaking spaces while typing; normalize them like the shared HTML text extractor.
      text += (node.textContent ?? '').replace(/\u00a0/g, ' ');
      segments.push({ node: node as Text, start, end: text.length });
    } else {
      const tag = node.nodeName.toLowerCase();
      if (tag === 'script' || tag === 'style') return;
      if (/^(p|div|h[1-6]|li|blockquote|ul|ol)$/.test(tag) && node !== root && text && !text.endsWith('\n')) text += '\n';
      node.childNodes.forEach(visit);
      if (/^(br|p|div|h[1-6]|li|blockquote|ul|ol)$/.test(tag) && node !== root) text += '\n';
    }
  };
  visit(root);
  return { text, segments };
}

// Feature: locate a reviewed text range across inline formatting using the editor's real text nodes.
function textRange(root: HTMLElement, start: number, end: number): Range | null {
  const state = snapshot(root);
  const first = state.segments.find((item) => item.start <= start && item.end > start);
  const last = [...state.segments].reverse().find((item) => item.start < end && item.end >= end);
  if (!first || !last) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start);
  return range;
}

// Feature: capture passage selection before a revision dialog takes focus.
export function editorTextSelection(root: HTMLElement, range?: Range | null) {
  const selection = root.ownerDocument.getSelection();
  const selected = range ?? (selection?.rangeCount ? selection.getRangeAt(0) : null);
  if (!selected || selected.collapsed || !root.contains(selected.startContainer) || !root.contains(selected.endContainer)) return undefined;
  const state = snapshot(root);
  return anchorText(state.text, pointOffset(state, selected.startContainer, selected.startOffset), pointOffset(state, selected.endContainer, selected.endOffset));
}

// Feature: highlighting/navigation selects the real passage and scrolls its nearest block into view.
export function selectEditorText(root: HTMLElement, start: number, end: number): boolean {
  const range = textRange(root, start, end); if (!range) return false;
  root.focus();
  const selection = root.ownerDocument.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
  const element = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  element?.closest('p,div,h1,h2,h3,blockquote,li')?.scrollIntoView({ block: 'nearest' });
  return true;
}

// Feature: apply one reviewed proofreading edit through browser undo with stale-text protection.
export function applyEditorTextEdit(root: HTMLElement, edit: TextEdit): boolean {
  const state = snapshot(root);
  if (state.text.slice(edit.start, edit.end) !== edit.before) return false;
  const range = textRange(root, edit.start, edit.end); if (!range) return false;
  root.focus();
  const selection = root.ownerDocument.getSelection(); if (!selection) return false;
  selection.removeAllRanges(); selection.addRange(range);
  return root.ownerDocument.execCommand('insertText', false, edit.after);
}

// Records caret/selection offsets before an undoable correction moves focus away from a modal.
function pointOffset(state: ReturnType<typeof snapshot>, container: Node, offset: number) {
  const direct = state.segments.find((segment) => segment.node === container);
  if (direct) return direct.start + offset;
  const point = container.ownerDocument!.createRange();
  point.setStart(container, offset); point.collapse(true);
  for (const segment of state.segments) {
    const candidate = container.ownerDocument!.createRange();
    candidate.setStart(segment.node, 0); candidate.collapse(true);
    if (candidate.compareBoundaryPoints(0, point) >= 0) return segment.start;
  }
  return state.text.length;
}

// Feature: applies one uppercase I through the browser undo stack, retaining formatting and the caret.
export function applyEditorSuggestion(root: HTMLElement, suggestion: GrammarSuggestion, rememberedRange?: Range | null): boolean {
  const state = snapshot(root);
  if (!grammarSuggestions(state.text).some((item) => item.start === suggestion.start && item.before === suggestion.before)) return false;
  const segment = state.segments.find((item) => item.start <= suggestion.start && item.end > suggestion.start);
  if (!segment) return false;
  const saved = rememberedRange && root.contains(rememberedRange.startContainer) && root.contains(rememberedRange.endContainer)
    ? [pointOffset(state, rememberedRange.startContainer, rememberedRange.startOffset), pointOffset(state, rememberedRange.endContainer, rememberedRange.endOffset)] : null;
  root.focus();
  const selection = root.ownerDocument.getSelection();
  if (!selection) return false;
  const range = root.ownerDocument.createRange();
  range.setStart(segment.node, suggestion.start - segment.start);
  range.setEnd(segment.node, suggestion.start - segment.start + 1);
  selection.removeAllRanges(); selection.addRange(range);
  const applied = root.ownerDocument.execCommand('insertText', false, 'I');
  if (applied && saved) {
    const next = snapshot(root);
    const restored = root.ownerDocument.createRange();
    // Resolves stable character offsets after the browser may split or merge text nodes.
    const setPoint = (position: number, start: boolean) => {
      const target = next.segments.find((item) => item.start <= position && item.end >= position) ?? next.segments.at(-1);
      if (!target) return;
      const offset = Math.max(0, Math.min(target.node.length, position - target.start));
      if (start) restored.setStart(target.node, offset); else restored.setEnd(target.node, offset);
    };
    setPoint(saved[0], true); setPoint(saved[1], false);
    selection.removeAllRanges(); selection.addRange(restored);
  }
  return applied;
}

// Corrects a newly completed pronoun; the caller excludes paste, composition, and undo input events.
export function autoCapitalizeEditor(root: HTMLElement, previousText: string): boolean {
  const next = snapshot(root);
  const suggestion = justTypedPronoun(previousText, next.text);
  const selection = root.ownerDocument.getSelection();
  return !!suggestion && applyEditorSuggestion(root, suggestion, selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null);
}
