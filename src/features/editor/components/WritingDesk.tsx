import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import Pressable from '../../../components/AccessiblePressable';
import type { Theme } from '../../../theme/theme';
import type { RevisionTab } from './RevisionTools';

export type WritingView = { width: number; spacing: number; formatting: boolean };
export const DEFAULT_WRITING_VIEW: WritingView = { width: 790, spacing: 1.9, formatting: true };

// Feature: direct editorial shortcuts and a view panel make the writing desk discoverable on every screen size.
export function WritingDeskControls({ theme, view, onView, contextOpen, onContext, onTools, onRevision }: {
  theme: Theme; view: WritingView; onView: (value: WritingView) => void;
  contextOpen: boolean; onContext: () => void; onTools: () => void; onRevision: (tab: RevisionTab) => void;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const styles = makeStyles(theme);
  return <>
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.controlsScroll} contentContainerStyle={styles.controls} keyboardShouldPersistTaps="always">
      <Pressable onPress={() => onRevision('find')} style={styles.button}><Text style={styles.buttonText}>Find & replace</Text></Pressable>
      <Pressable onPress={() => onRevision('outline')} style={styles.button}><Text style={styles.buttonText}>Scene outline</Text></Pressable>
      <Pressable onPress={onTools} style={styles.button}><Text style={styles.buttonText}>Writing tools</Text></Pressable>
      <Pressable onPress={() => onRevision('comments')} style={styles.button}><Text style={styles.buttonText}>Revision tools</Text></Pressable>
      <View style={styles.divider} />
      <Pressable onPress={() => setViewOpen(true)} style={styles.button}><Text style={styles.buttonText}>View options</Text></Pressable>
      <Pressable onPress={onContext} accessibilityState={{ expanded: contextOpen }} style={[styles.button, contextOpen && styles.selected]}><Text style={styles.buttonText}>{contextOpen ? 'Hide context' : 'Show context'}</Text></Pressable>
    </ScrollView>
    <Modal visible={viewOpen} transparent animationType="fade" accessibilityLabel="Writing view options" onRequestClose={() => setViewOpen(false)}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close view options" style={StyleSheet.absoluteFill} onPress={() => setViewOpen(false)} />
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.row}><Text style={styles.title}>Make room for your words</Text><Pressable accessibilityLabel="Close view options" onPress={() => setViewOpen(false)} style={styles.button}><Text style={styles.buttonText}>Done</Text></Pressable></View>
          {/* Feature: view preferences scroll beneath a fixed Done action on short windows. */}
          <ScrollView style={styles.preferencesScroll} contentContainerStyle={styles.preferencesContent}>
          <Text style={styles.muted}>Adjust your writing view. These settings do not change your export layout.</Text>
          {Platform.OS === 'web' && <Text style={styles.muted}>Ctrl/⌘ + F to find · Ctrl/⌘ + Shift + F to focus · Esc to exit focus</Text>}
          <Text style={styles.label}>Page width</Text>
          <View style={styles.options}>{[{ label: 'Compact', value: 640 }, { label: 'Comfortable', value: 790 }, { label: 'Wide', value: 960 }].map((option) => <Pressable key={option.value} accessibilityLabel={`${option.label} page width`} accessibilityState={{ selected: view.width === option.value }} onPress={() => onView({ ...view, width: option.value })} style={[styles.option, view.width === option.value && styles.selected]}><Text style={styles.buttonText}>{option.label}</Text></Pressable>)}</View>
          <Text style={styles.label}>Line spacing</Text>
          <View style={styles.options}>{[1.5, 1.9, 2.2].map((spacing) => <Pressable key={spacing} accessibilityLabel={`Line spacing ${spacing}`} accessibilityState={{ selected: view.spacing === spacing }} onPress={() => onView({ ...view, spacing })} style={[styles.option, view.spacing === spacing && styles.selected]}><Text style={styles.buttonText}>{spacing === 1.5 ? 'Tight' : spacing === 1.9 ? 'Relaxed' : 'Airy'} · {spacing}</Text></Pressable>)}</View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: view.formatting }} onPress={() => onView({ ...view, formatting: !view.formatting })} style={[styles.option, view.formatting && styles.selected]}><Text style={styles.buttonText}>{view.formatting ? '✓' : '○'}  Show formatting toolbar</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

// Feature: a live footer pairs word/selection counts and estimated reading time with an actionable chapter goal.
export function WritingDeskStatus({ theme, words, selectedWords, characters, goal, saveState, onGoal }: {
  theme: Theme; words: number; selectedWords: number; characters: number; goal?: number; saveState: string; onGoal: () => void;
}) {
  const styles = makeStyles(theme);
  const progress = goal ? Math.min(100, Math.round(words / goal * 100)) : 0;
  return <View style={styles.status}>
    <Text style={styles.wordCount}>{words.toLocaleString()} words</Text>
    {selectedWords > 0 && <Text style={styles.muted}>{selectedWords.toLocaleString()} selected</Text>}
    <Text style={styles.muted}>{characters.toLocaleString()} characters</Text>
    <Text style={styles.muted}>{words ? Math.max(1, Math.ceil(words / 200)) : 0} min read</Text>
    <Pressable accessibilityLabel={goal ? `Chapter goal: ${words} of ${goal} words, ${progress} percent. Edit goal` : 'Set chapter word goal'} onPress={onGoal} style={styles.goal}>
      <Text style={styles.buttonText}>{goal ? `${progress}% of ${goal.toLocaleString()} word goal` : '+ Set word goal'}</Text>
      {!!goal && <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>}
    </Pressable>
    <Text style={styles.save}>{saveState}</Text>
  </View>;
}

// Feature: shared desk styling keeps view controls and live progress consistent in light and dark themes.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    controlsScroll: { flexGrow: 0, flexShrink: 0, marginHorizontal: 12 },
    controls: { alignItems: 'center', flexDirection: 'row', paddingVertical: 6, gap: 4 },
    button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 8 },
    buttonText: { color: theme.accent, fontSize: 14, fontWeight: '600' },
    divider: { width: 1, height: 20, backgroundColor: theme.border, marginHorizontal: 6 },
    selected: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(18,16,21,0.4)' },
    panel: { width: '100%', maxWidth: 490, maxHeight: '100%', padding: 22, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, gap: 12 },
    preferencesScroll: { flexShrink: 1 },
    preferencesContent: { gap: 12, paddingBottom: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
    title: { color: theme.text, fontSize: 19, fontWeight: '700', flex: 1 },
    muted: { color: theme.muted, fontSize: 13, lineHeight: 19 },
    label: { color: theme.text, fontSize: 13, fontWeight: '700', marginTop: 8 },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 9, borderWidth: 1, borderColor: theme.border, justifyContent: 'center' },
    status: { flexShrink: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 18, rowGap: 4, paddingHorizontal: 24, paddingVertical: 8, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    wordCount: { fontSize: 12, fontWeight: '700', color: theme.text },
    goal: { minHeight: 36, justifyContent: 'center', gap: 5 },
    track: { height: 3, backgroundColor: theme.accentSoft, borderRadius: 4, overflow: 'hidden' },
    fill: { height: 3, backgroundColor: theme.accent, borderRadius: 4 },
    save: { color: theme.muted, fontSize: 11, marginLeft: 'auto' },
  });
}
