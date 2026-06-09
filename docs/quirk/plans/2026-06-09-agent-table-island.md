# `agent-table` Island — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use quirk:subagent-driven-development (recommended) or quirk:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, typed-table island: a fenced ```agent-table block (typed `key: value` header + `---` + GFM Markdown table) that the renderer transforms server-side into a real semantic `<table>` wrapped in `<agent-table>`, which a light-DOM Lit component then enhances with sort and group-by. No writeback, no live data, no filter/views.

**Architecture:** Parser-first. A new pure module `src/renderer/agent-table.mjs` (`parseHeader` → `parseRows` via a nested unified+remark-gfm parse → `coerceCell` typed render model with a url protocol guard → `buildHast`) is unit-tested in isolation, then wired into the pipeline as a `rehypeAgentTable` transform in `src/renderer/rehype-plugins.mjs` that runs after `rehypeAgentFlow` and before `rehypeRaw` (`src/render.mjs:61-62`), copying the fence node `position` onto the emitted `<agent-table>`. The sanitized-mode schema is extended (`src/renderer/sanitize.mjs`), then the light-DOM component, theme CSS, docs/demo, and Playwright smoke land in that order.

**Tech Stack:** Node 22 ESM, unified/remark-parse/remark-gfm/remark-rehype (already dependencies — the nested row parse reuses them), Lit 3 (light DOM via `createRenderRoot(){ return this; }`), `node --test`, Playwright (`playwright.config.mjs`, testDir `./tests/browser`). No new dependencies.

**Spec:** `docs/quirk/specs/2026-06-09-agent-table-island-design.md` (authoritative — implement exactly this; filter, saved views, and writeback editing stay OUT).

---

## File Structure

**New:**
- `src/renderer/agent-table.mjs` — pure parse/coerce/build logic, no pipeline imports.
- `src/components/agent-table.js` — light-DOM Lit enhancement component.
- `tests/agent-table-parse.test.mjs` — unit tests for the pure module.
- `tests/agent-table.test.mjs` — pipeline + sanitized-mode + source/bundle/demo tests (mirrors `tests/agent-flow.test.mjs` conventions).
- `tests/browser/agent-table.spec.mjs` — Playwright smoke (uses `tests/browser/support/static-server.mjs`).

**Modified:**
- `src/renderer/rehype-plugins.mjs` — register the `agent-table` fenced transform (mirrors `rehypeAgentFlow` at `src/renderer/rehype-plugins.mjs:46-74`).
- `src/render.mjs` — `.use(rehypeAgentTable)` between `rehypeAgentFlow` (`src/render.mjs:61`) and `rehypeRaw` (`src/render.mjs:62`).
- `src/renderer/sanitize.mjs` — add `agent-table` + `caption` to `coreSanitizedSchema.tagNames` (`src/renderer/sanitize.mjs:5-56`) and an `agent-table` host-attribute entry next to `agent-flow` (`src/renderer/sanitize.mjs:153`).
- `src/components/index.js` — append `export * from './agent-table.js';` after `agent-flow` (`src/components/index.js:18`).
- `src/theme/agent-theme.css` — `agent-table` display rule in the island list (`src/theme/agent-theme.css:101-126`) + a delimited table section at the end of the file (currently 192 lines).
- `examples/demo.md` — worked two-pane gallery example (pattern at `examples/demo.md:33-63`) + a second minimal table for id-uniqueness proof.
- `docs/component-vocabulary.md` + `docs/wiki/Component-Vocabulary.md` — new `### <agent-table>` section under "Supported components" (vocabulary change checklist at `docs/component-vocabulary.md:796-804`).

---

## Implementation notes — read these before Phase 1

Risk spots found during the codebase-validated review. Do not rediscover them:

1. **Nested-parse positions are body-relative.** `parseRows` parses only the fence *body*, so any `position` inside that nested tree is relative to the body string, not the file. Never copy nested positions onto emitted nodes. The only position that matters is the **fence node's own `position`** (the `pre` element the transform replaces — read it off `child.position` in the transform loop; `extractLanguageCodeBlock` at `src/renderer/rehype-plugins.mjs:145-164` returns only `{ value }`). Copy that onto `<agent-table>`. Verified empirically: an element's `position` survives `rehype-raw` pass-through unchanged, so the writeback-readiness guarantee holds end-to-end (Phase 2 has a probe test locking this in). Note the agent-flow precedent does NOT do this — its replacement node at `src/renderer/rehype-plugins.mjs:63-68` carries no position; `rehypeAgentWritebackMetadata` requires `node.position?.start && node.position?.end` (`src/renderer/rehype-plugins.mjs:361`). **Nothing in v1 emits writeback metadata** — we only carry the position.
2. **The warning channel is new plumbing.** The pipeline has no warning path today. Keep it minimal: every pure function returns a `warnings: string[]` array; the rehype transform forwards them to an injectable `warn` callback defaulting to `console.warn`, prefixed `[agent-isles] agent-table:`. `src/render.mjs` passes nothing (default). Tests inject a spy or `mock.method(console, 'warn')` — never assert on real stderr.
3. **`<caption>` and `<button>` are NOT in the rehype-sanitize default schema** (verified against the installed `rehype-sanitize`: `tagNames` has `table/thead/tbody/tfoot/tr/th/td` but no `caption`, no `button`; `'*'` attributes already include `scope`, `colSpan`, `id`). `caption` must be allowlisted in Phase 3 because the transform emits it server-side. `button` must NOT be allowlisted and must NOT be emitted server-side — sort/toggle buttons are JS-injected after sanitize has already run. Acceptance everywhere: static HTML contains zero `<button>` inside `<agent-table>`.
4. **rehype-sanitize clobbers `id` and `name`** (`clobber: ['ariaDescribedBy','ariaLabelledBy','id','name']`, prefix `user-content-`). Row identity therefore uses `data-row-id` (passes through via the `data*` allowance at `src/renderer/sanitize.mjs:61`), never `id`. Phase 3 asserts the exact value survives.
5. **Bootstrap reboot styles bare `table`/`caption`.** The page ships full `bootstrap.min.css` (`src/renderer/page.mjs:21-26`, inlined at `:145`), and reboot sets `caption-side: bottom` + muted color on `caption`. Phase 5 must override with `agent-table caption { caption-side: top; }` plus heading color. We never apply Bootstrap's `.table` class, so collision risk is limited to reboot.
6. **Do not import the status-board component server-side.** The status tone vocabulary lives in `src/components/agent-status-board.js:4-21` (`STATUS_ALIASES`) and `:23-56` (`STATUS_DETAILS`), but that file imports `lit` and calls `customElements.define` — unusable from the Node renderer. Replicate the alias map in `src/renderer/agent-table.mjs` with a comment naming `agent-status-board.js` as the source of truth. Decision (to honor the spec's own worked example, which uses `done`/`at-risk`/`blocked`): extend the replicated map with `done → green` and `at-risk → amber`; any unrecognized token gets a **grey** pill that still shows the literal label (status never raw-text-falls-back — it mirrors status-board's `|| 'grey'` behavior, and the pill always carries a text label, never color-only).
7. **GFM pipe escaping:** per the GFM spec a `|` inside inline code still delimits cells; authors must write `\|`. The nested parse handles this correctly (verified: `**bold** \| pipe` stays one cell; raw HTML like `<script>` inside a cell is **dropped** because the nested `remark-rehype` runs without `allowDangerousHtml`). This is precisely why rows go through the real GFM parser, not `split('|')`.
8. **Light-DOM Lit pattern:** `createRenderRoot(){ return this; }` and `render(){ return nothing; }` (import `nothing` from `lit`). All enhancement is imperative in `firstUpdated()` against the server-emitted table. Lit only manages its own (empty) part, so the server HTML is untouched. Consequence: do NOT add `agent-table` to `AGENT_COMPONENT_TAGS` in `src/components/agent-theme-toggle.js:5` — light DOM inherits the document `data-bs-theme` for free; dark-mode CSS uses plain `[data-bs-theme="dark"] agent-table …` document-level selectors in `agent-theme.css`, not `:host(...)`.
9. **Group-by lanes:** `<details>` cannot wrap `<tr>` — group-by reorganizes rows into **multiple `<tbody>` elements** at upgrade time. The group-header `<tr><th colspan>` containing the `<button aria-expanded>` lives in its **own single-row `<tbody class="agent-table-group-header">`**, followed by `<tbody class="agent-table-group-body">` holding the group's rows; collapsing toggles `hidden` on the body tbody only (so the header row stays visible). The server-emitted table is always flat (single `<tbody>`).

