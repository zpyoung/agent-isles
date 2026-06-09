# Live Mode: Multi-Document Support — Design

**Date:** 2026-06-08
**Status:** Approved (pending implementation plan)
**Branch / worktree:** `feat/live-multi-doc` (`../agent-isles-live-multidoc`)

## Problem

`isles live <dir>` today serves a **single** document — the newest `.md` by mtime
(`resolveNewestScreen`, `src/live.mjs:118`). Multiple `.md` files may coexist in the
folder (the brainstorming companion relies on this to "push" successive screens), but
only the newest is ever displayed. There is no listing, navigation, or way to view any
other document. We want to let users browse **all** top-level documents in the folder
while preserving the existing single-screen "push the latest" flow.

## Goals

- List every top-level `.md` in the folder and let the user view any of them.
- Preserve the companion's behavior: default to newest, and **auto-advance** when the
  agent writes a new screen.
- Keep live-reload calm and targeted — no reload storms, no lost scroll position.
- Zero visual/behavioral regression for the single-document case.
- Preserve the documented `<dir>/state/events` JSONL contract.

## Non-Goals

- Recursing into subdirectories / nested trees (top-level only this iteration).
- A client-side SPA / content-swap router.
- Multi-tab SSE targeting beyond per-document reload (each tab is its own connection).
- Changing `preview <dir>` (static, non-live) behavior.

## Decisions Locked

**Core model**
- Sidebar/index of all top-level `.md` documents; click to view any. Live-reload still
  works per file.

**Default & push**
- Landing (`/`) shows the **newest** doc (current behavior).
- When the agent writes a **new** file, the open viewer **auto-advances** to it.
- A manual sidebar selection holds until the **next** new-file push.

**Reload targeting**
- Only the document you are currently viewing reloads on edit. Edits to other files
  flag them as "updated" in the sidebar; they do **not** reload your view.

**Sidebar ordering & labels**
- Sort **alphabetically by filename**; label entries with the **raw filename**.
- First `<h1>` (falling back to filename) is used as the link tooltip/`title`.

**Routing**
- Clean path slugs: `GET /<slug>` renders that doc; `GET /` renders newest.
- Slug = sanitized filename without `.md`. Resolution is **listing-match only** (never
  string concatenation of slug onto a path) → structurally traversal-safe.

