# Cloud integration deployment

<!-- Feature: record the actual applied database integration and distinguish verified checks from account testing. -->
Applied on 2026-11-03 to **Little by Little**, project `yheuhwrooefcemrqjqqv`, which matches the application's configured project origin. The project was healthy. Preflight found zero accounts and zero cloud workspaces; no existing manuscript data needed moving or exporting. No other Supabase project was changed.

Migration: `harden_cloud_workspace_rpc`, applied through the connected Supabase migration tool using `schema.sql`. The installer was `postgres` with RLS bypass capability, as required by the private definer operations. The old public table was moved to `private`; table and legacy column privileges were revoked from browser roles.

## Verified live

- `security-check.sql` executed with assertions enabled: anonymous and cross-account access denied; direct table reads/writes denied; create/save/read and server revisions succeeded; stale revisions, invalid payloads and exhausted quotas rejected.
- The same checks also ran with the actual `createStarterWorkspace()` result, including a chapter, character and world setting, through the deployed read/save RPCs. All synthetic users, workspaces and quota rows were rolled back.
- Public HTTP Auth settings returned success: email accounts enabled, signup enabled, email confirmation required.
- Anonymous HTTP RPC read returned 401 / `42501`.
- HTTP access using the `private` schema returned 406 / `PGRST106`, confirming it is not exposed through the Data API.
- The private workspace table has forced RLS. The anonymous role cannot execute saves; the authenticated role cannot read the table or update its workspace column directly.

Security Advisors returned no warning/error findings. Two informational `rls_enabled_no_policy` findings are intentional: private tables deny all direct client access and are reached only through owner-checked definer operations. Do not add permissive policies to silence those notices. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Test your account

Open the application's **Cloud saves** panel. Create an email/password account, confirm the email, and sign in. Choose **Start cloud sync** for the first upload. On another browser or device, sign in to the same account and choose **Use cloud workspace** to retrieve it. Local writing and version history remain available while cloud sync is paused or signed out.

Personal account creation, confirmation delivery, and an authenticated browser save still need the writer's account interaction. The checks above do not claim those personal steps already happened. Never send account passwords in chat or put them in repository files. Existing packaged clients using the old direct-table protocol need rebuilding before cloud sync.

## Logout revocation hardening — 2026-11-03

<!-- Feature: record the applied session-revocation fix and its rollback-only authorization verification. -->
Migration `enforce_active_cloud_sessions` (`20261103114812`) was applied to the same configured project. It replaces only the two private read/save function bodies, preserving their ownership, signatures, grants and empty search paths. Both now bind the access JWT's session to an existing login session owned by its authenticated user. No workspace rows or account settings were changed by the migration.

The updated `security-check.sql` passed against this project with assertions enabled. It verifies valid-session saves and reads, account isolation, direct-table denial, revisions, payload validation and quotas, plus read/write rejection for missing session claims, another user's session, and revoked session claims. Session, workspace and quota fixtures are removed by rolling back to a savepoint while the original claims remain unchanged; the whole transaction then rolls back. A post-check confirmed zero users, sessions, workspaces and quota rows remained, matching the empty preflight state.

Security Advisors still report only the two intentional informational private-table RLS notices, with no warning/error finding. Hosted JWT duration, email-token expiry, and Auth rate-limit configuration were not changed by this migration; the connected database tools do not expose those Auth settings.

## Save attempt quotas — 2026-11-04

<!-- Feature: record the live quota fix and the rollback boundary of its regression checks. -->
Migration `charge_rejected_cloud_save_attempts` (`20261104090421`) is live in the configured project. It keeps the same public save RPC arguments and returns the same success row array and expected HTTP error objects. Invalid workspaces, invalid revisions and stale saves now consume the account's save quota. The previous routine definitions are retired in the private schema with client execution revoked.

The rollback-only database fixture passed its quota, response shape, revision, ownership and session assertions. Three rejected writes used the final three available attempts without modifying the workspace. The checks also verified rejection of `Prefer: tx=rollback` and confirmed no test accounts remained. These assertions exercised the database functions and their PostgREST response settings.
