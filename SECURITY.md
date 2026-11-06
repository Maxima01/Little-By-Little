# Security boundaries

<!-- Feature: document the deployed security model and the required database upgrade without promising immunity to attacks. -->
Little by Little remains an offline-first writing application. The web host serves the application; Supabase handles optional account authentication and private cloud saves. Intended website and authentication routes are reachable by browsers. Protection comes from authorization, restricted privileges and validated inputs, rather than hiding URLs.

<!-- Feature: record the verified cloud deployment separately from application-host deployment. -->
The cloud database upgrade was applied to the configured **Little by Little** Supabase project on 2026-11-03. Live database authorization/save checks and anonymous HTTP access checks passed; see [the deployment record](./supabase/DEPLOYMENT.md). This does not establish that another database, published website, or previously packaged desktop client has been upgraded.

## Apply the database upgrade

Run the reviewed, transactional [Supabase schema](./supabase/schema.sql) in the intended project's SQL Editor, following [the cloud security notes](./supabase/README.md). Back up existing cloud data first. Deploy matching clients together: older clients that read the table directly must be upgraded. The schema moves existing workspace data into a private schema, retains account ownership and server revisions, and exposes only the authenticated read and revision-checked save operations. No service-role credential belongs in the browser, desktop renderer, mobile bundle, Git, or any `EXPO_PUBLIC_` variable.

Builds validate the public cloud settings before Expo embeds them. Only publishable or legacy anon keys are accepted. This is a credential-type check; the database verifies user identity and ownership for every cloud operation. An accidentally published secret still requires revocation and rotation.

<!-- Feature: enforce completed logout at the cloud data boundary rather than waiting for JWT expiry. -->
Both cloud RPCs require the JWT's `session_id` to identify an existing `auth.sessions` row owned by the signed-in user. A copied access token cannot read or save a workspace after that session is revoked. Browser roles receive no session-table privileges. Logout revokes the provider session before best-effort cleanup of local sync preferences; preference cleanup failures cannot prevent the revocation.

<!-- Feature: a new login requires an explicit workspace choice before automatic syncing can begin. -->
Cloud sync stores approval for the current login session. Identical copies still require the writer to connect the workspace on a new login. A token refresh within that login retains the approval. Cloud save attempts that fail workspace validation or revision checks still count against the account's write quota.

<!-- Feature: keep cloud coordination data small without changing manuscript encryption or local recovery. -->
Sync preferences store a SHA-256 content fingerprint rather than a second serialized manuscript. Existing preferences are converted for the same approved login, including paused devices. This is change detection, not manuscript encryption. Native session refresh follows foreground/background transitions independently of the manuscript-sync switch; background polling skips hidden apps and browsers known to be offline.

<!-- Feature: bound cloud JSON responses through body completion and document the native buffering limit. -->
The shared cloud transport restricts initial requests to the configured provider origin and keeps its 15-second deadline active until the response body finishes. Browser fetch rejects redirects; all runtimes reject responses reported from another origin. Auth responses are capped at 1 MiB and workspace responses at 24 MiB, leaving room around the database's 20 MiB workspace limit. Streaming responses are bounded while reading; native transports without streams validate buffered bytes before SDK parsing. The transport does not retry writes itself. These client changes and the read-quota rollback guard are recorded in [the November 7 review](./docs/security/2026-11-07-review.md); local source changes do not establish deployment.

## Web hosting

Use `npm run build:web` and `npm run serve:web`. The dependency-free production host defaults to loopback and only accepts GET and HEAD. It serves known documents and exported asset paths; it does not serve the checkout, source maps, environment files, database scripts, an upload handler, or a general proxy. Filesystem containment also checks symlinks. Unknown document paths return the custom page with HTTP 404.

The host supplies Content Security Policy, anti-framing and MIME-sniffing protections, restrictive permission and referrer policies, request/header/connection bounds, and generic errors. Scripts load from the same origin; when `EXPO_PUBLIC_TURNSTILE_SITE_KEY` is configured, the exact `https://challenges.cloudflare.com` origin is also allowed for the challenge script and iframe. Executable inline scripts and eval remain blocked. React Native Web generates inline styles, so the style policy permits those. Outbound browser connections are restricted to the configured Supabase project and the dictionary providers used by explicit word lookups.

<!-- Feature: distinguish local guest writing, optional account UI and provider-enforced bot protection. -->
Guest writing uses local storage and does not create an anonymous Supabase user. Sign-in and registration call Supabase Auth directly, so web-host request limits do not apply to those provider endpoints. A public Turnstile site key enables the browser challenge; the corresponding **secret** belongs only in Supabase Auth's CAPTCHA configuration. Supabase must validate challenge tokens on the server to prevent bots from bypassing the UI. Configure the widget's allowed hostnames, enable CAPTCHA in Supabase, retain email confirmation, and review [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) before a public release. Do not publish a Turnstile testing key for a production hostname. See the [CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha) and [cloud security notes](./supabase/README.md). This source change does not establish that provider CAPTCHA was enabled.

<!-- Feature: keep credentials out of browser URLs and require a separate password sign-in after signup. -->
Browser account forms require a secure context. They send credentials directly to Supabase, and the production host blocks native form submissions. Signup uses an isolated, in-memory Auth client and asks Supabase for a PKCE confirmation code. The website clears confirmation codes and legacy token fragments from its address. Confirm the email through Supabase, then sign in with the password. The [cloud security notes](./supabase/README.md) cover hosted password requirements, trusted redirects and the optional server-side policy acknowledgment check.

