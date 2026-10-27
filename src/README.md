# Source guide

## Entry points and ownership

`index.js` registers `shell/App.tsx` with Expo. `electron-main.cjs` opens either the development server or the built `dist/index.html`; its sandboxed preload exposes only the PDF export bridge. `scripts/prepare-desktop-build.mjs` adjusts built asset links for offline `file://` loading and stages the Electron runtime.

The application is organized by ownership:

| Path | Responsibility |
| --- | --- |
| `shell/App.tsx` | Screen navigation and composition; it delegates saving to the workspace hook. |
| `domain/model.ts` | The persisted workspace, story, chapter, scene, and entry shapes, defaults, and shared operations. |
| `features/editor/` | Manuscript editing, preview, revision, recovery, proofreading, prose analysis, and word lookup. |
| `features/characters/` and `features/world/` | Dossiers, references, memberships, and event records. |
| `features/workspace/` | Autosave, history, backup/import, export, and navigation preferences. |
| `components/` and `theme/` | Shared accessible controls and visual tokens. |

Feature folders keep UI in `components/` and reusable logic in `lib/`; workspace hooks live in `hooks/`. Keep native and web platform pairs in the same folder (for example, `RichEditor.tsx` and `RichEditor.web.tsx`) so Expo selects the implementation. Cross-feature imports should use the owning feature's logic instead of copying it.

## Save and recovery path

1. `App.tsx` updates a `Workspace` through `useWorkspaceSave.persist`. The hook updates its in-memory reference and asks the store to stage a crash draft.
2. `useWorkspaceSave` commits after an idle delay, a maximum typing delay, or immediately when the caller supplies save options or the platform has no synchronous draft journal. It reports **Saved on this device** only after the storage write succeeds.
3. `saveHistory.ts` validates and serializes commits, retains bounded checkpoints, and compares the previous raw record before writing. `webStorage.ts` performs that comparison in an IndexedDB transaction; native storage uses AsyncStorage.
4. On load, the store can recover an intact checkpoint or crash draft. Damaged primary data is preserved, and a draft based on an older revision goes into history instead of replacing a newer commit. Explicit backup import validates the workspace before restore.

`Workspace.version` in `domain/model.ts` describes the portable backup schema. The internal save record's `format` and `revision` in `saveHistory.ts` describe the local history wrapper and concurrency baseline. Keep these separate when changing persistence. New optional model fields must be accepted by `isWorkspace` and included in backup, restore, and relevant tests; preserve older backups when adding fields.

## Platform and validation notes

`fileTransfer.web.ts` handles browser and Electron downloads, print/PDF, and backup file picking. `fileTransfer.ts` supplies native explanations for those unsupported file actions; native editing and local saves still work. The built Electron renderer uses the same web implementation, with PDF sent through the narrow preload bridge.

Run `npm run verify` for type checking, the Node tests in `tests/`, and a web build. Use `npm run test:pdf` when changing PDF output, and `npm run test:desktop -- --fast` when changing cross-screen desktop workflows. Desktop validation uses an isolated profile under `.local-checks/`; its screenshots, trace, exported files, and report stay there. See the root [README](../README.md#verification) for the full validation command and scope.

Document new functions and features with a brief comment explaining their purpose. Put non-obvious data and recovery invariants beside the code that enforces them.


<!-- Feature: external backup integration keeps disk copies independent of the renderer's IndexedDB data. -->
Automatic desktop backups are implemented in `electron-backup.cjs` through scoped preload methods. `features/workspace/lib/storage.ts` dispatches portable workspace copies after successful commits and restores, and guards startup when local data is missing but external copies remain. `externalBackup.ts` shares independent backup status with `AutomaticBackups.tsx`. The save hook retries the last committed workspace every minute; manual backup can additionally preserve open unsaved edits in a dated file. Electron serializes writes, flushes temporary files before replacement, retains 30 dated snapshots, stores device-only preferences in its profile, and waits for in-flight writes on normal quit. Both the staging script and package file list include the backup module.