---

### Phase 1: Pure parser/build module — `src/renderer/agent-table.mjs`

```yaml
independent: true
dependencies: []
scope:
  files: [src/renderer/agent-table.mjs, tests/agent-table-parse.test.mjs]
```

**Files:**
- Create: `src/renderer/agent-table.mjs`
- Test: `tests/agent-table-parse.test.mjs`

**Module contract** (everything returns warnings instead of throwing; a render must never crash):

```javascript
// src/renderer/agent-table.mjs — pure logic, no pipeline imports.
export function parseHeader(headerText)
// -> { ok, title, columns: [{ key, type }], sort: { key, dir } | null,
//      groupBy: string | null, density: string | null, warnings: string[] }
// columns is REQUIRED (`key:type` pairs separated by `|`); missing -> { ok: false }.
// Unknown type token -> 'text' + warning. sort: '<key> [asc|desc]', dir defaults 'asc';
// unknown sort/groupBy key -> dropped + warning. groupBy on a multi-select column ->
// dropped + warning (single-value columns only: text/select/status/boolean/date/number).

export function parseRows(bodyText)
// Nested unified().use(remarkParse).use(remarkGfm).use(remarkRehype) — WITHOUT
// allowDangerousHtml, so raw HTML in cells is dropped. Locates the first <table>
// element in the nested hast; returns { ok, headerLabels: string[],
// rows: CellChildren[][] , warnings } or { ok: false } when the body has no GFM table
// (e.g. missing |---| delimiter row). Positions in this nested tree are body-relative —
// never propagate them (Implementation note 1).

export function coerceCell(cellChildren, columnType)
// -> { children, sortval: string | null, cellClass: string | null }
// Typed grammar (spec-fixed): number via Number() (non-finite -> raw-text fallback,
// sortval = String(n)); date ISO-8601 only (friendly display, sortval = ISO string);
// status -> tone pill (alias map replicated from agent-status-board.js:4-21 + done/at-risk;
// unknown -> grey pill, label preserved); select -> one neutral chip;
// boolean true/false/yes/no/x/empty -> glyph + visually-hidden text label, sortval 1/0;
// multi-select -> comma-separated chips; url -> <a href> ONLY for http(s):, mailto:,
// or relative (no scheme per /^[a-z][a-z0-9+.-]*:/i test) — anything else (javascript:,
// data:, vbscript:, file:) renders as plain text with NO <a>. text -> rich inline
// children kept as-is, sortval = lowercased trimmed text.

export function buildHast(parsed, { tableIndex })
// -> { node, warnings } where node is:
// <agent-table title? group-by? sort? density?>
//   <div class="agent-table-scroll">
//     <table>
//       <caption>title</caption>                      (only when title present)
//       <thead><tr><th scope="col" data-key data-type>label</th>…</tr></thead>
//       <tbody>
//         <tr data-row-id="t{tableIndex}-r{n}">
//           <td class="agent-table-cell--…" data-sortval="…">
//             <span class="agent-table-rowref">#n</span> …cell children…  (first cell only)
//           </td>…
//         </tr>…
//       </tbody>
//     </table>
//   </div>
// </agent-table>
// Author-declared sort applied SERVER-SIDE (stable, source-order tiebreak) so no-JS
// readers see the authored order; #n badges and data-row-id reflect SOURCE order and
// never renumber. NO <button> anywhere. Zero rows -> typed thead + one empty-state row
// (<td colspan>). Row/column-count mismatch vs the columns spec -> pad with text cells /
// treat extras as text + warning. > 200 rows -> render all + soft warning.

export function parseAgentTable(source, { tableIndex } = {})
// Orchestrator used by the rehype transform: split on first `---`, parseHeader,
// parseRows, coerce + buildHast. -> { ok, node?, warnings }.
// Missing `---` or unparseable header or non-table body -> { ok: false, warnings }.
```

- [ ] **Step 1: Write the failing tests — `parseHeader`**

