import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import CharacterMentionField from './CharacterMentionField';
import { CHARACTER_GROUPS, createId, type Chapter, type CharacterAppearance, type CharacterEvent, type CharacterProfile, type Story, type StoryEntry } from '../../../domain/model';
import { CHARACTER_STATUSES, CHARACTER_TEXT_FIELDS, characterAppearances } from '../lib/characterProfile';
import type { Theme } from '../../../theme/theme';
import GroupMemberships from './GroupMemberships';
import { RelatedHistory } from '../../world/components/HistoryConnections';

type Props = { story: Story; character: StoryEntry; theme: Theme; onPatch: (patch: Partial<StoryEntry>) => void; onOpenChapter: (chapter: Chapter) => void; onOpenGroup: (group: StoryEntry) => void };
type Styles = ReturnType<typeof makeStyles>;
type FieldKey = typeof CHARACTER_TEXT_FIELDS[number];

// Feature: one character workspace separates reference facts, long-form description, story arc and author plans.
export default function CharacterWorkspace({ story, character, theme, onPatch, onOpenChapter, onOpenGroup }: Props) {
  const [canvasWidth, setCanvasWidth] = useState(0);
  const wide = canvasWidth >= 1080;
  const compact = canvasWidth < 620;
  const styles = makeStyles(theme, compact);
  const profile = character.characterProfile ?? {};
  const [activeTab, setActiveTab] = useState<'Profile' | 'Detailed description' | 'Character arc'>('Profile');
  const [dialog, setDialog] = useState<'events' | 'appearance' | 'history' | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<CharacterEvent | null>(null);
  const [appearanceDraft, setAppearanceDraft] = useState<CharacterAppearance | null>(null);
  const [error, setError] = useState('');
  const appearances = characterAppearances(story, character);
  const latest = appearances.at(-1);
  const events = profile.events ?? [];
  const orphaned = (profile.appearances ?? []).filter((record) => !story.chapters.some((chapter) => chapter.id === record.chapterId));

  // Feature: updating a single reference field preserves the rest of the dossier and the original freeform body.
  const patchProfile = (patch: Partial<CharacterProfile>) => onPatch({ characterProfile: { ...profile, ...patch } });
  // Feature: a fresh appearance form links an actual chapter to an optional time and note within the story.
  const recordAppearance = () => { setAppearanceDraft({ id: createId(), chapterId: '', storyTime: '', note: '' }); setError(''); setDialog('appearance'); };
  // Feature: new and existing key events share a form with explicit Save and Cancel actions.
  const editEvent = (event?: CharacterEvent) => { setEventDraft(event ? { ...event } : { id: createId(), title: '', chapterId: null, storyTime: '', details: '' }); setError(''); };
  // Feature: event titles are required; optional chapter links are checked before saving to the character.
  const saveEvent = () => {
    if (!eventDraft) return;
    if (!eventDraft.title.trim()) { setError('Give this event a title.'); return; }
    if (eventDraft.chapterId && !story.chapters.some((chapter) => chapter.id === eventDraft.chapterId)) { setError('Choose an available chapter or leave this event unlinked.'); return; }
    const next = { ...eventDraft, title: eventDraft.title.trim() };
    patchProfile({ events: events.some((event) => event.id === next.id) ? events.map((event) => event.id === next.id ? next : event) : [...events, next] });
    setExpandedEvent(next.id); setEventDraft(null); setError('');
  };
  // Feature: manual records confirm presence without requiring scene setup in the chapter editor.
  const saveAppearance = () => {
    if (!appearanceDraft) return;
    if (!story.chapters.some((chapter) => chapter.id === appearanceDraft.chapterId)) { setError('Choose the chapter where this character appears.'); return; }
    patchProfile({ appearances: [...(profile.appearances ?? []), appearanceDraft] }); setDialog(null); setAppearanceDraft(null); setError('');
  };
  // Feature: closing a dialog discards only its unsaved form, leaving saved profile fields untouched.
  const closeDialog = () => { setDialog(null); setEventDraft(null); setAppearanceDraft(null); setError(''); };
  // Feature: chapter references open the real manuscript from the ledger or expanded event.
  const openChapter = (chapter: Chapter) => { closeDialog(); onOpenChapter(chapter); };
  // Feature: reusable labelled inputs provide optional structured facts without forcing a questionnaire.
  const field = (key: FieldKey, label: string, placeholder: string, long = true, large = false) => <ProfileField key={key} label={label} value={profile[key] ?? ''} placeholder={placeholder} multiline={long} large={large} onChange={(value) => patchProfile({ [key]: value })} theme={theme} styles={styles} />;

  const tracker = <View style={styles.tracker}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>In the story</Text>
    <Text style={styles.label}>Last seen</Text>
    {latest ? <>
      <Pressable accessibilityLabel={`Open last appearance in ${latest.chapter.title}`} onPress={() => openChapter(latest.chapter)} style={styles.chapterLink}><Text style={styles.lastSeen}>Chapter {latest.chapterNumber}</Text><Text style={styles.linkText}>{latest.chapter.title}</Text></Pressable>
      {!!latest.records.at(-1)?.storyTime && <Text style={styles.helper}>{latest.records.at(-1)?.storyTime}</Text>}
      {!!latest.scenes.length && <Text style={styles.helper}>{latest.scenes.map((scene) => scene.title).join(', ')}</Text>}
      <Text style={styles.helper}>{appearances.length} {appearances.length === 1 ? 'chapter' : 'chapters'} with recorded appearances</Text>
      <Pressable onPress={() => setDialog('history')} style={styles.outlineButton}><Text style={styles.linkText}>View appearances</Text></Pressable>
    </> : <Text style={styles.helper}>No appearances yet. Record a chapter or assign this character to a scene while writing.</Text>}
    <Pressable onPress={recordAppearance} style={styles.outlineButton}><Text style={styles.linkText}>＋ Record appearance</Text></Pressable>
    <Text style={styles.caption}>Last seen follows chapter order. Scene cast assignments appear here automatically.</Text>
    {!!orphaned.length && <Pressable onPress={() => setDialog('history')} style={styles.outlineButton}><Text style={styles.linkText}>Review {orphaned.length} deleted chapter {orphaned.length === 1 ? 'link' : 'links'}</Text></Pressable>}
    <View style={styles.divider} />
    <Pressable accessibilityLabel={`View key events for ${character.title}`} onPress={() => { setEventDraft(null); setDialog('events'); }} style={styles.eventLaunch}>
      <View style={styles.flex}><Text style={styles.sectionTitle}>Key events</Text><Text style={styles.helper}>{events.length ? `${events.length} ${events.length === 1 ? 'event' : 'events'} recorded` : 'Track the moments they take part in'}</Text></View><Text style={styles.arrow}>›</Text>
    </Pressable>
    <RelatedHistory story={story} entryId={character.id} kind="character" theme={theme} onOpen={onOpenGroup} />
  </View>;

  const authorNotes = <View style={styles.authorNotes}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Author notes</Text>
    <Text style={styles.helper}>What you have in store for this character.</Text>
    {field('authorNotes', 'Plans & key notes', 'Future reveals, unresolved threads, promises to the reader, and things to remember…', true, true)}
    <Text style={styles.caption}>Keep your plans here while the profile describes who they are.</Text>
  </View>;

  return <View onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)} style={styles.root}>
    <ScrollView contentContainerStyle={styles.canvas}>
      <View style={styles.identity}>
        <TextInput accessibilityLabel="Character name" value={character.title} onChangeText={(title) => onPatch({ title })} placeholder="Character name" placeholderTextColor={theme.muted} style={styles.name} />
        <View style={styles.identityOptions}>
          <View style={styles.optionGroup}><Text style={styles.label}>Story role</Text><View style={styles.chips}>{CHARACTER_GROUPS.map((category) => <Pressable key={category} accessibilityLabel={`Character role: ${category}`} accessibilityState={{ selected: character.category === category }} onPress={() => onPatch({ category })} style={[styles.chip, character.category === category && styles.chipSelected]}><Text style={[styles.chipText, character.category === category && styles.selectedText]}>{category}</Text></Pressable>)}</View></View>
          <View style={styles.optionGroup}><Text style={styles.label}>Status</Text><View style={styles.chips}>{CHARACTER_STATUSES.map((status) => <Pressable key={status} accessibilityLabel={`Character status: ${status}`} accessibilityState={{ selected: (profile.status ?? 'Unspecified') === status }} onPress={() => patchProfile({ status })} style={[styles.chip, (profile.status ?? 'Unspecified') === status && styles.chipSelected]}><Text style={[styles.chipText, (profile.status ?? 'Unspecified') === status && styles.selectedText]}>{status}</Text></Pressable>)}</View></View>
        </View>
      </View>
      {/* Feature: narrow layouts keep appearance and event actions above the long profile form. */}
      {!wide && <View style={styles.narrowOverview}>
        <View style={styles.overviewCopy}><Text style={styles.label}>Last seen</Text>{latest ? <Pressable accessibilityLabel={`Open last appearance in ${latest.chapter.title}`} onPress={() => openChapter(latest.chapter)} style={styles.chapterLink}><Text style={styles.sectionTitle}>Chapter {latest.chapterNumber}: {latest.chapter.title}</Text>{!!latest.records.at(-1)?.storyTime && <Text style={styles.helper}>{latest.records.at(-1)?.storyTime}</Text>}</Pressable> : <Text style={styles.helper}>No appearances recorded</Text>}</View>
        <View style={styles.overviewActions}>
          {(!!appearances.length || !!orphaned.length) && <Pressable onPress={() => setDialog('history')} style={styles.outlineButton}><Text style={styles.linkText}>View appearances{orphaned.length ? ' (deleted links)' : ''}</Text></Pressable>}
          <Pressable onPress={recordAppearance} style={styles.outlineButton}><Text style={styles.linkText}>＋ Record appearance</Text></Pressable>
          <Pressable accessibilityLabel={`View key events for ${character.title}`} onPress={() => { setEventDraft(null); setDialog('events'); }} style={styles.outlineButton}><Text style={styles.linkText}>Key events ({events.length})</Text></Pressable>
        </View>
        <Text style={styles.caption}>Scene cast assignments appear automatically. Last seen follows chapter order.</Text>
        <RelatedHistory story={story} entryId={character.id} kind="character" theme={theme} onOpen={onOpenGroup} />
      </View>}
      <View style={[styles.columns, wide && styles.columnsWide]}>
        {wide && <View style={styles.leftRail}>{tracker}</View>}
        <View style={styles.mainColumn}>
          <View style={styles.paper}>
            <View accessibilityRole="tablist" style={styles.tabs}>{(['Profile', 'Detailed description', 'Character arc'] as const).map((name) => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: activeTab === name }} onPress={() => setActiveTab(name)} style={[styles.tab, activeTab === name && styles.activeTab]}><Text style={[styles.tabText, activeTab === name && styles.selectedText]}>{name}</Text></Pressable>)}</View>
            <View style={styles.paperBody}>
              {activeTab === 'Profile' && <>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Physical attributes</Text>
                <View style={styles.fieldGrid}>{field('height', 'Height', 'e.g. 170 cm / 5 ft 7 in', false)}{field('weight', 'Weight', 'Use any unit', false)}{field('bodyType', 'Body type', 'Build, posture, silhouette…', false)}</View>
                {field('physicalDetails', 'Distinctive features', 'Hair, eyes, skin, age, scars, clothing, movement…')}
                <View style={styles.divider} />
                {field('personality', 'Personality', 'Temperament, values, habits, contradictions, and how they speak…')}
                {/* Feature: relationship mentions link prose directly to another saved character's current description. */}
                <CharacterMentionField label="Relationships" kind="character" value={profile.relationships ?? ''} links={profile.relationshipLinks ?? []} story={story} characterId={character.id} theme={theme} onChange={(relationships, relationshipLinks) => patchProfile({ relationships, relationshipLinks })} />
                {field('abilities', 'Abilities (if applicable)', 'Skills, powers, limits, costs, and weaknesses…')}
                <View style={styles.divider} />
                {field('aliases', 'Aliases', 'Nicknames, titles, and other identities; separate each with a comma or new line…')}
                <Text style={styles.helper}>These aliases count as name mentions in chapter context. Separate each alias with a comma or new line.</Text>
                {/* Feature: affiliation mentions share organization descriptions from World Building. */}
                <CharacterMentionField label="Affiliations" kind="organization" value={profile.affiliations ?? ''} links={profile.affiliationLinks ?? []} story={story} characterId={character.id} theme={theme} onChange={(affiliations, affiliationLinks) => patchProfile({ affiliations, affiliationLinks })} />
                {/* Feature: explicit memberships connect character and world profiles without interpreting written affiliations. */}
                <GroupMemberships story={story} ids={profile.membershipIds ?? []} theme={theme} onChange={(membershipIds) => patchProfile({ membershipIds })} onOpenGroup={onOpenGroup} />
                {field('references', 'Character references', 'People, characters, images, or source links that inspired them…')}
              </>}
              {activeTab === 'Detailed description' && <>
                <Text accessibilityRole="header" style={styles.sectionTitle}>The full picture</Text>
                <Text style={styles.helper}>Room for their backstory, voice, contradictions, and all the details that bring them to life.</Text>
                <ProfileField label="Detailed description" value={character.content} onChange={(content) => onPatch({ content })} placeholder="Describe this character in as much detail as you like…" theme={theme} styles={styles} multiline large />
              </>}
              {activeTab === 'Character arc' && <>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Their journey</Text><Text style={styles.helper}>What drives them, what holds them back, and who they become.</Text>
                {field('goal', 'Goals', 'What do they want? What do they actually need?')}
                {field('motivation', 'Motivations', 'Why does this matter to them? What keeps them moving?')}
                {field('fear', 'Fears', 'What are they afraid of losing, facing, or becoming?')}
                {field('flaw', 'Flaws', 'Beliefs, habits, and blind spots that get in their way…')}
                {field('arc', 'How they change', 'Where they begin, turning points, and where they end…')}
              </>}
            </View>
          </View>
          {!wide && <View style={styles.lowerPanels}>{authorNotes}</View>}
        </View>
        {wide && <View style={styles.rightRail}>{authorNotes}</View>}
      </View>
      <Text style={styles.timestamp}>Updated {new Date(character.updatedAt).toLocaleString()}</Text>
    </ScrollView>

    <Modal transparent visible={dialog !== null} animationType="fade" onRequestClose={closeDialog}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Dismiss character dialog" onPress={closeDialog} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.modal}>
          <View style={styles.modalHeader}><View style={styles.flex}><Text accessibilityRole="header" style={styles.modalTitle}>{dialog === 'events' ? 'Key events' : dialog === 'history' ? 'Appearance history' : 'Record appearance'}</Text><Text style={styles.helper}>{character.title}</Text></View><Pressable accessibilityLabel="Close character dialog" onPress={closeDialog} style={styles.close}><Text style={styles.arrow}>×</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {dialog === 'appearance' && appearanceDraft && <>
              <ChapterChoice story={story} value={appearanceDraft.chapterId} onChange={(chapterId) => setAppearanceDraft({ ...appearanceDraft, chapterId: chapterId ?? '' })} theme={theme} styles={styles} required />
              {!story.chapters.length && <Text style={styles.helper}>Create a chapter in your story before recording an appearance.</Text>}
              <ProfileField label="Time in the story (optional)" value={appearanceDraft.storyTime} onChange={(storyTime) => setAppearanceDraft({ ...appearanceDraft, storyTime })} placeholder="e.g. The morning after the festival" theme={theme} styles={styles} />
              <ProfileField label="Appearance notes" value={appearanceDraft.note} onChange={(note) => setAppearanceDraft({ ...appearanceDraft, note })} placeholder="Where they are and what they are doing…" theme={theme} styles={styles} multiline />
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <View style={styles.actions}><Pressable onPress={closeDialog} style={styles.outlineButton}><Text style={styles.linkText}>Cancel</Text></Pressable><Pressable disabled={!story.chapters.length} onPress={saveAppearance} style={[styles.primaryButton, !story.chapters.length && styles.disabled]}><Text style={styles.primaryText}>Save appearance</Text></Pressable></View>
            </>}
            {dialog === 'history' && <>
              <Text style={styles.helper}>Confirmed chapter appearances, listed in story order. Remove scene assignments in the chapter’s context panel.</Text>
              {!appearances.length && <Text style={styles.empty}>No appearances in the current chapters.</Text>}
              {appearances.map(({ chapter, chapterNumber, scenes, records }) => <View key={chapter.id} style={styles.historyRow}>
                <Pressable onPress={() => openChapter(chapter)} style={styles.chapterLink}><Text style={styles.sectionTitle}>Chapter {chapterNumber}: {chapter.title}</Text><Text style={styles.linkText}>Open chapter</Text></Pressable>
                {scenes.map((scene) => <Text key={scene.id} style={styles.helper}>Scene: {scene.title}</Text>)}
                {records.map((record) => <View key={record.id} style={styles.record}><Text style={styles.helper}>{record.storyTime || 'Manually recorded'}{record.note ? '\n' + record.note : ''}</Text><Pressable accessibilityLabel={`Remove appearance record ${record.storyTime || record.note || chapter.title}`} onPress={() => patchProfile({ appearances: (profile.appearances ?? []).filter((item) => item.id !== record.id) })} style={styles.textButton}><Text style={styles.linkText}>Remove record</Text></Pressable></View>)}
              </View>)}
              {orphaned.map((record) => <View key={record.id} style={styles.historyRow}><Text style={styles.sectionTitle}>Deleted chapter</Text><Text style={styles.helper}>{record.storyTime}{record.note ? '\n' + record.note : ''}</Text><Pressable onPress={() => patchProfile({ appearances: (profile.appearances ?? []).filter((item) => item.id !== record.id) })} style={styles.textButton}><Text style={styles.linkText}>Remove record</Text></Pressable></View>)}
              <Pressable onPress={recordAppearance} style={styles.outlineButton}><Text style={styles.linkText}>＋ Record appearance</Text></Pressable>
            </>}
            {dialog === 'events' && <>
              <Text style={styles.helper}>The moments this character takes part in. Expand an event to read its details.</Text>
              {!eventDraft && <Pressable onPress={() => editEvent()} style={styles.outlineButton}><Text style={styles.linkText}>＋ Add key event</Text></Pressable>}
              {eventDraft ? <View style={styles.eventForm}>
                <Text style={styles.sectionTitle}>{events.some((event) => event.id === eventDraft.id) ? 'Edit key event' : 'New key event'}</Text>
                <ProfileField label="Event title" value={eventDraft.title} onChange={(title) => setEventDraft({ ...eventDraft, title })} placeholder="What happened?" theme={theme} styles={styles} />
                <ChapterChoice story={story} value={eventDraft.chapterId} onChange={(chapterId) => setEventDraft({ ...eventDraft, chapterId })} theme={theme} styles={styles} />
                <ProfileField label="Time in the story (optional)" value={eventDraft.storyTime} onChange={(storyTime) => setEventDraft({ ...eventDraft, storyTime })} placeholder="When does it happen?" theme={theme} styles={styles} />
                <ProfileField label="Event details" value={eventDraft.details} onChange={(details) => setEventDraft({ ...eventDraft, details })} placeholder="Their involvement, choices, consequences, and why this matters…" theme={theme} styles={styles} multiline large />
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <View style={styles.actions}><Pressable onPress={() => { setEventDraft(null); setError(''); }} style={styles.outlineButton}><Text style={styles.linkText}>Cancel event edit</Text></Pressable><Pressable onPress={saveEvent} style={styles.primaryButton}><Text style={styles.primaryText}>Save event</Text></Pressable></View>
              </View> : <>
                {!events.length && <Text style={styles.empty}>Add their first key event to start a record of their part in the story.</Text>}
                {events.map((event) => {
                  const chapter = story.chapters.find((chapter) => chapter.id === event.chapterId);
                  const expanded = expandedEvent === event.id;
                  return <View key={event.id} style={styles.eventRow}>
                    <Pressable accessibilityLabel={`Expand event: ${event.title}`} accessibilityState={{ expanded }} onPress={() => setExpandedEvent(expanded ? null : event.id)} style={styles.eventLaunch}><View style={styles.flex}><Text style={styles.sectionTitle}>{event.title}</Text><Text style={styles.helper}>{[chapter?.title ?? (event.chapterId ? 'Deleted chapter' : 'No chapter linked'), event.storyTime].filter(Boolean).join(' · ')}</Text></View><Text style={styles.arrow}>{expanded ? '−' : '+'}</Text></Pressable>
                    {expanded && <View style={styles.eventDetails}><Text selectable style={styles.detailText}>{event.details || 'No details yet. Edit this event to describe their involvement.'}</Text><View style={styles.actions}>{chapter && <Pressable onPress={() => openChapter(chapter)} style={styles.textButton}><Text style={styles.linkText}>Open chapter</Text></Pressable>}<Pressable accessibilityLabel={`Edit event: ${event.title}`} onPress={() => editEvent(event)} style={styles.textButton}><Text style={styles.linkText}>Edit event</Text></Pressable><Pressable accessibilityLabel={`Remove event: ${event.title}`} onPress={() => { patchProfile({ events: events.filter((item) => item.id !== event.id) }); setExpandedEvent(null); }} style={styles.textButton}><Text style={styles.linkText}>Remove event</Text></Pressable></View></View>}
                  </View>;
                })}
              </>}
            </>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

// Feature: every optional dossier field has a visible and accessible name and room for multiline detail.
function ProfileField({ label, value, placeholder, onChange, theme, styles, multiline = false, large = false }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; theme: Theme; styles: Styles; multiline?: boolean; large?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted} multiline={multiline} textAlignVertical="top" style={[styles.input, multiline && styles.multiline, large && styles.largeInput]} /></View>;
}

