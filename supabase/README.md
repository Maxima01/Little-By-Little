# Optional cloud setup

Cloud saves are optional. Local writing and backups work without configuring Supabase.

## Configure your own project

1. Create or select a Supabase project that you administer.
2. Review [schema.sql](schema.sql) and apply it through that project's SQL Editor as the database administrator. Back up existing data and test upgrades in a staging project first.
3. Keep the `private` schema outside the Data API's exposed schemas. Preserve the access restrictions installed by the schema; do not grant clients direct access to workspace tables.
4. Copy [`.env.example`](../.env.example) to `.env` and supply your project's URL and publishable key:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Restart the development server or rebuild the application after changing configuration. Never put secret or service-role credentials in an `EXPO_PUBLIC_` variable, the repository, or a distributed build.

Database changes and clients must be compatible. Older clients that access workspace tables directly need updating when upgrading from the original schema. Running a local build does not update a hosted database.

## Authentication

Configure email confirmation, email delivery, trusted HTTPS redirects, password requirements, and provider abuse controls for your own deployment. Test account creation, confirmation, sign-in, sign-out, and cross-device sync before release.

For optional browser CAPTCHA, configure the public `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and the matching secret in Supabase Auth. Keep the secret at the provider. Provider enforcement is required; the public widget alone does not protect authentication. The current challenge requires a supported web browser, so check compatibility with desktop and native account flows before enabling it.

The schema also includes an optional signup-policy acknowledgment hook. If you enable it in Supabase Auth, keep its policy versions aligned with the application and verify all supported account-creation flows. User-supplied acknowledgment metadata must not be used for authorization.

## Verify your installation

Run [security-check.sql](security-check.sql) in a disposable local or staging database after installing the schema. Use test accounts and fictional workspaces to check account isolation, saves, conflicts, and sign-out behavior. Keep results and deployment records in private maintainer documentation.

See the [development guide](../docs/DEVELOPMENT.md) for local checks and the [security policy](../SECURITY.md) for private reporting.

Provider references: [API security](https://supabase.com/docs/guides/api/securing-your-api), [authentication configuration](https://supabase.com/docs/guides/auth), and [CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha).
