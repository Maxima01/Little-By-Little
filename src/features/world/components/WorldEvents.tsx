import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import { createId, type Chapter, type Story, type StoryEntry, type WorldEvent } from '../../../domain/model';
import type { Theme } from '../../../theme/theme';

// Feature: world key events can be expanded, authored and linked to chapters without implying character presence.
export default function WorldEvents({ story, entry, theme, onChange, onClose, onOpenChapter }: {
  story: Story; entry: StoryEntry; theme: Theme; onChange: (events: WorldEvent[]) => void; onClose: () => void; onOpenChapter: (chapter: Chapter) => void;
}) {
  const styles = makeStyles(theme);
  const events = entry.worldProfile?.events ?? [];
  const [draft, setDraft] = useState<WorldEvent | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chapterPicker, setChapterPicker] = useState(false);
  const [error, setError] = useState('');
  // Feature: new and saved events use the same draft form, with explicit save/cancel boundaries.
  const edit = (event?: WorldEvent) => { setDraft(event ? { ...event } : { id: createId(), title: '', chapterId: null, storyTime: '', details: '' }); setError(''); setChapterPicker(false); };
  // Feature: required titles and optional chapter targets are checked before an event enters autosave.
  const save = () => {
    if (!draft) return;
    if (!draft.title.trim()) { setError('Give this event a title.'); return; }
    if (draft.chapterId && !story.chapters.some((chapter) => chapter.id === draft.chapterId)) { setError('Choose an available chapter or leave this event unlinked.'); return; }
    const next = { ...draft, title: draft.title.trim() };
    onChange(events.some((event) => event.id === next.id) ? events.map((event) => event.id === next.id ? next : event) : [...events, next]);
    setExpanded(next.id); setDraft(null); setError('');
  };
  // Feature: accessible event fields keep story dates freeform for fictional calendars.
  const field = (label: string, key: 'title' | 'storyTime' | 'details', placeholder: string, multiline = false) => draft && <View style={styles.field}>
    <Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={draft[key]} onChangeText={(value) => setDraft({ ...draft, [key]: value })} placeholder={placeholder} placeholderTextColor={theme.muted} multiline={multiline} textAlignVertical="top" style={[styles.input, multiline && styles.large]} />
  </View>;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Dismiss world event dialog" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.modal}>
        <View style={styles.header}><View style={styles.copy}><Text accessibilityRole="header" style={styles.heading}>Key events</Text><Text style={styles.helper}>{entry.title}</Text></View><Pressable accessibilityLabel="Close world event dialog" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.helper}>Record the moments that shape this {entry.category.toLowerCase()}. Expand an event to read its details.</Text>
          {draft ? <View style={styles.form}>
            <Text style={styles.label}>{events.some((event) => event.id === draft.id) ? 'Edit key event' : 'New key event'}</Text>
            {field('Event title', 'title', 'What happened?')}
            <View style={styles.field}><Text style={styles.label}>Chapter (optional)</Text>
              <Pressable accessibilityLabel="Choose event chapter" accessibilityState={{ expanded: chapterPicker }} onPress={() => setChapterPicker(!chapterPicker)} style={styles.button}><Text style={styles.link}>{story.chapters.find((chapter) => chapter.id === draft.chapterId)?.title ?? (draft.chapterId ? 'Deleted chapter — choose another' : 'No chapter linked')}</Text></Pressable>
              {chapterPicker && <View style={styles.choices}><Pressable onPress={() => { setDraft({ ...draft, chapterId: null }); setChapterPicker(false); }} style={styles.button}><Text style={styles.link}>No chapter linked</Text></Pressable>
                {story.chapters.map((chapter, index) => <Pressable key={chapter.id} accessibilityLabel={`Link event to chapter ${index + 1}: ${chapter.title}`} accessibilityState={{ selected: draft.chapterId === chapter.id }} onPress={() => { setDraft({ ...draft, chapterId: chapter.id }); setChapterPicker(false); }} style={styles.button}><Text style={styles.link}>{index + 1}. {chapter.title}</Text></Pressable>)}
              </View>}
            </View>
            {field('Time in the story (optional)', 'storyTime', 'A date, era, season, or relative time…')}
            {field('Event details', 'details', 'What happened, who was involved, and what changed…', true)}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <View style={styles.actions}><Pressable onPress={() => { setDraft(null); setError(''); }} style={styles.button}><Text style={styles.link}>Cancel</Text></Pressable><Pressable onPress={save} style={[styles.button, styles.primary]}><Text style={styles.primaryText}>Save event</Text></Pressable></View>
          </View> : <>
            <Pressable onPress={() => edit()} style={styles.button}><Text style={styles.link}>＋ Add key event</Text></Pressable>
            {!events.length && <Text style={styles.helper}>No key events recorded yet.</Text>}
            {events.map((event) => {
              const chapter = story.chapters.find((item) => item.id === event.chapterId);
              return <View key={event.id} style={styles.event}>
                <Pressable accessibilityLabel={`Expand world event ${event.title}`} accessibilityState={{ expanded: expanded === event.id }} onPress={() => setExpanded(expanded === event.id ? null : event.id)} style={styles.eventTitle}><View style={styles.copy}><Text style={styles.label}>{event.title}</Text>{!!event.storyTime && <Text style={styles.helper}>{event.storyTime}</Text>}</View><Text style={styles.link}>{expanded === event.id ? '−' : '+'}</Text></Pressable>
                {expanded === event.id && <View style={styles.form}>
                  <Text selectable style={styles.detail}>{event.details || 'No details recorded.'}</Text>
                  {chapter ? <Pressable onPress={() => { onClose(); onOpenChapter(chapter); }} style={styles.button}><Text style={styles.link}>Open chapter: {chapter.title}</Text></Pressable> : !!event.chapterId && <Text style={styles.helper}>Deleted chapter — edit this event to choose another.</Text>}
                  <View style={styles.actions}><Pressable accessibilityLabel={`Edit world event ${event.title}`} onPress={() => edit(event)} style={styles.button}><Text style={styles.link}>Edit event</Text></Pressable><Pressable accessibilityLabel={`Remove world event ${event.title}`} onPress={() => onChange(events.filter((item) => item.id !== event.id))} style={styles.button}><Text style={styles.link}>Remove event</Text></Pressable></View>
                </View>}
              </View>;
            })}
          </>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

// Feature: the world event dialog remains readable, scrollable and operable on narrow screens and in either theme.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(18,16,21,0.42)', padding: 12 }, modal: { width: '100%', maxWidth: 680, maxHeight: '92%', borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
    header: { flexDirection: 'row', gap: 12, padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border }, copy: { flex: 1, minWidth: 0 }, heading: { color: theme.text, fontSize: 20, fontWeight: '700' }, helper: { color: theme.muted, fontSize: 13, lineHeight: 21 },
    close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, closeText: { color: theme.accent, fontSize: 24 }, body: { padding: 20, gap: 18 }, form: { gap: 16, paddingBottom: 16 }, field: { gap: 7 }, label: { color: theme.text, fontSize: 14, lineHeight: 22, fontWeight: '600' },
    input: { color: theme.text, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, minHeight: 44, fontSize: 14, lineHeight: 22 }, large: { minHeight: 180 }, button: { minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
    link: { color: theme.accent, fontSize: 13, lineHeight: 21, fontWeight: '600', flexShrink: 1 }, choices: { gap: 6 }, error: { color: theme.accent, fontSize: 14, fontWeight: '600' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }, primary: { backgroundColor: theme.accent }, primaryText: { color: theme.surface, fontSize: 14, fontWeight: '700' },
    event: { borderBottomWidth: 1, borderBottomColor: theme.border }, eventTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 48 }, detail: { color: theme.text, fontSize: 14, lineHeight: 23 },
  });
}