Terminate TLS at a maintained HTTPS reverse proxy and apply request/connection limits at the edge. Distributed traffic controls, provider auth quotas, email verification, account abuse protection and dependency updates remain operational responsibilities. An in-process limit does not replace an edge service.

<!-- Feature: count visitors separately behind the configured proxy and reject client-supplied identities. -->
For a Caddy proxy running on the same host, set `HOST=127.0.0.1` and `TRUSTED_PROXY_IP=127.0.0.1` for Node. Overwrite the upstream client address header in the Caddy site block.

```caddyfile
reverse_proxy 127.0.0.1:8093 {
    header_up X-Novel-Client-IP {remote_host}
}
```

Keep the Node port private. Proxy mode accepts a single client IP from the configured socket peer. When another edge sits in front of Caddy, configure Caddy's trusted proxy chain before forwarding the validated visitor address. Direct server mode uses the socket peer address and ignores forwarding headers.

On a static host, serve `dist/`, route `/app` to `app/index.html`, return `404.html` with status 404 for unknown paths, and configure equivalent response headers. Never use a catch-all 200 rewrite. Static file hosting alone does not apply `server/web.mjs` protections.

<!-- Feature: Vercel deployments share the Node host's browser protections and publish only reviewed web artifacts. -->
For Vercel, the checked-in `vercel.json` runs `npm run build:vercel`. This emits `.vercel/output/config.json` with the same CSP, anti-framing, MIME-sniffing, referrer and permissions headers as the Node host. The provider origin and optional Turnstile allowance come from the production build environment. Only allowlisted web artifacts enter `.vercel/output/static`; environment files, source maps, export metadata and linked files are excluded or rejected. Known documents have explicit routes, unsupported write methods return 405, and missing routes return 404. Vercel's edge controls remain separate from the Node host's in-process request limits.

<!-- Feature: keep deployment source and build logs private through the supported provider settings. -->
Vercel's project setting `publicSource: false` keeps deployment source and build logs restricted; it does not make the production website private. The hosted project also has Git fork protection enabled and directory listings disabled. The hosting changes were deployed and checked on 2026-11-06; see [the hosting security record](./docs/security/2026-11-06-deployment.md) for verification and remaining owner-managed settings.

<!-- Feature: check the published configuration without creating accounts or reading manuscript content. -->
After a deployment, run `npm run inspect:hosted-security -- https://little-by-little-delta.vercel.app`. The inspection reports selected public response headers, missing-file responses and the configured Supabase project's public Auth settings. It omits cookies, credentials and response bodies. A successful build alone does not prove deployment or validate dashboard-only password, rate-limit, CAPTCHA, MFA or backup settings. Enabling provider CAPTCHA requires a coordinated browser sign-in path for desktop/native clients, which cannot render the current web challenge. The app's existing account UI has no self-service password-reset screen yet; these hosting changes do not add one or alter the manuscript encryption model.

## Untrusted manuscripts and desktop privileges

Imported, pasted and synced manuscript HTML is treated as untrusted. The editor and export paths filter markup through an allowlist before it enters a live document. Parsing occurs in an inert template; unsupported elements, active attributes and unsafe styles are removed. Client-side validation does not replace server-side authorization or storage limits.

Electron keeps Node integration disabled, context isolation enabled and the renderer sandboxed. Remote navigation, popups, webviews and device permissions are denied. Privileged PDF and backup IPC checks the exact trusted document and its main frame. The preload exposes only the scoped operations needed by the application.

<!-- Feature: protect the file-based desktop renderer independently of web-host response headers. -->
Desktop packaging installs a Content Security Policy at the start of the exported HTML head, using the same production Supabase origin and resource allowlist as the web host. It blocks inline executable scripts, eval and arbitrary outbound connections while permitting required generated styles. Packaging fails if the document has no complete head. Repeated packaging replaces earlier CSP metadata instead of accumulating policies.

The Windows 0.1.1 build pins Electron 45.2.2. Its packaging commands ensure the pinned runtime is present before assembling an installer. [Electron security advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9).

<!-- Feature: protect generated exports and automatic backups from linked or replaced files. -->
Automatic backups bound reads and preserve suspect snapshots for recovery. PDF exports verify the selected file after rendering and atomically replace it. Choose a backup or export parent directory you control because portable filesystem APIs cannot exclude every concurrent ancestor replacement. Markdown exports encode link destinations so malformed URLs cannot add raw HTML.

<!-- Feature: native login data is device-bound and rich text images are disabled before native parsing can fetch them. -->
Android and iOS use AES-GCM for saved Auth data with a device-bound SecureStore key. The first launch of the upgraded native build discards legacy plaintext login entries and requires a fresh sign-in. Android's generated backup rules exclude SecureStore and the legacy SQLite store. The install script applies the version-pinned image policy to both native parsers. Run `npm run postinstall` after an install that skips lifecycle scripts, then rebuild native binaries to include the parser changes.

## Focused checks

Typecheck and a production web build cover integration. The focused tests include web route and path protections, HTML sanitization, Electron document checks, public credential validation, cloud repository behavior and cloud SQL constraints. Run test files directly with Node when the environment prevents the Node test runner from spawning workers. Live two-account database authorization checks are still required against the configured project; local source tests cannot prove a deployed database policy.

References: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api), and [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
