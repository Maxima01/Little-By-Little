import { createId, createStarterWorkspace, type Workspace } from '../../../domain/model.ts';
import { isCharacterProfile } from '../../characters/lib/characterProfile.ts';
import { isWorldProfile } from '../../world/lib/worldProfile.ts';

export const AUTOSAVE_DELAY = 800;
export const AUTOSAVE_MAX_DELAY = 5_000;
export const VERSION_INTERVAL = 5 * 60_000;
export const MAX_VERSIONS = 30;
const HISTORY_BUDGET = 20 * 1024 * 1024;

// The save record wraps the portable Workspace with local checkpoints and a stale-write revision.
export type SavedVersion = { id: string; savedAt: string; label: string; workspace: Workspace };
type SaveRecord = { format: 2; revision: string; savedAt: string; workspace: Workspace; versions: SavedVersion[] };
type RecoveryDraft = { id: string; baseRevision: string | null; workspace: Workspace };
export type SaveOptions = { checkpoint?: string; preservePrevious?: { label: string; workspace: Workspace } };
// Adapters own durable storage. Only web supplies a synchronous draft journal between commits.
export type StorageAdapter = {
  read: () => Promise<string | null>;
  // Compare the previous value inside the write transaction to prevent stale overwrites.
  write: (value: string, expected: string | null) => Promise<void>;
  quarantine: (value: string) => Promise<void>;
  readDraft?: () => string | null;
  writeDraft?: (value: string) => void;
  clearDraft?: (id: string) => void;
};

