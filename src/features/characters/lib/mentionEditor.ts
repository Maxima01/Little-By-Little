import type { CharacterLink } from '../../../domain/model.ts';
import { validCharacterLinks } from './characterMentions.ts';

// Feature: one DOM snapshot reads plain prose, linked chips and text positions without storing executable HTML.
function mentionSnapshot(root: Node) {
  let value = '';
  const links: CharacterLink[] = [];
  const segments: { node: Text; start: number; end: number }[] = [];
  // Feature: walk inline formatting and browser-created line blocks while keeping mention offsets consistent.
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const start = value.length;
      value += (node.textContent ?? '').replace(/\u00a0/g, ' ');
      segments.push({ node: node as Text, start, end: value.length });
      return;
    }
    if (node.nodeType === 1) {
      const element = node as HTMLElement;
      if (/^(SCRIPT|STYLE)$/.test(element.tagName)) return;
      if (element.tagName === 'BR') { value += '\n'; return; }
      const block = /^(DIV|P|LI)$/.test(element.tagName) && node !== root;
      if (block && value && !value.endsWith('\n')) value += '\n';
      const start = value.length;
      node.childNodes.forEach(visit);
      if (element.dataset.referenceId && value.length > start && value[start] === '@') links.push({ targetId: element.dataset.referenceId, start, end: value.length });
      if (block && node.nextSibling && !value.endsWith('\n')) value += '\n';
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  return { value, links, segments };
}

// Feature: serialize only visible text and stable entry links for autosave, backup and native editing.
export function readMentionEditor(root: HTMLElement) {
  const { value, links } = mentionSnapshot(root);
  return { value, links };
}

// Feature: safely reconstruct linked text using textContent, including literal markup in names and descriptions.
export function renderMentionEditor(root: HTMLElement, value: string, links: CharacterLink[]) {
  const document = root.ownerDocument;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const link of validCharacterLinks(value, links) ? [...links].sort((a, b) => a.start - b.start) : []) {
    fragment.append(document.createTextNode(value.slice(cursor, link.start)));
    fragment.append(createMentionChip(document, value.slice(link.start, link.end), link.targetId));
    cursor = link.end;
  }
  fragment.append(document.createTextNode(value.slice(cursor)));
  root.replaceChildren(fragment);
}

// Feature: atomic, keyboard-focusable chips keep the entry ID attached while ordinary prose remains editable.
export function createMentionChip(document: Document, label: string, targetId: string) {
  const chip = document.createElement('span');
  chip.dataset.referenceId = targetId; chip.contentEditable = 'false'; chip.tabIndex = 0;
  chip.className = 'character-mention-chip'; chip.setAttribute('role', 'button');
  chip.setAttribute('aria-label', `Preview ${label}`); chip.textContent = label;
  return chip;
}

// Feature: suggestion insertion replaces only the @ query at the caret, including queries in the middle of prose.
export function selectMentionText(root: HTMLElement, start: number, end: number) {
  const { segments } = mentionSnapshot(root);
  const first = segments.find((segment) => segment.start <= start && segment.end >= start);
  const last = [...segments].reverse().find((segment) => segment.start <= end && segment.end >= end);
  if (!first || !last) return false;
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start);
  const selection = root.ownerDocument.getSelection();
  if (!selection) return false;
  selection.removeAllRanges(); selection.addRange(range); return true;
}

// Feature: read the actual caret so mention searches work with clicks, keyboard navigation and multiple lines.
export function mentionCaret(root: HTMLElement) {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.focusNode) || !selection.isCollapsed) return null;
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(root); prefix.setEnd(selection.focusNode!, selection.focusOffset);
  const wrapper = root.ownerDocument.createElement('div'); wrapper.append(prefix.cloneContents());
  return readMentionEditor(wrapper).value.length;
}
