import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import { type Chapter, type Story, type StoryEntry, type WorldProfile } from '../../../domain/model';
import { MEMBERSHIP_CATEGORIES, WORLD_FIELDS, settingChapters, worldMembers } from '../lib/worldProfile';
import WorldEvents from './WorldEvents';
import WorldTypeChange from './WorldTypeChange';
import HistoryConnections, { RelatedHistory } from './HistoryConnections';
import type { Theme } from '../../../theme/theme';

type Props = { story: Story; entry: StoryEntry; theme: Theme; onPatch: (patch: Partial<StoryEntry>) => void; onOpenCharacter: (character: StoryEntry) => void; onOpenWorld: (entry: StoryEntry) => void; onOpenChapter: (chapter: Chapter) => void };

// Feature: world dossiers mirror the character workspace with tailored facts, existing descriptions, connections and author plans.
export default function WorldWorkspace({ story, entry, theme, onPatch, onOpenCharacter, onOpenWorld, onOpenChapter }: Props) {
  const [width, setWidth] = useState(0);
  const [tab, setTab] = useState<'Profile' | 'Detailed description'>('Profile');
  const [eventsOpen, setEventsOpen] = useState(false);
  // Feature: type changes have a separate draft and confirmation rather than instant category buttons.
  const [typeChangeOpen, setTypeChangeOpen] = useState(false);
  const wide = width >= 1080;
  const styles = makeStyles(theme, width < 620);
  const profile = entry.worldProfile ?? {};
  const fields = WORLD_FIELDS[entry.category] ?? [];
  const members = worldMembers(story, entry);
  const chapters = settingChapters(story, entry);
  const group = MEMBERSHIP_CATEGORIES.includes(entry.category);
  // Feature: editing one world fact preserves the remaining dossier, key events and original long-form body.
  const patchProfile = (patch: Partial<WorldProfile>) => onPatch({ worldProfile: { ...profile, ...patch } });
  const connections = <View style={styles.connections}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>In the story</Text>
    <Pressable accessibilityLabel={`View world key events for ${entry.title}`} onPress={() => setEventsOpen(true)} style={styles.button}><Text style={styles.linkText}>Key events ({profile.events?.length ?? 0})</Text></Pressable>
    {group && <>
      <Text style={styles.sectionTitle}>Linked members ({members.length})</Text>
      <Text style={styles.helper}>Select this group under Memberships in a character’s profile.</Text>
      {!members.length && <Text style={styles.helper}>No character memberships recorded.</Text>}
      {members.map((character) => <Pressable key={character.id} accessibilityLabel={`Open member ${character.title}`} onPress={() => onOpenCharacter(character)} style={styles.connectionRow}><Text style={styles.linkText}>{character.title}</Text><Text style={styles.helper}>{character.category}</Text></Pressable>)}
    </>}
    {entry.category === 'Setting' && <>
      <Text style={styles.sectionTitle}>Scene settings ({chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'})</Text>
      {!chapters.length && <Text style={styles.helper}>Assign this setting to a scene in a chapter’s context panel to see it here.</Text>}
      {chapters.map(({ chapter, chapterNumber, scenes }) => <Pressable key={chapter.id} accessibilityLabel={`Open setting chapter ${chapter.title}`} onPress={() => onOpenChapter(chapter)} style={styles.connectionRow}><Text style={styles.linkText}>Chapter {chapterNumber}: {chapter.title}</Text><Text style={styles.helper}>{scenes.map((scene) => scene.title).join(', ')}</Text></Pressable>)}
    </>}
    {!group && entry.category !== 'Setting' && <Text style={styles.helper}>Key events can link to manuscript chapters and record time within your world.</Text>}
    <RelatedHistory story={story} entryId={entry.id} kind="world" theme={theme} onOpen={onOpenWorld} />
  </View>;
  const authorNotes = <View style={styles.authorNotes}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Author notes</Text><Text style={styles.helper}>Plans, reveals, and details to remember while writing.</Text>
    <WorldField label="Plans & key notes" value={profile.authorNotes ?? ''} placeholder="Future developments, unresolved threads, and things to revisit…" onChange={(authorNotes) => patchProfile({ authorNotes })} theme={theme} large />
  </View>;
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.root}>
    <ScrollView contentContainerStyle={styles.canvas} keyboardShouldPersistTaps="handled">
      <View style={styles.identity}>
        <TextInput accessibilityLabel="World entry name" value={entry.title} onChangeText={(title) => onPatch({ title })} placeholder="World entry name" placeholderTextColor={theme.muted} style={styles.name} />
        <Text style={styles.label}>Type: {entry.category}</Text>
        <Pressable accessibilityLabel="Change world entry type" onPress={() => setTypeChangeOpen(true)} style={[styles.button, { alignSelf: 'flex-start' }]}><Text style={styles.linkText}>Change type</Text></Pressable>
      </View>
      {/* Feature: narrow layouts keep connections and event actions reachable before the long profile form. */}
      {!wide && <View style={styles.overview}>{connections}</View>}
      <View style={[styles.columns, wide && styles.columnsWide]}>
        {wide && <View style={styles.leftRail}>{connections}</View>}
        <View style={styles.mainColumn}>
          <View style={styles.paper}>
            <View accessibilityRole="tablist" style={styles.tabs}>{(['Profile', 'Detailed description'] as const).map((name) => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.activeTab]}><Text style={[styles.tabText, tab === name && styles.selectedText]}>{name}</Text></Pressable>)}</View>
            <View style={styles.paperBody}>
              {tab === 'Profile' ? <>
                <Text style={styles.helper}>Build the details of this {entry.category.toLowerCase()}. Every field is optional.</Text>
                {!fields.length && <Text style={styles.helper}>Choose a category above for a tailored profile. Your existing description is in Detailed description.</Text>}
                {fields.map((section) => <View key={section.title} style={styles.fieldSection}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
                  {section.fields.map((field) => <WorldField key={field.key} label={field.label} value={profile[field.key] ?? ''} placeholder={field.placeholder} onChange={(value) => patchProfile({ [field.key]: value })} theme={theme} />)}
                </View>)}
                {entry.category === 'History' && <HistoryConnections story={story} entry={entry} theme={theme} onChange={patchProfile} onOpenCharacter={onOpenCharacter} onOpenWorld={onOpenWorld} />}
              </> : <>
                <Text accessibilityRole="header" style={styles.sectionTitle}>The full picture</Text><Text style={styles.helper}>The complete description, background, and details that bring this part of your world to life.</Text>
                <WorldField label="Detailed description" value={entry.content} placeholder="Describe this part of your world in as much detail as you like…" onChange={(content) => onPatch({ content })} theme={theme} large />
              </>}
            </View>
          </View>
          {!wide && <View style={styles.lowerPanel}>{authorNotes}</View>}
        </View>
        {wide && <View style={styles.rightRail}>{authorNotes}</View>}
      </View>
      <Text style={styles.timestamp}>Updated {new Date(entry.updatedAt).toLocaleString()}</Text>
    </ScrollView>
    {eventsOpen && <WorldEvents story={story} entry={entry} theme={theme} onChange={(events) => patchProfile({ events })} onClose={() => setEventsOpen(false)} onOpenChapter={onOpenChapter} />}
    {typeChangeOpen && <WorldTypeChange story={story} entry={entry} theme={theme} onClose={() => setTypeChangeOpen(false)} onConfirm={(category) => { onPatch({ category }); setTypeChangeOpen(false); }} />}
  </View>;
}

