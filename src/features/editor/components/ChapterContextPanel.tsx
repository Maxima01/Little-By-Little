import Pressable from '../../../components/AccessiblePressable';
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createScene, type Chapter, type ChapterScene, type Story } from '../../../domain/model';
import { sceneRanges, sceneTimeline } from '../lib/manuscriptOperations';
import type { Theme } from '../../../theme/theme';
import { chapterCharacterAppearances, settingContinuity } from '../lib/writingAnalysis';
import { worldReference } from '../../world/lib/worldProfile';

type Props = {
  chapter: Chapter;
  story: Story;
  theme: Theme;
  // Feature: drawers reuse the same references with full width and a single dialog heading.
  inDrawer?: boolean;
  onLocate?: (start: number, end: number) => void;
  onOutline?: () => void;
  onChange: (scenes: ChapterScene[], activeSceneId: string) => void;
};

// Lets writers mark the active scene and keep its setting and cast close to the draft.
export default function ChapterContextPanel({ chapter, story, theme, inDrawer = false, onChange, onLocate, onOutline }: Props) {
  const styles = makeStyles(theme);
  const scenes = chapter.scenes?.length ? chapter.scenes : [{ id: `${chapter.id}-scene-1`, title: 'Scene 1', settingId: null, characterIds: [] }];
  const activeScene = scenes.find((scene) => scene.id === chapter.activeSceneId) ?? scenes[0];
  // Feature: scene navigation uses the same linked manuscript order as the outline and continuity trail.
  const sceneOrder = sceneTimeline({ ...chapter, scenes }).ordered.map((item) => item.scene);
  const [settingPickerOpen, setSettingPickerOpen] = useState(false);
  // Feature: collapsible chapter summaries keep long casts and setting trails out of the drafting area.
  const [trackerOpen, setTrackerOpen] = useState(true);
  const [continuityOpen, setContinuityOpen] = useState(false);
  const appearances = useMemo(() => chapterCharacterAppearances(chapter, story), [chapter.html, chapter.scenes, story.characters, story.styleGuide]);
  const continuity = settingContinuity({ ...chapter, scenes }, story);
  const currentSetting = settingsForScene(story, activeScene.settingId);
  const settings = story.worldbuilding.filter((entry) => entry.category === 'Setting');

  const updateScene = (patch: Partial<ChapterScene>) => {
    onChange(scenes.map((scene) => scene.id === activeScene.id ? { ...scene, ...patch } : scene), activeScene.id);
  };
  // Feature: scene tabs also navigate to their linked manuscript passage.
  const selectScene = (scene: ChapterScene) => { onChange(scenes, scene.id); const range = sceneRanges(chapter).find((item) => item.scene.id === scene.id); if (range?.start !== undefined && scene.anchor) onLocate?.(range.start, range.start + scene.anchor.quote.length); };
  const activeRange = sceneRanges(chapter).find((item) => item.scene.id === activeScene.id);
  const addScene = () => {
    const nextScene = createScene(`Scene ${scenes.length + 1}`);
    onChange([...scenes, nextScene], nextScene.id);
  };
  const removeScene = () => {
    if (scenes.length < 2) return;
    const remaining = scenes.filter((scene) => scene.id !== activeScene.id);
    onChange(remaining, remaining[0].id);
  };

  return (
    <View style={[styles.panel, inDrawer && { maxWidth: undefined, borderWidth: 0, padding: 0 }]}>
      <View style={styles.headingRow}>
        <View>{!inDrawer && <Text style={styles.heading}>Chapter context</Text>}<Text style={styles.subtitle}>Track the scene, setting, and cast.</Text></View>
        {scenes.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Remove current scene" onPress={removeScene} style={styles.removeScene}><Text style={styles.removeSceneText}>Remove</Text></Pressable>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sceneTabsScroll} contentContainerStyle={styles.sceneTabs}>
        {sceneOrder.map((scene, index) => <Pressable key={scene.id} accessibilityRole="button" accessibilityLabel={'Set current scene to ' + scene.title} accessibilityState={{ selected: scene.id === activeScene.id }} onPress={() => selectScene(scene)} style={[styles.sceneTab, scene.id === activeScene.id && styles.sceneTabActive]}><Text numberOfLines={1} style={[styles.sceneTabText, scene.id === activeScene.id && styles.sceneTabTextActive]}>{index + 1}. {scene.title}</Text></Pressable>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Add scene" onPress={addScene} style={styles.addScene}><Text style={styles.addSceneText}>＋</Text></Pressable>
      </ScrollView>
      <Text style={styles.fieldLabel}>CURRENT SCENE</Text>
      <TextInput accessibilityLabel="Scene name" value={activeScene.title} onChangeText={(title) => updateScene({ title })} placeholder="Name this scene" placeholderTextColor={theme.muted} style={styles.sceneName} />
      {/* Feature: scene metadata and manuscript counts stay visible while drafting. */}
      <Text style={styles.helper}>{activeRange?.words === undefined ? 'Scene passage not linked' : `${activeRange.words} scene words`}{activeScene.viewpoint ? ` · Viewpoint: ${activeScene.viewpoint}` : ''}</Text>
      {!!activeScene.synopsis && <Text style={styles.helper}>{activeScene.synopsis}</Text>}
      {onOutline && <Pressable accessibilityRole="button" onPress={onOutline} style={styles.settingButton}><Text style={styles.settingValue}>Edit outline / link passage</Text></Pressable>}
      <Text style={styles.fieldLabel}>SETTING</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose scene setting" onPress={() => setSettingPickerOpen(true)} style={styles.settingButton}>
        <Text numberOfLines={1} style={styles.settingValue}>{settings.find((setting) => setting.id === activeScene.settingId)?.title ?? 'Choose a setting'}</Text><Text style={styles.chevron}>⌄</Text>
      </Pressable>
      {!settings.length && <Text style={styles.helper}>Add a place in World Building to assign it here.</Text>}
      <Text style={styles.fieldLabel}>CHARACTERS PRESENT</Text>
      {story.characters.length ? <View style={styles.characterList}>{story.characters.map((character) => {
        const selected = activeScene.characterIds.includes(character.id);
        return <Pressable key={character.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => updateScene({ characterIds: selected ? activeScene.characterIds.filter((id) => id !== character.id) : [...activeScene.characterIds, character.id] })} style={[styles.characterChip, selected && styles.characterChipActive]}><Text style={[styles.characterChipText, selected && styles.characterChipTextActive]}>{selected ? '✓  ' : '+  '}{character.title}</Text></Pressable>;
      })}</View> : <Text style={styles.helper}>Add characters in the Characters section to track who is here.</Text>}
      {/* Feature: missing cast references remain visible and can be removed deliberately from their actual scene. */}
      {[...new Set(activeScene.characterIds)].filter((id) => !story.characters.some((entry) => entry.id === id)).map((id) => <View key={id} style={styles.currentSceneNote}><Text style={[styles.helper, { flex: 1 }]}>Deleted character · {id}</Text><Pressable accessibilityLabel={`Remove missing character ${id} from ${activeScene.title}`} onPress={() => updateScene({ characterIds: activeScene.characterIds.filter((saved) => saved !== id) })} style={styles.removeScene}><Text style={styles.removeSceneText}>Remove</Text></Pressable></View>)}
      <View style={styles.currentSceneNote}><View style={styles.currentDot} /><Text numberOfLines={2} style={styles.currentSceneText}>Currently drafting: {activeScene.title}</Text></View>

      {/* Feature: a chapter-wide cast ledger separates author-confirmed appearances from name mentions. */}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: trackerOpen }} onPress={() => setTrackerOpen(!trackerOpen)} style={styles.sectionToggle}>
        <Text style={styles.sectionTitle}>Character appearances</Text><Text style={styles.chevron}>{trackerOpen ? '−' : '+'}</Text>
      </Pressable>
      {trackerOpen && <View style={styles.summary}>
        <Text style={styles.helper}>Scenes count checked cast assignments. Mentions count profile names, comma/line-separated profile aliases and linked style-guide aliases in the draft; pronouns aren’t counted.</Text>
        {appearances.map(({ character, scenes: present, mentions }) => <View key={character.id} style={styles.trackerRow}>
          <Text style={styles.trackerName}>{character.title}</Text>
          <Text style={styles.trackerCount}>{present.length} {present.length === 1 ? 'scene' : 'scenes'} · {mentions} {mentions === 1 ? 'mention' : 'mentions'}</Text>
          <Text style={styles.helper}>{present.length ? present.map((scene) => scene.title).join(', ') : 'No scene appearance recorded'}</Text>
        </View>)}
        {!appearances.length && <Text style={styles.helper}>Create character profiles to start this chapter’s cast ledger.</Text>}
        {scenes.some((scene) => scene.characterIds.some((id) => !story.characters.some((entry) => entry.id === id))) && <Text style={styles.helper}>A scene references a deleted character. Review its cast assignments.</Text>}
      </View>}

      {/* Feature: ordered setting references and authored notes support continuity within and between chapters. */}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: continuityOpen }} onPress={() => setContinuityOpen(!continuityOpen)} style={styles.sectionToggle}>
        <Text style={styles.sectionTitle}>Setting continuity</Text><Text style={styles.chevron}>{continuityOpen ? '−' : '+'}</Text>
      </Pressable>
      {continuityOpen && <View style={styles.summary}>
        <Text style={styles.helper}>Linked scenes follow their actual manuscript positions. Unlinked scenes have no confirmed position in this trail.</Text>
        {continuity.previousChapter && <Text style={styles.carryover}>Previous chapter: {continuity.previousChapter.title}{'\n'}Last linked scene: {continuity.previousSetting?.title ?? (continuity.previousEntry ? `${continuity.previousEntry.title} — now ${continuity.previousEntry.category}` : continuity.previousScene?.settingId ? 'Deleted setting' : 'No linked setting recorded')}{continuity.previousUnlinkedCount ? `\n${continuity.previousUnlinkedCount} unlinked scenes need review; the final location is unconfirmed.` : ''}</Text>}
        {continuity.trail.map(({ scene, setting, previousSetting, unavailableEntry, status }, index) => <Pressable key={scene.id} accessibilityRole="button" accessibilityLabel={'Review setting for ' + scene.title} onPress={() => selectScene(scene)} style={[styles.trailRow, scene.id === activeScene.id && styles.trailActive]}>
          <Text style={styles.trackerName}>{index + 1}. {scene.title}</Text>
          <Text style={styles.trackerCount}>{setting?.title ?? (unavailableEntry ? `${unavailableEntry.title} — now ${unavailableEntry.category}; choose a setting` : status === 'missing' ? 'Deleted setting — choose another' : 'Setting not assigned')}</Text>
          <Text style={styles.helper}>{status === 'changed' ? `Location change from ${previousSetting?.title}` : status === 'same' ? 'Continues in the same setting' : status === 'start' ? 'First recorded location' : 'Select this scene to assign a setting'}</Text>
          {!!scene.continuityNotes && <Text style={styles.notePreview}>{scene.continuityNotes}</Text>}
        </Pressable>)}
        {!!continuity.unlinked.length && <Text style={styles.sectionTitle}>Unlinked scenes ({continuity.unlinked.length})</Text>}
        {continuity.unlinked.map(({ scene, entry }) => <Pressable key={scene.id} accessibilityLabel={`Review unlinked setting for ${scene.title}`} onPress={() => selectScene(scene)} style={[styles.trailRow, scene.id === activeScene.id && styles.trailActive]}><Text style={styles.trackerName}>{scene.title}</Text><Text style={styles.trackerCount}>{entry ? `${entry.title}${entry.category !== 'Setting' ? ` — now ${entry.category}` : ''}` : scene.settingId ? 'Deleted setting — choose another' : 'Setting not assigned'}</Text><Text style={styles.helper}>Link this scene’s beginning in Scene outline to place it in manuscript order.</Text></Pressable>)}
        {/* Feature: scene context includes structured setting facts alongside its long-form description. */}
        {currentSetting && !!worldReference(currentSetting) && <View style={styles.reference}><Text style={styles.trackerName}>Setting reference</Text><Text selectable style={styles.helper}>{worldReference(currentSetting)}</Text></View>}
        <Text style={styles.trackerName}>Notes for {activeScene.title}</Text>
        <TextInput accessibilityLabel="Scene continuity notes" multiline value={activeScene.continuityNotes ?? ''} onChangeText={(continuityNotes) => updateScene({ continuityNotes })} placeholder="Time of day, weather, travel, or details to carry forward…" placeholderTextColor={theme.muted} style={[styles.sceneName, styles.notesInput]} />
      </View>}

      <Modal transparent visible={settingPickerOpen} animationType="fade" onRequestClose={() => setSettingPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close setting picker" onPress={() => setSettingPickerOpen(false)} style={styles.modalDismiss} />
          <View accessibilityViewIsModal style={styles.settingModal}>
            <Text style={styles.modalTitle}>Choose this scene’s setting</Text>
            <ScrollView>
              <Pressable accessibilityRole="button" onPress={() => { updateScene({ settingId: null }); setSettingPickerOpen(false); }} style={styles.settingOption}><Text style={styles.settingOptionText}>No setting selected</Text>{!activeScene.settingId && <Text style={styles.selectedMark}>✓</Text>}</Pressable>
              {settings.map((setting) => <Pressable key={setting.id} accessibilityRole="button" accessibilityState={{ selected: activeScene.settingId === setting.id }} onPress={() => { updateScene({ settingId: setting.id }); setSettingPickerOpen(false); }} style={styles.settingOption}><Text style={styles.settingOptionText}>{setting.title}</Text>{activeScene.settingId === setting.id && <Text style={styles.selectedMark}>✓</Text>}</Pressable>)}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Resolves only setting entries, including the missing-reference case after a place is deleted.
function settingsForScene(story: Story, settingId: string | null) {
  return story.worldbuilding.find((entry) => entry.id === settingId && entry.category === 'Setting');
}

// Styles the scene controls and compact, expandable chapter tracking summaries.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    panel: { width: '100%', maxWidth: 300, alignSelf: 'stretch', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, gap: 10 },
    headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    heading: { color: theme.text, fontSize: 14, fontWeight: '700' },
    subtitle: { color: theme.muted, fontSize: 12, lineHeight: 20, marginTop: 4 },
    removeScene: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.background },
    removeSceneText: { color: theme.muted, fontSize: 14 },
    sceneTabsScroll: { minHeight: 62, height: 62, flexGrow: 0, flexShrink: 0, alignSelf: 'stretch' },
    sceneTabs: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
    sceneTab: { maxWidth: 140, minWidth: 76, height: 44, flexShrink: 0, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 9, backgroundColor: theme.background },
    sceneTabActive: { backgroundColor: theme.accentSoft },
    sceneTabText: { color: theme.muted, fontSize: 14 },
    sceneTabTextActive: { color: theme.accent, fontWeight: '700' },
    addScene: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: theme.border },
    addSceneText: { color: theme.accent, fontSize: 15, fontWeight: '600' },
    fieldLabel: { color: theme.muted, fontSize: 12, letterSpacing: 0.9, fontWeight: '800', marginTop: 2 },
    sceneName: { color: theme.text, fontSize: 14, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: theme.border },
    settingButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background },
    settingValue: { flex: 1, color: theme.text, fontSize: 14 },
    chevron: { color: theme.muted, fontSize: 14 },
    helper: { color: theme.muted, fontSize: 12, lineHeight: 20 },
    characterList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    characterChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background },
    characterChipActive: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
    characterChipText: { color: theme.muted, fontSize: 14 },
    characterChipTextActive: { color: theme.accent, fontWeight: '700' },
    currentSceneNote: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
    currentDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.secondary },
    currentSceneText: { flex: 1, color: theme.secondary, fontSize: 14, fontWeight: '600' },
    sectionToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: theme.border, paddingTop: 12, minHeight: 44 },
    sectionTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    summary: { gap: 10 },
    trackerRow: { gap: 4, paddingVertical: 7, borderBottomWidth: 1, borderColor: theme.border },
    trackerName: { color: theme.text, fontSize: 14, fontWeight: '600' },
    trackerCount: { color: theme.accent, fontSize: 14, lineHeight: 20 },
    carryover: { color: theme.secondary, fontSize: 14, lineHeight: 20, paddingVertical: 6 },
    trailRow: { gap: 4, padding: 9, borderLeftWidth: 2, borderColor: theme.border },
    trailActive: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    notePreview: { color: theme.text, fontSize: 14, lineHeight: 20 },
    reference: { gap: 5, paddingTop: 8, borderTopWidth: 1, borderColor: theme.border },
    notesInput: { minHeight: 86, textAlignVertical: 'top', fontSize: 14, lineHeight: 20 },
    modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(18,16,21,0.34)' },
    modalDismiss: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    settingModal: { width: '100%', maxWidth: 360, maxHeight: '80%', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    modalTitle: { color: theme.text, fontSize: 14, fontWeight: '700', marginBottom: 10 },
    settingOption: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 9 },
    settingOptionText: { color: theme.text, fontSize: 14 },
    selectedMark: { color: theme.accent, fontWeight: '700' },
  });
}
