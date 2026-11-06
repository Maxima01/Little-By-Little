# Hosting security deployment — 2026-11-06

<!-- Feature: distinguish protections actually applied to production from account settings that still require owner access. -->
Production site: https://little-by-little-delta.vercel.app

Vercel project: `little-by-little` (`prj_GIrjlkv4e4vdOCqhdVzuJhBZ7p6r`), team `mike-ec21`.

## Applied

- GitHub commit `6a35789262083db5a860cf292072bf83486197d1` introduced the Vercel security-header and public-artifact packaging fixes. Vercel reported its production deployment `READY`.
- The web export now supplies a Content Security Policy allowing the configured Supabase origin and the explicit dictionary providers, with executable inline scripts, eval, arbitrary connections and framing blocked.
- MIME-sniffing, referrer, permissions, opener and resource policies are supplied. Document responses are not cached by the application's policy; hashed Expo assets retain immutable caching.
- Private files and source maps are not packaged into the public output. Missing routes return real 404 responses. Write methods are rejected by the static-site routing configuration.
- Vercel accepted the project settings `gitForkProtection: true`, `directoryListing: false`, and `publicSource: false`. Source/log protection is managed through the provider setting: the currently deployed configuration schema rejects the older `public` property in `vercel.json`, despite older documentation referencing it.
- Existing Vercel Authentication protection for deployment URLs was retained. The production website remains publicly accessible.

## Verification

- Nine focused hosting tests passed for the final hosting change. The preceding implementation also passed type checking, the production build and the focused account tests.
- Public requests to `/`, `/app`, `/terms` and `/privacy` returned 200 with the new CSP and other browser security headers.
- Missing-page and private-file requests returned 404. `/assets` does not expose a directory listing.
- `/_src` and `/_logs` redirected to Vercel sign-in rather than exposing source or logs.
- The production writing desk and sample chapter editor loaded in a browser with no captured warning/error console entries during that check. No personal account was created or manuscript uploaded.
- Supabase public Auth settings required email confirmation and disabled anonymous sign-ins. Database metadata confirmed private-table RLS and no direct anonymous or authenticated table access. The cloud routines retain account and active-session checks. Security Advisors returned only the two documented informational private-table RLS notices, not warning/error findings.
- Vercel's active custom-firewall configuration endpoint returned `Config not found`. This does not establish that platform DDoS protection is disabled. No custom firewall rules, attack challenges or paid services were enabled.

## Owner-managed settings still to verify

<!-- Feature: retain ordinary account recovery while documenting the controls unavailable through the connected database tools. -->
The connected Supabase tools do not expose hosted Auth configuration or backup encryption settings. Dashboard automation could not initialize, so these settings were not changed:

1. Enable administrator two-factor authentication for both provider accounts, and retain recovery codes privately.
2. In Supabase's **URL Configuration**, set the Site URL to `https://little-by-little-delta.vercel.app`. Keep only exact required production redirect URLs; avoid unrelated domains and broad preview wildcards.
3. In the email/password provider settings, retain email confirmation and set the minimum new-password length to 15. Enable leaked-password screening if already included in the selected plan; no upgrade was purchased.
4. Review Auth rate limits and confirmation-email delivery. The Vercel firewall does not govern requests that the browser sends directly to Supabase Auth.
5. Confirm database backup availability, retention and encryption coverage for the actual hosted plan. Provider encryption at rest remains distinct from end-to-end encryption.

CAPTCHA is not configured in this production build. Enabling it at the provider requires a coordinated sign-in path for the desktop/native clients, whose current account forms cannot display the browser challenge. Do not enable it in isolation and unintentionally prevent those clients from signing in.

The app does not yet have a self-service password-reset screen. Manuscript encryption and recovery-key changes remain deferred by the user's choice. No claim of end-to-end encryption should be added to the privacy notice based on these hosting changes.

References: [Vercel security settings](https://vercel.com/docs/project-configuration/security-settings), [Vercel Firewall](https://vercel.com/docs/vercel-firewall), [Supabase password security](https://supabase.com/docs/guides/auth/password-security), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
