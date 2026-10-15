import type { ProsePreferences, TextAnchor } from '../../../domain/model';
import type { RevisionTab } from './RevisionTools';
import { anchorText, replaceHtmlText, type TextEdit } from '../lib/manuscriptOperations';
import Pressable from '../../../components/AccessiblePressable';
import { createElement, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import WritingToolbar, { type ToolbarAction } from './WritingToolbar';
import ChapterContextPanel from './ChapterContextPanel';
import ChapterPreview from './ChapterPreview';
import WritingTools from './WritingTools';
import { manuscriptText } from '../lib/writingAnalysis';
import { applyEditorTextEdit, editorTextSelection, selectEditorText, autoCapitalizeEditor } from '../lib/editorAssistance';
import type { Chapter, ChapterScene, Story, WritingAlignment, WritingBlockStyle, WritingFontFamily, WritingPreferences } from '../../../domain/model';
import { countTextWords } from '../../../domain/model';
import type { Theme } from '../../../theme/theme';
import './rich-editor.css';

type Props = {
  chapter: Chapter;
  story: Story;
  theme: Theme;
  desktop: boolean;
  saveState: string;
  // Feature: responsive context preferences belong to the workspace, surviving recovery and reload.
  contextBeside: boolean;
  contextOpen: boolean;
  onContextToggle: () => void;
  onExport: () => void;
  navigationControl?: ReactNode;
  onSceneChange: (scenes: ChapterScene[], activeSceneId: string) => void;
  onTitleChange: (title: string) => void;
  onSaveHtml: (html: string) => void;
  onTypographyChange: (fontFamily: WritingFontFamily, fontSize: number) => void;
  onPreferencesChange: (preferences: WritingPreferences) => void;
  // Feature: editorial tools share chapter ignores, project prose settings and real passage navigation.
  navigationRequest?: { chapterId: string; start: number; end: number; token: number };
  onRevisionOpen: (selection?: TextAnchor, tab?: RevisionTab) => void;
  onProsePreferences: (preferences: ProsePreferences) => void;
  onIgnoreProofreading: (ids: string[]) => void;
  onBack: () => void;
};

export default function RichEditor({ chapter, story, theme, desktop, saveState, contextBeside, contextOpen, onContextToggle, onExport, navigationControl, onSceneChange, onTitleChange, onSaveHtml, onTypographyChange, onPreferencesChange, onRevisionOpen, navigationRequest, onProsePreferences, onIgnoreProofreading, onBack }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const saveRef = useRef(onSaveHtml);
  const [title, setTitle] = useState(chapter.title);
  const [bodyText, setBodyText] = useState('');
  const [blockStyle, setBlockStyle] = useState<WritingBlockStyle>('Paragraph');
  const [alignment, setAlignment] = useState<WritingAlignment>('left');
  const [activeFormats, setActiveFormats] = useState<Partial<Record<ToolbarAction, boolean>>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  // Feature: context and writing tools have independent visibility for distraction-free drafting.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const previousTextRef = useRef(manuscriptText(chapter.html));
  const correctingRef = useRef(false);
  const preferences = chapter.writingPreferences ?? { grammarSuggestions: true, autoCapitalizeI: false };
  const fontFamily = chapter.fontFamily ?? 'Georgia';
  const fontSize = chapter.fontSize ?? 16;
  const styles = makeStyles(theme, desktop);

  useEffect(() => { saveRef.current = onSaveHtml; }, [onSaveHtml]);
  useEffect(() => {
    // Retains the editor's caret or selection while a toolbar menu takes focus.
    const rememberSelection = () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && selection.anchorNode && contentRef.current?.contains(selection.anchorNode)) {
        selectionRef.current = selection.getRangeAt(0).cloneRange();
        const word = selection.toString().trim();
        setSelectedWord(/^[a-z]+(?:['’-][a-z]+)*$/i.test(word) && word.length <= 64 ? word : '');
        setActiveFormats({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strike: document.queryCommandState('strikeThrough'),
          bullet: document.queryCommandState('insertUnorderedList'),
          numbered: document.queryCommandState('insertOrderedList'),
        });
        const anchor = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection.anchorNode.parentElement;
        const block = anchor?.closest('p,h1,h2,h3,blockquote');
        const tagStyles: Record<string, WritingBlockStyle> = { p: 'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', blockquote: 'Quote' };
        if (block && tagStyles[block.tagName.toLowerCase()]) setBlockStyle(tagStyles[block.tagName.toLowerCase()]);
        if (block) {
          const textAlign = window.getComputedStyle(block).textAlign;
          if (textAlign === 'center' || textAlign === 'right' || textAlign === 'justify') setAlignment(textAlign);
          else setAlignment('left');
        }
      }
    };
    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, []);
  useEffect(() => {
    setTitle(chapter.title);
    setBlockStyle('Paragraph');
    setAlignment('left');
    selectionRef.current = null;
    if (contentRef.current) {
      contentRef.current.innerHTML = chapter.html;
      setBodyText(contentRef.current.innerText);
    }
  }, [chapter.id]);
  // Hands each edit to the shared crash journal immediately; only database commits are debounced.
  const saveNow = () => {
    if (contentRef.current) saveRef.current(contentRef.current.innerHTML);
  };
  const onInput = (event?: { nativeEvent?: InputEvent }) => {
    if (correctingRef.current) return;
    const editor = contentRef.current;
    if (editor && preferences.autoCapitalizeI && event?.nativeEvent?.inputType === 'insertText' && !event.nativeEvent.isComposing) {
      correctingRef.current = true;
      try { autoCapitalizeEditor(editor, previousTextRef.current); } finally { correctingRef.current = false; }
    }
    previousTextRef.current = manuscriptText(editor?.innerHTML ?? '');
    setBodyText(contentRef.current?.innerText ?? '');
    saveNow();
  };
  // Captures the saved DOM selection before opening a revision dialog.
  const captureSelection = () => contentRef.current ? editorTextSelection(contentRef.current, selectionRef.current ?? undefined) : undefined;
  // Restores manuscript focus after the writing-tools modal has released its focus trap.
  const locatePassage = (start: number, end: number) => { setTimeout(() => { if (contentRef.current) selectEditorText(contentRef.current, start, end); }, 260); };
  useEffect(() => { if (navigationRequest?.chapterId === chapter.id) locatePassage(navigationRequest.start, navigationRequest.end); }, [navigationRequest?.token, chapter.id]);
  // Applies reviewed proofreading to the rich DOM while keeping browser undo available.
  const applyTextEdit = (edit: TextEdit) => {
    if (!contentRef.current) return;
    correctingRef.current = true;
    try { if (!applyEditorTextEdit(contentRef.current, edit)) throw new Error('This passage changed. Review the current suggestion again.'); } finally { correctingRef.current = false; }
    onInput();
  };
  const format = (command: string, value?: string) => {
    const editor = contentRef.current;
    editor?.focus();
    const selection = window.getSelection();
    if (editor && selection && selectionRef.current && editor.contains(selectionRef.current.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    document.execCommand(command, false, value);
    const updatedSelection = window.getSelection();
    if (updatedSelection?.rangeCount) selectionRef.current = updatedSelection.getRangeAt(0).cloneRange();
    onInput();
  };
  // Maps shared toolbar choices to the browser editor's native rich-text commands.
  const applyBlockStyle = (style: WritingBlockStyle) => {
    const tags: Record<WritingBlockStyle, string> = {
      Paragraph: 'p', 'Heading 1': 'h1', 'Heading 2': 'h2', 'Heading 3': 'h3', Quote: 'blockquote',
    };
    format('formatBlock', tags[style]);
    setBlockStyle(style);
  };
  // Applies the same alignment choices exposed by the native editor toolbar.
  const applyAlignment = (value: WritingAlignment) => {
    const commands: Record<WritingAlignment, string> = {
      left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull',
    };
    format(commands[value]);
    setAlignment(value);
  };
  const applyToolbarAction = (action: ToolbarAction) => {
    const commands: Record<ToolbarAction, string> = {
      bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough',
      bullet: 'insertUnorderedList', numbered: 'insertOrderedList', undo: 'undo', redo: 'redo',
    };
    format(commands[action]);
  };
  const changeTitle = (value: string) => { setTitle(value); onTitleChange(value); };

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        {navigationControl}
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹  Story</Text></Pressable>
        <View style={styles.topbarStory}>
          <Text style={styles.eyebrow}>Chapter</Text>
          <TextInput value={title} onChangeText={changeTitle} onBlur={() => onTitleChange(title.trim() || 'Untitled chapter')} style={styles.titleInput} accessibilityLabel="Chapter title" />
        </View>
        <View style={styles.topbarActions}>
          <Pressable accessibilityRole="button" onPress={() => setPreviewOpen(true)} style={styles.previewButton}><Text style={styles.previewButtonText}>Preview</Text></Pressable>
        </View>
      </View>
      <View style={styles.assistanceBar}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: contextOpen }} onPress={onContextToggle} style={styles.previewButton}><Text style={styles.previewButtonText}>{contextOpen ? 'Hide context' : 'Show context'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setToolsOpen(!toolsOpen)} style={styles.previewButton}><Text style={styles.previewButtonText}>Writing tools</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => onRevisionOpen(captureSelection())} style={styles.previewButton}><Text style={styles.previewButtonText}>Revision tools</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onExport} style={styles.previewButton}><Text style={styles.previewButtonText}>Export</Text></Pressable>
        {preferences.autoCapitalizeI && <Text style={styles.statusText}>Auto-capitalize I on</Text>}
      </View>
      <WritingToolbar
        theme={theme} desktop={desktop} blockStyle={blockStyle} fontFamily={fontFamily} fontSize={fontSize}
        alignment={alignment} activeFormats={activeFormats} enableHistory
        onBlockStyleChange={applyBlockStyle}
        onFontFamilyChange={(value) => onTypographyChange(value, fontSize)}
        onFontSizeChange={(value) => onTypographyChange(fontFamily, value)}
        onAlignmentChange={applyAlignment} onFormat={applyToolbarAction}
      />
      <ScrollView contentContainerStyle={styles.pageArea}>
        <View style={[styles.documentWorkspace, { flexDirection: contextBeside ? 'row' : 'column' }]}>
          <View style={[styles.paper, contextBeside && contextOpen && styles.paperBeside]}>
          <TextInput value={title} onChangeText={changeTitle} onBlur={() => onTitleChange(title.trim() || 'Untitled chapter')} style={styles.pageTitle} placeholder="Chapter title" placeholderTextColor={theme.muted} accessibilityLabel="Manuscript chapter heading" />
          {!title.trim() && <Text style={styles.statusText}>Add a title, or leave this field to use “Untitled chapter”.</Text>}
          {createElement('div', {
            ref: contentRef,
            className: `writer-rich-editor ${theme.mode}`,
            contentEditable: true,
            suppressContentEditableWarning: true,
            role: 'textbox',
            'aria-label': 'Chapter text editor',
            'aria-multiline': true,
            // Feature: show a writing prompt even when the empty draft contains a blank paragraph.
            'data-empty': bodyText.trim() ? undefined : 'true',
            spellCheck: true,
            style: { fontFamily, fontSize: fontSize + 'px' },
            onInput,
            onBlur: saveNow,
          })}
          </View>
          {contextBeside && contextOpen && <ChapterContextPanel chapter={chapter} story={story} theme={theme} onChange={onSceneChange} onLocate={(start, end) => { if (!contextBeside && contextOpen) onContextToggle(); locatePassage(start, end); }} onOutline={() => { if (!contextBeside && contextOpen) onContextToggle(); onRevisionOpen(captureSelection(), 'outline'); }} />}
        </View>
      </ScrollView>
      <View style={styles.statusbar}>
        <Text style={styles.statusText}>{countTextWords(bodyText)}{chapter.chapterGoal ? ` / ${chapter.chapterGoal}` : ''} words</Text>
        <Text style={styles.statusText}>{bodyText.replace(/\s/g, '').length} characters</Text>
        {desktop && <Text style={styles.statusHint}>Ctrl+B bold · Ctrl+I italic · Ctrl+Z undo</Text>}
      </View>
      {/* Feature: narrow context opens beside the current task as a drawer, leaving the manuscript first. */}
      <Modal accessibilityLabel="Chapter context" visible={!contextBeside && contextOpen} transparent animationType="fade" onRequestClose={onContextToggle}>
        <View style={styles.contextOverlay}><View style={styles.contextDrawer}>
          <View style={styles.contextHeader}><Text style={styles.contextTitle}>Chapter context</Text><Pressable accessibilityRole="button" accessibilityLabel="Close chapter context" onPress={onContextToggle} style={styles.previewButton}><Text style={styles.previewButtonText}>Close</Text></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled"><ChapterContextPanel inDrawer chapter={chapter} story={story} theme={theme} onChange={onSceneChange} onLocate={(start, end) => { if (!contextBeside && contextOpen) onContextToggle(); locatePassage(start, end); }} onOutline={() => { if (!contextBeside && contextOpen) onContextToggle(); onRevisionOpen(captureSelection(), 'outline'); }} /></ScrollView>
        </View></View>
      </Modal>
      <ChapterPreview visible={previewOpen} storyTitle={story.title} chapter={chapter} theme={theme} onClose={() => setPreviewOpen(false)} />
      <WritingTools visible={toolsOpen} theme={theme} text={manuscriptText(chapter.html)} selectedWord={selectedWord} preferences={preferences} onPreferences={onPreferencesChange} styleGuide={story.styleGuide} prosePreferences={story.prosePreferences} ignoredProofreading={chapter.ignoredProofreading ?? []} onIgnore={onIgnoreProofreading} onProsePreferences={onProsePreferences} onLocate={locatePassage} onApply={applyTextEdit} onClose={() => setToolsOpen(false)} />
    </View>
  );
}