```javascript
// tests/agent-table-parse.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHeader, parseRows, coerceCell, buildHast, parseAgentTable } from '../src/renderer/agent-table.mjs';

test('parseHeader parses title, typed columns, sort, group-by', () => {
  const h = parseHeader('title: Launch readiness\ncolumns: task:text | owner:text | status:status | effort:number | spec:url\ngroup-by: status\nsort: effort desc');
  assert.equal(h.ok, true);
  assert.equal(h.title, 'Launch readiness');
  assert.deepEqual(h.columns.map((c) => c.key), ['task', 'owner', 'status', 'effort', 'spec']);
  assert.deepEqual(h.columns.map((c) => c.type), ['text', 'text', 'status', 'number', 'url']);
  assert.deepEqual(h.sort, { key: 'effort', dir: 'desc' });
  assert.equal(h.groupBy, 'status');
  assert.deepEqual(h.warnings, []);
});

test('parseHeader: columns is required', () => {
  assert.equal(parseHeader('title: No columns').ok, false);
});

test('parseHeader: untyped column defaults to text; unknown type warns and falls back to text', () => {
  const h = parseHeader('columns: a | b:rocket');
  assert.deepEqual(h.columns.map((c) => c.type), ['text', 'text']);
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0], /unknown column type/i);
});

test('parseHeader: sort/group-by on unknown keys are dropped with warnings', () => {
  const h = parseHeader('columns: a:text\nsort: missing desc\ngroup-by: alsoMissing');
  assert.equal(h.sort, null);
  assert.equal(h.groupBy, null);
  assert.equal(h.warnings.length, 2);
});

test('parseHeader: group-by on a multi-select column falls back to ungrouped + warning', () => {
  const h = parseHeader('columns: tags:multi-select | name:text\ngroup-by: tags');
  assert.equal(h.groupBy, null);
  assert.match(h.warnings[0], /multi-select/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/agent-table-parse.test.mjs`
Expected: FAIL — `Cannot find module '../src/renderer/agent-table.mjs'`.