// Validates imported and recovered data before any editor or collection accesses it.
export function isWorkspace(value: unknown): value is Workspace {
  // These predicates check the shared shape of records, timestamps, and identifiers.
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  const text = (item: unknown): item is string => typeof item === 'string';
  const date = (item: unknown) => text(item) && Number.isFinite(Date.parse(item));
  const unique = (items: Record<string, unknown>[]) => new Set(items.map((item) => item.id)).size === items.length;
  const identified = (item: unknown): item is Record<string, unknown> => object(item) && text(item.id) && !!item.id && text(item.title);
  // Feature: validate revision anchors and editorial metadata without rejecting older workspaces.
  const positive = (item: unknown) => typeof item === 'number' && Number.isInteger(item) && item > 0 && item <= 1_000_000;
  const anchor = (item: unknown) => object(item) && Number.isInteger(item.start) && Number.isInteger(item.end) && (item.start as number) >= 0 && (item.end as number) >= (item.start as number) && text(item.quote) && text(item.prefix) && text(item.suffix) && (item.detached === undefined || typeof item.detached === 'boolean');
  if (!object(value) || value.version !== 1 || !date(value.updatedAt) || !Array.isArray(value.stories)) return false;
  // Feature: validate optional responsive preferences while continuing to accept legacy backups.
  const visibility = value.contextVisibility;
  if (visibility !== undefined && (!object(visibility)
    || ['wide', 'narrow'].some((key) => visibility[key] !== undefined && typeof visibility[key] !== 'boolean'))) return false;
  if (!value.stories.every((story) => {
    if (!identified(story) || !text(story.description) || !date(story.createdAt) || !date(story.updatedAt) || !Array.isArray(story.chapters)) return false;
    if (story.lastOpenedChapterId !== undefined && !text(story.lastOpenedChapterId)) return false;
    if (story.isExample !== undefined && typeof story.isExample !== 'boolean') return false;
    if (story.styleGuide !== undefined) {
      const guide = story.styleGuide;
      if (!object(guide) || !text(guide.conventions) || !['any', 'curly', 'straight'].includes(guide.quoteStyle as string) || !['any', 'em', 'spaced-en'].includes(guide.dashStyle as string) || !['any', 'character', 'dots'].includes(guide.ellipsisStyle as string)
        || !Array.isArray(guide.rules) || !guide.rules.every((rule) => object(rule) && text(rule.id) && !!rule.id && ['alias', 'vocabulary', 'spelling', 'capitalization'].includes(rule.kind as string) && text(rule.preferred) && Array.isArray(rule.variants) && rule.variants.every(text) && text(rule.note) && (rule.characterId === undefined || text(rule.characterId))) || !unique(guide.rules)) return false;
    }
    if (story.prosePreferences !== undefined) {
      const prose = story.prosePreferences;
      if (!object(prose) || !['repetitions', 'openings', 'phrases', 'lengths'].every((key) => typeof prose[key] === 'boolean') || !positive(prose.windowWords) || !positive(prose.longSentenceWords) || !Array.isArray(prose.overusedPhrases) || !prose.overusedPhrases.every(text)) return false;
    }
    if (story.sessionGoal !== undefined && (!object(story.sessionGoal) || !positive(story.sessionGoal.target) || !Number.isInteger(story.sessionGoal.baseline) || (story.sessionGoal.baseline as number) < 0 || !date(story.sessionGoal.startedAt))) return false;
    if (!story.chapters.every((chapter) => {
      if (!identified(chapter) || !text(chapter.html) || !date(chapter.updatedAt)) return false;
      if (chapter.fontFamily !== undefined && !['Georgia', 'Arial', 'Courier New'].includes(chapter.fontFamily as string)) return false;
      if (chapter.fontSize !== undefined && (typeof chapter.fontSize !== 'number' || !Number.isFinite(chapter.fontSize) || chapter.fontSize < 6 || chapter.fontSize > 96)) return false;
      if (chapter.activeSceneId !== undefined && !text(chapter.activeSceneId)) return false;
      if (chapter.passageTasks !== undefined && (!Array.isArray(chapter.passageTasks) || !chapter.passageTasks.every((task) => object(task) && text(task.id) && !!task.id && text(task.note) && anchor(task.anchor) && typeof task.completed === 'boolean' && date(task.createdAt)) || !unique(chapter.passageTasks))) return false;
      if (chapter.ignoredProofreading !== undefined && (!Array.isArray(chapter.ignoredProofreading) || !chapter.ignoredProofreading.every(text))) return false;
      if (chapter.chapterGoal !== undefined && !positive(chapter.chapterGoal)) return false;
      if (chapter.releaseStatus !== undefined && !['draft', 'complete', 'released'].includes(chapter.releaseStatus as string)) return false;
      if (chapter.releaseDate !== undefined && (!text(chapter.releaseDate) || !/^\d{4}-\d{2}-\d{2}$/.test(chapter.releaseDate) || !date(chapter.releaseDate) || new Date(chapter.releaseDate).toISOString().slice(0, 10) !== chapter.releaseDate)) return false;
      // Validate optional assistance and continuity fields while accepting backups from older versions.
      if (chapter.writingPreferences !== undefined && (!object(chapter.writingPreferences) || typeof chapter.writingPreferences.grammarSuggestions !== 'boolean' || typeof chapter.writingPreferences.autoCapitalizeI !== 'boolean')) return false;
      return chapter.scenes === undefined || (Array.isArray(chapter.scenes) && chapter.scenes.every((scene) => identified(scene) && (scene.settingId === null || text(scene.settingId)) && Array.isArray(scene.characterIds) && scene.characterIds.every(text) && (scene.continuityNotes === undefined || text(scene.continuityNotes)) && (scene.anchor === undefined || anchor(scene.anchor)) && (scene.viewpoint === undefined || text(scene.viewpoint)) && (scene.synopsis === undefined || text(scene.synopsis))) && unique(chapter.scenes));
    }) || !unique(story.chapters)) return false;
    for (const key of ['characters', 'worldbuilding', 'art', 'notes', 'research']) {
      const entries = story[key];
      if (!Array.isArray(entries) || !entries.every((entry) => identified(entry) && text(entry.content) && date(entry.updatedAt) && ['Major', 'Minor', 'Side character', 'Setting', 'History', 'Faction', 'Family', 'Organization', 'Reference'].includes(entry.category as string)
        // Feature: refuse malformed character metadata before it can break an open profile or recovered version.
        && (entry.characterProfile === undefined || isCharacterProfile(entry.characterProfile))
        // Feature: world profiles travel safely through autosave, checkpoints and workspace imports.
        && (entry.worldProfile === undefined || isWorldProfile(entry.worldProfile))) || !unique(entries)) return false;
    }
    return story.activity === undefined || (Array.isArray(story.activity) && story.activity.every((event) => object(event) && text(event.id) && text(event.action) && text(event.targetId) && text(event.targetTitle) && text(event.details) && date(event.createdAt)));
  })) return false;
  return unique(value.stories);
}

