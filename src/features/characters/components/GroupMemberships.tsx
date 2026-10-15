import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import type { Story, StoryEntry } from '../../../domain/model';
import { MEMBERSHIP_CATEGORIES } from '../../world/lib/worldProfile';
import type { Theme } from '../../../theme/theme';

// Feature: character memberships select saved groups explicitly and preserve notes and unavailable links for review.
export default function GroupMemberships({ story, ids, theme, onChange, onOpenGroup }: {
  story: Story; ids: string[]; theme: Theme; onChange: (ids: string[]) => void; onOpenGroup: (group: StoryEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const styles = makeStyles(theme);
  const groups = story.worldbuilding.filter((entry) => MEMBERSHIP_CATEGORIES.includes(entry.category));
  const matches = groups.filter((entry) => `${entry.title} ${entry.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  // Feature: selecting a group toggles only its stable ID, allowing multiple memberships and duplicate group names.
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter((saved) => saved !== id) : [...ids, id]);
  return <View style={styles.root}>
    <Text style={styles.title}>Memberships</Text>
    <Text style={styles.helper}>Link this character to families, factions, and organizations. Written affiliation notes stay separate.</Text>
    {ids.map((id) => {
      const group = story.worldbuilding.find((entry) => entry.id === id);
      const available = group && MEMBERSHIP_CATEGORIES.includes(group.category);
      return <View key={id} style={styles.selected}>
        <View style={styles.copy}>{group ? <Pressable accessibilityLabel={`Open membership ${group.title}`} onPress={() => onOpenGroup(group)} style={styles.link}><Text style={styles.linkText}>{group.title}</Text></Pressable> : <Text style={styles.title}>Deleted group</Text>}
          <Text style={styles.helper}>{available ? group.category : group ? 'This entry is no longer a family, faction, or organization.' : 'This saved membership no longer has a group profile.'}</Text></View>
        <Pressable accessibilityLabel={`Remove membership ${group?.title ?? 'deleted group'}`} onPress={() => toggle(id)} style={styles.button}><Text style={styles.linkText}>Remove</Text></Pressable>
      </View>;
    })}
    {!ids.length && <Text style={styles.helper}>No memberships selected.</Text>}
    <Pressable accessibilityLabel="Choose memberships" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.button}><Text style={styles.linkText}>{open ? 'Close membership picker' : 'Choose memberships'}</Text></Pressable>
    {open && <View style={styles.options}>
      <TextInput accessibilityLabel="Search memberships" value={query} onChangeText={setQuery} placeholder="Search groups by name or category…" placeholderTextColor={theme.muted} style={styles.input} />
      {!groups.length && <Text style={styles.helper}>Create a Family, Faction, or Organization in World Building to link it here.</Text>}
      {!!groups.length && !matches.length && <Text style={styles.helper}>No groups match this search.</Text>}
      {matches.map((group) => <Pressable key={group.id} accessibilityRole="checkbox" accessibilityLabel={`Membership: ${group.category} ${group.title}`} accessibilityState={{ checked: ids.includes(group.id) }} onPress={() => toggle(group.id)} style={styles.option}>
        <Text style={styles.mark}>{ids.includes(group.id) ? '☑' : '☐'}</Text><View style={styles.copy}><Text style={styles.title}>{group.title}</Text><Text style={styles.helper}>{group.category}</Text></View>
      </Pressable>)}
    </View>}
  </View>;
}

// Feature: membership controls wrap within narrow character profiles and share the workspace palette.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { gap: 10 }, title: { color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 21 }, helper: { color: theme.muted, fontSize: 13, lineHeight: 21 },
    copy: { flex: 1, minWidth: 0 }, selected: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 6 },
    button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 8, alignSelf: 'flex-start' },
    link: { minHeight: 32, justifyContent: 'center' }, linkText: { color: theme.accent, fontSize: 13, fontWeight: '600', lineHeight: 21, flexShrink: 1 },
    options: { padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 8, gap: 10 }, input: { backgroundColor: theme.background, color: theme.text, padding: 10, minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 8, fontSize: 14 },
    option: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 48, paddingVertical: 6 }, mark: { color: theme.accent, fontSize: 22 },
  });
}