- [ ] **Step 3: Implement `parseHeader`** (header-line regex mirrors agent-flow's `parseAgentFlowCodeBlock` at `src/renderer/rehype-plugins.mjs:76-105`; accepted keys: `title`, `columns`, `sort`, `group-by`, `density` — `density` is authorable here because the spec lists it as a sanitized host attribute and the fence header is the only authoring surface). Run Step 1's tests to green.

- [ ] **Step 4: Write the failing tests — `parseRows`** (nested GFM parse)

```javascript
test('parseRows: nested GFM parse renders inline markdown and handles escaped pipes', () => {
  const r = parseRows('| Task | Notes |\n| - | - |\n| **Bold** \\| pipe | `code` |');
  assert.equal(r.ok, true);
  assert.deepEqual(r.headerLabels, ['Task', 'Notes']);
  assert.equal(r.rows.length, 1);
  const cellText = JSON.stringify(r.rows[0][0]);
  assert.match(cellText, /strong/);          // **Bold** became <strong>
  assert.match(cellText, /\| pipe/);          // escaped pipe stayed in the cell
  assert.match(JSON.stringify(r.rows[0][1]), /"tagName":"code"/);
});

test('parseRows: raw HTML in a cell is dropped, never passed through', () => {
  const r = parseRows('| A |\n| - |\n| <script>steal()</script>safe |');
  assert.doesNotMatch(JSON.stringify(r.rows), /script|steal/);
  assert.match(JSON.stringify(r.rows), /safe/);
});

test('parseRows: body without a GFM table (missing delimiter row) is not ok', () => {
  assert.equal(parseRows('| A |\n| just text |').ok, false);   // no |---| delimiter row
  assert.equal(parseRows('plain prose, no table').ok, false);
});
```

- [ ] **Step 5: Run to verify failure, implement `parseRows`, re-run to green**

Implementation: build the nested processor once at module scope (`unified().use(remarkParse).use(remarkGfm).use(remarkRehype)` — **no** `allowDangerousHtml`), `await`-free via `processor.runSync(processor.parse(body))`, walk the hast for the first `table` element, read `thead th` text for `headerLabels` and `tbody tr td` children arrays for `rows`. GFM itself pads/truncates each row to the header column count — the residual mismatch case (columns spec count ≠ GFM table column count) is handled in `buildHast`.

- [ ] **Step 6: Write the failing tests — `coerceCell`** (one per type + the security cases)

```javascript
const textCell = (s) => [{ type: 'text', value: s }];

test('coerceCell number: finite -> sortval, non-finite -> raw-text fallback', () => {
  const ok = coerceCell(textCell('5'), 'number');
  assert.equal(ok.sortval, '5');
  const bad = coerceCell(textCell('fast'), 'number');
  assert.equal(bad.sortval, null);
  assert.match(JSON.stringify(bad.children), /fast/);
});

test('coerceCell date: ISO-8601 only; sortval is the ISO string', () => {
  const ok = coerceCell(textCell('2026-06-09'), 'date');
  assert.equal(ok.sortval, '2026-06-09');
  assert.equal(coerceCell(textCell('06/09/2026'), 'date').sortval, null); // raw-text fallback
});

test('coerceCell status: tone pill with text label; unknown tone -> grey, label preserved', () => {
  const blocked = JSON.stringify(coerceCell(textCell('blocked'), 'status').children);
  assert.match(blocked, /agent-table-pill--red/);
  assert.match(blocked, /blocked/); // never color-only
  const mystery = JSON.stringify(coerceCell(textCell('mystery'), 'status').children);
  assert.match(mystery, /agent-table-pill--grey/);
  assert.match(mystery, /mystery/);
});

test('coerceCell boolean: glyph plus accessible text label; sortval 1/0', () => {
  const yes = coerceCell(textCell('yes'), 'boolean');
  assert.equal(yes.sortval, '1');
  assert.match(JSON.stringify(yes.children), /visually-hidden/);
  assert.equal(coerceCell(textCell(''), 'boolean').sortval, '0');
  assert.equal(coerceCell(textCell('maybe'), 'boolean').sortval, null); // raw-text fallback
});

test('coerceCell multi-select: comma-separated -> one chip per value', () => {
  const chips = JSON.stringify(coerceCell(textCell('api, ui, docs'), 'multi-select').children);
  assert.equal((chips.match(/agent-table-chip/g) || []).length >= 3, true);
});

test('coerceCell url: protocol allowlist enforced — javascript: renders as text, no <a>', () => {
  const evil = JSON.stringify(coerceCell(textCell('javascript:alert(1)'), 'url').children);
  assert.doesNotMatch(evil, /"tagName":"a"/);
  assert.match(evil, /javascript:alert\(1\)/); // shown as inert text
  const data = JSON.stringify(coerceCell(textCell('data:text/html,x'), 'url').children);
  assert.doesNotMatch(data, /"tagName":"a"/);
  for (const good of ['https://example.com/x', 'mailto:a@b.c', './specs/writeback.md', '/abs/path']) {
    assert.match(JSON.stringify(coerceCell(textCell(good), 'url').children), /"tagName":"a"/);
  }
});
```

- [ ] **Step 7: Run to verify failure, implement `coerceCell`, re-run to green**

Include the replicated status alias map (Implementation note 6) with the source-of-truth comment.

- [ ] **Step 8: Write the failing tests — `buildHast` + `parseAgentTable`**

```javascript
const FENCE = `title: Launch readiness
columns: task:text | owner:text | status:status | effort:number | spec:url
sort: effort desc
---
| Task | Owner | Status | Effort | Spec |
| - | - | - | - | - |
| Writeback API | Zach | at-risk | 5 | ./specs/writeback.md |
| Renderer slice | Merlin | done | 3 | https://github.com/x/agent/pull/138 |
| Dark mode | Merlin | blocked | 2 | javascript:alert(1) |`;

test('buildHast emits caption, scoped plain th, server-sorted rows, source-order row ids', () => {
  const { ok, node } = parseAgentTable(FENCE, { tableIndex: 1 });
  assert.equal(ok, true);
  const html = JSON.stringify(node);
  assert.match(html, /"tagName":"caption"/);
  assert.match(html, /"scope":"col"/);
  assert.doesNotMatch(html, /"tagName":"button"/);          // no dead controls pre-JS
  assert.match(html, /t1-r1/);                                // data-row-id, per-table prefix
  // sort: effort desc applied server-side -> Writeback API (5) is the first body row,
  // but its badge/row-id remain source-order (#1 / t1-r1).
  const firstRow = JSON.stringify(node /* drill to first tbody tr in the real test */);
  assert.match(firstRow, /Writeback API/);
});

test('buildHast: zero rows -> typed header + empty-state row', () => {
  const { node } = parseAgentTable('columns: a:text | b:number\n---\n| A | B |\n| - | - |', { tableIndex: 1 });
  assert.match(JSON.stringify(node), /agent-table-empty/);
  assert.match(JSON.stringify(node), /"colSpan":2/);
});

test('buildHast: >200 rows renders all + soft warning', () => {
  const rows = Array.from({ length: 201 }, (_, i) => `| r${i} |`).join('\n');
  const { node, warnings } = parseAgentTable(`columns: a:text\n---\n| A |\n| - |\n${rows}`, { tableIndex: 1 });
  assert.equal((JSON.stringify(node).match(/data-row-id/g) || []).length, 201);
  assert.match(warnings.join(' '), /200/);
});

test('parseAgentTable: missing --- or non-table body fails soft (ok: false + warning)', () => {
  assert.equal(parseAgentTable('columns: a:text\n| A |', { tableIndex: 1 }).ok, false);
  assert.equal(parseAgentTable('columns: a:text\n---\nnot a table', { tableIndex: 1 }).ok, false);
});
```

- [ ] **Step 9: Run to verify failure, implement `buildHast` + `parseAgentTable`, re-run to green**

Run: `node --test tests/agent-table-parse.test.mjs`
Expected: PASS (all Phase 1 tests).

- [ ] **Step 10: Checkpoint commit**

```bash
git add src/renderer/agent-table.mjs tests/agent-table-parse.test.mjs
git commit -m "feat(agent-table): add fenced-block parser/build module (parseHeader, parseRows, coerceCell, buildHast)"
```

---

### Phase 2: Pipeline wiring — transform registration + fence position carry-through

```yaml
independent: false
dependencies: [Phase 1]
scope:
  files: [src/renderer/rehype-plugins.mjs, src/render.mjs, tests/agent-table.test.mjs]
```

**Files:**
- Modify: `src/renderer/rehype-plugins.mjs` (new `rehypeAgentTable`, modeled on `rehypeAgentFlow` at `:46-74`)
- Modify: `src/render.mjs` (pipeline insertion at `:61-62`; import at `:21-28`)
- Test: `tests/agent-table.test.mjs` (new file)

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/agent-table.test.mjs — follows tests/agent-flow.test.mjs conventions.
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const FENCED = '\n```agent-table\ntitle: Launch readiness\ncolumns: task:text | status:status | effort:number | spec:url\nsort: effort desc\n---\n| Task | Status | Effort | Spec |\n| - | - | - | - |\n| Writeback API | at-risk | 5 | javascript:alert(1) |\n| Renderer slice | done | 3 | https://github.com/x/pull/138 |\n```\n';

test('agent-table fenced blocks render to a semantic table island', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(`# Plan\n${FENCED}`);
  assert.match(html, /<agent-table[^>]*title="Launch readiness"/);
  assert.match(html, /<caption>Launch readiness<\/caption>/);
  assert.match(html, /<th scope="col"[^>]*data-key="effort"[^>]*data-type="number"/);
  assert.match(html, /data-row-id="t1-r1"/);
  assert.doesNotMatch(html, /<code class="hljs language-agent-table">/);
  assert.doesNotMatch(html, /<button/);
});

test('url protocol allowlist is enforced in TRUSTED mode (transform-level, not sanitize)', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(FENCED); // default mode is trusted — sanitize never runs
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /javascript:alert\(1\)/);          // inert text survives
  assert.match(html, /href="https:\/\/github.com\/x\/pull\/138"/);
});

test('multiple tables get unique server-emitted row-id prefixes', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(`${FENCED}\n${FENCED}`);
  assert.match(html, /data-row-id="t1-r1"/);
  assert.match(html, /data-row-id="t2-r1"/);
});

