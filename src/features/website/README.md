# Public website

The website introduces Little by Little and leads writers to `/app`. Electron and native platforms open the writing workspace directly.

## Routes and account entry

The landing page offers **Create a story for free**, **Sign in**, and **Register**. **Continue without an account** opens the local writing desk. Signing in preserves the guest library; the Cloud saves workspace choice controls the first transfer.

The terms and privacy notice appear at `/terms` and `/privacy`. Unknown paths show the missing-page view. Generic account configuration is documented in the [cloud setup guide](../../../supabase/README.md).

## Design and assets

The page uses the application's paper, violet, sage, and serif visual language. An editable fictional manuscript sample demonstrates word counting and Focus; it is labeled as temporary and unsaved. The [design system](../../../DESIGN.md) describes the shared visual conventions.

`public/website/` contains application captures made with `scripts/capture-website.mjs` from the built-in example story. Use fictional data when regenerating screenshots. The page does not need external photographs, video, or web fonts.

## Contributor checks

Build with `npm run build:web`, start `npm run serve:web`, then run `node scripts/website-smoke.mjs`. Check desktop and narrow layouts, keyboard navigation, reduced-motion preferences, the sample editor, account entry, and public routes.

See the [development guide](../../../docs/DEVELOPMENT.md) for build and hosting guidance and the [security policy](../../../SECURITY.md) for private vulnerability reporting. Keep inspection output and internal review notes out of the public documentation.
