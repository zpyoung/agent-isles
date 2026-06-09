# `agent-table` island — design

**Date:** 2026-06-09
**Status:** Approved — pending implementation
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
- Per-row citation badges + stable ids (like `agent-status-board`), so agents/humans can reference "row #2".
- Dark-mode parity with the existing component library, via Agent Isles theme tokens.
- A data model that keeps a future constrained-writeback phase feasible without rework.

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

A fenced block whose header carries column types and whose body is a normal GFM Markdown table — chosen for maximum source readability and clean per-row diffs, reusing the GFM table parser already shipped, and mirroring `agent-flow`'s `key: value` header + `---` + body precedent.

````markdown
```agent-table
title: Launch readiness
columns: task:text | owner:text | status:status | effort:number | spec:url
group-by: status
sort: effort desc
---
| Task           | Owner  | Status  | Effort | Spec     |
| -------------- | ------ | ------- | ------ | -------- |
| Writeback API  | Zach   | at-risk | 5      | spec.md  |
| Renderer slice | Merlin | done    | 3      | PR #138  |
| Dark mode      | Merlin | blocked | 2      | #136     |
```
````

Header keys (all optional except `columns`):

| Key | Meaning | Default |
| --- | --- | --- |
| `title` | Accessible caption / heading | none |
| `columns` | `key:type` pairs separated by `\|` | required; each maps positionally to a table column |
| `sort` | initial sort, `<key> [asc\|desc]` | source order |
| `group-by` | column key to group rows under collapsible lanes | ungrouped |

Column types: `text` (default), `number`, `status`, `select`, `date`, `url`, `boolean`, `multi-select`. An **untyped** column is `text` — no value inference (explicit over implicit, per Agent Isles conventions). A cell value that does not match its declared type renders as **plain text** (graceful fallback), never an error or crash. `status` reuses the `agent-status-board` tone vocabulary (`green`/`amber`/`red`/`grey` + aliases) for cross-island consistency and the existing dark-mode audit.

## Architecture

**Approach A — light-DOM progressive enhancement** (chosen unanimously by the accessibility research). The fenced block is parsed **server-side** in the render pipeline, which emits a real semantic `<table>`; the Lit component enhances that table **in place in light DOM**.

```
isles render
  └─ remark parse ─> mdast `code` node (lang="agent-table")
       └─ agent-table transform (rehype-plugins.mjs)
            ├─ split on first `---`
            ├─ parseHeader()  -> {title, columns, sort, groupBy}
            ├─ parseRows()    -> row objects (reuses GFM table parsing)
            ├─ coerceCell()   -> typed render model (+ raw-text fallback)
            └─ buildHast()    -> <agent-table ...>
                                   <div class="agent-table-scroll">
                                     <table> … sortable <th>, <tbody> rows
                                       with stable ids + #n badge … </table>
                                   </div>
                                 </agent-table>
  └─ rehype-raw + sanitize (schema allows agent-table subtree)
  └─ page ships a WORKING accessible <table> immediately
       └─ agent-components.js upgrades <agent-table> in the browser:
            sort (type-aware via data-sortval, toggles aria-sort),
            group lanes (native <details>/<summary>), density, sticky-col scroll
```

No-JS readers get the full, accessible table. JS adds interactivity only.

**Where sort/group happen (resolves the obvious implementer ambiguity):**
- The author-declared `sort` is applied **server-side**, so the emitted row order already reflects it and a no-JS reader sees the authored ordering. The component re-sorts in place on header click.
- The emitted `<table>` is always **flat** (one `<tbody>`, source/sort order). `group-by` lanes are a **client-side enhancement only** — a no-JS reader sees the flat (sorted) table, not lanes. This keeps the static artifact a single clean semantic table and avoids encoding grouping into the markup.

### Why light DOM (not the shadow-DOM convention of other islands)

A native `<table>` is screen-reader-correct with zero ARIA-grid work; `role=grid` is over-engineered for read-only data and shadow DOM *breaks* cross-root ARIA and renders nothing without JS. Light DOM also inherits `data-bs-theme` directly (no shadow propagation hack) and keeps source ranges mappable for the deferred writeback phase. The documented, accepted cost: `agent-table` styles live in `agent-theme.css` rather than scoped `css\`\``, unlike the other islands.