test('malformed block falls back to a plain code fence and warns (never crashes)', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const warn = mock.method(console, 'warn', () => {});
  try {
    const html = await renderMarkdown('```agent-table\ncolumns: a:text\n| no delimiter |\n```\n');
    assert.match(html, /language-agent-table/);          // left as a code fence
    assert.doesNotMatch(html, /<agent-table/);
    assert.equal(warn.mock.calls.length >= 1, true);
    assert.match(String(warn.mock.calls[0].arguments[0]), /\[agent-isles\] agent-table/);
  } finally {
    warn.mock.restore();
  }
});

test('fence position is copied onto <agent-table> and survives rehype-raw (writeback-readiness)', async () => {
  // Mirror the src/render.mjs:54-62 plugin order with a capture plugin after rehypeRaw.
  const { unified } = await import('unified');
  const remarkParse = (await import('remark-parse')).default;
  const remarkGfm = (await import('remark-gfm')).default;
  const remarkRehype = (await import('remark-rehype')).default;
  const rehypeRaw = (await import('rehype-raw')).default;
  const { rehypeAgentTable } = await import('../src/renderer/rehype-plugins.mjs');

  let position = null;
  const capture = () => (tree) => {
    (function find(n) {
      if (n.tagName === 'agent-table') position = n.position;
      (n.children || []).forEach(find);
    })(tree);
  };
  const md = `before\n\n${FENCED}`;
  const processor = unified().use(remarkParse).use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeAgentTable).use(rehypeRaw).use(capture);
  await processor.run(processor.parse(md));
  assert.ok(position?.start?.offset >= 0 && position?.end?.offset > position.start.offset);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/agent-table.test.mjs`
Expected: FAIL — `rehypeAgentTable` is not exported; rendered HTML still contains `language-agent-table`.

- [ ] **Step 3: Implement `rehypeAgentTable` in `src/renderer/rehype-plugins.mjs`**

Mirror the `rehypeAgentFlow` walk (`:46-74`): for each child where `extractLanguageCodeBlock(child, 'agent-table')` matches, keep a per-run `tableIndex` counter (starts at 1, increments per matched fence — deterministic server-side, unlike status-board's runtime counter at `src/components/agent-status-board.js:582`), call `parseAgentTable(code.value, { tableIndex })`; on `ok`, replace the node and set `replacement.position = child.position` (the fence `pre` node's position — Implementation note 1); on `!ok`, leave the `pre` untouched. Forward all warnings through `options.warn ?? console.warn` with the `[agent-isles] agent-table:` prefix. Import `parseAgentTable` from `./agent-table.mjs`.

- [ ] **Step 4: Wire into `src/render.mjs`**

Add `rehypeAgentTable` to the import block (`src/render.mjs:21-28`) and insert `.use(rehypeAgentTable)` between `.use(rehypeAgentFlow)` (`:61`) and `.use(rehypeRaw)` (`:62`) — before `rehypeRaw` like the other fenced transforms, and therefore before the sanitized-mode branch at `:69-73`.

- [ ] **Step 5: Run to verify pass + no regressions**

Run: `node --test tests/agent-table.test.mjs tests/agent-table-parse.test.mjs tests/render.test.mjs tests/agent-flow.test.mjs`
Expected: PASS.

- [ ] **Step 6: Checkpoint commit**

```bash
git add src/renderer/rehype-plugins.mjs src/render.mjs tests/agent-table.test.mjs
git commit -m "feat(agent-table): wire fenced transform into render pipeline with fence-position carry-through"
```

---

### Phase 3: Sanitized-mode schema extension

```yaml
independent: false
dependencies: [Phase 2]
scope:
  files: [src/renderer/sanitize.mjs, tests/agent-table.test.mjs]
```

**Files:**
- Modify: `src/renderer/sanitize.mjs` (tagNames set at `:5-56`; host attrs map around `:153`)
- Test: `tests/agent-table.test.mjs` (append)

- [ ] **Step 1: Write the failing tests** (append to `tests/agent-table.test.mjs`; sanitized-test shape follows `tests/agent-flow.test.mjs:79-94`)

```javascript
test('sanitized mode preserves the agent-table subtree, caption, host attrs, and data-row-id', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const grouped = FENCED.replace('sort: effort desc', 'sort: effort desc\ngroup-by: status\ndensity: compact');
  const html = await renderMarkdown(grouped, { renderMode: 'sanitized' });
  assert.match(html, /<agent-table[^>]*group-by="status"/);
  assert.match(html, /density="compact"/);
  assert.match(html, /<caption>Launch readiness<\/caption>/);     // caption allowlisted
  assert.match(html, /<table>[\s\S]*<thead>[\s\S]*<tbody>/);
  assert.match(html, /data-row-id="t1-r1"/);                       // NOT user-content- clobbered
  assert.doesNotMatch(html, /user-content-/);
  assert.match(html, /data-sortval/);
});

test('sanitized mode still suppresses disallowed url protocols and strips active HTML', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(FENCED, { renderMode: 'sanitized' });
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<button/);                            // buttons are JS-injected only
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/agent-table.test.mjs`
Expected: FAIL — sanitized output drops `<agent-table>` (not in tagNames) and `<caption>`.

- [ ] **Step 3: Extend `coreSanitizedSchema`**

In `src/renderer/sanitize.mjs`:
- tagNames (`:5-56`): add `'agent-table'` after `'agent-flow'` (`:33`) and `'caption'` near the table-support comment. Do **not** add `'button'` (Implementation note 3). `table/thead/tbody/tr/th/td` are already in the default schema; `scope`/`colSpan` are in the default `'*'` list; `data*`/`aria*` come from `:59-68`.
- attributes: next to `'agent-flow'` (`:153`) add `'agent-table': ['className', 'title', 'group-by', 'sort', 'density']`.

- [ ] **Step 4: Run to verify pass + sanitized regression check**

Run: `node --test tests/agent-table.test.mjs tests/render.test.mjs`
Expected: PASS.

- [ ] **Step 5: Checkpoint commit**

```bash
git add src/renderer/sanitize.mjs tests/agent-table.test.mjs
git commit -m "feat(agent-table): allow agent-table subtree and caption in sanitized mode"
```

---

### Phase 4: Light-DOM Lit component — `src/components/agent-table.js`

```yaml
independent: false
dependencies: [Phase 2]
scope:
  files: [src/components/agent-table.js, src/components/index.js, tests/agent-table.test.mjs]
