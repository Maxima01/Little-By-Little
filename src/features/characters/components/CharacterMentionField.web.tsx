import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterLink, Story } from '../../../domain/model';
import { filterMentionCandidates, mentionCandidates, mentionQuery, type MentionCandidate, type MentionKind, type MentionQuery } from '../lib/characterMentions';
import { createMentionChip, mentionCaret, readMentionEditor, renderMentionEditor, selectMentionText } from '../lib/mentionEditor';
import type { Theme } from '../../../theme/theme';
import './character-mentions.css';

type Props = { label: string; value: string; links: CharacterLink[]; kind: MentionKind; story: Story; characterId: string; theme: Theme; onChange: (value: string, links: CharacterLink[]) => void };

// Feature: relationships and affiliations contain editable prose with @ pickers and inline reference previews.
export default function CharacterMentionField({ label, value, links, kind, story, characterId, theme, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pickerId = useId();
  const tooltipId = useId();
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [preview, setPreview] = useState<{ targetId: string; label: string; left: number; top: number; above: boolean } | null>(null);
  const candidates = mentionCandidates(story, kind, characterId);
  const matches = query ? filterMentionCandidates(candidates, query.query) : [];
  const reference = preview ? candidates.find((candidate) => candidate.id === preview.targetId) : undefined;
  // Feature: a retained affiliation target with a changed world type is distinguished from a deleted group.
  const changedType = preview && kind === 'organization' && !reference ? story.worldbuilding.find((entry) => entry.id === preview.targetId) : undefined;
  const tokens = { '--mention-ink': theme.text, '--mention-muted': theme.muted, '--mention-accent': theme.accent, '--mention-tint': theme.accentSoft, '--mention-paper': theme.surface, '--mention-input': theme.background, '--mention-border': theme.border } as CSSProperties;

  // Feature: sync external saves without resetting a live caret or the browser's undo history after every keystroke.
  useLayoutEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const current = readMentionEditor(root);
    if (current.value !== value || JSON.stringify(current.links) !== JSON.stringify(links)) renderMentionEditor(root, value, links);
    for (const chip of root.querySelectorAll<HTMLElement>('[data-reference-id]')) chip.dataset.missing = String(!candidates.some((candidate) => candidate.id === chip.dataset.referenceId));
  }, [value, links, story.characters, story.worldbuilding]);

  // Feature: scrolling or leaving the field closes a preview so it cannot float over unrelated content.
  useEffect(() => {
    const close = () => setPreview(null);
    document.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { document.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); clearTimeout(hoverTimer.current); };
  }, []);

  // Feature: read the edited field, persist stable links and derive the search from the current caret.
  const commit = (search = true) => {
    const root = editorRef.current; if (!root) return;
    const current = readMentionEditor(root); onChange(current.value, current.links);
    const caret = mentionCaret(root);
    setQuery(search && !composingRef.current && caret !== null ? mentionQuery(current.value, caret, current.links) : null); setActiveIndex(0);
  };
  // Feature: clicking or moving the caret can start @ search without changing the saved field.
  const searchAtCaret = () => {
    const root = editorRef.current; if (!root || composingRef.current) return;
    const current = readMentionEditor(root); const caret = mentionCaret(root);
    setQuery(caret === null ? null : mentionQuery(current.value, caret, current.links)); setActiveIndex(0);
  };
  // Feature: insert the selected entry as an undoable atomic chip, then save its ID and visible text.
  const choose = (candidate: MentionCandidate) => {
    const root = editorRef.current; if (!root || !query) return;
    root.focus(); if (!selectMentionText(root, query.start, query.end)) { setQuery(null); return; }
    const chip = createMentionChip(root.ownerDocument, (kind === 'organization' ? '@/' : '@') + candidate.title, candidate.id);
    if (!root.ownerDocument.execCommand('insertHTML', false, chip.outerHTML + ' ')) {
      const selection = root.ownerDocument.getSelection(); if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0); range.deleteContents(); range.insertNode(chip);
      const space = root.ownerDocument.createTextNode(' '); chip.after(space); range.setStartAfter(space); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
    }
    commit(false); setPreview(null);
  };
  // Feature: hover, keyboard focus and tapping a mention show the target's current description, including deleted-link feedback.
  const showPreview = (chip: HTMLElement) => {
    clearTimeout(hoverTimer.current); chip.setAttribute('aria-describedby', tooltipId);
    const bounds = chip.getBoundingClientRect(); const width = Math.min(320, window.innerWidth - 32);
    const above = window.innerHeight - bounds.bottom < 230 && bounds.top > 230;
    setPreview({ targetId: chip.dataset.referenceId!, label: chip.textContent ?? '', left: Math.min(Math.max(16, bounds.left), window.innerWidth - width - 16), top: above ? bounds.top - 8 : bounds.bottom + 8, above });
    setQuery(null);
  };
  // Feature: only real saved mention chips can trigger a preview; ordinary @ text stays ordinary prose.
  const chipFrom = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-reference-id]') : null;
  // Feature: arrow keys browse suggestions, Enter/Tab links a choice, and Escape dismisses picker or preview.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (composingRef.current || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); setQuery(null); setPreview(null); return; }
    const chip = chipFrom(event.target);
    if (chip && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showPreview(chip); return; }
    if (!query || !matches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length); }
    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(matches[Math.min(activeIndex, matches.length - 1)]); }
  };
  // Feature: pointer selection and hover reuse the same live preview without interfering with normal text editing.
  const onPointer = (event: MouseEvent<HTMLDivElement>) => { const chip = chipFrom(event.target); if (chip) showPreview(chip); else setPreview(null); };
  // Feature: a short hover grace period lets readers move from the inline chip into its description popup.
  const scheduleHide = () => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setPreview(null), 180); };

  return <div ref={wrapperRef} className="character-mention-field" style={tokens} onMouseLeave={scheduleHide} onBlur={(event) => { const next = event.relatedTarget as Node | null; if (!event.currentTarget.contains(next) && !document.getElementById(tooltipId)?.contains(next)) { setQuery(null); setPreview(null); } }}>
    <label className="character-mention-label" htmlFor={pickerId + '-editor'}>{label}</label>
    <div ref={editorRef} id={pickerId + '-editor'} role="textbox" aria-label={label} aria-multiline="true" aria-autocomplete="list" aria-controls={query ? pickerId : undefined} aria-activedescendant={query && matches.length ? pickerId + '-' + Math.min(activeIndex, matches.length - 1) : undefined} contentEditable suppressContentEditableWarning spellCheck className="character-mention-editor" data-placeholder={kind === 'organization' ? 'Describe their loyalties. Type @/ to link a group…' : 'Describe their bonds. Type @ to link a character…'} onInput={() => commit()} onKeyDown={onKeyDown} onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) searchAtCaret(); }} onClick={(event) => { const chip = chipFrom(event.target); if (chip) showPreview(chip); else searchAtCaret(); }} onMouseOver={onPointer} onFocusCapture={(event) => { const chip = chipFrom(event.target); if (chip) showPreview(chip); }} onCompositionStart={() => { composingRef.current = true; setQuery(null); }} onCompositionEnd={() => { composingRef.current = false; commit(); }} onPaste={(event) => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); commit(); }} onDrop={(event) => event.preventDefault()} />
    <div className="character-mention-hint">{kind === 'organization' ? 'Type @/ to link a group from World Building.' : 'Type @ to link another character.'} Hover or tap a link to preview it.</div>
    {query && <div className="character-mention-picker" id={pickerId} role="listbox" aria-label={kind === 'organization' ? 'Affiliation suggestions' : 'Character suggestions'}>
      {matches.length ? matches.map((candidate, index) => <button type="button" role="option" aria-selected={index === activeIndex} id={pickerId + '-' + index} key={candidate.id} className="character-mention-option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(candidate)}><span>{candidate.title}</span><span className="character-mention-option-description">{candidate.description || 'No description yet'}</span></button>) : <div role="status" className="character-mention-empty">{kind === 'organization' ? 'No matching group. Add a faction, family or organization in World Building.' : 'No matching character. Add their profile in Characters first.'}</div>}
    </div>}
    {preview && createPortal(<div id={tooltipId} role="tooltip" className="character-mention-preview" style={{ ...tokens, left: preview.left, top: preview.top, width: Math.min(320, window.innerWidth - 32), transform: preview.above ? 'translateY(-100%)' : undefined }} onMouseEnter={() => clearTimeout(hoverTimer.current)} onMouseLeave={scheduleHide}>
      <div className="character-mention-preview-header"><strong>{reference?.title ?? (changedType ? `${changedType.title} — now ${changedType.category}` : `Deleted ${kind === 'organization' ? 'group' : 'character'}`)}</strong><button type="button" aria-label="Close reference preview" onClick={() => setPreview(null)}>×</button></div>
      <p>{reference ? reference.description || (kind === 'organization' ? 'Add a description to this group in World Building.' : 'Add a detailed description or personality to this character.') : changedType ? 'This entry’s type changed. Affiliations link to families, factions and organizations. Review this reference or change its type back.' : `The original ${kind === 'organization' ? 'group' : 'character'} for ${preview.label} is no longer in this story. Remove the mention or link another entry.`}</p>
    </div>, document.body)}
  </div>;
}
