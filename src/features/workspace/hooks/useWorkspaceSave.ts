import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { Workspace } from '../../../domain/model';
import { AUTOSAVE_DELAY, AUTOSAVE_MAX_DELAY, type SaveOptions } from '../lib/saveHistory';
import { loadWorkspace, replaceWorkspace, stageWorkspace, writeWorkspace } from '../lib/storage';
import { recoverChapterInWorkspace, type ChapterRecoveryRequest } from '../../editor/lib/chapterRecovery';
import { replaceStoryMatches, type SearchMatch } from '../../editor/lib/manuscriptOperations';
import { appendStoryActivity } from '../../../domain/model';

// Coordinates in-memory edits, crash-draft staging, durable commits, checkpoints, and recovery notices.
// workspaceRef is the latest edit; revisionRef prevents an older completed save from clearing newer dirty state.
export function useWorkspaceSave() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState('Loading your stories…');
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Clears both the idle debounce and the maximum continuous-typing delay.
  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    timerRef.current = null;
    maxTimerRef.current = null;
  }, []);

  // Displays Saved only after durable storage completes for the newest revision.
  const saveNow = useCallback(async (options: SaveOptions = {}) => {
    clearTimers();
    const current = workspaceRef.current;
    if (!current) return;
    const revision = revisionRef.current;
    setSaveState('Saving…');
    try {
      const result = await writeWorkspace(current, options);
      if (mountedRef.current && revision === revisionRef.current) {
        dirtyRef.current = false;
        setLastSavedAt(result.savedAt);
        setSaveState('Saved on this device');
        setSaveError('');
      }
    } catch (error) {
      if (mountedRef.current && revision === revisionRef.current) {
        setSaveState('Save failed · changes still open');
        setSaveError(error instanceof Error ? error.message : 'Could not save. Download a backup and try Save now again.');
      }
      throw error;
    }
  }, [clearTimers]);

  // Updates the UI immediately, journals a crash draft, and coalesces normal database writes.
  const persist = useCallback((next: Workspace, options?: SaveOptions) => {
    workspaceRef.current = next;
    setWorkspace(next);
    revisionRef.current += 1;
    dirtyRef.current = true;
    const draftProtected = stageWorkspace(next);
    setSaveState('Unsaved changes');
    if (timerRef.current) clearTimeout(timerRef.current);
    // Structural changes and devices without a synchronous crash journal save immediately.
    if (options || !draftProtected) { void saveNow(options).catch(() => undefined); return; }
    timerRef.current = setTimeout(() => { void saveNow().catch(() => undefined); }, AUTOSAVE_DELAY);
    if (!maxTimerRef.current) maxTimerRef.current = setTimeout(() => { void saveNow().catch(() => undefined); }, AUTOSAVE_MAX_DELAY);
  }, [saveNow]);

  // Loads legacy or current saves and surfaces a recovery explanation when a fallback was needed.
  const retryLoad = useCallback(async () => {
    setLoadError('');
    setSaveState('Loading your stories…');
    try {
      const loaded = await loadWorkspace();
      if (!mountedRef.current) return;
      workspaceRef.current = loaded.workspace;
      setWorkspace(loaded.workspace);
      setLastSavedAt(loaded.savedAt);
      setRecoveryMessage(loaded.recoveryMessage);
      setSaveState('Saved on this device');
    } catch (error) {
      if (mountedRef.current) {
        setSaveState('Could not load local stories');
        setLoadError(error instanceof Error ? error.message : 'Could not load local stories. Try again or import a backup.');
      }
    }
  }, []);

  // Restores only after saving the current draft; the pre-restore checkpoint makes this reversible.
  const restore = useCallback(async (next: Workspace) => {
    clearTimers();
    const previous = workspaceRef.current;
    if (previous) await saveNow();
    const restored = { ...next, updatedAt: new Date().toISOString() };
    const result = await replaceWorkspace(restored, previous ?? undefined);
    revisionRef.current += 1;
    workspaceRef.current = restored;
    setWorkspace(restored);
    dirtyRef.current = false;
    setSaveError('');
    setLoadError('');
    setLastSavedAt(result.savedAt);
    setSaveState('Saved on this device');
    setRecoveryMessage('Workspace restored. Your previous workspace is available in Version history.');
  }, [clearTimers, saveNow]);

  // Feature: saves a pre-recovery checkpoint, then merges only the chosen chapter/passages into the latest workspace.
  const recoverChapter = useCallback(async (request: ChapterRecoveryRequest) => {
    const opening = workspaceRef.current;
    if (!opening) throw new Error('Load the workspace before recovering a chapter.');
    recoverChapterInWorkspace(opening, request);
    await saveNow({ checkpoint: 'Before chapter recovery' });
    const current = workspaceRef.current;
    if (!current) throw new Error('The workspace is no longer open.');
    const next = recoverChapterInWorkspace(current, request);
    persist(next);
    await saveNow();
  }, [persist, saveNow]);

  // Feature: checkpoint before bulk replacement, then recheck the preview and commit the edit set atomically.
  const replaceMatches = useCallback(async (storyId: string, matches: SearchMatch[]) => {
    const opening = workspaceRef.current?.stories.find((story) => story.id === storyId);
    if (!opening) throw new Error('This story is no longer open.');
    const changes = matches.filter((match) => match.before !== match.after);
    if (!changes.length) throw new Error('The replacement would not change any text.');
    replaceStoryMatches(opening, changes);
    await saveNow({ checkpoint: `Before find & replace — ${opening.title}` });
    const current = workspaceRef.current;
    const story = current?.stories.find((item) => item.id === storyId);
    if (!current || !story) throw new Error('The story changed while saving the checkpoint. Search again.');
    const updated = replaceStoryMatches(story, changes);
    const now = new Date().toISOString();
    const next = { ...updated, updatedAt: now, activity: appendStoryActivity(updated.activity, { action: 'Find & replace', targetId: story.id, targetTitle: story.title, details: `${changes.length} reviewed replacements applied.` }) };
    persist({ ...current, updatedAt: now, stories: current.stories.map((item) => item.id === storyId ? next : item) });
    await saveNow();
    return changes.length;
  }, [persist, saveNow]);

  useEffect(() => {
    mountedRef.current = true;
    void retryLoad();
    return () => { mountedRef.current = false; clearTimers(); };
  }, [retryLoad, clearTimers]);

  useEffect(() => {
    // Flushes on backgrounding and makes Ctrl/Cmd+S a manual recoverable checkpoint.
    const flush = () => { if (dirtyRef.current) void saveNow().catch(() => undefined); };
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') flush(); });
    if (Platform.OS !== 'web') return () => subscription.remove();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveNow({ checkpoint: 'Manual checkpoint' }).catch(() => undefined);
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) { flush(); event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      subscription.remove();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [saveNow]);

  return { workspace, workspaceRef, persist, saveNow, restore, recoverChapter, replaceMatches, saveState, saveError, loadError, recoveryMessage, lastSavedAt, retryLoad, dismissRecovery: () => setRecoveryMessage('') };
}
