# `agent-table` island — design

**Date:** 2026-06-09
**Status:** Approved — pending implementation (revised after a codebase-validated Fable review)
**Topic:** A read-only, "Airtable-style" typed-table island (`<agent-table>` via a fenced ```agent-table block) that renders agent-authored tabular data richer than a plain Markdown table — typed columns, status pills, in-browser sort/group — while keeping the source boring, git-diffable, and the rendered artifact inert and accessible.

## Problem

Agents frequently emit tabular data in artifacts: task lists, risk registers, comparison matrices, release checklists. Plain GFM Markdown tables (already supported via `remark-gfm`) render, but they are untyped — numbers don't align, statuses are plain text, there's no sorting or grouping, and there's no way for an agent or human to cite a specific row. The existing islands (`agent-status-board`, `agent-kanban`, `agent-gantt`) each solve a narrow shape; none covers "a real table of typed rows."

The risk is equally clear. Agent Isles is **deliberately not a data-app framework** (README: use a purpose-built stack for "heavy data exploration"). Both context-research agents independently flagged that "a table inside a document that can edit itself tends to grow into a data app" — scope creep is the central hazard. The design must add table value **without** crossing into framework territory.

## Goals / Non-goals

**Goals**
- A `<agent-table>` island authored as a fenced ```agent-table block: a typed `key: value` header + `---` + a GFM Markdown table of rows.
- Typed columns (v1): `text`, `number`, `status`, `select`, `date`, `url`, `boolean`, `multi-select`.
- In-browser, read-only interactivity: column **sort** (always on) and **group-by** (opt-in via header). State is ephemeral.
- The rendered HTML artifact contains a **real semantic `<table>`** that is accessible and complete even with no JavaScript.
- Per-row citation badges + stable, **server-emitted** ids, so agents/humans can reference "row #2" even in the static artifact.
- Dark-mode parity with the existing component library, via Agent Isles theme tokens.
- A data model that keeps a future constrained-writeback phase feasible without a redesign (it still requires a documented contract extension — see Writeback-readiness).

**Non-goals**
- **No writeback / inline editing in this scope.** The source `.md` is canonical and never mutated by the rendered view (designed writeback-ready, not built).
- **No live, fetched, computed, or derived data — ever.** No formulas, rollups, external queries, server-backed state. This is the hard scope fence.
- No `filter` controls or saved/author-declared "views" in v1 (deferred — see Deferred Ideas).
- No virtualization, pagination, charts, or pivots.
- Not a general data grid; `role=grid` is explicitly avoided.

## Scope boundary (the central decision)

The decisive framing from brainstorming: a read-only table over source-authored rows **is** a mini read-only database, and that is *on-identity* for Agent Isles because the data lives in the `.md` file — the island is just a richer rendering of a document artifact. The README's "not a data-app framework" warning is really about two things we avoid:

1. **Data that lives somewhere other than the source** (fetched/live/computed). → Never.
2. **The rendered view mutating state** (writeback editing). → Deferred, gated, designed-for but not built.

Everything in v1 sits firmly in the read-only, source-authored lane.

## Authoring format

A fenced block whose header carries column types and whose body is a normal GFM Markdown table — chosen for maximum source readability and clean per-row diffs, and mirroring `agent-flow`'s `key: value` header + `---` + body precedent (verified: `src/renderer/rehype-plugins.mjs` already parses exactly this shape for `agent-flow`).

````markdown
```agent-table
title: Launch readiness
columns: task:text | owner:text | status:status | effort:number | spec:url
group-by: status
sort: effort desc
---
| Task           | Owner  | Status  | Effort | Spec                               |
| -------------- | ------ | ------- | ------ | ---------------------------------- |
| Writeback API  | Zach   | at-risk | 5      | ./specs/writeback.md               |
| Renderer slice | Merlin | done    | 3      | https://github.com/x/agent/pull/138 |
| Dark mode      | Merlin | blocked | 2      | https://github.com/x/agent/issues/136 |
```
````

Header keys (all optional except `columns`):

| Key | Meaning | Default |
| --- | --- | --- |
| `title` | Accessible `<caption>` for the table | none |
| `columns` | `key:type` pairs separated by `\|` | required; each maps positionally to a table column |
| `sort` | initial sort, `<key> [asc\|desc]` | source order |
| `group-by` | single-value column key to group rows under collapsible lanes (client-side) | ungrouped |

### Column types and value grammar

`text` (default), `number`, `status`, `select`, `date`, `url`, `boolean`, `multi-select`. An **untyped** column is `text` — no value inference (explicit over implicit, per Agent Isles conventions). A cell value that does not match its declared type renders as **plain text** (graceful fallback), never an error or crash. To make per-type coercion testable, v1 fixes these grammars:

- `number` — parsed with `Number()`; non-finite → raw-text fallback. Sort uses the numeric value via `data-sortval`.
- `date` — ISO-8601 (`YYYY-MM-DD`, optional time); unparseable → raw-text fallback. Display is a friendly format; `data-sortval` is the ISO string (lexicographically chronological).
- `status` — reuses the `agent-status-board` tone vocabulary (`green`/`amber`/`red`/`grey` + aliases). Pill carries a text label (never color-only).
- `select` — single token → one neutral chip.
- `boolean` — `true`/`false`/`yes`/`no`/`x`/empty → check / dash glyph **plus** an accessible text label.
- `multi-select` — **comma-separated** (pipes are taken by the table syntax) → multiple chips.
- `url` — see Security: only `http(s):`, `mailto:`, and relative URLs become links; anything else (e.g. `javascript:`) renders as plain text.

Cell text is parsed through the **GFM inline** parser, so `**bold**`, `` `code` ``, and inline links work in a cell; raw/dangerous HTML is never allowed (this is also why rows must go through the real GFM parser, not a hand-rolled `split('|')` — it correctly handles escaped pipes and inline code containing pipes).

## Architecture

**Approach A — light-DOM progressive enhancement** (chosen unanimously by the accessibility research). The fenced block is parsed **server-side** in the render pipeline, which emits a real semantic `<table>`; the Lit component enhances that table **in place in light DOM**.

```
isles render
  └─ remark parse ─> mdast `code` node (lang="agent-table")
       └─ agent-table transform (rehype-plugins.mjs, runs pre-rehypeRaw like agent-flow)
            ├─ split on first `---`
            ├─ parseHeader()  -> {title, columns, sort, groupBy}
            ├─ parseRows()    -> row objects (nested unified+remark-gfm parse of the body)
            ├─ coerceCell()   -> typed render model (+ raw-text fallback, url protocol guard)
            └─ buildHast()    -> <agent-table ... [fence position copied on]>
                                   <div class="agent-table-scroll">
                                     <table>
                                       <caption> title </caption>          (if title)
                                       <thead> plain <th scope="col"> … </thead>
                                       <tbody> rows w/ data-row-id + #n badge,
                                               data-sortval on typed cells </tbody>
                                     </table>
                                   </div>
                                 </agent-table>
  └─ rehype-raw + (sanitized mode) sanitize  → custom schema allows the agent-table subtree
  └─ page ships a WORKING accessible <table> immediately (no dead controls)
       └─ agent-components.js upgrades <agent-table> in the browser:
            injects sort buttons into <th> (type-aware compare via data-sortval, sets aria-sort),
            builds group lanes (multiple <tbody> + toggle button — NOT <details>),
            density class, sticky-col scroll wrapper
```

No-JS readers get the full, accessible table with **no dead controls**. JS adds interactivity only.

**Where sort/group happen (resolves the implementer ambiguity):**
- The author-declared `sort` is applied **server-side**, so the emitted row order already reflects it and a no-JS reader sees the authored ordering. The component re-sorts in place on header click.
- The emitted `<table>` is always **flat** (a single `<tbody>`). `group-by` is a **client-side enhancement only** — a no-JS reader sees the flat (sorted) table, not lanes.

### Why light DOM (not the shadow-DOM convention of other islands)

A native `<table>` is screen-reader-correct with zero ARIA-grid work; `role=grid` is over-engineered for read-only data and shadow DOM *breaks* cross-root ARIA and renders nothing without JS. Light DOM also inherits `data-bs-theme` directly (verified: theme tokens live at `:root`/`[data-bs-theme="dark"]` on the document, so a light-DOM table gets dark mode for free and **avoids** the `AGENT_COMPONENT_TAGS` shadow-propagation registration that other islands need). Accepted cost: `agent-table` styles live in `agent-theme.css` rather than scoped `css\`\``, unlike the other islands. (Bootstrap collision risk is limited to reboot styles on bare `table`/`th`/`caption`, since the `.table` class is never applied — see the `caption-side` note in Modules.)

## Group-by mechanism (MUST be this, not `<details>`)

`<details>`/`<summary>` **cannot legally wrap `<tr>`s** inside a `<table>`, so the status-board/gantt disclosure pattern does not transfer. Group-by is implemented at upgrade time by reorganizing rows into **one `<tbody>` per group** (multiple `<tbody>` is valid HTML), each preceded by a **group-header row** (`<tr><th colspan>` containing a `<button aria-expanded>`); collapsing toggles `hidden` on that group's `<tbody>`. Group counts render in the header row.

`group-by` is only valid on a **single-value** column (`text`/`select`/`status`/`boolean`/`date`/`number`). If pointed at a `multi-select` column it falls back to ungrouped + a soft warning (avoids the "row appears in N lanes" duplication problem). The `#n` citation badge is **source-order identity** and does **not** renumber after client-side sort or group.

## Modules

| File | Change | Responsibility |
| --- | --- | --- |
| `src/renderer/agent-table.mjs` | **new** | Pure logic: `parseHeader`, `parseRows` (nested GFM parse), `coerceCell` (incl. url protocol guard), `buildHast`. Unit-tested in isolation. |
| `src/renderer/rehype-plugins.mjs` | extend | Register the fenced `agent-table` transform (mirrors `agent-flow` wiring, runs before `rehypeRaw`); copies the fence node `position` onto the emitted `<agent-table>` for future writeback. |
| `src/renderer/sanitize.mjs` | extend | Add `agent-table` host attrs (`density`, `title`, …) to `coreSanitizedSchema.attributes`; allow `<caption>` (not in the default schema) and the emitted `<table>` subtree. `table/thead/tbody/tr/th/td`, `scope`, `data-*`, `aria-*` are already permitted. |
| `src/components/agent-table.js` | **new** | Light-DOM Lit component (`createRenderRoot(){return this}`): inject sort buttons, group lanes (multi-`<tbody>`), density, sticky-scroll. Ephemeral per-instance state. |
| `src/components/index.js` | extend | Register `<agent-table>`. |
| `src/theme/agent-theme.css` | extend | Table/pill/chip/badge styles, light + dark tokens, comfortable/compact density, sticky first column, **`caption-side: top`** (overrides Bootstrap reboot's `caption-side: bottom`/muted). Add as a clearly delimited section (it will be the largest addition to the 192-line file). |
| `docs/component-vocabulary.md` (+ `docs/wiki/Component-Vocabulary.md`) | extend | Document the `agent-table` syntax, attributes, types, trusted/sanitized behavior. |
| `examples/demo.md` | extend | A worked `agent-table` example for the demo/gallery + browser smoke. |

## Component behavior (light-DOM enhancement)

- `connectedCallback`: locate the emitted `<table>`; **inject** a sort `<button>` into each `<th>` (so no-JS has no dead controls) and wire a type-aware comparator using `data-sortval`; maintain `aria-sort`.
- `group-by` set on a valid column → reorganize into per-group `<tbody>` blocks with toggle header rows (see Group-by mechanism).
- Density attribute toggles a CSS class (comfortable default, `density="compact"` opt-in).
- Narrow screens: a scroll wrapper with the first column sticky.
- State (active sort, expanded lanes) lives on the instance only — **ephemeral**, resets on reload.

## Security

- **URL protocol allowlist (both render modes).** `coerceCell` for `url` only emits an `<a href>` for `http(s):`, `mailto:`, or relative URLs; any other scheme (notably `javascript:`) renders as plain text. This is enforced in the transform itself, because sanitize runs **only in sanitized mode** — trusted mode would otherwise ship the link verbatim.
- **No raw HTML from cells.** Cell content is produced via the GFM inline parser, never by injecting source text as HTML; sanitized mode additionally strips anything off-allowlist.
- **Row ids use `data-row-id`, not `id`.** rehype-sanitize clobbers `id` with a `user-content-` prefix, which would make ids differ between trusted and sanitized renders; `data-*` passes through untouched, keeping `#n`/citation identity stable across modes.

## Error handling (never crash a render)

| Condition | Behavior |
| --- | --- |
| Missing `---` / unparseable header | Render the block as a plain code fence + build warning. |
| Header OK but body is not a GFM table (e.g. missing `\|---\|` delimiter row) | Same plain-code-fence fallback + warning. |
| Row/column count mismatch | Pad or truncate to the column set; warn. |
| Unknown type token | Treat as `text`. |
| Bad cell value for its type | Raw-text fallback (no formatting, no error). |
| `url` cell with a disallowed protocol | Plain text, link suppressed (both modes). |
| `group-by` targets a `multi-select` column | Ungrouped + soft warning. |
| `> ~200` rows | Render all + soft build-time warning nudging toward a real data tool. No virtualization. |
| Zero rows | Render typed header + an empty-state row. |
| Multiple tables on a page | Per-table id prefix on `data-row-id`, **emitted server-side** so `#n` ids are unique in the static HTML (status-board does this client-side; agent-table cannot rely on a runtime counter). |

Build warnings surface via a small renderer warning path (stderr/`console.warn`) — the pipeline has no warning channel today, so this is new (minimal) plumbing.

## Accessibility

Native `<table>` semantics throughout; `<th scope="col">`; sort controls are buttons **injected by JS** (so the static artifact has no dead controls) exposing `aria-sort`; `status` and `boolean` carry text labels (never color-only); group lanes use a `button`+`aria-expanded` over multiple `<tbody>` (not `role=grid`, not shadow-DOM ARIA). The static (pre-JS) artifact is already fully navigable.

## Testing

- **Unit (`node --test`, `tests/agent-table-parse.test.mjs`):** header parsing; `columns` spec parsing; nested GFM row parse (incl. escaped pipes / inline code); each type's coercion/formatting incl. value grammar; bad-value fallback; **url protocol suppression**; `data-sortval` extraction; `data-row-id`/badge generation; `group-by`-on-`multi-select` fallback; body-not-a-table fallback.
- **Sanitized-mode tests:** `<agent-table>` + `<caption>` + `<table>` subtree survive sanitize; host attrs preserved; `data-row-id` not clobbered; disallowed-protocol url still suppressed.
- **Browser (Playwright):** static table present *before* enhancement with no dead controls; injected header button sorts + flips `aria-sort`; `group-by` builds collapsible `<tbody>` lanes; dark-mode parity; sticky first column on a narrow viewport; citation ids stable across multiple tables.

Verification standard (per `AGENTS.md`): run build/tests, render an example, confirm the generated HTML includes the `<table>` + component script, and use a browser/screenshot check for interactive behavior.

## Writeback-readiness (deferred, not built)

Keeping a future constrained-writeback phase feasible **without a redesign** requires, and v1 lays only the groundwork for:

1. **A contract extension.** `docs/writeback-contract.md` validation rule 6 only accepts `agent-*` tagNames or the markdown-checkbox kind — a `<td>` target fails today. Cell writeback needs a new target kind (e.g. `agent-table-cell`) added to the contract and to `rehypeAgentWritebackMetadata`.
2. **Position arithmetic.** v1's transform copies the **fence node `position`** onto the emitted `<agent-table>` (agent-flow's replacement node carries none today). Nested-parse positions are **body-relative**, so a later writeback phase must translate fence-offset → file-offset to patch a specific cell.

Operations would stay narrow (`agent-table:set-status` / `agent-table:set-boolean` for constrained-token cells); free-text/number cell editing stays out (the contract forbids arbitrary browser-supplied replacement text). **Nothing in v1 emits writeback metadata.**

## Decisions Locked

**Scope**
- Read-only ceiling for v1; data model kept writeback-friendly but writeback not built.
- No live, fetched, computed, or derived data, ever.

**Authoring format**
- Fenced ```agent-table block: typed `key: value` header + `---` + GFM Markdown-table rows.
- Rows parsed via a nested unified/remark-gfm pass; cell text via the GFM inline parser; no `split('|')`.

**Column types**
- v1 types: `text`, `number`, `status`, `select`, `date`, `url`, `boolean`, `multi-select`.
- Untyped column → `text`, no value inference. Bad cell value → graceful raw-text fallback.
- Value grammar fixed: ISO-8601 dates, comma-separated multi-select, `Number()` numbers.
- `status` reuses the `agent-status-board` tone vocabulary.
- `url` cells: http(s)/mailto/relative only; other schemes → plain text (both modes).

**Read-side interactivity**
- v1: `sort` (always on) + `group-by` (opt-in via header). Filter and saved views deferred.
- Sort applied server-side for the default order; component re-sorts on click. State ephemeral; no localStorage.
- Group-by via multiple `<tbody>` + toggle button (not `<details>`); valid only on single-value columns; `multi-select` target → ungrouped + warn.
- `#n` badges are source-order identity and do not renumber after sort/group.

**Layout & responsive**
- Narrow screens: horizontal scroll with sticky first column.
- Density: comfortable default, `compact` opt-in.
- Large tables: render all + soft warning above ~200 rows (no virtualization).
- Per-row citation badges + stable **server-emitted** `data-row-id`s.
- Dark mode via Agent Isles theme tokens; `caption-side: top` override for Bootstrap reboot.

**Architecture**
- Approach A: rehype plugin emits a semantic `<table>`; Lit component enhances it in light DOM. Server-side parsing. `agent-table` styles in `agent-theme.css`. Sort buttons injected by JS (static `<th>` are plain).

## Industry Insights

Distilled from four parallel research agents (2026 sources) and the codebase-validated review.

- **Scope creep is the dominant table-feature failure mode.** Editable tables in documents drift toward full data apps; bounded teams set a strict feature fence and keep editing constrained/exported rather than free-form. Drove the read-only ceiling + hard "no live/computed data" fence. (telerik.com; shopify.com/partners feature-creep; Airtable two-way-sync docs.)
- **Light-DOM native `<table>` beats shadow-DOM `role=grid` for read-only tables** — consensus was lopsided. `role=grid` is for interactive/cell-selectable widgets; shadow DOM breaks cross-root ARIA (`aria-labelledby`/`describedby` can't cross the boundary) and shows nothing without JS. UI5 Web Components' 2024 redesign moved ARIA into light DOM. Drove Approach A. (nolanlawson.com; igalia.com; MDN grid role; W3C APG; frontendmasters.com light-DOM-only; Raymond Camden table-sort 2025.)
- **Virtualization is unnecessary and harmful below a few hundred rows** — it breaks screen-reader access to off-viewport rows. Confirmed render-all + soft-warning. (dev.to data-table virtualization; reactdatagrid.io.)
- **Parse fenced blocks server-side**, configure `rehype-sanitize` with a custom schema or custom elements get stripped. Correction to an earlier note: `remark-rehype` does **not** drop positions wholesale — rather, transform-*created* replacement nodes carry no position and nested-parse positions are body-relative, so writeback needs explicit fence-offset→file-offset carry-through. (unifiedjs.com recipes/guides; rehype-sanitize npm; verified against `rehype-plugins.mjs`.)
- **Inline-edit data-integrity hazards** (async write races, source-of-truth ambiguity when a table is generated from a source file, non-editable computed columns) justify deferring writeback and, when it lands, scoping it to constrained-token operations only. (Airtable two-way-sync docs; telerik.com.)

## Deferred Ideas

- **Filter controls** (per-column, removable filter chips) — valuable but the heaviest UI/empty-state surface; deferred from v1.
- **Saved / author-declared views** (named filter+sort+group presets as tabs) — most powerful but the most parsing/UI work and the first "database app" smell; deferred.
- **Inline writeback editing** (constrained `status`/`boolean`/`select` cell edits patching source via the writeback contract) — explicitly out of the read-only ceiling; data model kept ready, but it requires the documented contract extension above.
- **`multi-select` kept in v1** at the user's request despite being a mild "becoming-a-database" smell. Concrete cost contained: `group-by` on a `multi-select` column is unsupported (ungrouped + warn) rather than introducing multi-lane row duplication.
- **localStorage state persistence** — considered and rejected for v1 in favor of ephemeral state.
- **Stack-to-cards / column-priority responsive modes** — considered; horizontal-scroll chosen for v1.

## Pre-existing issues found during review (out of scope for this spec)

Surfaced by the validation pass; tracked separately, not part of agent-table:
- `agent-flow` is missing from the theme-toggle propagation list, so its dark-mode styles never fire.
- Dead duplicate exports / missing imports around `src/renderer/rehype-plugins.mjs:190-205`.
