# Design research: what makes tracker apps feel premium

Date: 2026-10-25. Written before the v2.1 redesign. Goal: find out why
Study Workspace looked "cheap" and what the best productivity apps do
instead, then turn that into rules for our own design system
(`frontend/css/base.css` + `components.css`).

## 1. What was wrong with our UI (from the user's screenshot)

| Problem | Cause |
| --- | --- |
| Blue frame around the whole page | `<main tabindex="-1">` gets focus after each page change. `main { outline: none }` loses to the global `:focus-visible { outline }` rule (a pseudo-class is more specific than a tag). |
| Big empty band on the right | `main` had `max-width: 1320px` and was not centred, so wide screens got a dead strip. |
| Holes under cards | The Overview used `auto-fit` columns with `align-items: start`, so cards of different heights left gaps, and the last row was half empty. |
| "Toy" look | 24 px radius on everything, pill buttons, same flat fill for page and cards, no borders, big padding, 15 px text with few weights. Everything had the same visual weight, so nothing looked important. |
| Generic empty states | Plain grey sentences like "No lessons today." with no icon and no next step. |

## 2. What the best apps do

### Linear (issue tracker), the reference for "premium" software
- Redesign 2024: theme colours built in **LCH** so equal lightness looks
  equal across hues; each theme comes from 3 inputs (base, accent,
  contrast) instead of 98 variables. Accent colour is used **sparingly**.
  ([how we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui))
- 2025 refresh principles: *"Don't compete for attention you haven't
  earned"*: the sidebar is dimmed a few notches, icons smaller, inactive
  text muted. *"Structure should be felt, not seen"*: fewer dividers,
  softer contrast, rounded edges. Neutral greys moved slightly warmer.
  ([behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh))
- Measured tokens (third-party teardown): 13 px body, 4 px spacing grid,
  32–36 px rows, 8 px radius, hairline borders, elevation by **small
  lightness steps (~2%) instead of shadows**, one accent used only for
  focus ring, brand mark and primary button.
  ([Linear aesthetic decoded](https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026))

### Vercel Geist
- Type is a small set of named roles: Heading (14–72), Label (single
  line, 12–20), Copy (multi-line, 13–24), Button (12–16), plus mono.
  Roles, not random sizes. ([Geist typography](https://vercel.com/geist/typography))
- "Materials": base 6 px radius flat; menus/modals 12 px with more lift;
  fullscreen 16 px. Radius grows with elevation.
  ([Geist materials](https://vercel.com/geist/materials))
- Empty states: icon + title + one sentence that adds information + **one**
  primary action (max two). Don't say "Get started"; use verb + noun.
  ([Geist empty state](https://vercel.com/design/empty-state))

### Radix Colors (used by Radix Themes, shadcn, many dashboards)
- Every colour is a 12-step scale with fixed jobs: 1–2 app/card
  backgrounds, 3–5 component normal/hover/pressed, 6–8 borders, 9–10
  solid fills, 11–12 low/high-contrast text. Greys are slightly **tinted
  toward the accent**. ([Radix colour docs](https://radix-ui.com/themes/docs/theme/color))

### Things 3, Todoist, Sunsama, Akiflow (from using them; no single source)
- **Things 3**: generous but *consistent* whitespace, one typeface, bold
  headings vs. light metadata, tiny accent colour per list, checkboxes are
  the hero. The calm comes from alignment, not from emptiness.
- **Todoist**: list rows ~36 px, priority shown with a coloured checkbox
  ring, metadata in one muted line under the title, red used only for
  "overdue". ([Todoist design notes](https://blakecrosley.com/fr/guides/design/todoist))
- **Sunsama / Akiflow**: the day plan is a vertical timeline next to a task
  column; the "now" line is the only loud element; time labels are
  tabular and right-aligned.

### Apple HIG and Material 3
- HIG: content first, chrome recedes; consistent alignment to a grid;
  44 pt touch targets on touch screens only.
- Material 3: window size classes (compact < 600, medium 600–839,
  expanded 840–1199, large 1200–1599, extra-large ≥ 1600) decide how
  many panes to show. Layouts should **fill** the window by adding
  columns, not by stretching one column.

## 3. Rules we adopted

1. **Type** (Inter, vendored, with Rubik as the Caelestia option):
   12 / 13 / 14 / 16 / 20 / 24 / 32 px. Body 14 px. Weights 400, 500, 600.
   Tabular numbers for times and counts. Tight letter spacing on headings.
2. **Spacing**: 4 px grid (4, 8, 12, 16, 20, 24, 32, 48). Cards 20 px
   padding, list rows 36–40 px, controls 32 px, fields 36 px, gaps 16 px
   (12 px on phones).
3. **Shape**: 8 px controls, 12 px cards, 16 px dialogs. Pills only for
   chips and status dots.
4. **Colour**: keep Caelestia's Material roles (so the app still follows
   the wallpaper) but use them the Radix way: page = surface, card =
   surfaceContainerLow + hairline border, hover = next step up. The accent
   (primary) only for the primary button, focus ring, active nav marker,
   progress and links. Red only for overdue/danger.
5. **Elevation**: flat cards with 1 px borders; shadows only for things
   that float (menus, dialogs, toasts).
6. **Layout**: content fills the window up to 1680 px, centred after that.
   Dashboards use a 12-column grid with fixed spans so rows end flush; no
   holes. Two or three panes on wide screens, one on phones.
7. **Chrome recedes**: sidebar dimmer than content, 32 px rows, small
   icons, group labels in 11 px caps. Top bar 56 px with a hairline.
8. **Empty states**: icon tile + short title + one helpful sentence +
   one action.
9. **Focus**: visible ring only for keyboard focus on controls; never on
   page containers.
10. **Motion**: 120–200 ms, no bouncy springs on everyday controls.

## 4. Where it lives

- Tokens and layout: `frontend/css/base.css` (`--fs-*`, `--sp-*`, `--r-*`,
  surfaces `--bg / --chrome / --panel / --panel-2 / --field`, borders
  `--border-soft / --border / --border-strong`, `--ring`).
- Components: `frontend/css/components.css` (`.btn`, `.card`, `.stat`,
  `.stats-row`, `.bento` + `.s-3/.s-4/.s-6/.s-8`, `.empty`, tables, tabs,
  dialogs). `empty(text, action, icon)` in `core/ui.js` builds an empty state.
- Fonts: `vendor/inter/InterVariable.woff2` (OFL). Rubik stays as an option
  (Settings → Appearance → Font).
- Checks: `scripts/smoke.js` fails on a focus frame round the page or content
  that leaves an empty band, besides the older contrast and control checks.
