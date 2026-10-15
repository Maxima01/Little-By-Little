import Pressable from '../../../components/AccessiblePressable';
import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { chooseWorkspaceBackup, downloadWorkspaceBackup } from '../lib/fileTransfer';
import { countWords, plainText, type Chapter, type Workspace } from '../../../domain/model';
import ChapterComparison from '../../editor/components/ChapterComparison';
import type { ChapterRecoveryRequest } from '../../editor/lib/chapterRecovery';
import { listWorkspaceVersions } from '../lib/storage';
import type { SavedVersion } from '../lib/saveHistory';
import type { Theme } from '../../../theme/theme';

type Props = { theme: Theme; workspace: Workspace | null; saveState: string; lastSavedAt: string | null; onSave: () => Promise<unknown>; onRestore: (workspace: Workspace) => Promise<void>; onRecoverChapter: (request: ChapterRecoveryRequest) => Promise<void> };

// Keeps save, recovery, and portable backups accessible from every writing screen and startup errors.
export default function WorkspaceTools({ theme, workspace, saveState, lastSavedAt, onSave, onRestore, onRecoverChapter }: Props) {
  const styles = makeStyles(theme);
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [selected, setSelected] = useState<SavedVersion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  // Feature: small windows group recovery and backup commands in a labeled workspace disclosure.
  const { width } = useWindowDimensions();
  const compact = width < 1280;
  const [menuOpen, setMenuOpen] = useState(false);
  // Feature: comparisons are scoped to a saved chapter instead of requiring whole-workspace restoration.
  const [comparison, setComparison] = useState<{ chapter: Chapter; storyId: string; storyTitle: string } | null>(null);

  // Runs file/storage actions with visible progress and an actionable failure message.
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'The action failed. Please try again.'); }
    finally { setBusy(false); }
  };
  // Reads committed history for preview without making opening history depend on a successful save.
  const showHistory = () => {
    setOpen(true); setSelected(null); setComparison(null); setNotice('');
    void run(async () => { setVersions(await listWorkspaceVersions()); });
  };
  // Loads a selected file into a preview; only the Restore workspace button replaces the library.
  const importBackup = () => {
    setOpen(true); setSelected(null); setComparison(null); setNotice('');
    void run(async () => {
      const imported = await chooseWorkspaceBackup();
      if (imported) setSelected({ id: 'import', workspace: imported, label: 'Imported backup', savedAt: imported.updatedAt });
    });
  };
  return <>
    <View style={styles.bar}>
      <View style={[styles.status, width < 600 && { width: '100%' }]}><Text accessibilityLiveRegion="polite" style={styles.statusText}>{saveState}</Text>{lastSavedAt && <Text style={styles.detail}>Last saved {new Date(lastSavedAt).toLocaleTimeString()}</Text>}</View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityHint="Saves immediately and creates a version you can restore" disabled={!workspace || busy} onPress={() => { void run(async () => { await onSave(); setNotice('Manual checkpoint saved.'); }); }} style={styles.button}><Text style={styles.buttonText}>Save now</Text></Pressable>
        {compact && <Pressable accessibilityRole="button" accessibilityLabel="Workspace backups and history" accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(!menuOpen)} style={styles.button}><Text style={styles.buttonText}>Workspace {menuOpen ? '⌃' : '⌄'}</Text></Pressable>}
      </View>
      {(!compact || menuOpen) && <View style={[styles.actions, compact && { width: '100%' }]}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={showHistory} style={styles.button}><Text style={styles.buttonText}>Version history</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!workspace || busy} onPress={() => { if (workspace) void run(async () => { await downloadWorkspaceBackup(workspace); setNotice('Workspace backup download started.'); }); }} style={styles.button}><Text style={styles.buttonText}>Download backup</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={importBackup} style={styles.button}><Text style={styles.buttonText}>Import backup</Text></Pressable>
      </View>
      }
    </View>
    {!open && (error || notice) ? <View style={styles.noticeRow}><Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.message, { flex: 1 }]}>{error || notice}</Text>{!!notice && !error && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss workspace notice" onPress={() => setNotice('')} style={styles.button}><Text style={styles.buttonText}>Dismiss</Text></Pressable>}</View> : null}
    <Modal accessibilityLabel="Workspace version history and recovery" visible={open} transparent animationType="fade" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <View style={styles.overlay}><View style={[styles.modal, comparison && { maxWidth: 1040 }]}>
        <View style={styles.header}><Text style={styles.title}>{comparison ? 'Chapter comparison & recovery' : selected ? 'Preview workspace version' : 'Version history'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close version history" disabled={busy} onPress={() => setOpen(false)}><Text style={styles.close}>×</Text></Pressable></View>
        <Text style={styles.detail}>Autosave keeps your latest work. Checkpoints preserve earlier drafts about every five minutes of changes, before deletion, and when you save manually. Up to 30 versions are kept within a 20 MB history budget.</Text>
        {busy && <ActivityIndicator color={theme.accent} />}
        {error ? <Text accessibilityRole="alert" style={styles.message}>{error}</Text> : null}
        {!!notice && <Text accessibilityLiveRegion="polite" style={styles.message}>{notice}</Text>}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {comparison ? <ChapterComparison source={comparison.chapter} storyId={comparison.storyId} storyTitle={comparison.storyTitle} workspace={workspace} theme={theme} busy={busy} onBack={() => setComparison(null)} onRecover={(request) => { void run(async () => { await onRecoverChapter(request); setComparison(null); setNotice('Chapter recovered. Your previous draft is in Version history.'); }); }} /> : selected ? <>
            <Text style={styles.versionTitle}>{selected.label}</Text><Text style={styles.detail}>{new Date(selected.savedAt).toLocaleString()}</Text>
            <Text style={styles.warning}>Use Compare & recover chapter for individual drafts or passages. Restore workspace replaces all stories and notes, and saves your current workspace in history first.</Text>
            {selected.workspace.stories.length === 0 && <Text style={styles.detail}>This version contains an empty story library.</Text>}
            {selected.workspace.stories.map((story) => <View key={story.id} style={styles.version}>
              <Text style={styles.versionTitle}>{story.title || 'Untitled story'}</Text>
              <Text style={styles.detail}>{story.chapters.length} chapters · {story.chapters.reduce((sum, chapter) => sum + countWords(chapter.html), 0).toLocaleString()} words · {story.characters.length} characters</Text>
              {story.chapters.map((chapter) => <View key={chapter.id}><Text style={styles.chapterTitle}>{chapter.title}</Text><Text numberOfLines={2} style={styles.detail}>{plainText(chapter.html) || 'Empty chapter'}</Text><Pressable accessibilityRole="button" disabled={busy || !workspace} onPress={() => { setError(''); setNotice(''); setComparison({ chapter, storyId: story.id, storyTitle: story.title }); }} style={styles.button}><Text style={styles.buttonText}>Compare & recover chapter</Text></Pressable></View>)}
            </View>)}
          </> : versions.length ? versions.map((version) => <Pressable accessibilityRole="button" key={version.id} disabled={busy} onPress={() => setSelected(version)} style={styles.version}>
            <Text style={styles.versionTitle}>{version.label}</Text><Text style={styles.detail}>{new Date(version.savedAt).toLocaleString()} · {version.workspace.stories.length} stories · {version.workspace.stories.reduce((sum, story) => sum + story.chapters.reduce((words, chapter) => words + countWords(chapter.html), 0), 0).toLocaleString()} words</Text><Text numberOfLines={2} style={styles.detail}>{version.workspace.stories.map((story) => story.title + ' — ' + story.chapters.map((chapter) => chapter.title).join(', ')).join('; ')}</Text><Text style={styles.buttonText}>Preview</Text>
          </Pressable>) : <Text style={styles.empty}>No previous versions yet. Save now creates your first manual checkpoint.</Text>}
        </ScrollView>
        {selected && !comparison && <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setSelected(null)} style={styles.button}><Text style={styles.buttonText}>Back to history</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(async () => { await onRestore(selected.workspace); setSelected(null); setOpen(false); setNotice(''); }); }} style={styles.primary}><Text style={styles.primaryText}>Restore workspace</Text></Pressable>
        </View>}
      </View></View>
    </Modal>
  </>;
}

