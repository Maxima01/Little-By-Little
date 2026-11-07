---
name: Little by Little
description: The visual system for the writing workspace and public website.
colors:
  paper: "#FAF7F2"
  surface: "#FFFFFF"
  surface-alt: "#F3EDE5"
  ink: "#332F38"
  muted: "#625C6B"
  violet: "#67518F"
  violet-soft: "#EAE3F5"
  violet-paper: "#F4F1F8"
  sage-ink: "#396C59"
  sage: "#E2EFE8"
  peach: "#D99178"
  border: "#E8E1D9"
  website-stage: "#f0eaf5"
  dark-paper: "#19191F"
  dark-surface: "#24232C"
  dark-surface-alt: "#302E38"
  dark-ink: "#F2EEF5"
  dark-muted: "#B5AFBD"
  dark-violet: "#C0AFE9"
  dark-violet-soft: "#39334A"
  dark-violet-paper: "#2B2735"
  dark-sage-ink: "#9AC8B7"
  dark-sage: "#2D403A"
  dark-peach: "#E7A78F"
  dark-border: "#3A3742"
  dark-action-ink: "#201B2A"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(58px, 6.3vw, 92px)"
    fontWeight: 400
    lineHeight: 1.03
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(34px, 3.8vw, 54px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Georgia"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: "30px"
  body:
    fontFamily: "Arial, sans-serif"
    fontSize: "17px"
    lineHeight: 1.6
  manuscript:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "16px"
    lineHeight: 1.9
  interface:
    fontSize: "14px"
  label:
    fontSize: "13px"
    fontWeight: 600
rounded:
  control: "5px"
  panel: "8px"
  page: "2px"
  square: "0px"
spacing:
  compact: "8px"
  control: "12px"
  inset: "16px"
  mobile: "20px"
  panel: "24px"
  spread: "32px"
components:
  app-primary:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  app-secondary:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.violet}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  app-quiet:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  website-primary:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.surface}"
    rounded: "{rounded.square}"
    padding: "14px 24px"
  app-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "10px 12px"
  app-nav-selected:
    backgroundColor: "{colors.violet-soft}"
    textColor: "{colors.violet}"
    rounded: "{rounded.control}"
  app-chip-selected:
    backgroundColor: "{colors.violet-soft}"
    textColor: "{colors.violet}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  manuscript-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Little by Little

## Overview

The app and website share warm paper surfaces, violet actions, sage status accents, and serif manuscript text. Preserve these colors and keep writing workflows central to the interface.

The workspace gives the draft priority through continuous navigation, quieter toolbars, readable rows, and open context sections. The website uses the same materials at a larger reading scale. Its manuscript-spread composition is documented in `src/features/website/README.md`; app screens use layouts suited to their writing tasks.

**Key Characteristics:**

- Warm neutral surfaces with restrained violet and sage accents.
- Serif manuscript and story titles; familiar sans-serif controls.
- Flat shared surfaces, explicit selected states, and visible keyboard focus.
- Responsive hierarchy that keeps writing and navigation actions available.

Source authority: `src/theme/theme.ts`, `src/shell/App.tsx`, the editor components and `rich-editor.css`, and `src/features/website/website.css`. The frontmatter records reusable design values; implementation sources define their actual use.

## Colors

The existing light and dark themes share semantic roles. Use the corresponding dark token when the workspace theme changes; the public website currently uses the light palette.

### Primary
Violet marks primary actions, links, selected navigation, and focus. Violet-soft provides selected fills; violet-paper supports author notes and planning. The website-stage tint groups public demonstration and account content.

### Secondary
Sage-ink identifies positive progress and saving context, paired with sage fills. Status meaning must also be present in text.

### Tertiary
Peach is a supporting accent; violet identifies primary actions.

### Neutral
Paper is the workspace background; surface holds manuscript content and selected containers; surface-alt forms the continuous sidebar and secondary controls. Ink carries content, muted carries supporting information, and border separates related rows and form fields. Primary buttons use surface text in light mode and dark-action-ink in dark mode.

**The Theme Pairing Rule.** Keep light and dark semantic roles paired; do not derive a new palette from a screenshot or substitute unrelated hues.

## Typography

Georgia and its serif fallbacks carry manuscript text, library story titles, and website display headings. The app retains platform-default interface text; the website explicitly uses Arial and sans-serif fallbacks.

The frontmatter captures the public display/headline/body roles, the manuscript-row title, the default editor prose, and common interface labels. App screen headings vary by purpose: library welcomes use Georgia at desktop/mobile sizes of 32/28px, while compact navigation and tool labels predominantly use 14px. The public body reduces to 16px on phones; its hero headline uses `clamp(46px,13vw,72px)` below the compact breakpoint. Supporting text and form labels retain their existing separate roles rather than being forced into a decorative scale.

The editor's font, size, page width, and line spacing are writer preferences. The documented manuscript role is the default, not a restriction on authored content. Website supporting paragraphs generally stay within 32–48 characters per line, while policy text has a wider reading measure.

