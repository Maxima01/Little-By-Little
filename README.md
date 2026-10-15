# Little by Little

A desktop-first, offline-friendly story writing workspace. React Native and Expo keep the experience portable; Electron opens the desktop app, while the same project can run in a browser or on mobile.

For contributors, [the source guide](./src/README.md) maps the entry points, feature folders, save pipeline, and platform-specific implementations.

## Start the desktop app

Install Node.js 22.13 or newer, then run from this directory:

```sh
npm install
npm start
```

This opens the Electron window and starts Expo's local web renderer. Close the app window or press Ctrl+C in the terminal to end the development session.

Other launch options:

```sh
npm run web         # Browser version
npm run start:expo  # Expo tools for devices and emulators
npm run desktop:preview # Build the web renderer and open it in Electron
```

`npm start` and `npm run web` use the local Expo development server. `desktop:preview` builds the renderer and loads it from disk, matching the packaged app's offline startup path. New dictionary lookups still need a network connection.

## Create a standalone Windows executable

<!-- Feature: package the complete offline renderer and Electron runtime as a Windows installer or portable executable. -->
The packaged desktop app does not require Node.js, Expo, a browser, the web application, or an internet connection to launch. Its story library remains in Electron's local application-data profile across normal closes, restarts, and installed upgrades. Uninstalling or manually clearing the application's data can remove that library, so keep using **Download backup** for irreplaceable manuscripts.

Create a Windows installer:

```powershell
npm install
npm run package:windows
```

The installer is written to `release/Little-by-Little-<version>-x64-Setup.exe`. It offers Start Menu and desktop shortcuts and lets the writer choose the installation folder.

For a single-file portable build instead:

```powershell
npm run package:windows:portable
```

Portable mode is convenient for testing or USB use, but the installer is the recommended everyday build because its application location and upgrade path remain stable. These local executables are currently unsigned, so Windows SmartScreen may show an unknown-publisher warning until a code-signing certificate is configured.

Packaging creates `.desktop-package/` and `release/`; both are ignored by Git. `npm run package:windows:dir` creates an unpacked Windows build for inspection. The desktop validation command below tests the built renderer in Electron, while the installer and portable executable need their own install and launch check before distribution.

## What is in the canvas

- Story library and story hub navigation.
- Chapter creation and a rich-text writing workspace with headings, emphasis, lists, quotes, undo/redo, spellcheck, word count, and automatic local saving.
- Story sections for characters, world building, art, notes, and research.
- PDF, EPUB, Word (.docx), Markdown, plain text, and HTML manuscript exports.
- Recoverable version history, manual checkpoints, and downloadable workspace backup/restore.
- Chapter cast counts, name mentions, scene setting continuity, and optional writing assistance.
- Saved/current chapter comparisons and recovery of individual drafts or passages.
- Light and dark palettes that follow the operating system; the light palette uses soft pastels.

Stories are stored on this device: IndexedDB on desktop and web, and AsyncStorage on mobile. There is no account, server, or cross-device sync in this initial build.

<!-- Feature: manuscript-first layouts, remembered context choices, reliable navigation and readable controls. -->
**Start my story** creates a personal story and opens its first blank chapter immediately. Starter content is labeled **Example story**, and missing titles get inline feedback. The manuscript appears first, with context beside it when the available canvas is at least 1040 px wide. Narrow screens start with context collapsed; **Show context** opens a drawer. Wide visibility and narrow expansion are remembered independently in workspace backups and across chapter changes, recovery and reload.

**Continue writing** reopens the last chapter viewed in that story. If it was deleted, the most recently edited existing chapter is used. **Recently edited** sorts by actual chapter edit time, so opening chapters or leaving unchanged title fields does not move them ahead of newer drafts. Interface controls use larger text and touch targets, stronger light-palette inks, visible keyboard focus, and explicit web/native accessibility states. The formatting toolbar reserves space for full controls and its scrollbar; narrower canvases show a horizontal scrolling hint.