// Matches the existing pastel workspace, with readable preview rows and compact persistent controls.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    noticeRow: { flexDirection: 'row', flexShrink: 0, alignItems: 'center', gap: 8, paddingRight: 12, backgroundColor: theme.accentSoft },
    bar: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
    status: { flexShrink: 1, gap: 3 }, statusText: { color: theme.text, fontSize: 12 }, detail: { color: theme.muted, fontSize: 12, lineHeight: 19 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    button: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }, buttonText: { color: theme.accent, fontSize: 14, fontWeight: '600' },
    primary: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10 }, primaryText: { color: theme.mode === 'dark' ? '#201B2A' : '#fff', fontSize: 14, fontWeight: '700' },
    message: { padding: 12, color: theme.text, backgroundColor: theme.accentSoft, fontSize: 14, lineHeight: 19 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 20, justifyContent: 'center', alignItems: 'center' },
    modal: { width: '100%', maxWidth: 660, maxHeight: '88%', backgroundColor: theme.surface, borderRadius: 18, padding: 24, gap: 14 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: theme.text, fontSize: 19, fontWeight: '700', flexShrink: 1 }, close: { minWidth: 44, minHeight: 44, textAlign: 'center', color: theme.muted, fontSize: 26 },
    scroll: { flexShrink: 1 }, scrollContent: { gap: 10, paddingBottom: 10 }, version: { borderBottomWidth: 1, borderColor: theme.border, paddingVertical: 12, gap: 6 },
    versionTitle: { color: theme.text, fontSize: 14, fontWeight: '600' }, chapterTitle: { color: theme.text, fontSize: 14, marginTop: 10 },
    warning: { color: theme.text, fontSize: 14, lineHeight: 19, padding: 12, backgroundColor: theme.secondarySoft, borderRadius: 8 }, empty: { color: theme.muted, fontSize: 14, lineHeight: 20, paddingVertical: 20 },
  });
}
