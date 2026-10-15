import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import { WORLD_GROUPS, type EntryCategory, type Story, type StoryEntry } from '../../../domain/model';
import { worldTypeImpact } from '../lib/worldProfile';
import type { Theme } from '../../../theme/theme';

// Feature: choosing a different world type previews affected facts and links before an explicit confirmation.
export default function WorldTypeChange({ story, entry, theme, onConfirm, onClose }: {
  story: Story; entry: StoryEntry; theme: Theme; onConfirm: (category: EntryCategory) => void; onClose: () => void;
}) {
  const [category, setCategory] = useState(entry.category);
  const impact = worldTypeImpact(story, entry, category);
  const styles = makeStyles(theme);
  const changed = category !== entry.category;
  // Feature: previews list the actual affected records rather than a generic conversion warning.
  const affected = (label: string, items: string[]) => items.length ? <Text style={styles.detail}>{label} ({items.length}): {items.join(', ')}</Text> : null;
  return <Modal accessibilityLabel="Change world entry type" transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Dismiss type change" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.modal}>
        <Text accessibilityRole="header" style={styles.heading}>Change type</Text>
        <Text style={styles.detail}>{entry.title} · Currently {entry.category}</Text>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.choices}>{WORLD_GROUPS.map((type) => <Pressable key={type} accessibilityRole="radio" accessibilityLabel={`New world type: ${type}`} accessibilityState={{ checked: category === type }} onPress={() => setCategory(type)} style={[styles.button, category === type && styles.selected]}><Text style={styles.link}>{type}</Text></Pressable>)}</View>
          {changed && <>
            <Text style={styles.heading}>{entry.category} → {category}</Text>
            <Text style={styles.detail}>All saved facts, descriptions, author notes, events and links will be preserved. A recovery checkpoint will be created before the change.</Text>
            {affected('Facts hidden by the new profile', impact.hiddenFacts)}
            {!!impact.hiddenFacts.length && <Text style={styles.detail}>Change back to their original type to edit these facts again.</Text>}
            {affected('Scenes that will need a Setting', impact.scenes)}
            {affected('Character memberships that will become unavailable', impact.members)}
            {affected('Affiliation references that will become unavailable', impact.affiliations)}
            {affected('History references that will need review', impact.history)}
            {impact.hidesHistoryLinks && <Text style={styles.detail}>This entry’s linked history places and participants will be preserved, but hidden until it is a History entry again. It will stop appearing under Related history.</Text>}
            {!!(impact.scenes.length || impact.members.length || impact.affiliations.length || impact.history.length) && <Text style={styles.detail}>The affected references stay saved for review. Changing back restores their availability.</Text>}
          </>}
        </ScrollView>
        <View style={styles.actions}><Pressable onPress={onClose} style={styles.button}><Text style={styles.link}>Cancel</Text></Pressable><Pressable accessibilityLabel="Confirm world type change" accessibilityState={{ disabled: !changed }} disabled={!changed} onPress={() => onConfirm(category)} style={[styles.button, styles.selected, !changed && { opacity: 0.5 }]}><Text style={styles.link}>Change to {category}</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}

// Feature: type confirmation uses existing theme tokens and stays scrollable at phone widths.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, padding: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(18,16,21,0.42)' },
    modal: { width: '100%', maxWidth: 660, maxHeight: '92%', padding: 20, gap: 14, borderRadius: 16, backgroundColor: theme.surface },
    heading: { fontSize: 18, fontWeight: '700', color: theme.text }, detail: { fontSize: 14, lineHeight: 22, color: theme.muted }, body: { gap: 14, paddingBottom: 12 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 44, justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 8 },
    selected: { backgroundColor: theme.accentSoft, borderColor: theme.accent }, link: { fontSize: 14, fontWeight: '600', color: theme.accent }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  });
}