## Modules

| File | Change | Responsibility |
| --- | --- | --- |
| `src/renderer/agent-table.mjs` | **new** | Pure logic: `parseHeader`, `parseRows`, `coerceCell`, `buildHast`. Unit-tested in isolation. |
| `src/renderer/rehype-plugins.mjs` | extend | Register the fenced `agent-table` transform (mirrors `agent-flow` wiring); delegates to `agent-table.mjs`. |
| `src/renderer/sanitize.mjs` | extend | Allow `agent-table` + emitted `<table>` subtree + safe `data-*`/`aria-*`/`scope` attrs in sanitized mode; strip the rest. |
| `src/components/agent-table.js` | **new** | Light-DOM Lit component (`createRenderRoot(){return this}`): sort, group lanes, density, sticky-scroll. Ephemeral per-instance state. |
| `src/components/index.js` | extend | Register `<agent-table>`. |
| `src/theme/agent-theme.css` | extend | Table/pill/chip/badge styles, light + dark tokens, comfortable/compact density, sticky first column. |
| `docs/component-vocabulary.md` (+ `docs/wiki/Component-Vocabulary.md`) | extend | Document the `agent-table` syntax, attributes, types, trusted/sanitized behavior. |
| `examples/demo.md` | extend | A worked `agent-table` example for the demo/gallery + browser smoke. |

## Component behavior (light-DOM enhancement)

- `connectedCallback`: locate the emitted `<table>`; wire each sortable `<th>` button to a type-aware comparator using `data-sortval`; maintain `aria-sort`.
- `group-by` set → render collapsible lanes via native `<details>/<summary>` (consistent with `agent-status-board` / `agent-gantt`), counts in the summary.
- Density attribute toggles a CSS class (comfortable default, `density="compact"` opt-in).
- Narrow screens: a scroll wrapper with the first column sticky.
- State (active sort, expanded lanes) lives on the instance only — **ephemeral**, resets on reload.

## Error handling (never crash a render)

| Condition | Behavior |
| --- | --- |
| Missing `---` / unparseable header | Render the block as a plain code fence + build warning. |
| Row/column count mismatch | Pad or truncate to the column set; warn. |
| Unknown type token | Treat as `text`. |
| Bad cell value for its type | Raw-text fallback (no formatting, no error). |
| `> ~200` rows | Render all + soft build-time warning nudging toward a real data tool. No virtualization. |
| Zero rows | Render typed header + an empty-state row. |
| Multiple tables on a page | Per-table id prefix so `#n` citation ids stay unique (same approach as `agent-status-board`). |

## Accessibility

Native `<table>` semantics throughout; `<th scope="col">`; sortable headers are real buttons exposing `aria-sort`; `status` and `boolean` carry text labels (never color-only); group lanes use native disclosure. No `role=grid`, no shadow-DOM ARIA hazards. The static (pre-JS) artifact is already fully navigable.

## Testing

- **Unit (`node --test`, `tests/agent-table-parse.test.mjs`):** header parsing; `columns` spec parsing; table→rows; each type's coercion/formatting; bad-value fallback; sort-value extraction; id/badge generation; sanitize-schema allowance.
- **Browser (Playwright):** static table present *before* enhancement; header click sorts + flips `aria-sort`; `group-by` renders collapsible lanes; dark-mode parity; sticky first column on a narrow viewport; citation ids stable across multiple tables.

Verification standard (per `AGENTS.md`): run build/tests, render an example, confirm the generated HTML includes the `<table>` + component script, and use a browser/screenshot check for interactive behavior.

## Writeback-readiness (deferred, not built)

The data model keeps a future constrained-writeback phase feasible: the rehype transform can later attach `data-agent-isles-writeback-op` + source-range metadata to individual cells (per `docs/writeback-contract.md`), with narrow registered operations like `agent-table:set-status` / `agent-table:set-boolean` for constrained-token cells. Free-text/number cell editing stays out (the contract forbids arbitrary browser-supplied replacement text). Nothing in v1 emits writeback metadata.

