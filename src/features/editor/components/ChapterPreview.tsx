import Pressable from '../../../components/AccessiblePressable';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Chapter } from '../../../domain/model';
import PreviewBody from './PreviewBody';
import { estimatedPreviewPages } from '../lib/previewPagination';
import type { Theme } from '../../../theme/theme';

type Props = { visible: boolean; storyTitle: string; chapter: Chapter; theme: Theme; onClose: () => void };
type PreviewMode = 'ebook' | 'pdf';

// Previews a chapter in a narrow reflowable reading layout or separated print pages.
export default function ChapterPreview({ visible, storyTitle, chapter, theme, onClose }: Props) {
  const [mode, setMode] = useState<PreviewMode>('ebook');
  const styles = makeStyles(theme);
  const pages = estimatedPreviewPages(chapter.html);
  const shownPages = mode === 'ebook' ? [chapter.html] : pages;

  return (
    <Modal accessibilityLabel="Chapter preview" visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View><Text style={styles.headerTitle}>Preview</Text><Text style={styles.headerSubtitle}>{storyTitle} · {chapter.title}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>Close</Text></Pressable>
        </View>
        <View style={styles.modeRow}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'ebook' }} onPress={() => setMode('ebook')} style={[styles.modeButton, mode === 'ebook' && styles.modeButtonActive]}><Text style={[styles.modeText, mode === 'ebook' && styles.modeTextActive]}>Mobile · EPUB</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'pdf' }} onPress={() => setMode('pdf')} style={[styles.modeButton, mode === 'pdf' && styles.modeButtonActive]}><Text style={[styles.modeText, mode === 'pdf' && styles.modeTextActive]}>PDF estimate</Text></Pressable>
          <Text style={styles.modeHint}>{mode === 'ebook' ? 'Reflowable reader layout' : 'Estimated A4 pagination. Actual PDF page breaks may differ; long passages stay intact.'}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.previewScroll}>
          {shownPages.map((html, index) => <View key={mode + '-' + index} style={[styles.page, mode === 'ebook' ? styles.ebookPage : styles.pdfPage]}>
            <Text style={styles.storyTitle}>{storyTitle}</Text>
            {index === 0 && <Text style={styles.chapterTitle}>{chapter.title}</Text>}
            <View style={styles.previewBody}><PreviewBody key={chapter.id + mode + index + chapter.updatedAt} html={html} chapter={chapter} /></View>
            {mode === 'pdf' && <Text style={styles.pageNumber}>Estimated page {index + 1}</Text>}
          </View>)}
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    header: { minHeight: 70, flexShrink: 0, paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 },
    headerTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
    headerSubtitle: { maxWidth: 220, color: theme.muted, fontSize: 12, marginTop: 4 },
    closeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
    closeText: { color: theme.text, fontSize: 14, fontWeight: '600' },
    modeRow: { minHeight: 58, flexShrink: 0, flexWrap: 'wrap', paddingVertical: 10, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface },
    modeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
    modeButtonActive: { backgroundColor: theme.accentSoft },
    modeText: { color: theme.muted, fontSize: 14, fontWeight: '600' },
    modeTextActive: { color: theme.accent },
    modeHint: { flexShrink: 1, color: theme.muted, fontSize: 12, maxWidth: 440 },
    previewScroll: { flexGrow: 1, alignItems: 'center', gap: 20, padding: 24, paddingBottom: 44 },
    page: { width: '100%', backgroundColor: '#fffefa', borderWidth: 1, borderColor: theme.border, shadowColor: '#302a36', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 4 }, shadowRadius: 16, elevation: 2 },
    ebookPage: { maxWidth: 410, minHeight: 700, paddingHorizontal: 24, paddingVertical: 32, borderRadius: 8 },
    pdfPage: { maxWidth: 595, minHeight: 842, paddingHorizontal: 28, paddingTop: 42, paddingBottom: 42, borderRadius: 3 },
    storyTitle: { color: '#77717c', fontSize: 12, textAlign: 'center', marginBottom: 30 },
    chapterTitle: { color: '#302a36', fontSize: 26, fontWeight: '700', marginBottom: 26, textAlign: 'center' },
    previewBody: { flex: 1 },
    pageNumber: { color: '#77717c', fontSize: 12, textAlign: 'center', marginTop: 20 },
  });
}
