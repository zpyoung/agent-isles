# Live View Settings Menu — Design

- **Date:** 2026-06-23
- **Status:** Approved (pending implementation plan)
- **Scope:** Add a viewer-facing settings menu to the Agent Isles "live" view chrome.

## Overview

The live view (`src/live.mjs` + `src/live-shell.mjs`) is a real-time agent-screen
server. It injects fixed chrome into every served page: a header bar that currently
shows only the static text "Agent Isles Live" ([live-shell.mjs:41](../../../src/live-shell.mjs)),
an optional left sidebar for multi-screen navigation, and a footer indicator bar.
There are no viewer controls in that chrome today — theme switching exists only as an
embeddable Markdown island (`<agent-theme-toggle>`), not as session-level chrome.

This feature adds a **settings menu** to the live header so viewers can adjust theme
and reading preferences for the whole live session. Most of the underlying machinery
already exists: theme persistence is wired (`localStorage['agent-isles-theme']` +
`agent-isles-theme-change` event), and the reading preferences map directly to CSS
variables the theme already consumes (`--agent-isles-page-max-width / -font-size /
-line-height`). The interactive editor view (`src/preview.mjs`) already exposes an
equivalent reading-controls UI with established presets — this feature mirrors those
presets in the live view for consistency.

## Approach (selected)

**Bake the menu into the live chrome (no new component).** The settings menu is
live-view-specific chrome, not a reusable Markdown island, so it lives in the two
files that already produce that chrome rather than in a new Lit Web Component. It uses
the native HTML Popover API (Baseline 2025).

Alternatives considered and rejected:

- **Lit Web Component `<agent-settings-menu>`** — most consistent with the island
  model and reuses the theme machinery, but the user opted to avoid a new component;
  the menu is not needed outside the live view.
- **Light-DOM Lit component** — simpler CSS-variable inheritance but loses
  encapsulation and diverges from every other component's Shadow-DOM pattern.

## Architecture & Files

| File | Change |
|------|--------|
| `src/live-shell.mjs` | Header markup becomes `title + spacer + gear button`; emit the `<div id="isles-settings" popover="auto">` panel; add panel/control CSS to the existing `overlayStyle` block; gate any panel animation behind `@media (prefers-reduced-motion: no-preference)`. |
| `src/live-client.js` | Append a self-contained settings module to the `LIVE_CLIENT` IIFE: load saved settings → apply → wire control clicks → persist → cross-tab sync → reset. |
| `tests/live-shell.test.mjs` | Add assertions that `injectLiveFrame` emits the gear button + popover panel markup. |
| `tests/browser/live-settings.spec.mjs` | New Playwright spec (modeled on `live-choice.spec.mjs`) that boots the live server and exercises the menu end to end. |

### Component boundaries

- **`live-shell.mjs`** owns *structure and style* of the chrome (pure string output,
  no behavior). Adding the menu keeps it a presentation concern: markup + CSS only.
- **`live-client.js`** owns *behavior* on the page. The new settings module is a
  self-contained block within the existing IIFE; it reads/writes storage, applies CSS
  variables and the theme attribute, and listens for cross-tab `storage` events. It
  shares no state with the SSE/WebSocket logic already in the file beyond living in the
  same closure.

## UI & Controls

The trigger is a **gear icon only** (`<button popovertarget="isles-settings"
aria-label="Settings">`) at the right end of the header bar. Opening it reveals a
popover panel containing three segmented control groups plus a footer, mirroring the
presets in [preview.mjs:550-558](../../../src/preview.mjs):

- **Theme:** Light / Dark / Auto
- **Width:** Focus `760px` / Comfort `960px` / Wide `1200px`
- **Text:** Small `15px·1.65` / Regular `16px·1.7` / Large `18px·1.75`
- **Footer:** "Reset to defaults" link + a small `✕` close button

Defaults (match `agent-theme.css` `:root` and `preview.mjs`): theme = Auto, width =
Comfort (`960px`), text = Regular (`16px` / `1.7`).