// Feature: chapter selection uses stable IDs so links survive chapter renaming and reordering.
function ChapterChoice({ story, value, onChange, theme, styles, required = false }: { story: Story; value: string | null; onChange: (id: string | null) => void; theme: Theme; styles: Styles; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = story.chapters.find((chapter) => chapter.id === value);
  return <View style={styles.field}><Text style={styles.label}>{required ? 'Chapter' : 'Chapter (optional)'}</Text><Pressable accessibilityLabel="Choose chapter" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.picker}><Text style={styles.detailText}>{selected?.title ?? (value ? 'Deleted chapter — choose another' : required ? 'Choose a chapter…' : 'No chapter linked')}</Text><Text style={styles.linkText}>{open ? '−' : '⌄'}</Text></Pressable>{open && <View style={[styles.pickerOptions, { backgroundColor: theme.background }]}>{!required && <Pressable onPress={() => { onChange(null); setOpen(false); }} style={styles.pickerOption}><Text style={styles.linkText}>No chapter linked</Text></Pressable>}{story.chapters.map((chapter, index) => <Pressable key={chapter.id} accessibilityLabel={`Link chapter ${index + 1}: ${chapter.title}`} accessibilityState={{ selected: value === chapter.id }} onPress={() => { onChange(chapter.id); setOpen(false); }} style={styles.pickerOption}><Text style={styles.detailText}>{index + 1}. {chapter.title}{value === chapter.id ? ' ✓' : ''}</Text></Pressable>)}</View>}</View>;
}