**Subdirectories**
- Top-level only (matches today's non-recursive `readdirSync`).

**Event state**
- Per-document, achieved **additively**: keep the single `state/events` JSONL file;
  stamp each record with `"screen":"<slug>"` and `"screen_file":"<name>"`. Consumers
  filter by `screen` for per-document state. Old consumers ignore the new fields.

**Single-document case**
- With exactly one `.md`, render full-width with **no sidebar chrome** — pixel-identical
  to today. Sidebar appears only at ≥2 documents.

**Approach**
- B: extract focused modules (`live-docs.mjs`, `live-shell.mjs`); evolve `live.mjs` and
  `live-client.js`. Server-rendered per route (no SPA).

## Architecture

### Module map

| Unit | File | Responsibility |
|------|------|----------------|
| Discovery + slug mapping | `src/live-docs.mjs` (new) | `listScreens(dir)`, `resolveSlug(dir, slug)`, slug derivation + collision disambiguation, title extraction |
| Live shell / sidebar HTML | `src/live-shell.mjs` (new) | Build sidebar + frame markup; one-doc vs many-doc layout; active/updated states |
| Server + routing + watcher | `src/live.mjs` (modified) | Route `/`, `/<slug>`, `/__agent-isles/screens`; snapshot diff → typed broadcasts; signal stamping |
| Browser client | `src/live-client.js` (modified) | Typed SSE handling (`live:advance`/`live:reload`/`live:screens`), sidebar refresh, slug-stamped signals |

### `live-docs.mjs`

```
listScreens(dir) -> [{ file, name, slug, mtimeMs, size, title }]   // top-level *.md, sorted by name asc
resolveSlug(dir, slug) -> { file, name, slug, ... } | null         // scans listing, matches slug; no path concat
slugForName(name) -> string                                        // sanitize filename-without-.md
```

- **Slug derivation:** lowercase, strip `.md`, replace unsafe chars with `-`, collapse
  repeats, trim. Reserved slugs (`events`, anything under `__agent-isles`) are suffixed
  to avoid route collisions (e.g. a literal `events.md` → `events-doc`).
- **Collisions:** if two filenames produce the same slug, append a deterministic numeric
  suffix in sorted order (`name`, `name-2`). Because resolution scans the same listing,
  the mapping is always self-consistent within a single request.
- **Traversal safety:** `resolveSlug` never builds a path from user input; it enumerates
  real files via `listScreens` and matches by computed slug. Unknown slug → `null` → 404.

### Routing (`live.mjs`)

Order of matching (reserved first):

1. `GET /events` → SSE (unchanged).
2. `GET /__agent-isles/screens` → `application/json` array from `listScreens(dir)`
   (fields needed by the sidebar: `slug`, `name`, `title`, `mtimeMs`).
3. `POST /__agent-isles/signal` + WS upgrade → unchanged location; now stamps `screen`.
4. `GET /` → render newest (`resolveNewestScreen`), as today.
5. `GET /<slug>` → `resolveSlug`; render that doc, or 404 if unknown.

Rendering reuses `renderMarkdownString({ assetMode:'inline', includeUserPacks:false, projectDir:dir })`
and wraps via the live shell. Delete/disappear races fall back to the existing
`waitingPage()`.

### Live shell / sidebar (`live-shell.mjs`)

- Replaces the body-wrapping portion of `injectLiveFrame`.
- **One doc:** existing header/footer bars + full-width content (no sidebar). No layout
  change vs today.
- **Many docs:** fixed left sidebar column (filenames → `/<slug>`), active item
  highlighted, an "updated" dot on docs changed since last viewed. Content area to the
  right; header/footer bars span the content column.
- Sidebar is rendered server-side on first paint and patched client-side on
  `live:screens` (no full reload).

### Targeted reload (watcher + client)

Watcher (`live.mjs`) keeps the 120ms debounce and snapshot comparison, but computes a
richer diff between `lastSnapshot` and the new snapshot:

| Change detected | Broadcast | Client action |
|-----------------|-----------|---------------|
| File **added** to listing (push) | `live:advance {slug}` | Navigate to `slug` (auto-advance) |
| **Existing** file edited | `live:reload {slug}` | `location.reload()` **iff** `slug` === current |
| File added/removed (membership) | `live:screens` | Re-fetch `/__agent-isles/screens`, patch sidebar |

**Add vs edit is the key distinction.** Auto-advance fires only when a slug is *newly
present* in the listing (a true push) — computed from membership diff, not from
"newest mtime changed." Editing an existing, unviewed doc bumps its mtime but must **not**
steal focus: it emits `live:reload {slug}` (ignored by the client unless it's the current
doc) plus `live:screens` to flag it updated in the sidebar. A file add typically emits
both `live:screens` (membership) and `live:advance` (focus) in the same tick.

- SSE `data:` payloads carry JSON (currently `data: {}`). Multiple typed events may fire
  for one debounce tick (e.g. add + advance).
- Client determines its current slug from `window.location.pathname` (`/` ⇒ resolve to
  newest via the screens list).
- Edits to non-current docs arrive as `live:screens` (with an `updated` marker) rather
  than `live:reload`, so the viewer never reloads for another file.

### Event-state scoping (`appendSignalEvent`, signals)

- Client `sendSignal` includes `screen` (current slug) and `screenFile` (filename) in the
  detail.
- `appendSignalEvent` stamps `screen` + `screen_file` onto the JSONL record written to
  the **same** `state/events` file. Record shape becomes:
  `{"type":"click","choice":...,"text":...,"selected":[...],"screen":"screen-2","screen_file":"screen-2.md","timestamp":...}`.
- `clearEvents` (clear-on-advance) is retained for the companion push loop; clearing
  fires when a **new** screen is pushed (file added → `live:advance`), preserving today's
  single-flow semantics. Editing an existing doc does **not** clear events.
- Contract preserved: `state/events` remains one append-only JSONL file; new fields are
  additive.

## Data Flow

```
agent writes screen-N.md
      │ fs.watch(dir) → debounce(120ms) → snapshot diff
      ▼
live.mjs broadcast: live:advance {slug:"screen-N"} (+ live:screens if membership changed)
      │ SSE /events
      ▼
live-client.js → navigate to /screen-N  (auto-advance)
      ▼
GET /screen-N → resolveSlug → renderMarkdownString → live-shell wrap → HTML
      ▲
user clicks option → agent-isles:select → sendSignal({...,screen:"screen-N"})
      │ WS /__agent-isles/signal
      ▼
appendSignalEvent → state/events (JSONL, stamped with screen)
```

## Error Handling

- Unknown slug → 404 (no path built from input).
- File deleted between list and read → `waitingPage()` fallback (existing pattern).
- `fs.watch` throws / unavailable → degrade to no-live-reload (existing `catch` keeps the
  server serving). Multi-doc browsing still works without push/auto-advance.
- `readdir` failure → empty list → `waitingPage()` (existing).
- Slug collision → deterministic suffixing; never 500.

## Testing

Extend `tests/live.test.mjs` and `tests/browser/`:

- `listScreens`: ordering (alphabetical), slug derivation, title extraction, collision
  suffixing, top-level-only (ignores subdirs).
- `resolveSlug`: known slug resolves; unknown → null; traversal attempts
  (`..%2f`, encoded, `events`) never escape `dir`.
- Routing: `/` = newest; `/<slug>` = that doc; reserved routes win; 404 on unknown slug.
- Single-doc: no sidebar markup emitted (regression guard).
- Many-doc: sidebar lists all, active highlighted; `/__agent-isles/screens` JSON shape.
- Watcher/broadcast: new file → `live:advance`; current-doc edit → `live:reload`;
  other-doc edit → `live:screens` only (no `live:reload`); add/remove → `live:screens`.
- Signals: record stamped with `screen`/`screen_file`; `state/events` stays a single file;
  clear-on-advance still fires.
- Browser (`tests/browser/`): auto-advance navigation; manual click holds until next push;
  sidebar updated-badge; per-doc reload isolation.

## Backwards Compatibility

- `state/events` remains a single JSONL file; new fields additive → existing
  consumers (`docs/component-vocabulary.md`, wiki) keep working.
- Single-document sessions are visually/behaviorally identical (no sidebar).
- `GET /` still serves newest; existing bookmarks to `/` unaffected.
- CLI surface unchanged: `isles live <dir> [...]` (still directory-only).
- `server-info` / `server-stopped` / idle-timeout / owner-pid lifecycle unchanged.

## Industry Insights

- **Folder exposure patterns** (Markserv, VitePress, MkDocs, Docsify): route-per-file +
  sidebar is the dominant model; auto-generated nav avoids stale navigation when files are
  added. We adopt route-per-slug + server-rendered sidebar refreshed on membership change.
  Sources: VitePress file-based routing (https://vitepress.dev/guide/getting-started),
  MkDocs nav auto-generation (https://www.mkdocs.org/user-guide/configuration/),
  Markserv directory index (https://github.com/markserv/markserv),
  Docsify sidebar (https://github.com/docsifyjs/docsify).
- **Reload targeting:** reloading the whole page on any change disrupts scroll/state;
  best practice is to broadcast which file changed and reload only if it's the viewed one.
  We scope `live:reload` to the current slug. Source: live-server
  (https://github.com/tapio/live-server).
- **Path traversal:** `path.normalize`/`path.join` do **not** secure user-supplied paths;
  encoded/double-encoded `..`, null bytes, absolute paths, and symlinks all bypass naive
  checks. We avoid the class entirely by resolving via listing-match, not path
  construction. Source: https://nodejsdesignpatterns.com/blog/nodejs-path-traversal-security/.
- **fs.watch quirks:** macOS FSEvents always recurses and coalesces/duplicates events;
  `null` filename forces a directory restat; debouncing is mandatory. The existing 120ms
  debounce + snapshot diff already mitigates this; we keep and extend it rather than add a
  new watcher. Sources: nodejs/node#47058, nodejs/node#3042, Node fs docs.
- **SSE:** unidirectional, auto-reconnects (~3s); typed events via `event:` lines (already
  used). Each browser tab is its own connection — we target reloads by slug in the data
  payload, not by tab. Source: MDN Using server-sent events.

## Deferred Ideas

- Recursive subdirectory support + nested sidebar tree (explicitly out of scope this
  iteration; slug-collision-across-folders and recursive-watch cost noted).
- Per-slug `state/events/<slug>/` directory (rejected: breaks documented contract).
- Prev/next pagination and breadcrumbs (sidebar-only navigation chosen).
- Sidebar open/close state persistence via localStorage.
- H1-title sidebar labels (chose raw filenames; H1 retained only as tooltip).
