# Little by Little

An offline-first writing workspace for novels and other long-form stories. Keep your manuscript, characters, world building, and research together, with optional cloud sync across devices.

## What you can do

- Write and organize stories, chapters, and scenes in a rich-text editor.
- Build character profiles and linked world-building notes.
- Keep art references, notes, research, and a project style guide beside your draft.
- Review prose, track word-count goals, and compare or recover earlier drafts.
- Export manuscripts as PDF, EPUB, Word, Markdown, plain text, or HTML.
- Save locally, download workspace backups, and use automatic desktop backups.
- Work in light or dark mode, with optional account-based cloud saves.

The desktop app runs through Electron. The same React Native and Expo project also runs in a browser and on mobile. File export and backup-file actions are supported on desktop and web; some mobile file actions are not yet available.

## Get started

Install Node.js 22.13 or newer, then run:

```sh
npm install
npm start
```

This opens the desktop development app. Choose **Start my story** to create a story and begin its first chapter.

For the browser version, run `npm run web`. The landing page opens at `/` and the writing desk at `/app`. See the [development guide](docs/DEVELOPMENT.md) for other launch options and production builds.

To create a standalone Windows installer, follow the [desktop release guide](DESKTOP_RELEASE.md). Packaged builds run without Node.js or an internet connection for local writing. Unsigned preview builds may display a Windows publisher warning.

## Saving and recovery

Writing saves automatically on your device. **Save now** saves immediately; **Version history** lets you review and recover previous work.

**Download backup** creates a portable copy of the current workspace. **Import backup** previews a backup before you confirm replacement of your library. Manuscript exports contain the selected writing; workspace backups include supporting collections as well.

Desktop automatic backups start in **Documents/Little by Little Backups**. Open **Automatic backups** to choose another folder, make a backup, or pause them. For protection against device loss, keep a copy on another device or in storage you control. Local history and backups on the same computer do not protect against losing that computer.

## Optional cloud sync

You can write without an account. When cloud saves are available, open **Workspace → Cloud saves**, sign in, and choose which workspace to connect.

Sync transfers the whole workspace. If device and cloud copies conflict, you choose which to keep; manuscript changes are not merged automatically. Download a backup first if you need both copies. Local version history and backup-folder settings stay on each device.

**Pause sync** stops transfers. **Sign out** disconnects the account and leaves stories on the device. Neither action deletes the cloud copy.

## Privacy

Local manuscripts and exported backups are not encrypted by the application, and cloud sync is not end-to-end encrypted. Protect your device and backup files accordingly.

Proofreading and prose analysis work locally. Optional dictionary and thesaurus lookups send the requested word to external providers.

Read **Terms & conditions** and **Privacy & data use** in the app, or visit `/terms` and `/privacy` on the website. [Legal notices](LEGAL.md) identifies the policy sources and contact information.

## Contributing and support

- [Development and verification](docs/DEVELOPMENT.md)
- [Source guide](src/README.md)
- [Optional cloud setup](supabase/README.md)
- [Desktop releases](DESKTOP_RELEASE.md)
- [Security reporting](SECURITY.md)

Use [GitHub issues](https://github.com/Maxima01/Little-By-Little/issues) for ordinary bugs and feature requests. Report suspected vulnerabilities privately using the security policy.