// Feature: optional world facts and descriptions have visible labels and accessible multiline editing areas.
function WorldField({ label, value, placeholder, onChange, theme, large = false }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; theme: Theme; large?: boolean }) {
  return <View style={{ gap: 7 }}><Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted} multiline textAlignVertical="top" style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, backgroundColor: theme.background, color: theme.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 22, minHeight: large ? 320 : 92 }} />
  </View>;
}

// Feature: world profiles share character typography and theme tokens with three columns on wide screens and stacked mobile panels.
function makeStyles(theme: Theme, compact: boolean) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0 }, canvas: { width: '100%', maxWidth: 1500, alignSelf: 'center', padding: compact ? 16 : 28, paddingBottom: 45 }, identity: { marginBottom: 26, gap: 10 }, name: { fontSize: compact ? 28 : 34, lineHeight: 44, fontWeight: '700', color: theme.text, padding: 0, marginBottom: 8 },
    label: { color: theme.text, fontSize: 13, fontWeight: '600' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { minHeight: 40, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }, chipSelected: { backgroundColor: theme.accentSoft, borderColor: theme.accent }, chipText: { color: theme.muted, fontSize: 13 }, selectedText: { color: theme.accent, fontWeight: '700' },
    columns: { gap: 20, alignItems: 'stretch' }, columnsWide: { flexDirection: 'row', alignItems: 'flex-start' }, leftRail: { width: 210 }, rightRail: { width: 238 }, mainColumn: { flex: 1, minWidth: 0 }, paper: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: 'hidden' },
    tabs: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: theme.border, paddingHorizontal: compact ? 8 : 16, gap: 4 }, tab: { minHeight: 48, justifyContent: 'center', paddingHorizontal: compact ? 8 : 10, borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: theme.accent }, tabText: { color: theme.muted, fontSize: 13 }, paperBody: { padding: compact ? 18 : 24, gap: 20 },
    fieldSection: { gap: 16, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16 }, sectionTitle: { color: theme.text, fontSize: 16, lineHeight: 23, fontWeight: '700' }, helper: { color: theme.muted, fontSize: 13, lineHeight: 21 }, connections: { gap: 14, paddingVertical: 16 }, button: { minHeight: 44, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' }, linkText: { color: theme.accent, fontSize: 13, lineHeight: 21, fontWeight: '600', flexShrink: 1 },
    connectionRow: { minHeight: 44, gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }, authorNotes: { backgroundColor: theme.secondarySoft, borderRadius: 12, padding: 19, gap: 16, borderTopWidth: 3, borderTopColor: theme.secondary }, lowerPanel: { marginTop: 20 }, overview: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border, marginBottom: 20 }, timestamp: { marginTop: 22, fontSize: 12, color: theme.muted },
  });
}
