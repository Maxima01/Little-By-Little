import Pressable from '../../../components/AccessiblePressable';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Chapter, Workspace } from '../../../domain/model';
import { countWords } from '../../../domain/model';
import { compareChapterPassages, type ChapterRecoveryRequest, type Passage } from '../lib/chapterRecovery';
import type { Theme } from '../../../theme/theme';

type Props = { source: Chapter; storyId: string; storyTitle: string; workspace: Workspace | null; theme: Theme; busy: boolean; onRecover: (request: ChapterRecoveryRequest) => void; onBack: () => void };

// Feature: compares saved/current passages and lets authors recover a draft, append, or replace a chosen range.
export default function ChapterComparison({ source, storyId, storyTitle, workspace, theme, busy, onRecover, onBack }: Props) {
  const styles = makeStyles(theme);
  const { width } = useWindowDimensions();
  const story = workspace?.stories.find((item) => item.id === storyId);
  const current = story?.chapters.find((item) => item.id === source.id);
  const [savedIndices, setSavedIndices] = useState<number[]>([]);
  const [currentIndices, setCurrentIndices] = useState<number[]>([]);
  const rows = useMemo(() => compareChapterPassages(source.html, current?.html ?? ''), [source.html, current?.html]);
  const consecutive = currentIndices.length > 0 && Math.max(...currentIndices) - Math.min(...currentIndices) + 1 === currentIndices.length;

  // Refreshes selections after a recovery or a changed draft, preventing indices from referring to new passages.
  useEffect(() => { setSavedIndices([]); setCurrentIndices([]); }, [source.id, source.html, current?.html]);

  // Captures the compared draft so the recovery operation rejects concurrent changes before writing.
  const recover = (mode: ChapterRecoveryRequest['mode']) => onRecover({ storyId, source, expectedHtml: current?.html ?? null, mode, savedIndices, currentIndices });

  // Displays complete readable text; selections retain the original HTML including emphasis and list structure.
  const passageCell = (passage: Passage | null, saved: boolean) => {
    const selected = saved ? savedIndices : currentIndices;
    const setter = saved ? setSavedIndices : setCurrentIndices;
    return <View style={styles.cell}>
      {passage ? <>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select ${saved ? 'saved' : 'current'} passage ${passage.index + 1}`} accessibilityState={{ checked: selected.includes(passage.index), disabled: busy }} disabled={busy} onPress={() => setter(selected.includes(passage.index) ? selected.filter((index) => index !== passage.index) : [...selected, passage.index])} style={styles.selectRow}>
          <Text style={styles.check}>{selected.includes(passage.index) ? '☑' : '☐'}</Text><Text style={styles.label}>{saved ? 'Saved' : 'Current'} passage {passage.index + 1}</Text>
        </Pressable>
        <Text selectable style={styles.passage}>{passage.text || 'Empty paragraph'}</Text>
      </> : <Text style={styles.detail}>{saved ? 'No saved passage here' : 'No current passage here'}</Text>}
    </View>;
  };

  return <View style={styles.content}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.button}><Text style={styles.buttonText}>Back to version preview</Text></Pressable>
    <Text style={styles.title}>{storyTitle} / {source.title}</Text>
    <Text style={styles.detail}>Saved: {countWords(source.html)} words · Current: {current ? countWords(current.html) : 0} words</Text>
    <Text style={styles.detail}>Compare the complete passage text below. Recovery keeps the saved formatting. Lists and quotes are kept together as one passage.</Text>
    {!story && <Text style={styles.notice}>This story was deleted. Return to the version preview to restore the workspace.</Text>}
    {story && !current && <Text style={styles.notice}>This chapter was deleted. Recover chapter draft adds it back to this story.</Text>}
    <View style={styles.recovery}>
      <Text style={styles.label}>Recover selected passages</Text>
      <Text style={styles.detail}>Select saved passages to append. To replace text, also select consecutive current passages. Your current workspace is checkpointed first.</Text>
      <Text style={styles.detail}>{savedIndices.length} saved selected · {currentIndices.length} current selected{currentIndices.length > 0 && !consecutive ? ' · Choose a consecutive current range' : ''}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !current || !savedIndices.length }} disabled={busy || !current || !savedIndices.length} onPress={() => recover('append')} style={[styles.button, (!current || !savedIndices.length) && styles.disabled]}><Text style={styles.buttonText}>Append saved passages</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !current || !savedIndices.length || !consecutive }} disabled={busy || !current || !savedIndices.length || !consecutive} onPress={() => recover('replace')} style={[styles.button, (!current || !savedIndices.length || !consecutive) && styles.disabled]}><Text style={styles.buttonText}>Replace selected current passages</Text></Pressable>
      </View>
    </View>
    <View style={styles.recovery}>
      <Text style={styles.label}>Recover chapter draft</Text><Text style={styles.detail}>Replaces this chapter’s entire body with the saved body. Existing chapter details, other chapters, and story materials stay in place.</Text>
      <Pressable accessibilityRole="button" disabled={busy || !story || current?.html === source.html} onPress={() => recover('chapter')} style={[styles.button, (!story || current?.html === source.html) && styles.disabled]}><Text style={styles.buttonText}>Recover chapter draft</Text></Pressable>
    </View>
    {rows.map((row, index) => <View key={index} style={[styles.row, row.status !== 'unchanged' && styles.changed]}>
      <Text style={styles.status}>{row.status === 'unchanged' ? 'Unchanged' : row.status === 'changed' ? 'Changed text or formatting' : row.status === 'saved-only' ? 'Saved only' : 'Current only'}</Text>
      <View style={[styles.columns, { flexDirection: width >= 850 ? 'row' : 'column' }]}>{passageCell(row.saved, true)}{passageCell(row.current, false)}</View>
    </View>)}
    {!rows.length && <Text style={styles.detail}>Both drafts are empty.</Text>}
  </View>;
}

// Uses two columns when space permits and a stacked comparison on small screens.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    content: { gap: 14 }, title: { color: theme.text, fontSize: 17, fontWeight: '700' }, detail: { color: theme.muted, fontSize: 12, lineHeight: 19 },
    label: { color: theme.text, fontSize: 14, fontWeight: '600' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    button: { alignSelf: 'flex-start', padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 8 }, buttonText: { color: theme.accent, fontSize: 14, fontWeight: '600' }, disabled: { opacity: 0.45 },
    recovery: { gap: 10, paddingVertical: 14, borderTopWidth: 1, borderColor: theme.border }, notice: { padding: 12, backgroundColor: theme.secondarySoft, color: theme.text, fontSize: 14, lineHeight: 19 },
    row: { padding: 12, gap: 9, borderWidth: 1, borderColor: theme.border, borderRadius: 8 }, changed: { borderLeftWidth: 3, borderLeftColor: theme.accent, backgroundColor: theme.background }, status: { color: theme.secondary, fontSize: 14, fontWeight: '600' },
    columns: { gap: 16, alignItems: 'stretch' }, cell: { flex: 1, minWidth: 0, gap: 8 }, selectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, check: { color: theme.accent, fontSize: 19 }, passage: { color: theme.text, fontSize: 14, lineHeight: 22 },
  });
}
