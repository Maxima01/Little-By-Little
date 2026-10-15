import Pressable from '../../../components/AccessiblePressable';
import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EXPORT_FORMATS, type ExportFormat } from '../lib/exportDocument';
import { exportStoryFile } from '../lib/fileTransfer';
import type { Story } from '../../../domain/model';
import { exportSelection, resumeChapter } from '../lib/workspaceUx';
import type { Theme } from '../../../theme/theme';

// Lets writers choose a reading or editing format before generating the ordered chapter manuscript.
export default function ExportDialog({ story, currentChapterId, theme, onClose }: { story: Story; currentChapterId?: string; theme: Theme; onClose: () => void }) {
  const styles = makeStyles(theme);
  // Feature: review the included titles and choose chapter IDs before generating any output format.
  const current = story.chapters.find((chapter) => chapter.id === currentChapterId) ?? resumeChapter(story);
  const [scope, setScope] = useState<'chapter' | 'selected' | 'story'>(currentChapterId ? 'chapter' : 'story');
  const [selectedIds, setSelectedIds] = useState<string[]>(current ? [current.id] : []);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [language, setLanguage] = useState('en');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const included = exportSelection(story, scope === 'story' ? story.chapters.map((chapter) => chapter.id) : scope === 'chapter' ? current ? [current.id] : [] : selectedIds);
  // Feature: scope changes clear feedback from a previous export.
  const clearFeedback = () => { setMessage(''); setError(''); };
  // Feature: select chapters by ID, keeping manuscript order for output.
  const toggleChapter = (id: string) => { setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); clearFeedback(); };
  // Reports generator failures and cancellation without falsely announcing a successful saved file.
  const exportFile = async () => {
    if (!included.chapters.length) { setError('Select at least one chapter to export.'); return; }
    setBusy(true); setMessage(''); setError('');
    try { setMessage(await exportStoryFile(included, format, language)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not export this story. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Modal accessibilityLabel="Export manuscript" visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={styles.overlay}><View style={styles.modal}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Export manuscript</Text><Pressable accessibilityRole="button" accessibilityLabel="Close export options" disabled={busy} onPress={onClose} style={styles.closeButton}><Text style={styles.close}>×</Text></Pressable></View>
      <Text style={styles.detail}>{story.title}. Chapters export in manuscript order. Workspace backups also include notes, characters and research.</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.options}>
        <Text style={styles.optionTitle}>What to include</Text>
        <View style={styles.scopeRow}>{([{ id: 'chapter', title: 'This chapter' }, { id: 'selected', title: 'Selected chapters' }, { id: 'story', title: 'Entire story' }] as const).map((option) => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.title} accessibilityState={{ checked: scope === option.id, disabled: busy || (option.id === 'chapter' && !current) }} disabled={busy || (option.id === 'chapter' && !current)} onPress={() => { setScope(option.id); clearFeedback(); }} style={[styles.scopeButton, scope === option.id && styles.selected]}><Text style={styles.optionTitle}>{option.title}</Text></Pressable>)}</View>
        {scope === 'selected' && story.chapters.map((chapter, index) => <Pressable key={chapter.id} accessibilityRole="checkbox" accessibilityLabel={`Include ${chapter.title}`} accessibilityState={{ checked: selectedIds.includes(chapter.id), disabled: busy }} disabled={busy} onPress={() => toggleChapter(chapter.id)} style={styles.chapterRow}><Text style={styles.check}>{selectedIds.includes(chapter.id) ? '☑' : '☐'}</Text><Text style={styles.chapterTitle}>{index + 1}. {chapter.title}</Text></Pressable>)}
        <View style={styles.summary}><Text style={styles.optionTitle}>Included titles ({included.chapters.length})</Text>{included.chapters.length ? included.chapters.map((chapter) => <Text key={chapter.id} style={styles.detail}>{chapter.title}</Text>) : <Text accessibilityLiveRegion="polite" style={styles.detail}>{story.chapters.length ? 'Select at least one chapter to export.' : 'Create a chapter before exporting.'}</Text>}</View>
        <Text style={styles.optionTitle}>File format</Text>
        {EXPORT_FORMATS.map((option) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: format === option.id, disabled: busy }} key={option.id} disabled={busy} onPress={() => { setFormat(option.id); setMessage(''); setError(''); }} style={[styles.option, format === option.id && styles.selected]}>
          <Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.detail}>{option.detail}</Text>
        </Pressable>)}
        {format === 'epub' && <View><Text style={styles.detail}>Book language (for e-reader pronunciation, e.g. en, fil, zh)</Text><TextInput accessibilityLabel="EPUB book language" editable={!busy} value={language} autoCapitalize="none" onChangeText={setLanguage} style={styles.input} /></View>}
      </ScrollView>
      {format === 'pdf' && Platform.OS === 'web' && typeof window !== 'undefined' && !window.novelDesktop && <Text style={styles.detail}>Your browser's print dialog will open. Choose Save as PDF.</Text>}
      {message || error ? <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.message}>{error || message}</Text> : null}
      <View style={styles.actions}>{busy && <ActivityIndicator color={theme.accent} />}<Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !included.chapters.length, busy }} disabled={busy || !included.chapters.length} onPress={() => { void exportFile(); }} style={[styles.primary, !included.chapters.length && { opacity: 0.5 }]}><Text style={styles.primaryText}>{busy ? 'Preparing…' : `Export ${format === 'docx' ? 'Word' : format.toUpperCase()}`}</Text></Pressable></View>
    </View></View>
  </Modal>;
}

// Keeps format descriptions legible and selectable on both wide and narrow workspace windows.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, scopeButton: { minHeight: 44, padding: 10, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: theme.border },
    chapterRow: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44, paddingHorizontal: 8 }, check: { color: theme.accent, fontSize: 22 }, chapterTitle: { color: theme.text, fontSize: 14, flex: 1 }, summary: { padding: 12, backgroundColor: theme.background, borderRadius: 10, gap: 4, marginVertical: 8 },
    overlay: { flex: 1, padding: 12, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
    modal: { width: '100%', maxWidth: 520, maxHeight: '92%', padding: 20, borderRadius: 18, backgroundColor: theme.surface, gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { flexShrink: 1, fontSize: 20, color: theme.text, fontWeight: '700' }, close: { fontSize: 26, color: theme.muted },
    detail: { fontSize: 12, lineHeight: 19, color: theme.muted }, scroll: { flexShrink: 1 }, options: { gap: 8 },
    option: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 13, gap: 3 }, selected: { borderColor: theme.accent, backgroundColor: theme.accentSoft }, optionTitle: { fontSize: 14, color: theme.text, fontWeight: '600' },
    input: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 9, color: theme.text, marginTop: 6 }, message: { fontSize: 14, lineHeight: 19, color: theme.text },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }, primary: { borderRadius: 9, backgroundColor: theme.accent, paddingVertical: 12, paddingHorizontal: 20 }, primaryText: { color: theme.mode === 'dark' ? '#201B2A' : '#fff', fontWeight: '700', fontSize: 14 },
  });
}
