# Windows desktop releases

<!-- Feature: document the branded, self-contained installer, download publishing, and verified signing workflow. -->

Run `npm run release:windows` on Windows to build the x64 installer, verify its signature status, generate its SHA-256 checksum and download manifest, and rebuild the website. The installer is in `release/Little-by-Little-<version>-x64-Setup.exe`. The complete local website is in `dist/`, including `downloads/`. Run `npm run serve:web` to preview it.

The application bundles Electron (including Chromium and Node), the compiled renderer, and required runtime files. Users do not need a development environment or a separate dependency installation. Runtime licenses from Electron remain in the packaged application. Local writing works offline; cloud sync and dictionary requests need internet access.

The existing website symbol supplies the executable, installer, uninstaller, shortcuts, taskbar and favicon. Source artwork is `public/website/app-logo.svg`. Run `npm run brand:generate` to regenerate committed PNG/ICO assets using local Edge.

## Packaging safeguards

- Installs per user without requesting administrator privileges.
- Preserves application data on uninstall; writers should still keep external backups.
- Includes only the staged renderer and selected runtime files; excludes `.env`, source, signing keys and download binaries.
- Retains renderer isolation, sandboxing, navigation restrictions and permission denial.
- Enables Electron archive integrity checks and restricts loading to the packaged archive; disables Node environment overrides, Node CLI inspection and run-as-Node mode.
- Generates a checksum from the finished installer. A checksum detects changes; it does not establish publisher identity or certify the app is free of vulnerabilities.

## Publish on a website

Desktop downloads are configured separately from the writing website. The download section reads `/downloads/latest.json`; absent or invalid metadata shows an unavailable message instead of a broken download button.

For a server that accepts large files, deploy the generated `dist/` directory. The included Node server explicitly permits only the manifest, checksum list and versioned installer names inside `downloads/` and sends installers as attachments.

For separately hosted binaries (for example, a GitHub Release or object storage), upload the installer first. Set `DESKTOP_DOWNLOAD_BASE_URL` to the HTTPS directory containing that exact filename, run `node scripts/stage-desktop-download.mjs`, then `npm run build:web`. Deploy the generated `downloads/latest.json` and `SHA256SUMS.txt` with the website. No cross-origin fetch is needed for the installer; it is a normal download link. Confirm the published installer URL and checksum before deploying the manifest. Omit local `.exe` copies from the website deployment when using an external download URL. The script does not upload or publish files.

The web host must serve `/downloads/latest.json` as JSON, not a single-page-app fallback. Set its cache policy to `no-store`. Use HTTPS and preserve the production response headers described in the [development guide](docs/DEVELOPMENT.md). Choose hosting and file storage limits before uploading large installer files.

## Publicly trusted signing

An unsigned preview is clearly labeled on the download page. Do not instruct users to disable Windows security. A self-signed development certificate does not establish public trust.

Obtain signing through a provider that verifies the publisher's identity and supports their location. Confirm current eligibility and requirements directly with the provider. Keep identity-verification records and signing-account details outside the repository.

Configure the provider's protected certificate store, hardware token or supported cloud integration with electron-builder. Keep credentials outside Git. Use `npm run release:windows:signed`: packaging requires signing, and the staging script additionally requires Windows to report a valid signature with a timestamp. This signs via electron-builder's configured provider; it cannot issue a certificate or perform identity verification. Verify both the packaged application and installer before distribution. Signing proves publisher identity and detects tampering; it does not guarantee immediate SmartScreen reputation.

References: [Microsoft signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), [Artifact Signing eligibility](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart), [electron-builder v26 signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).