Because the panel uses `popover="auto"`, it renders in the browser top layer — it sits
above the chrome's `z-index: 99999` with **no z-index fighting** (it escapes the
stacking context entirely), and Esc-to-close + click-outside dismiss are automatic.
The `✕` button is an explicit, discoverable third dismissal path. The panel is
positioned `fixed` at top-right under the gear (avoids the less widely supported CSS
Anchor Positioning).

## Data Flow & Persistence

### Reading preferences (width, text)

- Persisted as JSON under a **new** key `agent-isles-live-settings`,
  e.g. `{ "themeMode": "auto", "width": "960px", "fontSize": "16px", "lineHeight": "1.7" }`.
- Applied by setting the CSS variables on `document.documentElement.style`:
  `--agent-isles-page-max-width`, `--agent-isles-page-font-size`,
  `--agent-isles-page-line-height` — the exact variables `agent-theme.css` consumes.
- Applied **on every page load** (each live-reload / live-advance navigation is a full
  page load, so the on-load apply step covers post-navigation re-application).

### Theme (interop with the existing system)

- The explicit Light/Dark choice reuses the existing `agent-isles-theme` localStorage
  key and dispatches the existing `agent-isles-theme-change` event, so a present
  `<agent-theme-toggle>` island stays in sync.
- The settings module applies the theme itself (so it works with no toggle island
  present): set `data-bs-theme` + `style.colorScheme` on `document.documentElement`,
  and set `data-bs-theme` on all `agent-*` elements, with a `MutationObserver` for
  late-loaded components. This is a small, self-contained re-implementation of
  `applyDocumentTheme` / `applyThemeToAgentComponents` from
  [agent-theme-toggle.js:212-233](../../../src/components/agent-theme-toggle.js) — the
  one real cost of the no-component approach. (Future option: extract a shared helper
  to remove the duplication.)
- **Auto** = follow `prefers-color-scheme` live (subscribe to the media query). The
  mode (`"auto"`) is stored in the `agent-isles-live-settings` JSON; the *effective*
  light/dark value is mirrored to `agent-isles-theme` so a present toggle reflects the
  right state. The existing toggle only understands `light`/`dark`, so storing the
  `auto` concept separately preserves backward compatibility.

### Cross-tab sync, fallback, reset

- **Cross-tab sync:** a `window` `storage` listener re-applies settings when either key
  changes in another tab/window.