## Decisions Locked

**Scope**
- Read-only ceiling for v1; data model kept writeback-friendly but writeback not built.
- No live, fetched, computed, or derived data, ever.

**Authoring format**
- Fenced ```agent-table block: typed `key: value` header + `---` + GFM Markdown-table rows.

**Column types**
- v1 types: `text`, `number`, `status`, `select`, `date`, `url`, `boolean`, `multi-select`.
- Untyped column → `text`, no value inference.
- Bad cell value → graceful raw-text fallback.
- `status` reuses the `agent-status-board` tone vocabulary.

**Read-side interactivity**
- v1: `sort` (always on) + `group-by` (opt-in via header). Filter and saved views deferred.
- Enablement: sort always available; group opt-in via header attribute.
- State is ephemeral (resets on reload); no localStorage.
- Default ordering = source order, with optional author-declared initial `sort`/`group-by`.

**Layout & responsive**
- Narrow screens: horizontal scroll with sticky first column.
- Density: comfortable default, `compact` opt-in.
- Large tables: render all + soft warning above ~200 rows (no virtualization).
- Per-row citation badges + stable ids included.
- Dark mode via Agent Isles theme tokens; joins the dark-mode audit.

**Architecture**
- Approach A: rehype plugin emits a semantic `<table>`; Lit component enhances it in light DOM. Server-side parsing. `agent-table` styles live in `agent-theme.css`.

## Industry Insights

Distilled from four parallel research agents (2026 sources).

- **Scope creep is the dominant table-feature failure mode.** Editable tables in documents drift toward full data apps; teams that stay bounded set a strict feature fence and keep editing constrained/exported rather than free-form. Drove the read-only ceiling + hard "no live/computed data" fence. (telerik.com; shopify.com/partners feature-creep; Airtable two-way-sync docs.)
- **Light-DOM native `<table>` beats shadow-DOM `role=grid` for read-only tables** — and the consensus was lopsided. `role=grid` is for interactive/cell-selectable widgets; shadow DOM breaks cross-root ARIA (`aria-labelledby`/`describedby` can't cross the boundary) and shows nothing without JS. UI5 Web Components' 2024 redesign moved ARIA into light DOM. Drove Approach A. (nolanlawson.com; igalia.com; MDN grid role; W3C APG; frontendmasters.com light-DOM-only; Raymond Camden table-sort 2025.)
- **Virtualization is unnecessary and harmful below a few hundred rows** — and it breaks screen-reader access to off-viewport rows. Confirmed the render-all + soft-warning choice. (dev.to data-table virtualization; reactdatagrid.io.)
- **Parse fenced blocks server-side**; emit either a JSON `<script>` payload or pre-rendered light-DOM HTML; configure `rehype-sanitize` with a custom schema or custom elements get stripped; `remark-rehype` drops `position` by default, so writeback needs explicit source-range carry-through. Shaped the module split + sanitize/writeback-readiness notes. (unifiedjs.com recipes/guides; rehype-sanitize npm; dev.to remark position retention.)
- **Inline-edit data-integrity hazards** (async write races, source-of-truth ambiguity when a table is generated from a source file, non-editable computed columns) directly justify deferring writeback and, when it lands, scoping it to constrained-token operations only. (Airtable two-way-sync docs; telerik.com.)

## Deferred Ideas

- **Filter controls** (per-column, removable filter chips) — valuable but the heaviest UI/empty-state surface; deferred from v1.
- **Saved / author-declared views** (named filter+sort+group presets as tabs) — most powerful but the most parsing/UI work and the first "database app" smell; deferred.
- **Inline writeback editing** (constrained `status`/`boolean`/`select` cell edits patching source via the writeback contract) — explicitly out of the read-only ceiling; data model kept ready for it.
- **`multi-select` was kept in v1** at the user's request despite being flagged as a mild "becoming-a-database" smell — noted, not deferred.
- **localStorage state persistence** — considered and rejected for v1 in favor of ephemeral state.
- **Stack-to-cards / column-priority responsive modes** — considered; horizontal-scroll chosen for v1.
