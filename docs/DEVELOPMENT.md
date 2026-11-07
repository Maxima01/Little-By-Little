# Development guide

## Local development

Use Node.js 22.13 or newer and install dependencies with `npm install`.

| Command | Purpose |
| --- | --- |
| `npm start` | Open the Electron development app. |
| `npm run web` | Start the browser development server. |
| `npm run start:expo` | Open Expo tools for devices and emulators. |
| `npm run desktop:preview` | Build and open the offline desktop renderer. |
| `npm run build:web` | Export the production website to `dist/`. |
| `npm run serve:web` | Serve the production web export locally. |

The local production preview is available at `http://127.0.0.1:8093`. The website opens at `/`, the writing desk at `/app`, and public notices at `/terms` and `/privacy`.

The development server is for local development. For public hosting, publish only generated web artifacts and use HTTPS. The included production server supplies response headers and missing-page handling. Alternative hosts must preserve those protections and return an actual 404 for unknown routes rather than a catch-all success response. Review the checked-in host/build configuration when adapting it to another provider.

Keep public provider configuration consistent between the build and the production server. Use `HOST` and `PORT` for your own server environment as needed; production configuration and deployment records belong outside the public repository.

## Optional services and packaging

- [Cloud setup](../supabase/README.md) explains configuring your own Supabase project with public client values.
- [Desktop releases](../DESKTOP_RELEASE.md) covers Windows installers, download artifacts, and signing.
- [Source guide](../src/README.md) maps application features and persistence.
- [Design system](../DESIGN.md) documents shared visual conventions.

## Verification

Choose checks appropriate to the change:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check TypeScript integration. |
| `npm test` | Run the automated Node tests. |
| `npm run build:web` | Verify production web compilation and export. |
| `npm run verify` | Run type checking, automated tests, and the web build together. |
| `npm run test:pdf` | Check PDF export changes. |
| `npm run test:desktop -- --fast` | Check built desktop workflows. |

For website or navigation changes, build and serve the website before running `node scripts/website-smoke.mjs` or `node scripts/navigation-smoke.mjs`. Generated screenshots and reports belong in the ignored `.local-checks/` directory. Local checks do not establish the state of a hosted application or database.

## Documentation

Document new application functions and features with brief purpose comments in their source files. Keep Markdown guides focused on current behavior and instructions, without change-log entries or feature-log comments. Keep the root README focused on the writing experience.

Use fictional data and placeholders in public examples. Keep production inventories, private audit results, deployment logs, credentials, and unresolved vulnerability details outside the tracked documentation. Report vulnerabilities through the [security policy](../SECURITY.md).