<!-- Feature: one authoritative save status and a compact workspace disclosure keep recovery reachable. -->
The workspace bar has one save indicator and a direct **Save now** action. Below 1280 px, **Workspace** expands to show version history, download backup and import backup. These recovery actions remain available when startup or saving fails. Success notices can be dismissed; save failures remain visible with recovery available.

## Chapter context and writing tools

<!-- Feature: character dossiers add structured facts, story arcs, chapter appearances and expandable participation events. -->
Open a character to edit **Profile** facts (physical attributes, personality, relationships, optional abilities, references, aliases and affiliations), life **Status** and story role. **Detailed description** preserves existing character notes and provides a separate long-form body. **Character arc** records goals, motivations, fears, flaws and change; **Author notes** holds planned reveals and other author intentions. All fields are optional and save automatically.

**In the story** shows the latest confirmed appearance in chapter order. Existing scene cast assignments feed this tracker automatically; **Record appearance** adds manual chapter presence with optional story time and context. **View appearances** lists the history and opens the linked manuscripts. Name mentions and event links alone do not count as presence. **Key events** opens a modal where writers add, expand, edit and remove events with details and optional chapter/time references. Deleted chapter links remain visible for review, and removing a saved event or manual appearance creates a recoverable workspace checkpoint. Dossiers are included in local saves, version history and workspace backups; older backups need no migration.

<!-- Feature: world dossiers add comprehensive settings, history, factions, families and organization profiles with shared character memberships. -->
**World Building** includes **Setting**, **History**, **Faction**, **Family**, and **Organization**. Each entry has an optional **Profile**, a **Detailed description** that preserves its existing notes, and separate **Author notes** for plans. Settings cover geography, atmosphere, culture, daily life, governance, resources, rules and history. Factions cover purpose, beliefs, leadership, ranks, recruitment, territory, resources, alliances and rivals. Families cover origins, members, lineage, succession, traditions, reputation, holdings, alliances and feuds. History entries cover time periods, causes, participants, consequences and legacy; organizations cover purpose, structure, membership requirements, operations and influence. Changing category preserves saved facts, notes and events.

**Key events** records expandable world events with details, a freeform story time and an optional chapter link. Add, edit, open the linked chapter or remove an event; removal retains a recovery checkpoint. Deleted chapter links remain available for review. Setting profiles also show their actual scene assignments in chapter order, and the chapter’s **Setting continuity** reference includes structured setting facts as well as the description.

<!-- Feature: explicit type changes preview hidden facts and affected references before a checkpointed confirmation. -->
World profiles display their current **Type**. **Change type** opens a draft choice and previews facts hidden by the new form, affected scene settings, memberships, affiliations and History links. **Cancel** leaves the entry unchanged; confirmation retains a **Before changing world entry type** checkpoint and all saved data. Changed types are distinguished from deleted references. Change back to the original type to edit its retained facts again.

<!-- Feature: History connects saved places and participants to reciprocal profile references without replacing prose. -->
History profiles offer optional **Places**, **Characters involved** and **Groups involved** links. Choose existing settings, characters, families, factions or organizations; linked profiles show **Related history** with a direct route to the account. Links follow saved IDs through renames. Missing or recategorised targets remain visible for explicit review/removal, and removing a link retains a checkpoint. Written participants, descriptions and author notes stay intact. These links do not assign scene presence or group membership.

<!-- Feature: shared manuscript text keeps totals, excerpts and profile alias mentions consistent. -->
Word totals and goals count decoded visible text, including words split across bold/italic markup and encoded apostrophes. **Aliases** in a character profile accepts comma-separated or line-separated names; these count alongside character-linked style-guide aliases, once per occurrence. Deleted scene cast entries appear in the current scene with an explicit **Remove** action and a recovery checkpoint.

