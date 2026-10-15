import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import type { CharacterLink, Story } from '../../../domain/model';
import { filterMentionCandidates, insertCharacterMention, mentionCandidates, mentionQuery, moveCharacterLinks, type MentionCandidate, type MentionKind } from '../lib/characterMentions';
import type { Theme } from '../../../theme/theme';

type Props = { label: string; value: string; links: CharacterLink[]; kind: MentionKind; story: Story; characterId: string; theme: Theme; onChange: (value: string, links: CharacterLink[]) => void };

// Feature: native writers can link @ references through a picker and tap saved links to read the same descriptions.
export default function CharacterMentionField({ label, value, links, kind, story, characterId, theme, onChange }: Props) {
  const [caret, setCaret] = useState(value.length);
  const [preview, setPreview] = useState<CharacterLink | null>(null);
  const candidates = mentionCandidates(story, kind, characterId);
  const query = mentionQuery(value, caret, links);
  const matches = query ? filterMentionCandidates(candidates, query.query) : [];
  const target = candidates.find((candidate) => candidate.id === preview?.targetId);
  // Feature: native affiliation previews also explain recategorised targets without claiming they were deleted.
  const changedType = preview && kind === 'organization' && !target ? story.worldbuilding.find((entry) => entry.id === preview.targetId) : undefined;
  const styles = makeStyles(theme);
  // Feature: selecting a native suggestion adds a stable ID and moves the caret after the inserted mention.
  const choose = (candidate: MentionCandidate) => {
    if (!query) return;
    const next = insertCharacterMention(value, links, query, candidate); onChange(next.value, next.links); setCaret(next.caret);
  };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} multiline value={value} onChangeText={(next) => { onChange(next, moveCharacterLinks(value, next, links)); setCaret(next.length); }} onSelectionChange={(event) => setCaret(event.nativeEvent.selection.end)} placeholder={kind === 'organization' ? 'Describe their loyalties. Type @/ to link a group…' : 'Describe their bonds. Type @ to link a character…'} placeholderTextColor={theme.muted} style={styles.input} />
    <Text style={styles.helper}>{kind === 'organization' ? 'Type @/ to link a group from World Building.' : 'Type @ to link another character.'} Tap a link to preview it.</Text>
    {query && <View style={styles.picker}>{matches.length ? matches.map((candidate) => <Pressable key={candidate.id} onPress={() => choose(candidate)} style={styles.option}><Text style={styles.label}>{candidate.title}</Text><Text numberOfLines={2} style={styles.helper}>{candidate.description || 'No description yet'}</Text></Pressable>) : <Text style={styles.helper}>{kind === 'organization' ? 'No matching group. Add a faction, family or organization in World Building.' : 'No matching character. Add their profile in Characters first.'}</Text>}</View>}
    {!!links.length && <View style={styles.links}>{links.map((link) => <Pressable key={`${link.targetId}-${link.start}`} onPress={() => setPreview(link)} style={styles.chip}><Text style={styles.linkText}>{value.slice(link.start, link.end)}</Text></Pressable>)}</View>}
    <Modal transparent visible={!!preview} animationType="fade" onRequestClose={() => setPreview(null)}><View style={styles.backdrop}><View accessibilityViewIsModal style={styles.preview}><Text style={styles.label}>{target?.title ?? (changedType ? `${changedType.title} — now ${changedType.category}` : `Deleted ${kind}`)}</Text><ScrollView><Text style={styles.helper}>{target ? target.description || 'No description yet. Add one in the entry’s profile.' : changedType ? 'This entry’s type changed. Affiliations link to families, factions and organizations. Review this reference or change its type back.' : 'The original entry is no longer in this story. Remove the mention or link another entry.'}</Text></ScrollView><Pressable onPress={() => setPreview(null)} style={styles.option}><Text style={styles.linkText}>Close reference preview</Text></Pressable></View></View></Modal>
  </View>;
}

// Feature: native mention controls follow the same theme colors and minimum touch sizes as the dossier.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    field: { gap: 7, minWidth: 0 }, label: { color: theme.text, fontSize: 13, fontWeight: '600' }, helper: { color: theme.muted, fontSize: 12, lineHeight: 19 },
    input: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, minHeight: 92, textAlignVertical: 'top', backgroundColor: theme.background, color: theme.text, fontSize: 14, lineHeight: 22 },
    picker: { borderWidth: 1, borderColor: theme.border, borderRadius: 9, padding: 12, gap: 8 }, option: { minHeight: 44, paddingVertical: 10, gap: 4 }, links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { backgroundColor: theme.accentSoft, padding: 10, borderRadius: 8, minHeight: 44 }, linkText: { color: theme.accent, fontSize: 13, fontWeight: '600' },
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(18,16,21,0.42)', padding: 20 }, preview: { width: '100%', maxWidth: 440, maxHeight: '80%', padding: 20, borderRadius: 12, backgroundColor: theme.surface, gap: 16 },
  });
}
