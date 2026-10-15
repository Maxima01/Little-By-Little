import Pressable from '../components/AccessiblePressable';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import RichEditor from '../features/editor/components/RichEditor';
import RevisionTools, { type RevisionTab } from '../features/editor/components/RevisionTools';
import { chapterWithHtml, chapterWithScenes } from '../features/editor/lib/manuscriptOperations';
import type { TextAnchor } from '../domain/model';
import {
  CHARACTER_GROUPS,
  createChapter,
  createEntry,
  createStory,
  appendStoryActivity,
  countWords,
  describeStoryChange,
  getStoryActivity,
  plainText,
  SECTION_INFO,
  WORLD_GROUPS,
  type Chapter,
  type ChapterScene,
  type EntryCategory,
  type SectionKey,
  type Story,
  type StoryEntry,
  type Workspace,
  type WritingFontFamily,
  type WritingPreferences,
} from '../domain/model';
import { useWorkspaceSave } from '../features/workspace/hooks/useWorkspaceSave';
import WorkspaceTools from '../features/workspace/components/WorkspaceTools';
import ExportDialog from '../features/workspace/components/ExportDialog';
import CharacterWorkspace from '../features/characters/components/CharacterWorkspace';
import WorldWorkspace from '../features/world/components/WorldWorkspace';
import { HISTORY_LINK_KEYS, worldSummary } from '../features/world/lib/worldProfile';
import { characterSummary } from '../features/characters/lib/characterProfile';
import type { SaveOptions } from '../features/workspace/lib/saveHistory';
import { darkTheme, lightTheme, type Theme } from '../theme/theme';
import { isExampleStory, recentlyEdited, rememberChapter, resumeChapter } from '../features/workspace/lib/workspaceUx';

type Screen = 'library' | 'story' | 'collection' | 'entry' | 'editor';
type CollectionSection = Exclude<SectionKey, 'chapters'>;
type DialogState =
  | { kind: 'story' }
  | { kind: 'chapter' }
  | { kind: 'entry'; section: CollectionSection; category: EntryCategory }
  | { kind: 'delete-story'; id: string }
  | { kind: 'delete-chapter'; id: string }
  | { kind: 'delete-entry'; section: CollectionSection; id: string };

const COLLECTION_SECTIONS: CollectionSection[] = ['characters', 'worldbuilding', 'art', 'notes', 'research'];