In a character’s **Profile**, **Memberships** selects saved families, factions and organizations. A character may belong to several groups. Each selected membership opens its world profile, and group profiles list linked characters with a direct route back to their dossiers. Renames follow the saved entry IDs; deleted or recategorised groups remain visible for review and explicit removal. **Affiliations** remains available for written notes and inline references; it does not automatically assign memberships. Family member notes can describe relatives who do not have character profiles. All new data saves locally and travels with checkpoints and workspace backups; old backups remain valid.

<!-- Feature: inline character and group mentions provide shared descriptions without replacing authored prose. -->
In **Relationships**, type `@` and choose a saved character. In **Affiliations**, type `@/org_name` and choose a group from World Building; underscores and spaces both work when searching. Linked names show the entry’s current description on hover, keyboard focus or tap. Use Arrow Up/Down and Enter or Tab to choose suggestions, and Escape to dismiss them. Links save by entry ID, so renames preserve the connection and deleted targets show an explicit message. Freeform prose stays editable. Factions, families and organizations are supported; written mentions remain separate from explicit memberships. The character tracker now uses a bordered panel, author notes use a muted theme tint, and profile tabs and role/status controls fill the available width.

<!-- Feature: a chapter cast ledger combines scene assignments with automatic literal name counts. -->
In the editor's **Chapter context**, check **Characters present** for each scene. **Character appearances** shows how many distinct scenes include each character and lists those scenes. Its separate mention count finds the full character profile name in the chapter body, including names split across rich formatting. Character-linked aliases recorded in the project style guide are included; pronouns and inferred presence are not counted; a mention can describe someone who is absent. Rename a profile or edit the draft and the ledger updates automatically.

<!-- Feature: an ordered setting trail shows location changes and authored continuity details. -->
Expand **Setting continuity** to follow linked scenes in actual manuscript order and see the previous chapter's last linked setting. Unlinked or detached scenes are listed separately, with guidance to link their beginning in **Scene outline**; their chronology is unconfirmed. Unassigned, deleted and recategorised settings are called out. Select a trail row to review that scene, read its World Building setting reference, and write **Scene continuity notes** for weather, time, travel, or other details. Reviewing or selecting scenes remembers the current scene without changing draft edit timestamps or adding edit activity. Authored scene changes still update the chapter. The trail uses your assignments; it does not infer locations or judge whether a change is intentional. **Hide context** tucks away the sidebar.

<!-- Feature: scoped revisions share real passage anchors, checkpointed replacements and chapter recovery. -->
Open **Revision tools** from the manuscript. **Find & replace** searches a selected passage, the current chapter, or the entire story, with whole-word and case matching, Previous/Next navigation, passage highlighting and replacement previews. Replace one or all creates a checkpoint first and rejects stale previews. Replacements edit visible text without touching HTML tags or attributes; inserted text inherits the first matched run's style. Searches may contain punctuation but replacements spanning paragraph boundaries are rejected to preserve structure.

**Passage tasks** attaches a note to a selected passage. Edit notes, filter unresolved tasks in the chapter or story, mark them completed, or jump back to the passage. Tasks and scene links follow text edits and recovery. Deleted passages remain marked for explicit reattachment; they are never silently assigned to another occurrence. **Chapter revisions** names checkpoints (for example, First draft or Dialogue revision), compares saved/current passages and uses the existing checkpoint-protected partial recovery workflow.

<!-- Feature: project-wide language conventions power consistent chapter review and alias mention counts. -->
**Project style guide**, also available from the story hub, records character aliases, invented vocabulary, preferred spellings, exact capitalization, and double-quote/dash/ellipsis conventions. Alias rules can link to character profiles for mention counts. Accepted aliases and vocabulary retain their recorded forms; preferred-spelling variants suggest the canonical spelling. Review and apply style suggestions across all chapters individually. Freeform convention notes remain a human reference; structured rules drive checks.