```

**Files:**
- Create: `src/components/agent-table.js`
- Modify: `src/components/index.js` (append after `:18`)
- Test: `tests/agent-table.test.mjs` (append source/bundle assertions; behavior is exercised in Phase 7's browser spec, matching how `tests/agent-flow.test.mjs:70-102` splits source vs browser coverage)

- [ ] **Step 1: Write the failing tests**

```javascript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('agent-table component enhances in light DOM and injects controls at runtime only', () => {
  const source = readFileSync(resolve('src/components/agent-table.js'), 'utf8');
  assert.match(source, /createRenderRoot\(\)\s*{\s*return this;?\s*}/);  // light DOM, deliberate divergence
  assert.match(source, /aria-sort/);
  assert.match(source, /aria-expanded/);
  assert.doesNotMatch(source, /<details/);                 // group-by must NOT use details/summary
  assert.match(source, /tbody/i);                          // multi-tbody lanes
  assert.match(source, /data-sortval/);
});

test('component bundle registers agent-table; theme-toggle propagation list is untouched', () => {
  const bundle = readFileSync(resolve('dist/agent-components.js'), 'utf8');
  assert.match(bundle, /customElements\.define\(["']agent-table["']/);
  const toggle = readFileSync(resolve('src/components/agent-theme-toggle.js'), 'utf8');
  assert.doesNotMatch(toggle, /'agent-table'/);            // light DOM inherits the document theme
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run build && node --test tests/agent-table.test.mjs`
Expected: FAIL — `src/components/agent-table.js` missing; bundle lacks the definition.

- [ ] **Step 3: Implement the component**

Skeleton and behavior (all enhancement imperative; server HTML is the source of truth):

```javascript
import { LitElement, nothing } from 'lit';

export class AgentTable extends LitElement {
  static properties = {
    groupBy: { type: String, attribute: 'group-by' },
    sort: { type: String },
    density: { type: String, reflect: true },
  };
  createRenderRoot() { return this; }   // light DOM: native <table> a11y, document theme tokens
  render() { return nothing; }          // never let Lit manage the server-emitted children
  firstUpdated() { this.enhance(); }
  // enhance():
  //  1. table = this.querySelector('.agent-table-scroll > table'); bail silently if absent.
  //  2. For each thead th[data-key]: move the label text into an injected
  //     <button type="button" class="agent-table-sort"> (static artifact has NO buttons);
  //     click -> sortBy(key): type-aware compare via td data-sortval (numeric compare when
  //     th[data-type="number"], else string), stable with source-order (data-row-id) tiebreak,
  //     re-append rows, set aria-sort="ascending|descending" on the active th, remove on others.
  //     Initial aria-sort comes from the `sort` attribute (already applied server-side).
  //  3. If group-by names a th[data-key] whose data-type is single-value: regroup —
  //     per distinct group value (source order), emit
  //     <tbody class="agent-table-group-header"><tr><th colspan=N><button aria-expanded="true">
  //       label (count)</button></th></tr></tbody>
  //     <tbody class="agent-table-group-body">…rows…</tbody>
  //     Toggle click flips aria-expanded and `hidden` on the body tbody only.
  //     Invalid target (multi-select/unknown) -> no-op + console.warn (soft).
  //     Sorting while grouped sorts within each group-body tbody.
  //  4. State (active sort, expanded lanes) lives on the instance — ephemeral, no localStorage.
}
customElements.define('agent-table', AgentTable);
```

Append `export * from './agent-table.js';` to `src/components/index.js` after the `agent-flow` line (`:18`). Do NOT touch `src/components/agent-theme-toggle.js:5` (Implementation note 8).

- [ ] **Step 4: Run to verify pass**

Run: `npm run build && node --test tests/agent-table.test.mjs`
Expected: PASS.

- [ ] **Step 5: Checkpoint commit**

```bash
git add src/components/agent-table.js src/components/index.js tests/agent-table.test.mjs
git commit -m "feat(agent-table): add light-DOM enhancement component (sort buttons, multi-tbody group lanes)"
```

---

### Phase 5: Theme CSS

```yaml
independent: false
dependencies: [Phase 4]
scope:
  files: [src/theme/agent-theme.css, tests/agent-table.test.mjs]
```

**Files:**
- Modify: `src/theme/agent-theme.css` (add `agent-table` to the island display list at `:101-126`; append a clearly delimited `/* agent-table */` section at the end — it will be the largest addition to the 192-line file, as the spec acknowledges)
- Test: `tests/agent-table.test.mjs` (append a source assertion; visual confirmation lands in Phase 7)

- [ ] **Step 1: Write the failing test**

```javascript
test('theme ships agent-table styles with caption-side override and dark-mode tokens', () => {
  const css = readFileSync(resolve('src/theme/agent-theme.css'), 'utf8');
  assert.match(css, /agent-table caption\s*{[^}]*caption-side:\s*top/); // beats Bootstrap reboot's bottom
  assert.match(css, /\.agent-table-scroll/);
  assert.match(css, /\.agent-table-pill--green/);
  assert.match(css, /position:\s*sticky/);                              // sticky first column
  assert.match(css, /\[data-bs-theme="dark"\][^{]*agent-table/);        // document-level dark selectors
  assert.match(css, /agent-table\[density="compact"\]/);
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Section contents (use the existing `--agent-isles-*` tokens from `:2-29`; light-DOM means plain document selectors, no `:host`):
- `agent-table` added to the `display: block; margin: 1rem 0;` island list (`:101-126`).
- `.agent-table-scroll { overflow-x: auto; }`; `agent-table table { width: 100%; border-collapse: collapse; background: var(--agent-isles-surface); border: 1px solid var(--agent-isles-border); }`.
- `agent-table caption { caption-side: top; color: var(--agent-isles-heading); font-weight: 800; text-align: left; padding: …; }` (Implementation note 5).
- th/td comfortable padding; `agent-table[density="compact"] th, agent-table[density="compact"] td` reduced padding.
- `.agent-table-cell--number { text-align: right; font-variant-numeric: tabular-nums; }`.
- Status pills `.agent-table-pill--green/--amber/--red/--grey` (palette mirrors `STATUS_DETAILS` at `src/components/agent-status-board.js:23-56`), neutral `.agent-table-chip`, `.agent-table-bool`, `.agent-table-rowref` (monospace badge like `.status-reference`), `.agent-table-empty`.
- Injected-control styles: `.agent-table-sort` (unstyled button, focus-visible ring via `--agent-isles-focus`, asc/desc indicator), group-header row styles.
- Sticky first column: `agent-table th:first-child, agent-table td:first-child { position: sticky; left: 0; background: inherit; }` scoped so it only matters when `.agent-table-scroll` overflows.
- Dark mode: `[data-bs-theme="dark"] agent-table table { … }` plus dark pill/chip variants — document-level selectors only.

- [ ] **Step 3: Run to verify pass + render smoke**

Run: `node --test tests/agent-table.test.mjs && node ./bin/isles.mjs render examples/demo.md --out /tmp/agent-table-css-check.html`
Expected: tests PASS; render succeeds.

- [ ] **Step 4: Checkpoint commit**

```bash
git add src/theme/agent-theme.css tests/agent-table.test.mjs
git commit -m "feat(agent-table): table theme styles with dark-mode parity and caption-side override"
```

---

### Phase 6: Docs + demo example

```yaml
independent: false
dependencies: [Phase 5]
scope:
  files: [examples/demo.md, docs/component-vocabulary.md, docs/wiki/Component-Vocabulary.md, tests/agent-table.test.mjs]
```

**Files:**
- Modify: `examples/demo.md` (gallery entry under "Component reference"; two-pane pattern at `examples/demo.md:33-63`)
- Modify: `docs/component-vocabulary.md` (+ mirror `docs/wiki/Component-Vocabulary.md`; follow the change checklist at `docs/component-vocabulary.md:796-804`)
- Test: `tests/agent-table.test.mjs` (append; pattern from `tests/agent-flow.test.mjs:104-115`)

- [ ] **Step 1: Write the failing test**

```javascript
test('demo documents agent-table and renders it through the full pipeline', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const demoSource = readFileSync(resolve('examples/demo.md'), 'utf8');
  assert.match(demoSource, /data-agent-components="agent-table"/);
  assert.match(demoSource, /```agent-table\ntitle: Launch readiness/);
  const { html } = await renderMarkdownFile(resolve('examples/demo.md'));
  assert.match(html, /<agent-table[^>]*title="Launch readiness"/);
  assert.match(html, /data-row-id="t1-r/);
  assert.match(html, /data-row-id="t2-r/);   // second table proves server-side id uniqueness
});
```

- [ ] **Step 2: Run to verify failure, then add the demo entry**

In `examples/demo.md`, add a gallery section after the agent-flow example. Unlike agent-flow (whose rendered pane embeds the island as literal HTML, `:39-57`), the agent-table island is *produced by* the fenced transform — so the rendered pane contains the real fenced block as Markdown. CommonMark HTML blocks end at a blank line, so a fenced block placed between blank lines inside the wrapper `<div>` is parsed as Markdown and transformed normally; the source pane shows the same fence escaped inside `<pre><code>`. The worked example exercises all 8 types plus `sort` and `group-by` (use status tokens covered by the alias map + the `done`/`at-risk` extensions: `done`, `at-risk`, `blocked`). Add a second, 2-row minimal table (e.g. "Reading list": `title:text | url:url | read:boolean`) so multi-table id prefixes are demonstrably unique in the static HTML.

- [ ] **Step 3: Document the vocabulary**

`docs/component-vocabulary.md`, new `### <agent-table>` under "Supported components": fenced authoring syntax, header keys (`title`, `columns` required, `sort`, `group-by`, `density`), the 8 column types with each value grammar (ISO dates, comma-separated multi-select, `Number()` numbers, status tone aliases), the url protocol allowlist (both modes), `data-row-id`/`#n` citation identity (source-order, never renumbers), no-JS behavior (flat sorted table, zero dead controls), group-by mechanism (multiple `<tbody>`, never `<details>`), error-handling table from the spec, and trusted/sanitized behavior. Mirror the section into `docs/wiki/Component-Vocabulary.md`.

- [ ] **Step 4: Run to verify pass + full unit suite**

Run: `npm run test:unit`
Expected: PASS (all suites, including the three agent-table test files and no regressions in `tests/render.test.mjs` / demo-dependent suites).

- [ ] **Step 5: Checkpoint commit**

```bash
git add examples/demo.md docs/component-vocabulary.md docs/wiki/Component-Vocabulary.md tests/agent-table.test.mjs
git commit -m "docs(agent-table): vocabulary reference + worked demo example"
```

---

### Phase 7: Browser smoke, accessibility verification, final render check

```yaml
independent: false
dependencies: [Phase 6]
scope:
  files: [tests/browser/agent-table.spec.mjs]
```

**Files:**
- Create: `tests/browser/agent-table.spec.mjs` (conventions from `tests/browser/kanban.spec.mjs:1-12` — `serveDist()` helper, console-error capture, `dist/demo.html` built by the `test:browser` script in `package.json`)

- [ ] **Step 1: Write the spec** (red until run against the built demo; assertions:)

```javascript
import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('static artifact: full accessible table, no dead controls, even with JS disabled', async ({ browser }) => {
  const server = await serveDist();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${server.origin}/demo.html`);
    const island = page.locator('agent-table').first();
    await expect(island.locator('table caption')).toHaveText('Launch readiness');
    await expect(island.locator('thead th[scope="col"]')).toHaveCount(5);
    await expect(island.locator('button')).toHaveCount(0);        // zero dead controls pre-JS
    await expect(island.locator('tbody')).toHaveCount(1);          // server table is flat
    // server-side sort: effort desc -> first body row is the effort-5 row, badge stays #1-of-source
    await expect(island.locator('tbody tr').first()).toContainText('Writeback API');
  } finally { await context.close(); await server.close(); }
});

test('enhanced: injected sort buttons flip order and aria-sort; group lanes toggle', async ({ page }) => {
  // serveDist + console-error capture per kanban.spec.mjs pattern; assertions:
  // - customElements.get('agent-table') truthy (poll).
  // - th[data-key="effort"] now contains button.agent-table-sort; click -> aria-sort flips
  //   ascending<->descending and the first row changes accordingly; data-row-id order in the
  //   DOM changes but each row keeps its original data-row-id / #n badge (no renumbering).
  // - the group-by table renders one agent-table-group-header + one agent-table-group-body
  //   <tbody> pair per status value; toggle click sets aria-expanded="false" and hidden on the
  //   body tbody only (header row remains visible); counts shown in the header row.
  // - no href="javascript:" anywhere in the document.
  // - consoleErrors deep-equals [].
});

test('responsive + dark mode', async ({ page }) => {
  // - viewport 390x900: .agent-table-scroll scrolled horizontally -> first-column cells'
  //   boundingBox().x stays pinned (sticky first column).
  // - page.evaluate set document.documentElement dataset.bsTheme = 'dark' (or click the
  //   demo's agent-theme-toggle) -> table surface/border computed styles change from the
  //   light values; screenshot both themes for the PR.
  // - both demo tables present with t1-/t2- row-id prefixes (citation ids stable across tables).
});
```

- [ ] **Step 2: Run the browser suite**

Run: `npm run test:browser`
Expected: PASS (builds the bundle, renders `dist/demo.html` with `--assets local`, runs Playwright including the new spec).

- [ ] **Step 3: Final verification checklist** (AGENTS.md "Verification standard")

- [ ] `npm run build` succeeds.
- [ ] `npm run test:unit` passes (includes `tests/agent-table-parse.test.mjs`, `tests/agent-table.test.mjs`, and all pre-existing suites).
- [ ] `node ./bin/isles.mjs render examples/demo.md --out dist/demo.html --assets local` succeeds.
- [ ] Generated HTML contains the semantic `<table>` inside `<agent-table>` (caption, `th scope="col"`, `data-row-id`, `data-sortval`) **and** the component bundle script reference.
- [ ] `node ./bin/isles.mjs render examples/demo.md --mode sanitized --out /tmp/agent-table-sanitized.html --assets inline` succeeds; output still contains the full `<agent-table>` subtree with `<caption>`, un-clobbered `data-row-id`, and no `javascript:` hrefs.
- [ ] `npm run test:browser` passes; screenshots captured for light + dark and for the sticky-column narrow viewport.
- [ ] Build warnings behave: rendering a deliberately malformed fence prints one `[agent-isles] agent-table:` warning to stderr and still produces HTML.

- [ ] **Step 4: Checkpoint commit**

```bash
git add tests/browser/agent-table.spec.mjs
git commit -m "test(agent-table): browser smoke for sort, group lanes, no-JS artifact, dark mode"
```

---

## Out of scope (do not implement)

Per the spec's read-only ceiling and Deferred Ideas — explicitly excluded from every phase above:
- **Filter controls** and **saved/author-declared views**.
- **Writeback / inline editing** of any kind. v1 emits **no** writeback metadata; the only writeback-readiness work is the fence-position copy (Phase 2) — the contract extension in `docs/writeback-contract.md` (validation rule 6 rejects `<td>` targets today) belongs to a future phase.
- Live/fetched/computed data, formulas, virtualization, pagination, `role=grid`, localStorage persistence, stack-to-cards responsive mode.
- The two pre-existing issues noted in the spec (agent-flow missing from the theme-toggle list; dead exports around `src/renderer/rehype-plugins.mjs:190-205`) — tracked separately; do not fix here.

---

## Self-Review

**1. Spec coverage**
- Fenced authoring format (header + `---` + GFM table), nested GFM parse, no `split('|')` → Phase 1 (`parseRows` via unified+remark-gfm, escaped-pipe/raw-HTML tests). ✓
- 8 typed columns with fixed value grammars + graceful raw-text fallback → Phase 1 `coerceCell` tests (one per type, bad-value cases). ✓
- url protocol allowlist enforced in the transform for BOTH modes → Phase 1 unit test + Phase 2 trusted-mode test + Phase 3 sanitized-mode test. ✓
- Real semantic `<table>`, server-side sort, flat single-`<tbody>` emission, no dead controls, `#n` source-order badges, server-emitted per-table `data-row-id` prefixes → Phase 1 `buildHast` + Phase 2 multi-table test + Phase 7 no-JS spec. ✓
- Fence `position` copied onto `<agent-table>`; no writeback metadata emitted → Phase 2 probe test (survival through `rehype-raw` verified). ✓
- Sanitize: `agent-table` host attrs, `caption` allowlisted, `data-row-id` un-clobbered, no `button` → Phase 3. ✓
- Light-DOM Lit component, JS-injected sort buttons with `aria-sort`, multi-`<tbody>` group lanes (never `<details>`), density, sticky scroll, ephemeral state → Phase 4 + Phase 7. ✓
- Theme: tokens, dark parity via document-level selectors, density, sticky first column, `caption-side: top` → Phase 5. ✓
- Error handling table (missing `---`, non-table body, mismatch pad/truncate, unknown type, bad value, bad protocol, group-by-on-multi-select, >200 rows, zero rows, multi-table ids) → Phases 1–2 tests map one-to-one. ✓
- Warning channel (new minimal plumbing, console.warn default, injectable) → Implementation note 2, Phase 2 malformed-block test. ✓
- Docs + demo + wiki mirror per the vocabulary change checklist → Phase 6. ✓
- AGENTS.md verification standard, both render modes → Phase 7 checklist. ✓
- Deferred items excluded → "Out of scope". ✓

**2. Decisions made where the spec was silent or self-tensioned** (flagged inline): `density` accepted as an optional fence-header key (the spec lists it as a sanitized host attribute and the header is the only authoring surface); status alias map replicated server-side (component file imports lit) and extended with `done`/`at-risk` so the spec's own worked example renders with the intended tones, unknown tokens → grey pill with literal label; group-header row placed in its own single-row `<tbody>` so toggling `hidden` on the group-body `<tbody>` cannot hide the header.

**3. TDD discipline** — every phase opens with failing tests (concrete assertions included), then implementation, then a green run; checkpoint commit at each phase boundary with a suggested message.

**4. Task ordering** — Phase 1 is independent; Phases 2→7 form a chain (2 needs 1's module; 3 needs 2's pipeline output; 4 enhances 2's emission; 5 styles 4's classes; 6 demos the whole; 7 verifies the demo). No two phases share a file except `tests/agent-table.test.mjs`, which is append-only across Phases 2–6.
