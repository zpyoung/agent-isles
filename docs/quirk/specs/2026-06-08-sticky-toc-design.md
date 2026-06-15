# Sticky "On this page" TOC — Design

**Date:** 2026-06-08
**Branch:** `feat/sticky-toc`
**Status:** Approved for planning

## Problem

The rendered "On this page" table of contents is currently a boxed `<nav class="agent-isles-toc">`
card stacked **above** the page content inside a single 960px-wide centered column
(`src/renderer/page.mjs`). It scrolls away immediately, so on any document longer than a screen the
TOC stops being useful as a navigation aid. We want to move it into a **sticky right-hand sidebar**
that stays in view while the reader scrolls.

## Goals

- Render the TOC as a sticky right-hand sidebar beside the content on wide viewports.
- Preserve the current ~960px content reading width.
- Highlight the section currently in view (scroll-spy).
- Degrade gracefully to today's stacked card on narrow viewports.
- Keep the single-column, no-TOC behavior unchanged for short documents (<2 headings) and for
  source-comparison view (`showSource`).

## Non-Goals

- No change to how the TOC entries are collected (`rehypeAgentHeadingAnchors` keeps populating
  `options.toc`).
- No smooth-scroll / animated anchor jumps (out of scope; see Deferred Ideas).
- No collapsible mobile drawer (stacked card is the chosen mobile fallback).

## Decisions Locked

**Layout**
- Right-hand sticky sidebar; content on the left (docs-site convention).

**Width**
- Content column stays at ~960px (`minmax(0, 960px)`); overall page widens to ~1240px to fit the
  sidebar. No narrowing of prose line length.

**Responsive**
- Below the two-column breakpoint (~1200px), the layout collapses to a single column and the TOC
  renders as today's boxed card, stacked **above** the content (visual order preserved via flex
  `order`, DOM order stays content-first for reading/screen-reader order).

**Scroll-spy**
- Yes — a small IntersectionObserver client script highlights the active heading's TOC link
  (`aria-current="location"` + `.is-active`). Injected only when a TOC is present.

**Long TOC**
- Sidebar caps at viewport height (`max-height: calc(100vh - <offset>)`) with `overflow-y: auto`
  so all entries stay reachable while pinned.

**Dark mode fix (in scope)**
- Replace the hardcoded `rgba(255,255,255,0.88)` TOC background with theme variables so the sidebar
  renders correctly in both light and dark themes.

## Architecture

Two pieces change, both already owned by the renderer:

### 1. Page structure — `src/renderer/page.mjs`

`buildHtmlPage` currently builds `mainBody` as `[TOC, content]` joined inside
`<main class="agent-isles-page container py-4">`. New logic:

```
tocHtml  = showSource ? '' : buildTableOfContents(options.toc)   // '' when <2 headings
hasToc   = Boolean(tocHtml)
mainClass = 'agent-isles-page container py-4' + (hasToc ? ' agent-isles-page--with-toc' : '')

mainBody =
  showSource          → pageBody                                   (unchanged)
  hasToc              → <div class="agent-isles-layout">
                          <div class="agent-isles-content"> …content… </div>
                          …tocHtml (the <nav class="agent-isles-toc">)…
                        </div>
  else                → indent(pageBody)                           (single column, unchanged)
```

- `buildTableOfContents` keeps returning the existing
  `<nav class="agent-isles-toc" aria-label="Table of contents">` markup unchanged (preserves the
  existing test assertion in `tests/preview.test.mjs:274`). The sticky/sidebar behavior is applied
  entirely through CSS targeting `.agent-isles-toc` inside `.agent-isles-layout`, plus the new
  wrapper elements.
- A new `buildTocScript()` returns the scroll-spy `<script>` (an IIFE, no external deps), injected
  into the page only when `hasToc` is true. It lives alongside the other `build*Script` helpers and
  is appended in the existing scripts slot.

### 2. Styling — `src/theme/agent-theme.css`

- `.agent-isles-page--with-toc` — raises the page `max-width` to ~1240px (overrides the base 960px
  only when a TOC is present).
- `.agent-isles-layout` — **mobile-first default:** `display:flex; flex-direction:column;`. The
  `.agent-isles-toc` child gets `order:-1` so the card sits above the content (matches today's
  behavior). The TOC keeps its current boxed-card styling here (static position).
- `@media (min-width: 1200px)` — `.agent-isles-layout` switches to
  `display:grid; grid-template-columns: minmax(0, 960px) var(--agent-isles-toc-width, 240px);
  gap: 2.5rem; align-items: start;`. The `.agent-isles-toc` becomes the sticky sidebar:
  `position: sticky; top: 1.5rem; align-self: start; max-height: calc(100vh - 3rem);
  overflow-y: auto; order: 0;`.
- `.agent-isles-content { min-width: 0; }` — prevents grid blowout from long code blocks / wide
  content (pairs with `minmax(0, …)`).
- TOC background/border switched from hardcoded white to `var(--agent-isles-surface)` /
  `var(--agent-isles-border)` so dark mode works.