<!-- Feature: local review offers explanatory grammar suggestions, persistent ignores and configurable fiction signals. -->
Open **Writing tools** beside the context toggle. **Proofreading** checks lowercase English I/contractions, duplicate words, punctuation spacing, sentence opening capitalization, quotation consistency and conservative grammar patterns (simple pronoun–verb agreement, modal “have” phrases and selected article cases). Suggestions show context, a preview and explanation. Apply individually, show the passage, ignore that occurrence or ignore its rule for the chapter; restore ignored checks at any time. These rules do not understand every grammatical construction. Review dialogue and dialect individually; system spellcheck adds spelling help. **Auto-capitalize I** stays optional and starts off. Browser corrections retain rich formatting and native undo; native corrections preserve HTML with the editor's supported content-update API.

**Prose analysis** highlights nearby repetitions, repeated sentence openings, configured overused phrases and long sentences. Toggle signals and configure repetition windows, sentence thresholds and phrases for the story. Estimated sentence counts, average length and a length distribution support rhythm review. Signals navigate to actual manuscript text; they are advisory, with no quality score. Proofreading and prose analysis work offline and never send manuscript passages online.

<!-- Feature: anchored scenes expose actual manuscript counts; optional goals and release planning stay unobtrusive. -->
**Scene outline** links a selected beginning passage to a scene, with viewpoint, setting and synopsis. Each linked scene runs to the next linked start in manuscript order. Word counts and **Go to scene** use those real boundaries. Chapter context shows the same metadata and its scene tabs navigate to linked passages.

**Targets & release buffer**, also on the story hub, provides optional session/chapter goals. Session progress counts net words added from the session's starting total. The drafting status bar shows a chapter target only when enabled. Mark installments Draft, Completed/ready or Released, add a validated planned release date, and view completed chapters awaiting release. These are local planning records; the app does not publish or schedule external releases.

