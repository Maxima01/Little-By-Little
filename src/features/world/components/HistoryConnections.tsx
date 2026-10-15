import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import type { Story, StoryEntry, WorldProfile } from '../../../domain/model';
import { MEMBERSHIP_CATEGORIES, relatedHistory, type HistoryLinkKey } from '../lib/worldProfile';
import type { Theme } from '../../../theme/theme';

// Feature: a history entry links saved places and participants independently of its written account.
export default function HistoryConnections({ story, entry, theme, onChange, onOpenCharacter, onOpenWorld }: {
  story: Story; entry: StoryEntry; theme: Theme; onChange: (patch: Partial<WorldProfile>) => void;
  onOpenCharacter: (entry: StoryEntry) => void; onOpenWorld: (entry: StoryEntry) => void;
}) {
  return <View style={{ gap: 20 }}>
    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>Linked places & participants</Text>
    <Text style={{ fontSize: 13, lineHeight: 21, color: theme.muted }}>Choose saved profiles to connect this history to your world. These links follow renames; your written participants and history stay separate.</Text>
    <HistoryLinkPicker label="Places" linkKey="settingIds" entries={story.worldbuilding} available={(item) => item.category === 'Setting'} {...{ entry, theme, onChange }} onOpen={onOpenWorld} />
    <HistoryLinkPicker label="Characters involved" linkKey="participantCharacterIds" entries={story.characters} available={() => true} {...{ entry, theme, onChange }} onOpen={onOpenCharacter} />
    <HistoryLinkPicker label="Groups involved" linkKey="participantGroupIds" entries={story.worldbuilding} available={(item) => MEMBERSHIP_CATEGORIES.includes(item.category)} {...{ entry, theme, onChange }} onOpen={onOpenWorld} />
  </View>;
}

// Feature: history pickers retain unavailable targets for explicit review/removal and distinguish duplicate names by ID.
function HistoryLinkPicker({ label, linkKey, entries, available, entry, theme, onChange, onOpen }: {
  label: string; linkKey: HistoryLinkKey; entries: StoryEntry[]; available: (entry: StoryEntry) => boolean;
  entry: StoryEntry; theme: Theme; onChange: (patch: Partial<WorldProfile>) => void; onOpen: (entry: StoryEntry) => void;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const ids = entry.worldProfile?.[linkKey] ?? [];
  const styles = makeStyles(theme);
  const options = entries.filter(available).filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  // Feature: a selected target toggles only its own link, preserving every other dossier field.
  const toggle = (id: string) => onChange({ [linkKey]: ids.includes(id) ? ids.filter((saved) => saved !== id) : [...ids, id] });
  return <View style={styles.root}>
    <Text style={styles.title}>{label}</Text>
    {!ids.length && <Text style={styles.detail}>No {label.toLowerCase()} linked.</Text>}
    {ids.map((id) => {
      const target = entries.find((item) => item.id === id);
      return <View key={id} style={styles.row}><View style={styles.copy}>
        {target ? <Pressable accessibilityLabel={`Open history ${label}: ${target.title}`} onPress={() => onOpen(target)} style={styles.button}><Text style={styles.link}>{target.title}</Text></Pressable> : <Text style={styles.title}>Deleted reference</Text>}
        <Text style={styles.detail}>{target ? available(target) ? target.category : `Now ${target.category} — review this link` : 'The saved profile is unavailable.'}</Text>
      </View><Pressable accessibilityLabel={`Remove history ${label}: ${target?.title ?? id}`} onPress={() => toggle(id)} style={styles.button}><Text style={styles.link}>Remove</Text></Pressable></View>;
    })}
    <Pressable accessibilityLabel={`Choose history ${label}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.button}><Text style={styles.link}>{open ? `Close ${label.toLowerCase()} picker` : `Choose ${label.toLowerCase()}`}</Text></Pressable>
    {open && <View style={styles.root}><TextInput accessibilityLabel={`Search history ${label}`} value={query} onChangeText={setQuery} placeholder="Search saved profiles…" placeholderTextColor={theme.muted} style={styles.input} />
      {!options.length && <Text style={styles.detail}>No matching saved profiles. Create them in Characters or World Building.</Text>}
      {options.map((target) => <Pressable key={target.id} accessibilityRole="checkbox" accessibilityLabel={`History ${label}: ${target.title}`} accessibilityState={{ checked: ids.includes(target.id) }} onPress={() => toggle(target.id)} style={styles.row}><Text style={styles.link}>{ids.includes(target.id) ? '☑' : '☐'}</Text><View style={styles.copy}><Text style={styles.title}>{target.title}</Text><Text style={styles.detail}>{target.category}</Text></View></Pressable>)}
    </View>}
  </View>;
}

// Feature: related history appears on character, setting and group profiles without implying chapter presence.
export function RelatedHistory({ story, entryId, kind, theme, onOpen }: {
  story: Story; entryId: string; kind: 'character' | 'world'; theme: Theme; onOpen: (entry: StoryEntry) => void;
}) {
  const history = relatedHistory(story, entryId, kind), styles = makeStyles(theme);
  if (!history.length) return null;
  return <View style={styles.root}><Text style={styles.title}>Related history ({history.length})</Text>{history.map((entry) => <Pressable key={entry.id} accessibilityLabel={`Open related history ${entry.title}`} onPress={() => onOpen(entry)} style={styles.button}><Text style={styles.link}>{entry.title}</Text>{!!entry.worldProfile?.period && <Text style={styles.detail}>{entry.worldProfile.period}</Text>}</Pressable>)}</View>;
}

// Feature: history links share existing dossier styling, wrap at narrow widths and support both palettes.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { gap: 10 }, title: { fontSize: 14, fontWeight: '600', color: theme.text }, detail: { fontSize: 13, lineHeight: 21, color: theme.muted },
    row: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44, paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.border }, copy: { flex: 1, minWidth: 0 },
    button: { minHeight: 44, justifyContent: 'center', padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 8 }, link: { fontSize: 13, lineHeight: 21, color: theme.accent, fontWeight: '600' },
    input: { minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, fontSize: 14, color: theme.text, backgroundColor: theme.background },
  });
}