- **localStorage failure** (file://, private mode, locked-down contexts): read/write
  wrapped in `try/catch`, falling back to in-memory state, mirroring the toggle's
  existing pattern ([agent-theme-toggle.js:196-210](../../../src/components/agent-theme-toggle.js)).
- **Reset to defaults:** clears `agent-isles-live-settings`, restores the default CSS
  variables, and sets theme back to Auto. One click, no confirmation (low-stakes,
  trivially re-adjusted reading prefs).

## Accessibility & Edge Cases

- Segmented buttons use `role="group"` + `aria-pressed` (matching `preview.mjs`),
  visible focus rings, and arrow-key navigation within each group.
- Focus returns to the gear button on close (native popover behavior).
- The menu is **always present**, independent of the 2+ screen sidebar.
- Respect `prefers-reduced-motion`: any panel transition is gated behind
  `@media (prefers-reduced-motion: no-preference)`.
- HTML escaping is unchanged — the menu markup is static (no user-derived strings).

## Testing

- **Unit** (`tests/live-shell.test.mjs`): assert `injectLiveFrame` output contains the
  gear `<button popovertarget>` and the `<div id="isles-settings" popover>` panel with
  the three control groups.
- **Browser** (`tests/browser/live-settings.spec.mjs`, modeled on
  [live-choice.spec.mjs](../../../tests/browser/live-choice.spec.mjs)):
  1. Boot the live server against a temp dir; open the page.
  2. Open the menu (click gear) → panel visible.
  3. Click Text → Large → assert `--agent-isles-page-font-size` on `:root` is `18px`.
  4. Reload → assert the setting persisted (read from `:root`).
  5. Toggle Theme → Dark → assert `documentElement[data-bs-theme] === "dark"`.
  6. Click Reset → assert variables/theme return to defaults.
  7. Esc closes the popover; focus returns to the gear.

## Decisions Locked

**Menu form & placement**
- Gear-icon **popover** (native Popover API), not a drawer or modal.
- Trigger is a **gear icon only** (`aria-label="Settings"`), right end of the header.
- Dismiss via **Esc + click-outside + explicit close button**.

**Which settings to expose**
- Core (all four): **Theme** (light/dark/auto), **Font size**, **Line height**,
  **Content width**.
- Extras: user had no preference → honor `prefers-reduced-motion` automatically (no
  toggle); sidebar-visibility toggle and density scale deferred.

**Persistence & scope**
- **Persist across sessions** via localStorage (in-memory fallback).
- **Sync across tabs** via the `storage` event.
- **One-click reset to defaults** (no confirmation).
- Reading prefs in new key `agent-isles-live-settings`; theme reuses
  `agent-isles-theme` + `agent-isles-theme-change`.

**Accessibility & dismissal**
- Native popover top-layer (above `z-index:99999`, no z-index fighting); `role="group"`
  + `aria-pressed` on segmented controls; focus return on close.

**Implementation approach**
- Bake into `live-shell.mjs` + `live-client.js` (no new component).

**Controls style**
- Discrete **preset buttons** (mirroring `preview.mjs`), not continuous sliders.

## Industry Insights

From the brainstorming research swarm (2026):

- **Native HTML Popover API is Baseline (April 2025)**: `popover="auto"` provides
  Esc-to-close, light-dismiss, focus management, and implicit ARIA with minimal code —
  no framework needed. (MDN: Popover API, Using the Popover API.)
- **Top layer escapes stacking contexts**: popover/top-layer rendering avoids the
  `z-index` escalation trap. The general fix for stacking issues is `isolation: isolate`
  rather than ever-larger z-index values. (Smashing Magazine, "Unstacking CSS Stacking
  Contexts", 2026; generalistprogrammer.com z-index guide, 2026.)
- **Configuration overload is the #1 settings anti-pattern**: strong defaults beat
  endless toggles; ~64% of enterprise features are rarely/never used. Use progressive
  disclosure and keep the surface small. (featurebloat.com; minimum-code.com UI/UX
  best practices, 2026.) → drove the lean core-4 + deferred-extras decision.
- **Persistence pitfalls**: non-persistence is a top frustration; multi-tab writes can
  race; `localStorage` can throw in Safari private mode / sandboxed contexts — always
  test write capability and fall back. (michalzalecki.com "why using localStorage
  directly is a bad idea"; ember-simple-auth multi-tab race issues.) → drove the
  `storage`-event sync and `try/catch` in-memory fallback.
- **Reset UX**: missing reset is a recovery gap; destructive resets need confirmation,
  but low-stakes prefs can reset in one click. (designmonks.co reset-button UI.)
- **Common reader settings across dev tools** (Storybook, Chrome DevTools, VitePress,
  Docusaurus): theme (light/dark/system), font size, line height, content width,
  reduce-motion — matches the chosen control set. (Storybook toolbars docs; Chrome
  DevTools preferences; VitePress appearance; Docusaurus theme config.)

## Deferred Ideas

- **Sidebar-visibility toggle** — show/hide the multi-screen nav for more reading room.
- **Density scale** (compact/comfortable) — risks bloat; the table already has its own
  density variant.
- **Explicit reduce-motion toggle** — honored automatically via the media query for
  now; a manual override could be added later.
- **Shared theme-applier helper** — extract `applyDocumentTheme` logic so live-client
  and `agent-theme-toggle` don't duplicate it.