<!-- Feature: independently timed dictionary providers retain useful partial results, attribution and explicit refresh. -->
**Dictionary & thesaurus** looks up one English word or uses a selected editor word. Requests send only that word to [FreeDictionaryAPI.com](https://freedictionaryapi.com/), the alternate [Free Dictionary API](https://dictionaryapi.dev/) when needed, and [Datamuse](https://www.datamuse.com/api/). The preferred API supplies Wiktionary meanings, examples, pronunciation text and source attribution under CC BY-SA 4.0. Each provider has independent cancellation and a bounded timeout; Datamuse supplies exact-word definitions if both dictionaries fail. Available definitions and synonyms remain usable when another service fails. Useful complete results are cached for ten minutes in the app session; **Refresh lookup** retries without that cache. New searches need internet access. Datamuse's published plan requires API keys starting February 1, 2027, so that integration will need an update before then.

## Export a manuscript

<!-- Feature: print and Word export body sizes match the existing editor and preview sizes. -->
Saved font sizes use screen pixels. PDF/HTML keep the same CSS size; Word converts pixels to points (16 px becomes 12 pt), while explicit inline point sizes retain their value. The on-screen editor and preview sizes are unchanged. EPUB remains reflowable and respects the reader’s text preferences.

<!-- Feature: export scopes show included chapter titles and preserve manuscript order in every format. -->
Open **Export story** from the hub or **Export** from the editor. Choose **This chapter**, **Selected chapters**, or **Entire story**, review **Included titles**, select a format, and export. Selected chapters keep their manuscript order; an empty selection displays guidance and disables export. Supporting collections are included in workspace backups instead.

<!-- Feature: complete rich-fragment previews retain loose text, nested blocks and supported inline formatting. -->
**Preview** retains leading text, Unicode, paragraph spacing, lists, quotes and supported writing styles without changing saved HTML. **PDF estimate** uses approximate word-count page groups, preserving long passages intact. It explicitly identifies estimated pagination; actual exported PDF page breaks may differ.

| Format | Best for | Details |
| --- | --- | --- |
| PDF | Reading and printing | Desktop opens a PDF save dialog. In a browser, choose **Save as PDF** in the print dialog. |
| EPUB | E-readers | Reflowable chapters, a table of contents, and language metadata. Choose the book language for screen readers. |
| Word (.docx) | Editing | Real editable OOXML, with headings, emphasis, alignment, links, quotes, and lists. |
| Markdown (.md) | Text editing | Paragraphs, headings, emphasis, links, and lists. Underline and exact page styling are not preserved. |
| Plain text (.txt) | Maximum portability | Paragraphs and chapter order without rich formatting. |
| HTML | Browser reading | Safe rich-text markup and print styling. |

File export and backup file picking are supported on desktop and web. Native mobile displays an explanation for unsupported file actions. Core writing, local saving, and version history continue to work on mobile. Embedded images and file attachments are not supported yet.

## Autosave and recovery

<!-- Feature: debounce normal commits while retaining immediate desktop/web crash drafts and bounded recoverable checkpoints. -->
Desktop and web keep an immediate crash draft while you type, then commit after 800 ms of inactivity or after five seconds of continuous changes. If the browser cannot keep the crash draft (for example, its local-storage quota is full), commits happen immediately. Native mobile also commits immediately. **Saved on this device** appears only after storage confirms the write. **Save now**, or **Ctrl/Cmd+S**, saves immediately and creates a manual checkpoint. Backgrounding the app also flushes pending changes.

**Version history** is available above every screen. It preserves the opening draft on the first edit, then an automatic checkpoint about every five minutes of changes, plus checkpoints before deleting stories/chapters/entries, bulk replacements and recovery, plus named chapter-revision checkpoints. History retains up to 30 versions within a 20 MB budget; older versions roll off. The newest checkpoint is retained even if it alone exceeds the budget.

Select a version to preview story titles, chapter samples, and word counts before restoring. Restore replaces the **entire workspace** and first preserves the current workspace in history. A restored editor is reopened from the library so stale editor text cannot overwrite the recovered draft.

<!-- Feature: chapter comparisons support partial recovery with a checkpoint and stale-draft protection. -->
For a smaller recovery, select a saved version (or import a backup) and click **Compare & recover chapter**. Saved and current passage text appears side by side on larger screens and stacked on narrow screens; changes in text or formatting are marked. Select saved passages to **Append saved passages**, or also select a consecutive range of current passages to **Replace selected current passages**. Recovery retains the original rich formatting; complete lists and quotes are kept together. **Recover chapter draft** recovers only that chapter's body, leaving its current title, scenes, preferences, and supporting materials in place. Deleted chapters can also be added back to an existing story.

Every chapter recovery saves a **Before chapter recovery** checkpoint first and refuses to apply if the compared chapter changed in the meantime. The open editor reloads from recovered text. Other stories, chapters, and notes are preserved. A deleted story still requires workspace recovery. Recovery operates on complete passages, not arbitrary character selections; large comparisons use a bounded positional comparison to keep memory use reasonable.

After an interrupted desktop/web session, the app attempts to recover a matching crash draft. An alternate draft based on an older save is placed in version history for review instead of replacing newer saved work. If the latest saved workspace is damaged, it tries intact previous versions and preserves the original damaged value. It never silently replaces unreadable saved work with a demo story. A startup recovery screen offers retry and backup import. A stale window cannot overwrite a newer database commit; the failure message directs you to download your open work before reloading.

<!-- Feature: portable JSON backup/restore provides a recovery copy outside the application's local storage. -->
**Download backup** includes every story, chapter, scene, character, setting, note, research entry, activity item, passage task, style guide, review preference, target and release record. It downloads the current in-memory workspace even if local saving failed. **Import backup** validates a chosen JSON backup, previews its contents, and waits for **Restore workspace** before replacing the library. Backup files contain the current workspace, while retained historical versions stay in local storage. Keep backup files somewhere separate from the device when you need protection against device loss or cleared application data.