// Feature: the dossier adapts from a three-column writing desk to stacked panels on narrow screens, in both themes.
function makeStyles(theme: Theme, compact: boolean) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0 }, canvas: { width: '100%', maxWidth: 1500, alignSelf: 'center', padding: compact ? 16 : 28, paddingBottom: 45 },
    identity: { marginBottom: 26 }, name: { fontSize: compact ? 28 : 34, lineHeight: 44, fontWeight: '700', color: theme.text, padding: 0, marginBottom: 18 },
    // Feature: role and status controls share the full header width and wrap as separate groups on mobile.
    identityOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, width: '100%' }, optionGroup: { gap: 9, maxWidth: '100%', flexGrow: 1, flexBasis: compact ? '100%' : '40%' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 40, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }, chipSelected: { backgroundColor: theme.accentSoft, borderColor: theme.accent }, chipText: { color: theme.muted, fontSize: 13 }, selectedText: { color: theme.accent, fontWeight: '700' },
    columns: { gap: 20, alignItems: 'stretch' }, columnsWide: { flexDirection: 'row', alignItems: 'flex-start' }, leftRail: { width: 210 }, rightRail: { width: 238 }, mainColumn: { flex: 1, minWidth: 0 }, flex: { flex: 1, minWidth: 0 },
    // Feature: evenly sized tabs occupy the full profile width, matching the surrounding panel edges.
    paper: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.border },
    tab: { flex: 1, minWidth: 0, minHeight: compact ? 56 : 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: compact ? 6 : 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: theme.accent, backgroundColor: theme.accentPaper }, tabText: { fontSize: 13, color: theme.muted, textAlign: 'center' }, paperBody: { padding: compact ? 18 : 24, gap: 16 },
    sectionTitle: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: theme.text }, label: { fontSize: 13, fontWeight: '600', color: theme.text }, helper: { fontSize: 13, lineHeight: 21, color: theme.muted }, caption: { fontSize: 12, lineHeight: 19, color: theme.muted },
    fieldGrid: { flexDirection: compact ? 'column' : 'row', gap: 12 }, field: { flex: 1, gap: 7, minWidth: 0 }, input: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, backgroundColor: theme.background, color: theme.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 22, minHeight: 44 }, multiline: { minHeight: 92 }, largeInput: { minHeight: 320 }, divider: { height: 1, backgroundColor: theme.border, marginVertical: 4 },
    // Feature: the appearance and event rail now sits inside a consistent bordered surface panel.
    tracker: { gap: 13, padding: 19, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border }, chapterLink: { gap: 4, paddingVertical: 4 }, lastSeen: { color: theme.text, fontSize: 23, fontWeight: '600' }, linkText: { fontSize: 13, lineHeight: 20, color: theme.accent, fontWeight: '600', flexShrink: 1 },
    outlineButton: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, eventLaunch: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 54, paddingVertical: 6 }, arrow: { fontSize: 24, color: theme.accent },
    // Feature: author plans use a subdued primary-theme tint instead of a contrasting green panel.
    authorNotes: { backgroundColor: theme.accentPaper, borderRadius: 12, padding: 19, gap: 16, borderWidth: 1, borderColor: theme.border }, lowerPanels: { gap: 20, marginTop: 20 }, timestamp: { marginTop: 22, fontSize: 12, color: theme.muted },
    narrowOverview: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 20, gap: 12 }, overviewCopy: { gap: 4 }, overviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(18,16,21,0.42)', padding: compact ? 12 : 24 }, modal: { width: '100%', maxWidth: 680, maxHeight: '92%', borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border }, modalTitle: { fontSize: 20, fontWeight: '700', color: theme.text }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, modalBody: { padding: 20, gap: 18 },
    picker: { minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, pickerOptions: { borderWidth: 1, borderColor: theme.border, borderRadius: 8 }, pickerOption: { padding: 12, minHeight: 44 },
    error: { fontSize: 14, lineHeight: 21, color: theme.accent, fontWeight: '600' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }, primaryButton: { minHeight: 44, backgroundColor: theme.accent, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16, justifyContent: 'center' }, primaryText: { fontSize: 14, fontWeight: '700', color: theme.surface }, disabled: { opacity: 0.45 }, textButton: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
    historyRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 10 }, record: { paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: theme.accentSoft }, eventForm: { gap: 18 }, eventRow: { borderBottomWidth: 1, borderBottomColor: theme.border }, eventDetails: { paddingVertical: 14, gap: 14 }, detailText: { fontSize: 14, lineHeight: 23, color: theme.text, flexShrink: 1 }, empty: { fontSize: 14, lineHeight: 23, color: theme.muted, paddingVertical: 24 },
  });
}