**The Writing Hierarchy Rule.** Give manuscript and story content typographic priority while keeping action labels explicit and familiar.

## Layout

The desktop workspace uses a continuous sidebar with width from `workspaceGeometry.sidebarWidth` (260px). It appears beside the content from 900px viewport width; smaller viewports use the bounded, scrollable navigation drawer. Content may stack even on desktop when the remaining area is below 900px. The library has a maximum content width of 1160px and the story hub 1280px. Writer-controlled manuscript widths remain available.

Use shared rows and section spacing to group navigation, manuscripts, and chapter information. The chapter-context surface is open rather than a stack of nested cards. Its controls retain their own field and selection boundaries. Editor toolbars remain horizontal scroll regions where the complete set of controls cannot fit, with a scroll hint when controls extend beyond the visible area.

The website uses full-width color fields, a maximum 1376px content measure for its major reading sections, and a 1600px outer cap on very wide screens. Its spread becomes a single column at 900px and a linear phone layout at 700px. Phone content typically uses 20px side insets; the hero has its own tighter outer inset. Desktop sticky detail copy only applies above 1100px. Preserve the source-specific breakpoints rather than assuming one global breakpoint fits both surfaces.

## Elevation & Depth

Main surfaces are flat. Tonal contrast, whitespace, and thin row dividers establish grouping without ambient card shadows. The writing toolbar's floating choice menu still uses a soft native shadow: color `#332F38`, opacity `0.16`, offset `(0, 8)`, radius `22`, elevation `8`. Dialog backdrops provide separation from the active document. This local overlay treatment does not justify shadows on ordinary content rows.

**The Quiet Surface Rule.** Keep ordinary writing surfaces flat and reserve overlay depth for controls that float above the current task.

## Shapes

`workspaceGeometry` distinguishes small control corners, panel corners, and nearly square manuscript pages. These are the reusable defaults for workspace controls, panels, and pages. The public site's action buttons and filled sections are square. Specialized dialogs and forms may use individual corner radii.

Thin borders remain appropriate for inputs, selected chips, and meaningful row divisions. Avoid enclosing every subsection when typography and spacing already establish its grouping.

## Components

### Buttons
App primary and secondary buttons use the control radius; quiet toolbar actions share the surrounding surface until selected. Common app targets are at least 44px high. Shared press feedback reduces opacity to 0.75 and disabled feedback to 0.45. Web hover feedback adjusts brightness, and keyboard focus has a visible violet outline. Dark theme primary text uses the dedicated dark action ink.

The website primary action is square, at least 52px high, and changes to ink on hover with a small vertical movement. Its disabled account action remains visibly disabled and does not move. These public action treatments should not replace the quieter editor controls.

### Inputs / Fields
Fields retain visible borders, labels, and theme-aware text. A common profile-field pattern uses the panel radius and paper fill. Manuscript editing stays on an uncluttered writing surface. Public account inputs remain square, at least 50px high, and use a stronger muted border. Focus outlines remain visible; status and error messages stay adjacent to the relevant form.

### Navigation
The sidebar is a continuous surface with text-led rows. Selected destinations use violet-soft fills and violet text; chapter hierarchy is conveyed with indentation and weight. Compact navigation remains scrollable within its drawer. The public header keeps both account actions available on small screens.

### Chips
Character selections use small control corners, outlined resting states, and violet fill/border changes when selected. Selection must remain programmatically exposed. Do not use a decorative chip to replace a plain section label.

### Manuscript Rows / Containers
Library stories use full-width surfaces, serif titles, supporting descriptions, and compact metadata. Rows expand or stack with the available content width. Shared chapter and collection containers use the panel radius; manuscript pages use the page radius. Keep delete and other secondary actions distinct from the main open-story action.

### Writing Sample and Motion
The public sample is editable, counts words with the real operation, and labels its text as a sample that is not saved. Focus changes the presence of context without discarding the sample. Use real product captures when explaining actual functions; do not invent customer proof.

With motion permitted, the website uses a brief staggered entrance and a slow scale change on the editor capture. Reduced motion disables animation, transitions, and smooth scrolling while retaining content and controls. Exact durations and responsive thresholds are recorded in the sidecar.

## Do's and Don'ts

### Do:

- Do retain the existing semantic colors in both workspace themes.
- Do prioritize the manuscript and use explicit text labels for navigation and actions.
- Do use the shared workspace geometry for controls, panels, and writing pages.
- Do preserve visible focus, selected states, readable labels, and available compact-screen actions.
- Do label temporary examples clearly and show actual application content as product evidence.
- Do respect reduced motion without hiding content or controls.

### Don't:

- Don't introduce a new palette, font identity, or brand metaphor as part of routine refinement.
- Don't surround every writing subsection with another card or apply shadows to ordinary rows.
- Don't turn the website's current spread composition into a mandatory app layout.
- Don't apply specialized dialog radii or mobile toolbar scrolling to every component.
- Don't use fabricated endorsements, statistics, or outside imagery to imply proof the product does not have.
