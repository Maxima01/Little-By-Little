import type { ProsePreferences, TextAnchor } from '../../../domain/model';
import type { RevisionTab } from './RevisionTools';
import { anchorText, replaceHtmlText, type TextEdit } from '../lib/manuscriptOperations';
import Pressable from '../../../components/AccessiblePressable';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
  type OnChangeStateEvent,
  type OnChangeTextEvent,
  type OnChangeHtmlEvent,
} from 'react-native-enriched-html';
import type { Chapter, ChapterScene, Story, WritingPreferences } from '../../../domain/model';
import { countTextWords, plainText, type WritingAlignment, type WritingBlockStyle, type WritingFontFamily } from '../../../domain/model';
import WritingToolbar, { type ToolbarAction } from './WritingToolbar';
import ChapterContextPanel from './ChapterContextPanel';
import ChapterPreview from './ChapterPreview';
import WritingTools from './WritingTools';
import { capitalizeHtmlPronoun, justTypedPronoun, manuscriptText } from '../lib/writingAnalysis';
import type { Theme } from '../../../theme/theme';

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
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const onSaveRef = useRef(onSaveHtml);
  const [title, setTitle] = useState(chapter.title);
  const [bodyText, setBodyText] = useState(plainText(chapter.html));
  const [formatState, setFormatState] = useState<OnChangeStateEvent | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Feature: portable writing assistance retains its toggles with the chapter and preserves native selections.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const selectionRef = useRef({ start: 0, end: 0 });
  const htmlRef = useRef(chapter.html);
  const preferences = chapter.writingPreferences ?? { grammarSuggestions: true, autoCapitalizeI: false };
  const fontFamily = chapter.fontFamily ?? 'Georgia';
  const fontSize = chapter.fontSize ?? 16;
  const styles = makeStyles(theme, desktop);

  useEffect(() => { onSaveRef.current = onSaveHtml; }, [onSaveHtml]);

  useEffect(() => {
    setTitle(chapter.title);
    setBodyText(plainText(chapter.html));
  }, [chapter.id, chapter.title, chapter.html]);

  // Uses native HTML change events so navigation cannot strand a pending editor-only debounce.
  const changeHtml = (event: NativeSyntheticEvent<OnChangeHtmlEvent>) => {
    const value = event.nativeEvent.value;
    const suggestion = preferences.autoCapitalizeI ? justTypedPronoun(manuscriptText(htmlRef.current), manuscriptText(value)) : undefined;
    const next = suggestion ? capitalizeHtmlPronoun(value, suggestion) : value;
    htmlRef.current = next;
    if (next !== value) { editorRef.current?.setValue(next); editorRef.current?.setSelection(selectionRef.current.start, selectionRef.current.end); }
    onSaveRef.current(next);
  };
  // Captures the native selection as an anchored manuscript passage.
  const captureSelection = () => {
    const range = selectionRef.current;
    return range.end > range.start ? anchorText(manuscriptText(htmlRef.current), range.start, range.end) : undefined;
  };
  // Restores native manuscript selection after a tool dialog closes.
  const locatePassage = (start: number, end: number) => { setTimeout(() => { editorRef.current?.focus(); editorRef.current?.setSelection(start, end); }, 260); };
  useEffect(() => { if (navigationRequest?.chapterId === chapter.id) locatePassage(navigationRequest.start, navigationRequest.end); }, [navigationRequest?.token, chapter.id]);
  // Applies a reviewed text correction without deleting rich-text tags or unrelated passages.
  const applyTextEdit = (edit: TextEdit) => {
    const next = replaceHtmlText(htmlRef.current, [edit]);
    htmlRef.current = next; editorRef.current?.setValue(next); setBodyText(manuscriptText(next));
    editorRef.current?.setSelection(edit.start, edit.start + edit.after.length); onSaveRef.current(next);
  };
  const changeText = (event: NativeSyntheticEvent<OnChangeTextEvent>) => {
    setBodyText(event.nativeEvent.value);
  };

  const changeTitle = (value: string) => {
    setTitle(value);
    onTitleChange(value);
  };

  // Applies the chosen paragraph style while clearing a conflicting active style.
  const applyBlockStyle = (style: WritingBlockStyle) => {
    const editor = editorRef.current;
    if (!editor) return;
    const active = formatState;
    if (style === 'Paragraph') {
      if (active?.h1.isActive) editor.toggleH1();
      if (active?.h2.isActive) editor.toggleH2();
      if (active?.h3.isActive) editor.toggleH3();
      if (active?.blockQuote.isActive) editor.toggleBlockQuote();
      return;
    }
    if (style === 'Quote') {
      if (active?.h1.isActive) editor.toggleH1();
      if (active?.h2.isActive) editor.toggleH2();
      if (active?.h3.isActive) editor.toggleH3();
      if (!active?.blockQuote.isActive) editor.toggleBlockQuote();
      return;
    }
    const targetIsActive = style === 'Heading 1' ? active?.h1.isActive
      : style === 'Heading 2' ? active?.h2.isActive : active?.h3.isActive;
    if (targetIsActive) {
      if (style === 'Heading 1') editor.toggleH1();
      if (style === 'Heading 2') editor.toggleH2();
      if (style === 'Heading 3') editor.toggleH3();
      return;
    }
    if (active?.h1.isActive) editor.toggleH1();
    if (active?.h2.isActive) editor.toggleH2();
    if (active?.h3.isActive) editor.toggleH3();
    if (active?.blockQuote.isActive) editor.toggleBlockQuote();
    if (style === 'Heading 1') editor.toggleH1();
    if (style === 'Heading 2') editor.toggleH2();
    if (style === 'Heading 3') editor.toggleH3();
  };

  // Routes toolbar actions through the rich editor's supported formatting commands.
  const applyToolbarAction = (action: ToolbarAction) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (action === 'bold') editor.toggleBold();
    if (action === 'italic') editor.toggleItalic();
    if (action === 'underline') editor.toggleUnderline();
    if (action === 'strike') editor.toggleStrikeThrough();
    if (action === 'bullet') editor.toggleUnorderedList();
    if (action === 'numbered') editor.toggleOrderedList();
  };

  const alignment = formatState?.alignment === 'center' || formatState?.alignment === 'right' || formatState?.alignment === 'justify'
    ? formatState.alignment : 'left';

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        {navigationControl}
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹  Story</Text>
        </Pressable>
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
        theme={theme}
        desktop={desktop}
        blockStyle={formatState?.h1.isActive ? 'Heading 1' : formatState?.h2.isActive ? 'Heading 2' : formatState?.h3.isActive ? 'Heading 3' : formatState?.blockQuote.isActive ? 'Quote' : 'Paragraph'}
        fontFamily={fontFamily}
        fontSize={fontSize}
        alignment={alignment}
        activeFormats={{
          bold: !!formatState?.bold.isActive,
          italic: !!formatState?.italic.isActive,
          underline: !!formatState?.underline.isActive,
          strike: !!formatState?.strikeThrough.isActive,
          bullet: !!formatState?.unorderedList.isActive,
          numbered: !!formatState?.orderedList.isActive,
        }}
        onBlockStyleChange={applyBlockStyle}
        onFontFamilyChange={(next) => onTypographyChange(next, fontSize)}
        onFontSizeChange={(next) => onTypographyChange(fontFamily, next)}
        onAlignmentChange={(next) => editorRef.current?.setTextAlignment(next)}
        onFormat={applyToolbarAction}
      />

      <ScrollView contentContainerStyle={styles.pageArea} keyboardShouldPersistTaps="handled">
        <View style={[styles.documentWorkspace, { flexDirection: contextBeside ? 'row' : 'column' }]}>
          <View style={[styles.paper, contextBeside && contextOpen && styles.paperBeside]}>
          <TextInput value={title} onChangeText={changeTitle} onBlur={() => onTitleChange(title.trim() || 'Untitled chapter')} style={styles.pageTitle} placeholder="Chapter title" placeholderTextColor={theme.muted} accessibilityLabel="Manuscript chapter heading" />
          {!title.trim() && <Text style={styles.statusText}>Add a title, or leave this field to use “Untitled chapter”.</Text>}
          <EnrichedTextInput
            accessibilityLabel="Chapter text editor"
            key={chapter.id}
            ref={editorRef}
            defaultValue={chapter.html}
            placeholder="Begin your story here…"
            placeholderTextColor={theme.muted}
            cursorColor={theme.accent}
            selectionColor={theme.accentSoft}
            scrollEnabled={false}
            style={{ ...styles.editorInput, fontFamily, fontSize }}
            htmlStyle={{ h1: { fontSize: 30, bold: true }, h2: { fontSize: 24, bold: true }, h3: { fontSize: 19, bold: true }, blockquote: { borderColor: theme.accent, borderWidth: 3, color: theme.muted }, a: { color: theme.accent } }}
            onChangeText={changeText}
            onChangeHtml={changeHtml}
            onChangeSelection={(event) => {
              selectionRef.current = { start: event.nativeEvent.start, end: event.nativeEvent.end };
              const word = event.nativeEvent.text.trim();
              setSelectedWord(/^[a-z]+(?:['’-][a-z]+)*$/i.test(word) && word.length <= 64 ? word : '');
            }}
            onChangeState={(event) => setFormatState(event.nativeEvent)}
          />
          </View>
          {contextBeside && contextOpen && <ChapterContextPanel chapter={chapter} story={story} theme={theme} onChange={onSceneChange} onLocate={(start, end) => { if (!contextBeside && contextOpen) onContextToggle(); locatePassage(start, end); }} onOutline={() => { if (!contextBeside && contextOpen) onContextToggle(); onRevisionOpen(captureSelection(), 'outline'); }} />}
        </View>
      </ScrollView>

      <View style={styles.statusbar}>
        <Text style={styles.statusText}>{countTextWords(bodyText)}{chapter.chapterGoal ? ` / ${chapter.chapterGoal}` : ''} words</Text>
        <Text style={styles.statusText}>{bodyText.replace(/\s/g, '').length} characters</Text>

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


// Matches the desktop writing canvas while adapting assistance controls for native device widths.
function makeStyles(theme: Theme, desktop: boolean) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0, backgroundColor: theme.background },
    topbar: { minHeight: 64, flexShrink: 0, marginHorizontal: desktop ? 18 : 9, marginTop: desktop ? 14 : 8, paddingHorizontal: desktop ? 18 : 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#332F38', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 1 },
    backButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 8 },
    backText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    topbarStory: { flex: 1, minWidth: 0 },
    eyebrow: { color: theme.muted, fontSize: 12, letterSpacing: 1.2, fontWeight: '800' },
    titleInput: { color: theme.text, fontSize: 15, fontWeight: '700', padding: 0, marginTop: 3 },
    saveBadge: { flexDirection: 'row', gap: 7, alignItems: 'center' },
    topbarActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    previewButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
    previewButtonText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    saveDot: { height: 7, width: 7, borderRadius: 4, backgroundColor: theme.secondary },
    saveText: { color: theme.muted, fontSize: 14 },
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
    editorInput: { minHeight: 560, fontSize: 16, lineHeight: 30, color: theme.text, padding: 0, backgroundColor: 'transparent', flex: 1 },
    statusbar: { minHeight: 40, flexShrink: 0, flexWrap: 'wrap', backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 17 },
    statusText: { color: theme.muted, fontSize: 12 },
    statusHint: { color: theme.muted, fontSize: 12, marginLeft: 'auto' },
  });
}