// Fits the document canvas and keeps optional assistance controls usable on narrow screens.
function makeStyles(theme: Theme, desktop: boolean) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0, backgroundColor: theme.background },
    topbar: { minHeight: 64, flexShrink: 0, marginHorizontal: desktop ? 18 : 9, marginTop: desktop ? 14 : 8, paddingHorizontal: desktop ? 18 : 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#332F38', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 1 },
    backButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 8 }, backText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    topbarStory: { flex: 1, minWidth: 0 }, eyebrow: { color: theme.muted, fontSize: 12, letterSpacing: 1.2, fontWeight: '800' },
    titleInput: { color: theme.text, fontSize: 15, fontWeight: '700', padding: 0, marginTop: 3 },
    saveBadge: { flexDirection: 'row', gap: 7, alignItems: 'center' }, saveDot: { height: 7, width: 7, borderRadius: 4, backgroundColor: theme.secondary }, saveText: { color: theme.muted, fontSize: 14 },
    topbarActions: { flexDirection: 'row', alignItems: 'center', gap: 12 }, previewButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.border }, previewButtonText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    pageArea: { flexGrow: 1, alignItems: 'center', padding: desktop ? 26 : 12, paddingBottom: 40 },
    assistanceBar: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: desktop ? 26 : 12, paddingTop: 10 },
    documentWorkspace: { width: '100%', maxWidth: 1120, alignSelf: 'center', gap: 16 },
    paper: { width: '100%', maxWidth: 790, minHeight: desktop ? 760 : 580, paddingHorizontal: desktop ? 88 : 24, paddingTop: desktop ? 40 : 24, paddingBottom: 70, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: desktop ? 4 : 12, boxShadow: desktop ? '0 4px 22px rgba(32, 24, 46, 0.05)' : undefined },
    contextOverlay: { flex: 1, padding: 12, backgroundColor: 'rgba(18,16,21,0.34)', alignItems: 'flex-end', justifyContent: 'center' },
    contextDrawer: { width: '100%', maxWidth: 420, maxHeight: '92%', padding: 12, borderRadius: 16, backgroundColor: theme.surface, gap: 10 },
    contextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    contextTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
    paperBeside: { flex: 1, minWidth: 0, width: 'auto' },
    pageTitle: { fontSize: desktop ? 30 : 24, fontWeight: '700', color: theme.text, marginBottom: 24, padding: 0 },
    statusbar: { minHeight: 40, flexShrink: 0, flexWrap: 'wrap', backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 17 }, statusText: { color: theme.muted, fontSize: 12 }, statusHint: { color: theme.muted, fontSize: 12, marginLeft: 'auto' },
  });
}