// Rejects damaged backups without changing the open workspace.
export function parseWorkspaceBackup(raw: string): Workspace {
  const value: unknown = JSON.parse(raw);
  if (!isWorkspace(value)) throw new Error('This is not a valid Little by Little workspace backup.');
  return value;
}

// Bounds history by count and size while retaining the newest checkpoint.
export function retainVersions(versions: SavedVersion[]): SavedVersion[] {
  let size = 0;
  return versions.slice(0, MAX_VERSIONS).filter((version, index) => {
    size += JSON.stringify(version).length * 2;
    return index === 0 || size <= HISTORY_BUDGET;
  });
}

// Decodes optional records; damaged copies remain available for quarantine.
function decode(raw: string | null): any {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// Requires a draft identity and baseline revision before trusting its workspace as a recovery copy.
function isRecoveryDraft(value: any): value is RecoveryDraft {
  return !!value && typeof value.id === 'string' && !!value.id && (value.baseRevision === null || typeof value.baseRevision === 'string') && isWorkspace(value.workspace);
}

// Creates immutable checkpoints so later typing cannot mutate a recoverable version.
function snapshot(workspace: Workspace, label: string, now: string): SavedVersion {
  return { id: createId(), savedAt: now, label, workspace: JSON.parse(JSON.stringify(workspace)) };
}

// Serializes saves, migrates legacy workspaces, and recovers drafts without discarding damaged data.
// expectedRaw belongs to the last successful commit; the adapter rejects writes over a newer one.
export function createWorkspaceStore(adapter: StorageAdapter, now = () => new Date().toISOString()) {
  let record: SaveRecord | null = null;
  let expectedRaw: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let pendingDraft: RecoveryDraft | null = null;
  let checkpointOnNextSave = true;

  // Loads the last valid commit or its newest intact checkpoint before checking a crash draft.
  async function load() {
    expectedRaw = await adapter.read();
    const parsed = decode(expectedRaw);
    const validVersions: SavedVersion[] = Array.isArray(parsed?.versions) ? parsed.versions.filter((version: any) => version && typeof version.id === 'string' && typeof version.label === 'string' && Number.isFinite(Date.parse(version.savedAt)) && isWorkspace(version.workspace)) : [];
    const committed = isWorkspace(parsed) ? parsed : isWorkspace(parsed?.workspace) ? parsed.workspace : validVersions[0]?.workspace;
    let recoveryMessage = '';
    if (expectedRaw && !committed) {
      // Never replace unreadable work with the demo story; backup import stays available in the UI.
      await adapter.quarantine(expectedRaw);
      const draft = decode(adapter.readDraft?.() ?? null);
      if (!isRecoveryDraft(draft)) throw new Error('Local stories are damaged. Import a workspace backup to recover them. The original data has been preserved.');
      recoveryMessage = 'Recovered your crash draft. The damaged save was preserved.';
    } else if (expectedRaw && !isWorkspace(parsed) && !isWorkspace(parsed?.workspace)) {
      await adapter.quarantine(expectedRaw);
      recoveryMessage = 'Recovered the newest intact version. The damaged save was preserved.';
    }
    const savedAt = typeof parsed?.savedAt === 'string' ? parsed.savedAt : now();
    record = { format: 2, revision: typeof parsed?.revision === 'string' ? parsed.revision : createId(), savedAt, workspace: committed ?? createStarterWorkspace(), versions: retainVersions(validVersions) };
    const draft: RecoveryDraft | null = decode(adapter.readDraft?.() ?? null);
    if (isRecoveryDraft(draft) && (!committed || draft.baseRevision === (parsed?.revision ?? null))) {
      pendingDraft = draft;
      recoveryMessage = recoveryMessage || 'Recovered your latest unsaved changes after an interrupted session.';
      await save(draft.workspace, { preservePrevious: committed ? { label: 'Before crash recovery', workspace: committed } : undefined });
    } else if (isRecoveryDraft(draft) && committed && JSON.stringify(draft.workspace) !== JSON.stringify(committed)) {
      // An alternate window's draft must stay accessible without replacing a newer durable commit.
      pendingDraft = draft;
      await save(committed, { preservePrevious: { label: 'Recovered alternate draft', workspace: draft.workspace } });
      recoveryMessage = 'An alternate unsaved draft was recovered in Version history. Your latest saved workspace is open.';
    } else if (!expectedRaw || isWorkspace(parsed) || recoveryMessage) {
      await save(record.workspace);
    }
    return { workspace: record.workspace, savedAt: record.savedAt, recoveryMessage };
  }

  // Keeps an immediate recovery copy between typing and the next database transaction.
  // False tells the hook to commit immediately when the draft journal is unavailable.
  function stage(workspace: Workspace): boolean {
    pendingDraft = { id: createId(), baseRevision: record?.revision ?? null, workspace };
    try { adapter.writeDraft?.(JSON.stringify(pendingDraft)); return !!adapter.writeDraft; } catch { return false; }
  }

  // Commits workspace and checkpoints together; failed writes leave the last commit untouched.
  // Queue recovery keeps a failed operation from blocking a later retry.
  function save(workspace: Workspace, options: SaveOptions = {}) {
    const nextWorkspace: Workspace = JSON.parse(JSON.stringify(workspace));
    const capturedDraft = pendingDraft?.id;
    const operation = queue.catch(() => undefined).then(async () => {
      if (!isWorkspace(nextWorkspace)) throw new Error('The workspace could not be saved because its data is invalid.');
      const timestamp = now();
      let versions = [...(record?.versions ?? [])];
      const changed = JSON.stringify(record?.workspace) !== JSON.stringify(nextWorkspace);
      const elapsed = Date.parse(timestamp) - Date.parse(versions[0]?.savedAt ?? '') >= VERSION_INTERVAL;
      if (options.preservePrevious) versions.unshift(snapshot(options.preservePrevious.workspace, options.preservePrevious.label, timestamp));
      else if (record && changed && (checkpointOnNextSave || !versions.length || elapsed)) versions.unshift(snapshot(record.workspace, 'Automatic checkpoint', timestamp));
      if (options.checkpoint) versions.unshift(snapshot(nextWorkspace, options.checkpoint, timestamp));
      const next: SaveRecord = { format: 2, revision: createId(), savedAt: timestamp, workspace: nextWorkspace, versions: retainVersions(versions) };
      const raw = JSON.stringify(next);
      await adapter.write(raw, expectedRaw);
      record = next;
      expectedRaw = raw;
      if (changed) checkpointOnNextSave = false;
      if (capturedDraft && pendingDraft?.id === capturedDraft) {
        pendingDraft = null;
        try { adapter.clearDraft?.(capturedDraft); } catch { /* Revision checks prevent reuse of a stale draft. */ }
      } else if (pendingDraft) {
        // Rebase a newer staged edit after an older queued save completes.
        pendingDraft = { ...pendingDraft, baseRevision: next.revision };
        try { adapter.writeDraft?.(JSON.stringify(pendingDraft)); } catch { /* Primary save errors are reported separately. */ }
      }
      return { savedAt: timestamp };
    });
    queue = operation;
    return operation;
  }

  // Returns detached history for previews without exposing mutable store state.
  async function listVersions(): Promise<SavedVersion[]> {
    await queue.catch(() => undefined);
    return JSON.parse(JSON.stringify(record?.versions ?? []));
  }

  // Permits an explicit backup import even when startup found unrecoverable local data.
  async function replace(workspace: Workspace, previous?: Workspace) {
    if (!record) expectedRaw = await adapter.read();
    return save(workspace, { preservePrevious: previous ? { label: 'Before restoring workspace', workspace: previous } : undefined, checkpoint: 'Restored workspace' });
  }

  return { load, stage, save, listVersions, replace };
}