export default function App() {
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  const styles = makeStyles(theme, desktop);
  const { workspace, workspaceRef, persist, saveNow, restore, recoverChapter, replaceMatches, saveState, saveError, loadError, recoveryMessage, lastSavedAt, retryLoad, dismissRecovery } = useWorkspaceSave();
  // Feature: one revision workspace shares the captured passage and navigates back to real manuscript text.
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionTab, setRevisionTab] = useState<RevisionTab>('find');
  const [revisionToken, setRevisionToken] = useState(0);
  const [revisionSelection, setRevisionSelection] = useState<TextAnchor>();
  const [navigationRequest, setNavigationRequest] = useState<{ chapterId: string; start: number; end: number; token: number }>();
  // Opens chapter or project tools without losing a manuscript selection when the dialog takes focus.
  const openRevision = (selection?: TextAnchor, tab: RevisionTab = 'find') => {
    setRevisionSelection(selection); setRevisionTab(tab); setRevisionToken((value) => value + 1); setRevisionOpen(true);
  };
  // Feature: reloads the open editor after partial recovery so its old DOM cannot overwrite recovered passages.
  const [editorRevision, setEditorRevision] = useState(0);
  // Tracks the format chooser independently of create/delete dialogs.
  const [exportStoryId, setExportStoryId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('library');
  // Let desktop writers tuck the floating story navigator away for a wider drafting area.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('chapters');
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [formTitle, setFormTitle] = useState('');
  // Feature: missing names get actionable feedback instead of silently ignoring Create.
  const [formError, setFormError] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState<EntryCategory>('Reference');
  // Places the navigation toggle inside the aligned workspace header.
  const navigationControl = desktop ? <Pressable accessibilityRole="button" accessibilityLabel={sidebarOpen ? 'Hide navigation' : 'Show navigation'} onPress={() => setSidebarOpen(!sidebarOpen)} style={styles.sidebarToggle}><Text style={styles.sidebarToggleText}>{sidebarOpen ? '‹' : '☰'}</Text></Pressable> : undefined;

  const updateStory = useCallback((storyId: string, updater: (story: Story) => Story, options?: SaveOptions) => {
    const current = workspaceRef.current;
    if (!current) return;
    const stories = current.stories.map((story) => {
      if (story.id !== storyId) return story;
      const updated = updater(story);
      if (updated === story) return story;
      const change = describeStoryChange(story, updated);
      const activity = change ? appendStoryActivity(updated.activity ?? [], change) : updated.activity;
      return { ...updated, activity, updatedAt: change ? new Date().toISOString() : story.updatedAt };
    });
    // Feature: reselecting the same destination does not stage a redundant autosave or alter edit ordering.
    if (stories.every((story, index) => story === current.stories[index])) return;
    persist({ ...current, stories, updatedAt: new Date().toISOString() }, options);
  }, [persist]);

  const stories = workspace?.stories ?? [];
  const activeStory = stories.find((story) => story.id === activeStoryId) ?? null;
  const activeChapter = activeStory?.chapters.find((chapter) => chapter.id === activeChapterId) ?? null;
  const activeEntry = activeStory && activeSection !== 'chapters'
    ? activeStory[activeSection].find((entry) => entry.id === activeEntryId) ?? null
    : null;

  const openStory = (story: Story) => {
    setActiveStoryId(story.id);
    setActiveChapterId(null);
    setActiveEntryId(null);
    setScreen('story');
  };

  const openChapter = (story: Story, chapter: Chapter) => {
    const current = workspaceRef.current;
    if (current) {
      const next = rememberChapter(current, story.id, chapter.id);
      if (next !== current) persist(next);
    }
    setActiveStoryId(story.id);
    setActiveChapterId(chapter.id);
    setActiveSection('chapters');
    setScreen('editor');
  };

  const openSection = (section: SectionKey) => {
    if (!activeStory) return;
    setActiveSection(section);
    setActiveEntryId(null);
    setScreen('collection');
  };

  // Feature: linked memberships and member lists open the corresponding world or character dossier.
  const openReference = (section: 'characters' | 'worldbuilding', entry: StoryEntry) => {
    setActiveSection(section); setActiveEntryId(entry.id); setScreen('entry');
  };

  const startDialog = (nextDialog: DialogState, defaultTitle = '', defaultContent = '') => {
    setFormError('');
    setFormTitle(defaultTitle);
    setFormContent(defaultContent);
    if (nextDialog.kind === 'entry') setFormCategory(nextDialog.category);
    setDialog(nextDialog);
  };

  const submitDialog = () => {
    if (!dialog || !workspaceRef.current) return;
    const title = formTitle.trim();
    if (dialog.kind === 'delete-story') {
      const next = { ...workspaceRef.current, stories: workspaceRef.current.stories.filter((story) => story.id !== dialog.id), updatedAt: new Date().toISOString() };
      persist(next, { preservePrevious: { label: 'Before deleting story', workspace: workspaceRef.current } });
      if (activeStoryId === dialog.id) { setActiveStoryId(null); setScreen('library'); }
      setDialog(null);
      return;
    }
    if (dialog.kind === 'delete-chapter' && activeStory) {
      const chapters = activeStory.chapters.filter((chapter) => chapter.id !== dialog.id);
      updateStory(activeStory.id, (story) => ({ ...story, chapters, lastOpenedChapterId: story.lastOpenedChapterId === dialog.id ? undefined : story.lastOpenedChapterId }), { preservePrevious: { label: 'Before deleting chapter', workspace: workspaceRef.current } });
      if (activeChapterId === dialog.id) { setActiveChapterId(null); setScreen('collection'); }
      setDialog(null);
      return;
    }
    if (dialog.kind === 'delete-entry' && activeStory) {
      const section = dialog.section;
      const entries = activeStory[section].filter((entry) => entry.id !== dialog.id);
      updateStory(activeStory.id, (story) => ({ ...story, [section]: entries }), { preservePrevious: { label: 'Before deleting entry', workspace: workspaceRef.current } });
      if (activeEntryId === dialog.id) { setActiveEntryId(null); setScreen('collection'); }
      setDialog(null);
      return;
    }
    if (!title) { setFormError('Enter a title to create this ' + (dialog.kind === 'story' ? 'story.' : dialog.kind === 'chapter' ? 'chapter.' : 'entry.')); return; }
    if (dialog.kind === 'story') {
      const story = createStory(title);
      story.description = formContent.trim();
      // Feature: starting a personal story opens its first blank manuscript immediately.
      const chapter = createChapter('Chapter 1');
      story.chapters.push(chapter);
      story.lastOpenedChapterId = chapter.id;
      const next = { ...workspaceRef.current, stories: [...workspaceRef.current.stories, story], updatedAt: new Date().toISOString() };
      persist(next);
      setActiveStoryId(story.id);
      setActiveChapterId(chapter.id);
      setActiveSection('chapters');
      setScreen('editor');
    } else if (dialog.kind === 'chapter' && activeStory) {
      const chapter = createChapter(title);
      updateStory(activeStory.id, (story) => ({ ...story, chapters: [...story.chapters, chapter], lastOpenedChapterId: chapter.id }));
      setActiveChapterId(chapter.id);
      setActiveSection('chapters');
      setScreen('editor');
    } else if (dialog.kind === 'entry' && activeStory) {
      const entry = { ...createEntry(title, formCategory), content: formContent.trim() };
      updateStory(activeStory.id, (story) => ({ ...story, [dialog.section]: [...story[dialog.section], entry] }));
      setActiveSection(dialog.section);
      setActiveEntryId(entry.id);
      setScreen('entry');
    }
    setDialog(null);
  };

  const createNewStory = () => startDialog({ kind: 'story' });
  const createNewChapter = () => startDialog({ kind: 'chapter' }, `Chapter ${(activeStory?.chapters.length ?? 0) + 1}`);

  // Writer type choices are saved with their chapter so the preferred page style survives reopening.
  const saveChapterHtml = useCallback((chapterId: string, html: string) => {
    if (!activeStoryId) return;
    if (workspaceRef.current?.stories.find((story) => story.id === activeStoryId)?.chapters.find((chapter) => chapter.id === chapterId)?.html === html) return;
    updateStory(activeStoryId, (story) => ({
      ...story,
      chapters: story.chapters.map((chapter) => chapter.id === chapterId ? chapterWithHtml(chapter, html) : chapter),
    }));
  }, [activeStoryId, updateStory]);

  // Feature: external revisions reload only a changed open draft, retaining undo after a rejected checkpoint/preview.
  const refreshRevisedEditor = (previousHtml: string | undefined) => {
    const currentHtml = workspaceRef.current?.stories.find((story) => story.id === activeStoryId)?.chapters.find((chapter) => chapter.id === activeChapterId)?.html;
    if (currentHtml !== previousHtml) {
      setEditorRevision((value) => value + 1); setRevisionSelection(undefined); setNavigationRequest(undefined);
    }
  };

  const renameChapter = useCallback((chapterId: string, title: string) => {
    if (!activeStoryId) return;
    // Feature: leaving an unchanged title field is viewing, so it must not reorder recent edits.
    const nextTitle = title || 'Untitled chapter';
    if (workspaceRef.current?.stories.find((story) => story.id === activeStoryId)?.chapters.find((chapter) => chapter.id === chapterId)?.title === nextTitle) return;
    updateStory(activeStoryId, (story) => ({
      ...story,
      chapters: story.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, title: nextTitle, updatedAt: new Date().toISOString() } : chapter),
    }));
  }, [activeStoryId, updateStory]);

  const patchEntry = (patch: Partial<StoryEntry>) => {
    if (!activeStory || !activeEntry) return;
    const section = activeSection as CollectionSection;
    // Feature: removing saved character records, memberships or world events preserves a recoverable checkpoint.
    const previousProfile = activeEntry.characterProfile;
    const removesCharacterRecord = patch.characterProfile && ((patch.characterProfile.events?.length ?? 0) < (previousProfile?.events?.length ?? 0) || (patch.characterProfile.appearances?.length ?? 0) < (previousProfile?.appearances?.length ?? 0) || (patch.characterProfile.membershipIds?.length ?? 0) < (previousProfile?.membershipIds?.length ?? 0));
    const removesWorldEvent = patch.worldProfile && (patch.worldProfile.events?.length ?? 0) < (activeEntry.worldProfile?.events?.length ?? 0);
    // Feature: confirmed type changes and explicit history-link removals retain the complete previous workspace.
    const changesWorldType = section === 'worldbuilding' && patch.category !== undefined && patch.category !== activeEntry.category;
    const removesHistoryLink = patch.worldProfile && HISTORY_LINK_KEYS.some((key) => (activeEntry.worldProfile?.[key] ?? []).some((id) => !patch.worldProfile?.[key]?.includes(id)));
    const checkpointLabel = changesWorldType ? 'Before changing world entry type' : removesWorldEvent ? 'Before removing world event' : removesHistoryLink ? 'Before removing history link' : removesCharacterRecord ? 'Before removing character record' : '';
    updateStory(activeStory.id, (story) => ({ ...story, [section]: story[section].map((entry) => entry.id === activeEntry.id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry) }), checkpointLabel && workspaceRef.current ? { preservePrevious: { label: checkpointLabel, workspace: workspaceRef.current } } : undefined);
  };

  const moveChapter = (chapterId: string, delta: number) => {
    if (!activeStory) return;
    const from = activeStory.chapters.findIndex((chapter) => chapter.id === chapterId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= activeStory.chapters.length) return;
    const chapters = [...activeStory.chapters];
    [chapters[from], chapters[to]] = [chapters[to], chapters[from]];
    updateStory(activeStory.id, (story) => ({ ...story, chapters }));
  };

  const startEntry = (section: CollectionSection, category?: EntryCategory) => {
    const defaultCategory = category ?? (section === 'characters' ? 'Major' : section === 'worldbuilding' ? 'Setting' : 'Reference');
    startDialog({ kind: 'entry', section, category: defaultCategory }, '', '');
  };

  // Resets navigation after recovery so editor instances cannot write over restored chapters.
  const restoreAndNavigate = async (next: Workspace) => {
    await restore(next);
    setActiveStoryId(null); setActiveChapterId(null); setActiveEntryId(null); setScreen('library');
  };
  const workspaceTools = <WorkspaceTools theme={theme} workspace={workspace} saveState={saveState} lastSavedAt={lastSavedAt} onSave={() => saveNow({ checkpoint: 'Manual checkpoint' })} onRestore={restoreAndNavigate} onRecoverChapter={async (request) => { try { await recoverChapter(request); } finally { setEditorRevision((value) => value + 1); } }} />;
  // Feature: context uses available canvas width and persists explicit choices across editor remounts.
  const contextBeside = width - (desktop && sidebarOpen ? 278 : 0) >= 1040;
  const contextKey = contextBeside ? 'wide' : 'narrow';
  const contextOpen = workspace?.contextVisibility?.[contextKey] ?? contextBeside;
  const toggleContext = () => {
    const current = workspaceRef.current;
    if (current) persist({ ...current, contextVisibility: { ...current.contextVisibility, [contextKey]: !contextOpen } });
  };

  if (!workspace) {
    return <View style={{ flex: 1, backgroundColor: theme.background }}>{workspaceTools}<View style={styles.loading}>{!loadError && <ActivityIndicator color={theme.accent} />}<Text style={styles.mutedText}>{loadError || saveState}</Text>{!!loadError && <Pressable accessibilityRole="button" onPress={() => { void retryLoad(); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Try loading again</Text></Pressable>}</View></View>;
  }

  return (
    <View style={styles.shell}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />
      {desktop && sidebarOpen && (
        <Sidebar
          theme={theme}
          styles={styles}
          stories={stories}
          activeStoryId={activeStoryId}
          activeChapterId={activeChapterId}
          screen={screen}
          saveState={saveState}
          onNewStory={createNewStory}
          onLibrary={() => setScreen('library')}
          onOpenStory={openStory}
          onOpenChapter={openChapter}
          onAddChapter={createNewChapter}
        />
      )}
      <View style={styles.main}>
        {workspaceTools}
        {saveError ? <Text accessibilityRole="alert" style={styles.recoveryNotice}>{saveError}</Text> : null}
        {recoveryMessage ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss recovery notice" onPress={dismissRecovery} style={styles.recoveryNotice}><Text style={styles.mutedText}>{recoveryMessage} · Dismiss</Text></Pressable> : null}
        {screen === 'library' && (
          <LibraryScreen
            theme={theme} styles={styles} stories={stories} saveState={saveState} navigationControl={navigationControl}
            onNewStory={createNewStory} onOpenStory={openStory} onOpenChapter={openChapter}
            onDeleteStory={(story) => startDialog({ kind: 'delete-story', id: story.id })}
          />
        )}
        {screen === 'story' && activeStory && (
          <StoryScreen
            theme={theme} styles={styles} story={activeStory} saveState={saveState} navigationControl={navigationControl} desktop={desktop}
            onBack={() => setScreen('library')}
            onTitleChange={(title) => updateStory(activeStory.id, (story) => ({ ...story, title }))}
            onDescriptionChange={(description) => updateStory(activeStory.id, (story) => ({ ...story, description }))}
            onOpenSection={openSection}
            onOpenChapter={openChapter}
            onNewChapter={createNewChapter}
            onExport={() => setExportStoryId(activeStory.id)}
            onProjectTools={(tab) => openRevision(undefined, tab)}
          />
        )}
        {screen === 'collection' && activeStory && (
          <CollectionScreen
            theme={theme} styles={styles} story={activeStory} section={activeSection} saveState={saveState} navigationControl={navigationControl}
            onBack={() => setScreen('story')}
            onNewChapter={createNewChapter}
            onNewEntry={startEntry}
            onOpenChapter={openChapter}
            onOpenEntry={(entry) => { setActiveEntryId(entry.id); setScreen('entry'); }}
            onDeleteChapter={(chapter) => startDialog({ kind: 'delete-chapter', id: chapter.id })}
            onDeleteEntry={(entry) => startDialog({ kind: 'delete-entry', section: activeSection as CollectionSection, id: entry.id })}
            onMoveChapter={moveChapter}
          />
        )}
        {screen === 'entry' && activeStory && activeEntry && (
          <EntryScreen
            theme={theme} styles={styles} story={activeStory} entry={activeEntry} section={activeSection as CollectionSection} saveState={saveState} navigationControl={navigationControl}
            onBack={() => setScreen('collection')}
            onPatch={patchEntry}
            onOpenReference={openReference}
            onOpenChapter={(chapter) => openChapter(activeStory, chapter)}
            onDelete={() => startDialog({ kind: 'delete-entry', section: activeSection as CollectionSection, id: activeEntry.id })}
          />
        )}
        {screen === 'editor' && activeStory && activeChapter && (
          <RichEditor
            key={`${activeChapter.id}-${editorRevision}`}
            chapter={activeChapter}
            saveState={saveState}
            story={activeStory}
            theme={theme}
            desktop={desktop}
            contextBeside={contextBeside}
            contextOpen={contextOpen}
            navigationRequest={navigationRequest}
            onRevisionOpen={openRevision}
            onProsePreferences={(prosePreferences) => updateStory(activeStory.id, (story) => ({ ...story, prosePreferences }))}
            onIgnoreProofreading={(ignoredProofreading) => updateStory(activeStory.id, (story) => ({ ...story, chapters: story.chapters.map((chapter) => chapter.id === activeChapter.id ? { ...chapter, ignoredProofreading } : chapter) }))}
            onContextToggle={toggleContext}
            onExport={() => setExportStoryId(activeStory.id)}
            navigationControl={navigationControl}
            onSceneChange={(scenes: ChapterScene[], activeSceneId: string) => updateStory(activeStory.id, (story) => {
              const chapter = story.chapters.find((item) => item.id === activeChapter.id);
              if (!chapter) return story;
              const next = chapterWithScenes(chapter, scenes, activeSceneId);
              return next === chapter ? story : { ...story, chapters: story.chapters.map((item) => item.id === chapter.id ? next : item) };
            }, workspaceRef.current && (activeChapter.scenes ?? []).some((scene) => !scenes.some((next) => next.id === scene.id) || scene.characterIds.some((id) => !scenes.find((next) => next.id === scene.id)?.characterIds.includes(id))) ? { preservePrevious: { label: 'Before removing scene context', workspace: workspaceRef.current } } : undefined)}
            onBack={() => setScreen('story')}
            onTitleChange={(title) => renameChapter(activeChapter.id, title)}
            onSaveHtml={(html) => saveChapterHtml(activeChapter.id, html)}
            onPreferencesChange={(writingPreferences: WritingPreferences) => updateStory(activeStory.id, (story) => ({
              ...story,
              chapters: story.chapters.map((chapter) => chapter.id === activeChapter.id ? { ...chapter, writingPreferences, updatedAt: new Date().toISOString() } : chapter),
            }))}
            onTypographyChange={(fontFamily: WritingFontFamily, fontSize: number) => updateStory(activeStory.id, (story) => ({
              ...story,
              chapters: story.chapters.map((chapter) => chapter.id === activeChapter.id ? { ...chapter, fontFamily, fontSize, updatedAt: new Date().toISOString() } : chapter),
            }))}
          />
        )}
        {!desktop && <MobileNavigation screen={screen} notesActive={activeSection === 'notes' && (screen === 'collection' || screen === 'entry')} theme={theme} styles={styles} onLibrary={() => setScreen('library')} onStory={activeStory ? () => setScreen('story') : undefined} onNotes={activeStory ? () => openSection('notes') : undefined} />}
      </View>
      {exportStoryId && stories.find((story) => story.id === exportStoryId) && <ExportDialog story={stories.find((story) => story.id === exportStoryId)!} currentChapterId={activeStoryId === exportStoryId ? activeChapterId ?? undefined : undefined} theme={theme} onClose={() => setExportStoryId(null)} />}
      {activeStory && <RevisionTools key={activeStory.id} visible={revisionOpen} initialTab={revisionTab} openToken={revisionToken} theme={theme} workspace={workspace} story={activeStory} chapter={activeChapter ?? resumeChapter(activeStory)} selection={revisionSelection}
        onClose={() => setRevisionOpen(false)}
        onLocate={(chapterId, start, end) => {
          const target = activeStory.chapters.find((chapter) => chapter.id === chapterId);
          if (!target) return;
          setRevisionOpen(false); openChapter(activeStory, target);
          setNavigationRequest((previous) => ({ chapterId, start, end, token: (previous?.token ?? 0) + 1 }));
        }}
        onPatchChapter={(id, patch) => updateStory(activeStory.id, (story) => ({ ...story, chapters: story.chapters.map((chapter) => chapter.id === id ? { ...(patch.scenes !== undefined || patch.activeSceneId !== undefined ? chapterWithScenes(chapter, patch.scenes ?? chapter.scenes ?? [], patch.activeSceneId ?? chapter.activeSceneId) : chapter), ...patch } : chapter) }))}
        onPatchStory={(patch) => updateStory(activeStory.id, (story) => ({ ...story, ...patch }))}
        onCheckpoint={(name) => saveNow({ checkpoint: `${name} — ${activeStory.title} / ${(activeChapter ?? resumeChapter(activeStory))?.title ?? 'Story'}` })}
        onReplace={async (matches) => { const before = activeChapter?.html; try { return await replaceMatches(activeStory.id, matches); } finally { refreshRevisedEditor(before); } }}
        onRecover={async (request) => { const before = activeChapter?.html; try { await recoverChapter(request); } finally { refreshRevisedEditor(before); } }}
      />}
      <CreateDialog
        dialog={dialog}
        title={formTitle}
        content={formContent}
        error={formError}
        category={formCategory}
        theme={theme}
        styles={styles}
        activeStoryTitle={activeStory?.title ?? ''}
        onChangeTitle={(value) => { setFormTitle(value); setFormError(''); }}
        onChangeContent={setFormContent}
        onChangeCategory={setFormCategory}
        onCancel={() => setDialog(null)}
        onSubmit={submitDialog}
      />
    </View>
  );
}

function Sidebar({ theme, styles, stories, activeStoryId, activeChapterId, screen, saveState, onNewStory, onLibrary, onOpenStory, onOpenChapter, onAddChapter }: {
  theme: Theme; styles: ReturnType<typeof makeStyles>; stories: Story[]; activeStoryId: string | null; activeChapterId: string | null; screen: Screen; saveState: string;
  onNewStory: () => void; onLibrary: () => void; onOpenStory: (story: Story) => void; onOpenChapter: (story: Story, chapter: Chapter) => void; onAddChapter: () => void;
}) {
  return (
    <View style={styles.sidebar}>
      <Pressable style={styles.brandBlock} onPress={onLibrary} accessibilityRole="button" accessibilityLabel="Go to My stories">
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>l</Text></View>
        <View><Text style={styles.brand}>little by little</Text><Text style={styles.brandCaption}>Your writing space</Text></View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onNewStory} style={styles.newButton}><Text style={styles.newButtonText}>＋  New story</Text></Pressable>
      <Text style={styles.navHeading}>Workspace</Text>
      <NavRow label="My stories" icon="▤" active={screen === 'library'} onPress={onLibrary} styles={styles} />
      <Text style={[styles.navHeading, styles.projectsHeading]}>Your stories</Text>
      <ScrollView style={styles.storyNavList}>
        {stories.map((story) => {
          const selected = story.id === activeStoryId;
          return (
            <View key={story.id}>
              <Pressable accessibilityRole="button" onPress={() => onOpenStory(story)} style={[styles.storyNavRow, selected && styles.storyNavRowActive]}>
                <View style={[styles.projectDot, { backgroundColor: selected ? theme.peach : theme.secondary }]} />
                <Text numberOfLines={1} style={[styles.storyNavTitle, selected && styles.storyNavTitleActive]}>{story.title}</Text>
              </Pressable>
              {selected && <View style={styles.chapterNavGroup}>
                <Pressable accessibilityRole="button" onPress={() => onOpenStory(story)} style={styles.storyMenuLink}><Text style={styles.storyMenuText}>Story menu</Text></Pressable>
                {story.chapters.map((chapter, index) => (
                  <Pressable key={chapter.id} accessibilityRole="button" onPress={() => onOpenChapter(story, chapter)} style={styles.chapterNavRow}>
                    <Text style={[styles.chapterNavText, chapter.id === activeChapterId && styles.chapterNavTextActive]} numberOfLines={1}>{index + 1}. {chapter.title}</Text>
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" onPress={onAddChapter} style={styles.addChapterLink}><Text style={styles.addChapterText}>＋  Add a chapter</Text></Pressable>
              </View>}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.sidebarFooter}>
        <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
        <View style={styles.profileCopy}><Text style={styles.profileName}>Your workspace</Text><Text style={styles.profileStatus}>Local writing & backups</Text></View>
        <Text style={styles.settingsIcon}>⌘</Text>
      </View>
    </View>
  );
}

function NavRow({ label, icon, active, onPress, styles }: { label: string; icon: string; active: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.navRow, active && styles.navRowActive]}><Text style={[styles.navIcon, active && styles.navIconActive]}>{icon}</Text><Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text></Pressable>;
}

function LibraryScreen({ theme, styles, stories, saveState, navigationControl, onNewStory, onOpenStory, onOpenChapter, onDeleteStory }: {
  theme: Theme; styles: ReturnType<typeof makeStyles>; stories: Story[]; saveState: string; navigationControl?: ReactNode; onNewStory: () => void; onOpenStory: (story: Story) => void; onOpenChapter: (story: Story, chapter: Chapter) => void; onDeleteStory: (story: Story) => void;
}) {
  const recent = recentlyEdited(stories).slice(0, 4);
  return (
    <>
      <TopBar title="My stories" subtitle="A calm place for every draft" saveState={saveState} navigationControl={navigationControl} styles={styles} theme={theme} actionLabel="＋ New story" onAction={onNewStory} />
      <ScrollView contentContainerStyle={styles.libraryContent}>
        <View style={styles.welcomePanel}>
          <View style={styles.welcomeCopy}><Text style={styles.welcomeTitle}>Make room for what comes next.</Text><Text style={styles.welcomeSub}>Drafts save automatically on this device. Download a backup from Workspace to keep a copy elsewhere.</Text></View>
          <Pressable accessibilityRole="button" onPress={onNewStory} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Start my story</Text></Pressable>
        </View>
        <SectionHeading title="Your stories" caption={`${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`} styles={styles} />
        {stories.length === 0 ? <EmptyState title="Your next story starts here" detail="Create a story to give your chapters and ideas a home." styles={styles} /> : (
          <View style={styles.storyCardGrid}>
            {stories.map((story) => {
              const words = story.chapters.reduce((sum, chapter) => sum + countWords(chapter.html), 0);
              return (
                <View key={story.id} style={styles.storyCard}>
                  <Pressable accessibilityRole="button" onPress={() => onOpenStory(story)} style={styles.storyCardOpen}>
                    <View style={styles.storyCardTop}><View style={styles.storyCardMark}><Text style={styles.storyCardMarkText}>✎</Text></View><Text style={styles.cardArrow}>↗</Text></View>
                    {isExampleStory(story) && <Text style={styles.exampleLabel}>Example story</Text>}
                    <Text numberOfLines={2} style={styles.storyCardTitle}>{story.title}</Text>
                    <Text numberOfLines={2} style={styles.storyCardDescription}>{story.description || 'A new story waiting to be written.'}</Text>
                    <View style={styles.storyStats}><Text style={styles.statText}>{story.chapters.length} chapters</Text><Text style={styles.statText}>{words.toLocaleString()} words</Text></View>
                    {isExampleStory(story) && <Text style={styles.exampleLabel}>Explore the example</Text>}
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => onDeleteStory(story)} style={styles.storyDelete}><Text style={styles.storyDeleteText}>Delete story</Text></Pressable>
                </View>
              );
            })}
          </View>
        )}
        <SectionHeading title="Recently edited" caption="Latest edits first" styles={styles} />
        {recent.length === 0 ? <Text style={styles.mutedText}>Your chapter list will appear here.</Text> : <View style={styles.recentList}>{recent.map(({ story, chapter }, index) => <Pressable accessibilityRole="button" key={chapter.id} onPress={() => onOpenChapter(story, chapter)} style={styles.recentRow}><View style={[styles.recentIcon, { backgroundColor: index % 2 ? theme.secondarySoft : theme.accentSoft }]}><Text style={{ color: index % 2 ? theme.secondary : theme.accent }}>▤</Text></View><View style={styles.recentCopy}><Text style={styles.recentTitle}>{chapter.title}</Text><Text style={styles.recentMeta}>{story.title} · {countWords(chapter.html).toLocaleString()} words · {relativeActivityTime(chapter.updatedAt)}</Text></View><Text style={styles.cardArrow}>›</Text></Pressable>)}</View>}
      </ScrollView>
    </>
  );
}

function StoryScreen({ theme, styles, story, saveState, navigationControl, desktop, onBack, onTitleChange, onDescriptionChange, onOpenSection, onOpenChapter, onNewChapter, onExport, onProjectTools }: {
  theme: Theme; styles: ReturnType<typeof makeStyles>; story: Story; saveState: string; navigationControl?: ReactNode; desktop: boolean; onBack: () => void; onTitleChange: (title: string) => void; onDescriptionChange: (description: string) => void;
  onOpenSection: (section: SectionKey) => void; onOpenChapter: (story: Story, chapter: Chapter) => void; onNewChapter: () => void; onExport: () => void; onProjectTools: (tab: RevisionTab) => void;
}) {
  const words = story.chapters.reduce((sum, chapter) => sum + countWords(chapter.html), 0);
  const sections = (Object.keys(SECTION_INFO) as SectionKey[]);
  const startChapter = resumeChapter(story);
  return (
    <>
      <TopBar title={story.title} subtitle="Story workspace" saveState={saveState} navigationControl={navigationControl} styles={styles} theme={theme} backLabel="My stories" onBack={onBack} actionLabel="Export story" onAction={onExport} />
      <ScrollView contentContainerStyle={styles.storyHubContent}>
        <View style={styles.storyHubHero}>
          <View style={styles.storyHubHeroCopy}>
            {isExampleStory(story) && <Text style={styles.exampleLabel}>Example story · explore it or start your own from My stories.</Text>}
            <TextInput accessibilityLabel="Story title" style={styles.hubTitleInput} value={story.title} onChangeText={onTitleChange} onBlur={() => { if (!story.title.trim()) onTitleChange('Untitled story'); }} placeholder="Story title" placeholderTextColor={theme.muted} />
            {!story.title.trim() && <Text style={styles.mutedText}>Add a title. Leaving this field blank will use “Untitled story”.</Text>}
            <TextInput accessibilityLabel="Story premise or description" style={styles.hubDescription} value={story.description} onChangeText={onDescriptionChange} placeholder="Add a short description or premise…" placeholderTextColor={theme.muted} multiline />
            <Text style={styles.storyHubStats}>{story.chapters.length} chapters  ·  {words.toLocaleString()} words</Text>
          </View>
          <View style={{ gap: 6, flexShrink: 1 }}><Pressable accessibilityRole="button" onPress={() => startChapter ? onOpenChapter(story, startChapter) : onNewChapter()} style={styles.continueButton}><Text style={styles.continueButtonText}>{startChapter ? 'Continue writing' : 'Create first chapter'}</Text></Pressable>{startChapter && <Text style={styles.chapterMeta}>{startChapter.title}</Text>}</View>
        </View>
        {/* Feature: project tools are accessible before choosing a chapter. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><Pressable accessibilityRole="button" onPress={() => onProjectTools('style')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Project style guide</Text></Pressable><Pressable accessibilityRole="button" onPress={() => onProjectTools('targets')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Targets & release buffer</Text></Pressable></View>
        <SectionHeading title="Explore this story" caption="Choose what you want to work on" styles={styles} />
        <View style={styles.categoryGrid}>
          {sections.map((section) => {
            const info = SECTION_INFO[section];
            const total = section === 'chapters' ? story.chapters.length : story[section].length;
            return <Pressable accessibilityRole="button" key={section} onPress={() => onOpenSection(section)} style={styles.categoryCard}>
              <View style={styles.categoryTop}><View style={[styles.categoryIcon, { backgroundColor: theme.accentSoft }]}><Text style={styles.categoryIconText}>{info.icon}</Text></View><Text style={styles.categoryCount}>{total}</Text></View>
              <Text style={styles.categoryTitle}>{info.title}</Text><Text style={styles.categorySubtitle}>{info.subtitle}</Text>
            </Pressable>;
          })}
        </View>
        <View style={[styles.hubBottomGrid, { flexDirection: desktop ? 'row' : 'column' }]}>
          <View style={styles.chapterPanel}>
            <View style={styles.panelHeading}><View><Text style={styles.panelTitle}>Chapters</Text><Text style={styles.panelSubtitle}>The pages that make the story.</Text></View><Pressable accessibilityRole="button" onPress={onNewChapter} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>＋ Add chapter</Text></Pressable></View>
            {story.chapters.length === 0 ? <EmptyState title="Start with Chapter One" detail="Create a chapter, then open it to begin writing." styles={styles} action="＋ Create first chapter" onAction={onNewChapter} /> : (
              <View style={styles.chapterList}>{story.chapters.slice(0, 5).map((chapter, index) => <Pressable accessibilityRole="button" key={chapter.id} onPress={() => onOpenChapter(story, chapter)} style={styles.chapterRow}><View style={styles.chapterNumber}><Text style={styles.chapterNumberText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={styles.chapterCopy}><Text style={styles.chapterTitle}>{chapter.title}</Text><Text style={styles.chapterMeta}>{countWords(chapter.html).toLocaleString()} words</Text></View><Text style={styles.cardArrow}>›</Text></Pressable>)}</View>
            )}
          </View>
          <ActivityPanel theme={theme} styles={styles} story={story} />
        </View>
      </ScrollView>
    </>
  );
}

// Shows the most recent saved story actions beside the chapter list.
function ActivityPanel({ theme, styles, story }: { theme: Theme; styles: ReturnType<typeof makeStyles>; story: Story }) {
  const activity = getStoryActivity(story).slice(0, 6);
  return (
    <View style={styles.activityPanel}>
      <View style={styles.activityHeading}><View><Text style={styles.panelTitle}>Recent activity</Text><Text style={styles.panelSubtitle}>Changes made in this story.</Text></View><Text style={styles.activityClock}>◷</Text></View>
      {activity.length ? <View style={styles.activityList}>{activity.map((item) => (
        <View key={item.id} style={styles.activityRow}>
          <View style={styles.activityMarker} />
          <View style={styles.activityCopy}>
            <View style={styles.activityTitleLine}><Text numberOfLines={1} style={styles.activityAction}>{item.action}</Text><Text style={styles.activityTime}>{relativeActivityTime(item.createdAt)}</Text></View>
            <Text numberOfLines={1} style={styles.activityTarget}>{item.targetTitle}</Text>
            <Text numberOfLines={2} style={styles.activityDetail}>{item.details}</Text>
          </View>
        </View>
      ))}</View> : <Text style={styles.activityEmpty}>Your story history will appear here as you work.</Text>}
    </View>
  );
}

// Turns saved activity timestamps into short labels that are easy to scan.
function relativeActivityTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function CollectionScreen({ theme, styles, story, section, saveState, navigationControl, onBack, onNewChapter, onNewEntry, onOpenChapter, onOpenEntry, onDeleteChapter, onDeleteEntry, onMoveChapter }: {
  theme: Theme; styles: ReturnType<typeof makeStyles>; story: Story; section: SectionKey; saveState: string; navigationControl?: ReactNode; onBack: () => void;
  onNewChapter: () => void; onNewEntry: (section: CollectionSection, category?: EntryCategory) => void;
  onOpenChapter: (story: Story, chapter: Chapter) => void; onOpenEntry: (entry: StoryEntry) => void;
  onDeleteChapter: (chapter: Chapter) => void; onDeleteEntry: (entry: StoryEntry) => void; onMoveChapter: (id: string, delta: number) => void;
}) {
  const info = SECTION_INFO[section];
  const groups = section === 'characters' ? CHARACTER_GROUPS : section === 'worldbuilding' ? WORLD_GROUPS : [];
  const entries = section === 'chapters' ? [] : story[section as CollectionSection];
  const create = section === 'chapters' ? onNewChapter : () => onNewEntry(section as CollectionSection);
  const createLabel = section === 'chapters' ? '＋ New chapter' : `＋ New ${singularSection(section)}`;
  return (
    <>
      <TopBar title={info.title} subtitle={story.title} saveState={saveState} navigationControl={navigationControl} styles={styles} theme={theme} backLabel="Story menu" onBack={onBack} actionLabel={createLabel} onAction={create} />
      <ScrollView contentContainerStyle={styles.collectionContent}>
        <View style={styles.collectionIntro}><View style={[styles.collectionIcon, { backgroundColor: theme.accentSoft }]}><Text style={styles.categoryIconText}>{info.icon}</Text></View><View style={styles.collectionCopy}><Text style={styles.collectionTitle}>{info.title}</Text><Text style={styles.collectionSubtitle}>{info.subtitle}</Text></View></View>
        {section === 'chapters' ? (
          story.chapters.length === 0 ? <EmptyState title="No chapters yet" detail="Give the story its first page." styles={styles} action="＋ Create first chapter" onAction={onNewChapter} /> :
            <View style={styles.collectionList}>{story.chapters.map((chapter, index) => <View key={chapter.id} style={styles.collectionRowWrap}><Pressable accessibilityRole="button" onPress={() => onOpenChapter(story, chapter)} style={styles.collectionRow}><View style={styles.chapterNumber}><Text style={styles.chapterNumberText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={styles.collectionRowCopy}><Text style={styles.collectionRowTitle}>{chapter.title}</Text><Text style={styles.collectionRowMeta}>{countWords(chapter.html).toLocaleString()} words · {new Date(chapter.updatedAt).toLocaleDateString()}</Text></View><Text style={styles.cardArrow}>›</Text></Pressable><View style={styles.rowTools}><Pressable accessibilityRole="button" accessibilityLabel={`Move ${chapter.title} up`} accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => onMoveChapter(chapter.id, -1)} style={styles.smallTool}><Text style={styles.smallToolText}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Move ${chapter.title} down`} accessibilityState={{ disabled: index === story.chapters.length - 1 }} disabled={index === story.chapters.length - 1} onPress={() => onMoveChapter(chapter.id, 1)} style={styles.smallTool}><Text style={styles.smallToolText}>↓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${chapter.title}`} onPress={() => onDeleteChapter(chapter)} style={styles.smallTool}><Text style={styles.deleteIcon}>×</Text></Pressable></View></View>)}</View>
        ) : (
          groups.length ? groups.map((group) => {
            const groupEntries = entries.filter((entry) => entry.category === group);
            return <View key={group} style={styles.groupSection}><View style={styles.groupHeading}><Text style={styles.groupTitle}>{group}</Text><Pressable accessibilityRole="button" onPress={() => onNewEntry(section as CollectionSection, group)} style={styles.groupAdd}><Text style={styles.groupAddText}>＋ Add</Text></Pressable></View><EntryList entries={groupEntries} story={story} section={section} styles={styles} onOpen={onOpenEntry} onDelete={onDeleteEntry} emptyText={`No ${group.toLowerCase()} entries yet.`} /></View>;
          }) : entries.length ? <EntryList entries={entries} styles={styles} onOpen={onOpenEntry} onDelete={onDeleteEntry} /> : <EmptyState title={`Nothing in ${info.title.toLowerCase()} yet`} detail="Create an entry to keep the useful details close to your draft." styles={styles} action={createLabel} onAction={create} />
        )}
        {/* Feature: older character entries with non-character categories remain available for recategorising. */}
        {section === 'characters' && entries.some((entry) => !CHARACTER_GROUPS.includes(entry.category)) && <View style={styles.groupSection}><Text style={styles.groupTitle}>Other characters</Text><EntryList entries={entries.filter((entry) => !CHARACTER_GROUPS.includes(entry.category))} story={story} styles={styles} onOpen={onOpenEntry} onDelete={onDeleteEntry} /></View>}
        {/* Feature: legacy world entries outside the standard categories remain visible and can be recategorised. */}
        {section === 'worldbuilding' && entries.some((entry) => !WORLD_GROUPS.includes(entry.category)) && <View style={styles.groupSection}><Text style={styles.groupTitle}>Other world entries</Text><EntryList entries={entries.filter((entry) => !WORLD_GROUPS.includes(entry.category))} story={story} section={section} styles={styles} onOpen={onOpenEntry} onDelete={onDeleteEntry} /></View>}
        {section !== 'chapters' && !groups.length && entries.length > 0 && <Pressable accessibilityRole="button" onPress={create} style={styles.addAnother}><Text style={styles.secondaryButtonText}>{createLabel}</Text></Pressable>}
        {section === 'art' && <Text style={styles.helperNote}>Add visual references by saving their title, source link, and notes. File attachments can be added as a later milestone.</Text>}
      </ScrollView>
    </>
  );
}

// Feature: character and world rows summarize their saved connections while other collections keep note previews.
function EntryList({ entries, story, section, styles, onOpen, onDelete, emptyText }: { entries: StoryEntry[]; story?: Story; section?: SectionKey; styles: ReturnType<typeof makeStyles>; onOpen: (entry: StoryEntry) => void; onDelete: (entry: StoryEntry) => void; emptyText?: string }) {
  if (!entries.length) return <Text style={styles.groupEmpty}>{emptyText ?? 'No entries yet.'}</Text>;
  return <View style={styles.entryList}>{entries.map((entry) => <View key={entry.id} style={styles.entryRowWrap}><Pressable accessibilityRole="button" onPress={() => onOpen(entry)} style={styles.entryRow}><View style={styles.entryBullet} /><View style={styles.collectionRowCopy}><Text style={styles.collectionRowTitle}>{entry.title}</Text><Text numberOfLines={2} style={styles.collectionRowMeta}>{story ? section === 'worldbuilding' ? worldSummary(story, entry) : characterSummary(story, entry) : entry.content || 'Add notes and details…'}</Text></View><Text style={styles.cardArrow}>›</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${entry.title}`} onPress={() => onDelete(entry)} style={styles.smallTool}><Text style={styles.deleteIcon}>×</Text></Pressable></View>)}</View>;
}

function EntryScreen({ theme, styles, story, entry, section, saveState, navigationControl, onBack, onPatch, onDelete, onOpenChapter, onOpenReference }: { theme: Theme; styles: ReturnType<typeof makeStyles>; story: Story; entry: StoryEntry; section: CollectionSection; saveState: string; navigationControl?: ReactNode; onBack: () => void; onPatch: (patch: Partial<StoryEntry>) => void; onDelete: () => void; onOpenChapter: (chapter: Chapter) => void; onOpenReference: (section: 'characters' | 'worldbuilding', entry: StoryEntry) => void }) {
  const info = SECTION_INFO[section];
  return (
    <>
      <TopBar title={entry.title} subtitle={`${story.title} · ${info.title}`} saveState={saveState} navigationControl={navigationControl} styles={styles} theme={theme} backLabel={info.title} onBack={onBack} actionLabel="Delete" onAction={onDelete} />
      {/* Feature: character and world dossiers share direct navigation through explicit membership connections. */}
      {section === 'characters' ? <CharacterWorkspace key={entry.id} story={story} character={entry} theme={theme} onPatch={onPatch} onOpenChapter={onOpenChapter} onOpenGroup={(group) => onOpenReference('worldbuilding', group)} /> : section === 'worldbuilding' ? <WorldWorkspace key={entry.id} story={story} entry={entry} theme={theme} onPatch={onPatch} onOpenChapter={onOpenChapter} onOpenCharacter={(character) => onOpenReference('characters', character)} onOpenWorld={(world) => onOpenReference('worldbuilding', world)} /> : <ScrollView contentContainerStyle={styles.entryEditorArea}>
        <View style={styles.entryPaper}>
          <Text style={styles.eyebrow}>{entry.category.toUpperCase()}</Text>
          <TextInput value={entry.title} onChangeText={(title) => onPatch({ title })} placeholder="Title" placeholderTextColor={theme.muted} style={styles.entryTitleInput} />
          <TextInput value={entry.content} onChangeText={(content) => onPatch({ content })} placeholder={section === 'research' ? 'Add a summary, source link, or details to check…' : section === 'art' ? 'Describe the reference, add a source link, or note what it inspires…' : 'Write down the details you want to remember…'} placeholderTextColor={theme.muted} multiline textAlignVertical="top" style={styles.entryBodyInput} />
          <Text style={styles.entryTimestamp}>Updated {new Date(entry.updatedAt).toLocaleString()}</Text>
        </View>
      </ScrollView>}
    </>
  );
}

function TopBar({ title, subtitle, saveState, navigationControl, styles, theme, backLabel, onBack, actionLabel, onAction }: {
  title: string; subtitle: string; saveState: string; navigationControl?: ReactNode; styles: ReturnType<typeof makeStyles>; theme: Theme; backLabel?: string; onBack?: () => void; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={[styles.topbar, { borderBottomColor: theme.border }]}>
      {navigationControl}
      {onBack && <Pressable accessibilityRole="button" onPress={onBack} style={styles.topBack}><Text style={styles.topBackText}>‹  {backLabel}</Text></Pressable>}
      <View style={styles.topbarCopy}><Text style={styles.eyebrow}>{subtitle}</Text><Text numberOfLines={1} style={styles.topbarTitle}>{title}</Text></View>
      <View style={styles.topbarRight}>
        {onAction && <Pressable accessibilityRole="button" onPress={onAction} style={styles.topAction}><Text style={styles.topActionText}>{actionLabel}</Text></Pressable>}
      </View>
    </View>
  );
}

function SectionHeading({ title, caption, styles }: { title: string; caption: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionCaption}>{caption}</Text></View>;
}

function EmptyState({ title, detail, styles, action, onAction }: { title: string; detail: string; styles: ReturnType<typeof makeStyles>; action?: string; onAction?: () => void }) {
  return <View style={styles.emptyState}><View style={styles.emptyMark}><Text style={styles.emptyMarkText}>✎</Text></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text>{action && onAction && <Pressable accessibilityRole="button" onPress={onAction} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{action}</Text></Pressable>}</View>;
}

// Feature: mobile navigation reports and displays the actual current destination.
function MobileNavigation({ screen, notesActive, theme, styles, onLibrary, onStory, onNotes }: { screen: Screen; notesActive: boolean; theme: Theme; styles: ReturnType<typeof makeStyles>; onLibrary: () => void; onStory?: () => void; onNotes?: () => void }) {
  return <View style={[styles.mobileNav, { borderTopColor: theme.border }]}><Pressable accessibilityRole="button" accessibilityLabel="My stories" accessibilityState={{ selected: screen === 'library' }} onPress={onLibrary} style={styles.mobileNavButton}><Text style={screen === 'library' ? styles.mobileNavActive : styles.mobileNavIcon}>▤</Text><Text style={screen === 'library' ? styles.mobileNavActive : styles.mobileNavText}>Stories</Text></Pressable>{onStory && <Pressable accessibilityRole="button" accessibilityLabel="Story workspace" accessibilityState={{ selected: screen !== 'library' && !notesActive }} onPress={onStory} style={styles.mobileNavButton}><Text style={screen !== 'library' && !notesActive ? styles.mobileNavActive : styles.mobileNavIcon}>⌂</Text><Text style={screen !== 'library' && !notesActive ? styles.mobileNavActive : styles.mobileNavText}>Story</Text></Pressable>}{onNotes && <Pressable accessibilityRole="button" accessibilityLabel="Story notes" accessibilityState={{ selected: notesActive }} onPress={onNotes} style={styles.mobileNavButton}><Text style={notesActive ? styles.mobileNavActive : styles.mobileNavIcon}>✎</Text><Text style={notesActive ? styles.mobileNavActive : styles.mobileNavText}>Notes</Text></Pressable>}</View>;
}

function CreateDialog({ dialog, title, content, error, category, theme, styles, activeStoryTitle, onChangeTitle, onChangeContent, onChangeCategory, onCancel, onSubmit }: {
  dialog: DialogState | null; title: string; content: string; error: string; category: EntryCategory; theme: Theme; styles: ReturnType<typeof makeStyles>; activeStoryTitle: string;
  onChangeTitle: (value: string) => void; onChangeContent: (value: string) => void; onChangeCategory: (value: EntryCategory) => void; onCancel: () => void; onSubmit: () => void;
}) {
  if (!dialog) return null;
  const isDelete = dialog.kind.startsWith('delete-');
  const titleText = dialog.kind === 'story' ? 'Create a story' : dialog.kind === 'chapter' ? 'Add a chapter' : dialog.kind === 'entry' ? `New ${singularSection(dialog.section)}` : dialog.kind === 'delete-story' ? 'Delete this story?' : dialog.kind === 'delete-chapter' ? 'Delete this chapter?' : 'Delete this entry?';
  const groups = dialog.kind === 'entry' && dialog.section === 'characters' ? CHARACTER_GROUPS : dialog.kind === 'entry' && dialog.section === 'worldbuilding' ? WORLD_GROUPS : [];
  return (
    <Modal accessibilityLabel={titleText} transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>{titleText}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onCancel}><Text style={styles.modalClose}>×</Text></Pressable></View>
        {isDelete ? <Text style={styles.modalDetail}>This action removes it from {activeStoryTitle || 'your library'} on this device.</Text> : <>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput accessibilityLabel={dialog.kind === 'story' ? 'New story title' : dialog.kind === 'chapter' ? 'New chapter title' : 'New entry title'} autoFocus value={title} onChangeText={onChangeTitle} placeholder={dialog.kind === 'story' ? 'A name for your story' : dialog.kind === 'chapter' ? 'Chapter title' : 'Give this entry a name'} placeholderTextColor={theme.muted} style={styles.modalInput} onSubmitEditing={onSubmit} />
          {!!error && <Text accessibilityRole="alert" style={styles.modalDetail}>{error}</Text>}
          {dialog.kind === 'story' && <><Text style={styles.fieldLabel}>Premise or description (optional)</Text><TextInput accessibilityLabel="New story premise or description" value={content} onChangeText={onChangeContent} multiline placeholder="What is this story about?" placeholderTextColor={theme.muted} style={[styles.modalInput, styles.modalTextarea]} /></>}
          {dialog.kind === 'entry' && <>
            {groups.length > 0 && <><Text style={styles.fieldLabel}>Group</Text><View style={styles.optionRow}>{groups.map((group) => <Pressable accessibilityRole="button" key={group} onPress={() => onChangeCategory(group)} style={[styles.optionChip, category === group && styles.optionChipActive]}><Text style={[styles.optionText, category === group && styles.optionTextActive]}>{group}</Text></Pressable>)}</View></>}
            <Text style={styles.fieldLabel}>{dialog.section === 'art' ? 'Reference notes or link (optional)' : 'Notes (optional)'}</Text>
            <TextInput accessibilityLabel="New entry notes" value={content} onChangeText={onChangeContent} multiline placeholder={dialog.section === 'research' ? 'Source, summary, or questions to check…' : dialog.section === 'art' ? 'Source link and what you want to remember…' : 'Write a few details…'} placeholderTextColor={theme.muted} style={[styles.modalInput, styles.modalTextarea]} />
          </>}
        </>}
        <View style={styles.modalActions}><Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" onPress={onSubmit} style={[styles.primaryButton, isDelete && styles.dangerButton]}><Text style={styles.primaryButtonText}>{isDelete ? 'Delete' : 'Create'}</Text></Pressable></View>
      </View></View>
    </Modal>
  );
}

function singularSection(section: SectionKey) {
  switch (section) {
    case 'chapters': return 'chapter';
    case 'characters': return 'character';
    case 'worldbuilding': return 'worldbuilding entry';
    case 'art': return 'art reference';
    case 'notes': return 'note';
    case 'research': return 'research item';
  }
}


function makeStyles(theme: Theme, desktop: boolean) {
  return StyleSheet.create({
    shell: { flex: 1, flexDirection: 'row', backgroundColor: theme.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.background },
    main: { flex: 1, minWidth: 0, position: 'relative' },
    recoveryNotice: { padding: 12, backgroundColor: theme.secondarySoft, color: theme.text, fontSize: 14, lineHeight: 18 },
    sidebarToggle: { width: 44, height: 44, flexShrink: 0, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border },
    sidebarToggleText: { color: theme.accent, fontSize: 18, fontWeight: '700' },
    sidebar: { width: 250, margin: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 23, paddingHorizontal: 18, paddingTop: 20, shadowColor: '#332F38', shadowOpacity: 0.09, shadowOffset: { width: 0, height: 4 }, shadowRadius: 16, elevation: 3 },
    brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 28 },
    brandMark: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSoft },
    brandMarkText: { fontSize: 22, fontWeight: '700', color: theme.accent, fontStyle: 'italic' },
    brand: { fontSize: 15, fontWeight: '700', color: theme.text },
    brandCaption: { color: theme.muted, fontSize: 12, letterSpacing: 1.15, marginTop: 3 },
    newButton: { minHeight: 44, backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 26 },
    newButtonText: { color: theme.mode === 'dark' ? '#201B2A' : '#FFFFFF', fontSize: 14, fontWeight: '700' },
    navHeading: { color: theme.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.15, marginLeft: 9, marginBottom: 9 },
    projectsHeading: { marginTop: 29 },
    navRow: { height: 40, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
    navRowActive: { backgroundColor: theme.accentSoft },
    navIcon: { width: 16, textAlign: 'center', fontSize: 14, color: theme.muted },
    navIconActive: { color: theme.accent },
    navLabel: { fontSize: 14, color: theme.muted, fontWeight: '500' },
    navLabelActive: { color: theme.accent, fontWeight: '700' },
    storyNavList: { flex: 1 },
    storyNavRow: { minHeight: 38, paddingHorizontal: 9, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    storyNavRowActive: { backgroundColor: theme.surfaceAlt },
    projectDot: { width: 8, height: 8, borderRadius: 4 },
    storyNavTitle: { color: theme.text, fontSize: 14, flex: 1 },
    storyNavTitleActive: { fontWeight: '700' },
    chapterNavGroup: { paddingBottom: 6 },
    storyMenuLink: { marginLeft: 25, paddingVertical: 6 },
    storyMenuText: { color: theme.muted, fontSize: 14 },
    chapterNavRow: { marginLeft: 25, paddingVertical: 6, paddingRight: 4 },
    chapterNavText: { color: theme.muted, fontSize: 14 },
    chapterNavTextActive: { color: theme.accent, fontWeight: '700' },
    addChapterLink: { marginLeft: 25, paddingVertical: 7 },
    addChapterText: { color: theme.muted, fontSize: 14 },
    sidebarFooter: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
    avatar: { height: 31, width: 31, borderRadius: 16, backgroundColor: theme.secondarySoft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: theme.secondary, fontSize: 14, fontWeight: '700' },
    profileCopy: { flex: 1, minWidth: 0 },
    profileName: { color: theme.text, fontSize: 14, fontWeight: '700' },
    profileStatus: { color: theme.muted, fontSize: 12, marginTop: 3 },
    settingsIcon: { color: theme.muted, fontSize: 15 },
    topbar: { minHeight: 64, flexShrink: 0, flexWrap: 'wrap', paddingVertical: 10, marginHorizontal: desktop ? 18 : 9, marginTop: desktop ? 14 : 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, paddingHorizontal: desktop ? 18 : 14, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#332F38', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 1 },
    topBack: { paddingVertical: 8, paddingRight: 8 },
    topBackText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    topbarCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: theme.muted, fontSize: 12, letterSpacing: 1.2, fontWeight: '800' },
    topbarTitle: { color: theme.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
    topbarRight: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 15 },
    saveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    saveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.secondary },
    saveText: { color: theme.muted, fontSize: 14 },
    topAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
    topActionText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    libraryContent: { width: '100%', maxWidth: 1160, alignSelf: 'center', paddingHorizontal: desktop ? 38 : 16, paddingTop: desktop ? 32 : 22, paddingBottom: 50 },
    welcomePanel: { backgroundColor: theme.accentSoft, borderRadius: 18, padding: desktop ? 27 : 19, flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 31 },
    welcomeCopy: { flex: 1 },
    welcomeTitle: { color: theme.text, fontSize: desktop ? 26 : 22, fontWeight: '700', marginTop: 9, maxWidth: 480 },
    welcomeSub: { color: theme.muted, fontSize: 14, lineHeight: 18, marginTop: 7, maxWidth: 430 },
    primaryButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: theme.accent, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 10 },
    primaryButtonText: { color: theme.mode === 'dark' ? '#201B2A' : '#FFFFFF', fontSize: 14, fontWeight: '700' },
    sectionHeading: { flexWrap: 'wrap', gap: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, marginTop: 8 },
    sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
    sectionCaption: { color: theme.muted, fontSize: 12 },
    exampleLabel: { color: theme.accent, fontSize: 12, fontWeight: '700', marginVertical: 6 },
    storyCardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginBottom: 31 },
    storyCard: { maxWidth: '100%', width: desktop ? 275 : '100%', backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 16 },
    storyCardOpen: { minHeight: 153 },
    storyCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    storyCardMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' },
    storyCardMarkText: { color: theme.accent, fontSize: 14 },
    storyCardTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    storyCardDescription: { color: theme.muted, fontSize: 14, lineHeight: 20, marginTop: 5, minHeight: 30 },
    storyStats: { flexDirection: 'row', gap: 12, marginTop: 14 },
    statText: { color: theme.muted, fontSize: 12 },
    cardArrow: { color: theme.muted, fontSize: 18 },
    storyDelete: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', paddingTop: 8 },
    storyDeleteText: { color: theme.muted, fontSize: 14 },
    recentList: { backgroundColor: theme.surface, borderRadius: 13, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
    recentRow: { minHeight: 61, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: theme.border },
    recentIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    recentCopy: { flex: 1 },
    recentTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    recentMeta: { color: theme.muted, fontSize: 12, marginTop: 4 },
    mutedText: { color: theme.muted, fontSize: 14 },
    storyHubContent: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: desktop ? 38 : 16, paddingVertical: desktop ? 28 : 18, paddingBottom: 48 },
    storyHubHero: { borderRadius: 17, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: desktop ? 25 : 18, marginBottom: 27, flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', gap: 18 },
    storyHubHeroCopy: { flex: 1 },
    hubTitleInput: { color: theme.text, fontSize: desktop ? 25 : 22, fontWeight: '700', padding: 0, marginTop: 8 },
    hubDescription: { color: theme.muted, fontSize: 14, lineHeight: 20, padding: 0, marginTop: 7, minHeight: 36 },
    storyHubStats: { color: theme.muted, fontSize: 12, marginTop: 12 },
    continueButton: { backgroundColor: theme.secondarySoft, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 11 },
    continueButtonText: { color: theme.secondary, fontSize: 14, fontWeight: '700' },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 27 },
    categoryCard: { width: desktop ? '31%' : '100%', minHeight: 135, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 13, padding: 15 },
    categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    categoryIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    categoryIconText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    categoryCount: { color: theme.muted, fontSize: 14 },
    categoryTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    categorySubtitle: { color: theme.muted, fontSize: 12, lineHeight: 20, marginTop: 4 },
    chapterPanel: { flex: desktop ? 1 : undefined, backgroundColor: theme.surface, borderRadius: 13, borderWidth: 1, borderColor: theme.border, padding: desktop ? 19 : 14 },
    hubBottomGrid: { gap: 14, alignItems: 'stretch' },
    activityPanel: { width: desktop ? 280 : '100%', backgroundColor: theme.surface, borderRadius: 13, borderWidth: 1, borderColor: theme.border, padding: desktop ? 19 : 14 },
    activityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
    activityClock: { color: theme.accent, fontSize: 18 },
    activityList: { borderTopWidth: 1, borderTopColor: theme.border },
    activityRow: { minHeight: 65, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: theme.border },
    activityMarker: { width: 7, height: 7, marginTop: 5, borderRadius: 4, backgroundColor: theme.secondary },
    activityCopy: { flex: 1, minWidth: 0, gap: 3 },
    activityTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    activityAction: { flex: 1, color: theme.text, fontSize: 14, fontWeight: '700' },
    activityTime: { color: theme.muted, fontSize: 12 },
    activityTarget: { color: theme.accent, fontSize: 14, fontWeight: '600' },
    activityDetail: { color: theme.muted, fontSize: 14, lineHeight: 20 },
    activityEmpty: { color: theme.muted, fontSize: 14, lineHeight: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border },
    panelHeading: { flexWrap: 'wrap', gap: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
    panelTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    panelSubtitle: { color: theme.muted, fontSize: 12, marginTop: 4 },
    secondaryButton: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
    secondaryButtonText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    chapterList: { borderTopWidth: 1, borderTopColor: theme.border },
    chapterRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: theme.border },
    chapterNumber: { width: 31, height: 31, borderRadius: 9, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' },
    chapterNumberText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    chapterCopy: { flex: 1 },
    chapterTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    chapterMeta: { color: theme.muted, fontSize: 12, marginTop: 4 },
    collectionContent: { width: '100%', maxWidth: 940, alignSelf: 'center', paddingHorizontal: desktop ? 38 : 16, paddingVertical: desktop ? 30 : 20, paddingBottom: 50 },
    collectionIntro: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 24 },
    collectionIcon: { height: 42, width: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    collectionCopy: { flex: 1 },
    collectionTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
    collectionSubtitle: { color: theme.muted, fontSize: 12, marginTop: 4 },
    collectionList: { backgroundColor: theme.surface, borderRadius: 13, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
    collectionRowWrap: { borderBottomWidth: 1, borderBottomColor: theme.border },
    collectionRow: { minHeight: 61, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
    collectionRowCopy: { flex: 1 },
    collectionRowTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    collectionRowMeta: { color: theme.muted, fontSize: 12, lineHeight: 20, marginTop: 4 },
    rowTools: { flexDirection: 'row', justifyContent: 'flex-end', gap: 5, paddingHorizontal: 10, paddingBottom: 6 },
    smallTool: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 5 },
    smallToolText: { color: theme.muted, fontSize: 14 },
    deleteIcon: { color: theme.muted, fontSize: 15 },
    groupSection: { marginBottom: 23 },
    groupHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
    groupTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    groupAdd: { padding: 7 },
    groupAddText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    groupEmpty: { color: theme.muted, fontSize: 14, paddingVertical: 15, paddingHorizontal: 13, backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
    entryList: { backgroundColor: theme.surface, borderRadius: 11, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
    entryRowWrap: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border, paddingRight: 8 },
    entryRow: { flex: 1, minHeight: 60, paddingLeft: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
    entryBullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.secondary },
    addAnother: { alignSelf: 'flex-start', marginTop: 12, padding: 8 },
    helperNote: { color: theme.muted, fontSize: 12, lineHeight: 20, marginTop: 17 },
    emptyState: { minHeight: 210, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    emptyMark: { height: 39, width: 39, borderRadius: 13, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyMarkText: { color: theme.accent, fontSize: 16 },
    emptyTitle: { color: theme.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
    emptyDetail: { color: theme.muted, maxWidth: 300, textAlign: 'center', fontSize: 14, lineHeight: 20 },
    entryEditorArea: { flexGrow: 1, alignItems: 'center', padding: desktop ? 35 : 14, paddingBottom: 40 },
    entryPaper: { width: '100%', maxWidth: 760, minHeight: 530, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: desktop ? 45 : 21 },
    entryTitleInput: { color: theme.text, fontSize: 22, fontWeight: '700', padding: 0, marginTop: 9, marginBottom: 20 },
    entryBodyInput: { color: theme.text, fontSize: 14, lineHeight: 22, minHeight: 300, padding: 0 },
    entryTimestamp: { color: theme.muted, fontSize: 12, marginTop: 25 },
    mobileNav: { minHeight: 56, flexShrink: 0, backgroundColor: theme.surface, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    mobileNavButton: { minWidth: 64, minHeight: 44, alignItems: 'center', gap: 2, padding: 7 },
    mobileNavActive: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    mobileNavIcon: { color: theme.muted, fontSize: 14 },
    mobileNavText: { color: theme.muted, fontSize: 14 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(18,16,21,0.34)', alignItems: 'center', justifyContent: 'center', padding: 18 },
    modalCard: { maxHeight: '92%', width: '100%', maxWidth: 440, backgroundColor: theme.surface, borderRadius: 15, borderWidth: 1, borderColor: theme.border, padding: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    modalTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
    modalClose: { minWidth: 44, minHeight: 44, textAlign: 'center', color: theme.muted, fontSize: 23, paddingHorizontal: 4 },
    modalDetail: { color: theme.muted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
    fieldLabel: { color: theme.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
    modalInput: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, color: theme.text, fontSize: 14, backgroundColor: theme.background },
    modalTextarea: { minHeight: 80, textAlignVertical: 'top', marginBottom: 5 },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    optionChip: { borderWidth: 1, borderColor: theme.border, borderRadius: 18, paddingHorizontal: 9, paddingVertical: 6 },
    optionChipActive: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    optionText: { color: theme.muted, fontSize: 14 },
    optionTextActive: { color: theme.accent, fontWeight: '700' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 9, marginTop: 18 },
    cancelButton: { paddingHorizontal: 13, paddingVertical: 9 },
    cancelButtonText: { color: theme.muted, fontSize: 14, fontWeight: '600' },
    // Feature: destructive actions keep readable button text in both palettes.
    dangerButton: { backgroundColor: theme.mode === 'dark' ? theme.peach : '#99513F' },
  });
}
