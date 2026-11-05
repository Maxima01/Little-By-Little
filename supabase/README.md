# Cloud boundary

<!-- Feature: document installation, upgrade and the authenticated cloud RPC security boundary. -->
Cloud saves are optional. Local writing and backups work without a cloud account. Browser bundles contain only a Supabase project origin and its publishable key (legacy `anon` keys are supported). These public values identify the project; a signed-in user's JWT authorizes an operation. Secret and `service_role` keys must never be set in an `EXPO_PUBLIC_*` variable.

Run [schema.sql](./schema.sql) as the database administrator (`postgres`) in the intended project's SQL Editor. It handles a fresh installation and upgrades the original schema in one transaction: the existing `public.cloud_workspaces` table moves into `private` with its rows and revisions intact. It stops without changes if both copies already exist. Export a database backup before applying an upgrade. Release matching clients together: old clients that read the table directly cannot sync after this upgrade; their local writing remains intact.

The `private` schema must stay out of Supabase **Data API → Exposed schemas**. Authenticated roles have no direct workspace table privileges, including old column-level grants. The table has RLS enabled and forced with no client policies. Two public `SECURITY INVOKER` functions delegate to narrowly scoped private `SECURITY DEFINER` functions. The private functions intentionally run as the administrator to cross the table privilege boundary; both independently require `auth.uid()`, reject anonymous sign-ins, bind `p_user_id` to the JWT owner, and filter all access to that owner. They use an empty search path and no dynamic SQL. All helper functions revoke default `PUBLIC` execution. Do not grant table or helper access to browser roles.

The two intended application endpoints are:

- `read_cloud_workspace`: reads only the signed-in owner's workspace; a matching known revision returns metadata without a manuscript body.
- `save_cloud_workspace`: creates a first snapshot or changes exactly the expected revision. The server assigns the next revision and timestamp. A stale expected revision fails with `40001`.

<!-- Feature: tie cloud authorization to the active server-side login session so logout revokes copied access tokens. -->
Both operations also require the JWT's `session_id` to match an existing `auth.sessions` row belonging to the authenticated owner. Missing, wrong-owner and revoked sessions fail before quota updates or workspace access. The private definer operations perform this check without granting clients any session-table privileges. This makes a completed session logout effective for new cloud requests immediately, independently of the token's remaining lifetime.

Requests are limited per account across devices to 120 reads and 60 save attempts per minute. Expected validation and revision failures retain their quota charge and return the existing HTTP error shape. Save requests reject the PostgREST transaction rollback preference. A workspace is limited to 20 MiB of serialized database JSON, 100 stories, and 10,000 chapters or entries per collection. SQL checks the required core shapes, and clients validate the complete portable format before accepting downloads. Existing oversized or legacy records are retained on upgrade. Subsequent writes must satisfy the current limits. The client rejects oversized uploads early and redacts database diagnostics in UI errors.

## Account security settings

<!-- Feature: document the Supabase controls that also apply to direct signup and sign-in requests. -->
Sign-up and sign-in reach Supabase Auth directly. Configure these controls in the intended project's dashboard before public release.

- Keep **Confirm email** enabled and leave anonymous sign-ins and unused account providers disabled. Use a monitored SMTP service for public confirmation delivery. Keep the default `{{ .ConfirmationURL }}` signup link so Supabase verifies the address before redirecting. The app sends no custom redirect and uses PKCE for new signup requests. The confirmation link leads to the site, then the user signs in with their password.
- Set the **Site URL** to the canonical, trusted HTTPS website. Keep the production redirect allowlist limited to exact destinations required by the deployment. Remove preview wildcards, localhost addresses and obsolete origins from production. [Supabase redirect settings](https://supabase.com/docs/guides/auth/redirect-urls).
- Set the Supabase minimum password length to at least 15 for new passwords. The app's signup form also caps new passwords at 72 UTF-8 bytes for Supabase's password hashing. Enable leaked-password screening when the plan supports it. [Supabase password security](https://supabase.com/docs/guides/auth/password-security).
- Review provider throttles and monitoring for confirmation emails, verification, and password sign-in. Keep the Auth rate limits enabled and test signup and sign-in in staging. [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

<!-- Feature: wire optional guest-to-account CAPTCHA protection without bundling provider secrets. -->
For web account forms, create a Cloudflare Turnstile widget restricted to your actual hostnames and set `EXPO_PUBLIC_TURNSTILE_SITE_KEY` to its public site key for both the web build and production host. In Supabase **Authentication → Bot and Abuse Protection**, enable CAPTCHA, select Turnstile, and save its matching secret there. Keep the secret in Supabase. Supabase validates the short-lived token on sign-up and sign-in, including direct API requests. The app requests a fresh challenge after a submission or expiry. When the provider requires CAPTCHA, signup and sign-in need a supported web browser. Confirm that this deployment tradeoff works for your native and packaged desktop users before enabling it. Guest writing works locally without an account. Static hosts need the same CSP allowances that `server/web.mjs` applies with a configured key. [Supabase CAPTCHA guide](https://supabase.com/docs/guides/auth/auth-captcha), [Cloudflare CSP requirements](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).

<!-- Feature: document the opt-in server check for policy acknowledgments and its public endpoint behavior. -->
The schema includes an optional **Before User Created** hook. Once provider-side CAPTCHA and throttling are configured, enable the hook under **Authentication → Hooks** and select the Postgres function `private.require_signup_policy_acknowledgment`. It rejects new accounts when either current policy version or its explicit acknowledgment is missing or invalid. Keep the versions in the hook and the signup form in sync, and use updated clients before enabling it. Check any other account creation paths that share this project. Supabase can answer a confirmed duplicate signup before invoking the hook, so responses to direct signup requests can still disclose account existence. The submitted acknowledgment fields remain user-editable account metadata. [Supabase hook setup](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook), [Supabase signup handler](https://github.com/supabase/auth/blob/master/internal/api/signup.go).

`scripts/check-public-config.mjs` validates the same Expo dotenv precedence as the build and rejects unsafe public Supabase config before bundling. It never prints configuration values. If a private credential was included in an earlier build, revoke/rotate it in Supabase and replace every published bundle; a new guard cannot remove an already published secret.

Run the local client checks with:

```sh
node --experimental-strip-types --test --experimental-test-isolation=none tests/cloudConfig.test.mjs tests/cloudSync.test.mjs
```

Run [security-check.sql](./security-check.sql) against a disposable local/staging Supabase database after installing the schema. It exercises role grants, anonymous/account isolation, direct-table denial, revision conflicts, invalid payloads and quotas inside a rolled-back transaction. It must not be presented as having run against production unless actually executed there. No database connection or Supabase CLI is bundled with the repository.

The implementation follows Supabase's [API security guidance](https://supabase.com/docs/guides/api/securing-your-api) and [database function privilege guidance](https://supabase.com/docs/guides/database/functions). Source hardening reduces attack surface; ongoing updates and deployment monitoring remain necessary.