- `.agent-isles-toc a.is-active`, `.agent-isles-toc a[aria-current="location"]` — active-state
  styling (weight + color via `--agent-isles-primary`, plus a left border/indicator so it is not
  color-only, per WCAG 1.4.11).

### Scroll-spy script behavior

```
links   = [...nav.querySelectorAll('a[href^="#"]')]
targets = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean)
observer = new IntersectionObserver(onIntersect, { rootMargin: '0px 0px -70% 0px', threshold: 0 })
targets.forEach(t => observer.observe(t))
```

- Observes the existing `<span class="agent-isles-heading-anchor" id="…">` elements (the ids the TOC
  links point at).
- On intersection, marks the last-entered heading's link active: add `.is-active` +
  `aria-current="location"`, remove from siblings.
- Pure DOM, no dependencies, guarded by `if (!nav) return;` and a `typeof IntersectionObserver`
  check for safety. ~30–40 lines.

## Edge Cases

| Case | Behavior |
|------|----------|
| <2 headings | `buildTableOfContents` returns `''` → single 960px column, no script (unchanged). |
| `showSource` view | No TOC, no layout wrapper, no script (unchanged). |
| Viewport < 1200px | Flex column; TOC card stacked above content; not sticky. |
| TOC taller than viewport | Internal `overflow-y:auto` scroll within the sticky sidebar. |
| Dark mode | TOC uses theme surface/border vars; readable in both themes. |
| No `IntersectionObserver` (old engine) | Script no-ops; TOC still works as plain anchor links. |
| Wide content (code blocks) | `min-width:0` + `minmax(0,960px)` prevent horizontal blowout. |

## Testing

Extend `tests/preview.test.mjs` (and/or `tests/renderer-modules.test.mjs`):

1. **Existing assertion stays green** — `<nav class="agent-isles-toc" aria-label="…">` still emitted.
2. **Sidebar wrapper present** — rendered HTML for a multi-heading doc contains
   `agent-isles-layout`, `agent-isles-content`, and `agent-isles-page--with-toc`.
3. **Scroll-spy script injected** — output includes the TOC script when a TOC is present…
4. **…and absent** when the doc has <2 headings (single-column path) and in `showSource` mode.
5. **No regression for short docs** — single-heading doc has no layout wrapper and no `--with-toc`.
6. **Dark-mode CSS** — theme CSS no longer contains the hardcoded `rgba(255, 255, 255, 0.88)` TOC
   background (or asserts the var-based rule).

Manual check via `isles render` on a long example doc in both light/dark, wide/narrow.

## Industry Insights

From the brainstorming research swarm (2026):

- **CSS Grid + `align-self: start`** is the standard sticky-sidebar layout; without it the grid
  stretches the sidebar full-height and breaks `position: sticky`.
  ([css-tricks.com/sticky-table-of-contents-with-scrolling-active-states](https://css-tricks.com/sticky-table-of-contents-with-scrolling-active-states/),
  [bram.us](https://www.bram.us/2020/01/10/smooth-scrolling-sticky-scrollspy-navigation/))
- **Sticky's #1 silent failure** is any ancestor with `overflow: hidden/scroll/auto` — confirmed
  none exists on the `<main>`/`<body>` path; keep it that way.
  ([blog.logrocket.com/troubleshooting-css-sticky-positioning](https://blog.logrocket.com/troubleshooting-css-sticky-positioning/))
- **Sticky requires a non-`auto` inset** (`top`) and a `max-height` + `overflow-y:auto` to keep an
  over-long TOC reachable. ([css-tricks.com dynamically-sized sticky sidebar](https://css-tricks.com/a-dynamically-sized-sticky-sidebar-with-html-and-css/))
- **IntersectionObserver** is the reliable scroll-spy approach (vs. scroll-event listeners); CSS-only
  `:target-current` exists but is Chrome-only experimental in 2026 — not production-safe.
  ([sarasoueidan.com/blog/css-scrollspy](https://www.sarasoueidan.com/blog/css-scrollspy/))
- **Accessibility:** don't rely on color alone for the active link (WCAG 1.4.11); hide the sidebar
  on narrow viewports rather than letting it consume mobile screen space.
  ([sheribyrnehaber.com/why-sticky-navigation-can-undermine-accessibility](https://www.sheribyrnehaber.com/why-sticky-navigation-can-undermine-accessibility/))

## Deferred Ideas

- **Smooth-scroll anchor jumps** (`scroll-behavior: smooth` gated on `prefers-reduced-motion`) —
  a nice polish, deferred to keep this change focused on layout + scroll-spy.
- **Collapsible mobile TOC drawer** — considered and rejected for now; stacked card is simpler and
  matches current behavior.

## Files Touched

- `src/renderer/page.mjs` — layout wrapper, `buildTocScript()`, conditional wiring.
- `src/theme/agent-theme.css` — grid/sticky/responsive rules, dark-mode var fix, active-state styles.
- `tests/preview.test.mjs` (and/or `tests/renderer-modules.test.mjs`) — new assertions.
