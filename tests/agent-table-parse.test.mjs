import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHeader, parseRows, coerceCell, parseAgentTable } from '../src/renderer/agent-table.mjs';

// ─── parseHeader ────────────────────────────────────────────────────────────

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

// ─── parseRows ──────────────────────────────────────────────────────────────

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

// Item 3: remarkStripTableHtml must also strip non-text inline nodes between html tags
test('parseRows: inline code between raw-HTML tags is stripped too, text after closing tag kept', () => {
  // <script>`exec()`</script>safe  — the backtick-code node between the tags must vanish
  const r = parseRows('| A |\n| - |\n| <script>`exec()`</script>safe |');
  const serialized = JSON.stringify(r.rows);
  assert.doesNotMatch(serialized, /script/);
  assert.doesNotMatch(serialized, /exec/);   // inline code node was removed
  assert.match(serialized, /safe/);          // text after closing tag kept
});

test('parseRows: body without a GFM table (missing delimiter row) is not ok', () => {
  assert.equal(parseRows('| A |\n| just text |').ok, false);   // no |---| delimiter row
  assert.equal(parseRows('plain prose, no table').ok, false);
});

// ─── coerceCell ─────────────────────────────────────────────────────────────

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

// Item 8: ISO-shaped but invalid date (regex passes, Date() → Invalid) must be raw-text fallback
test('coerceCell date: ISO-shaped but semantically invalid date -> raw-text fallback, sortval null', () => {
  const bad = coerceCell(textCell('2026-13-45'), 'date');
  assert.equal(bad.sortval, null);
  // Must NOT emit a <time> element (would carry an invalid dateTime attr)
  assert.doesNotMatch(JSON.stringify(bad.children), /"tagName":"time"/);
  // The raw text should still be visible as a fallback
  assert.match(JSON.stringify(bad.children), /2026-13-45/);
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

// Item 9: scheme-relative URLs (//example.com) — document the explicit decision.
// isAllowedUrl matches the SCHEME_RE only when a scheme is present; //example.com has no
// scheme component, so SCHEME_RE does NOT match and the URL is treated as a relative URL →
// allowed and rendered as <a>. We document this explicitly rather than leaving it implicit.
test('coerceCell url: scheme-relative URL (//example.com) is treated as a relative path -> <a> allowed', () => {
  // //example.com has no colon-scheme, so SCHEME_RE doesn't match → allowed as relative.
  const result = JSON.stringify(coerceCell(textCell('//example.com/page'), 'url').children);
  assert.match(result, /"tagName":"a"/);
});

// ─── buildHast + parseAgentTable ────────────────────────────────────────────

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
  assert.match(html, /t1-r1/);                              // data-row-id, per-table prefix

  // Item 2: Drill to first tbody tr: agent-table > div.agent-table-scroll > table > tbody > tr
  const scrollDiv = node.children[0];                       // div.agent-table-scroll
  const table = scrollDiv.children[0];                      // table
  // table children may be [caption, thead, tbody] or [thead, tbody]
  const tbody = table.children.find((c) => c.tagName === 'tbody');
  const firstTr = tbody.children[0];

  // sort: effort desc -> Writeback API (effort=5) is the first body row
  assert.match(JSON.stringify(firstTr), /Writeback API/);
  // source-order row-id is preserved (Writeback API was row 1 in source)
  assert.equal(firstTr.properties['data-row-id'], 't1-r1');
});

// Item 1: stable-sort tiebreak under desc must still be ascending source order
test('buildHast: tied sort values under desc keep ascending source order (tiebreak always ascending)', () => {
  const fence = `columns: name:text | score:number
sort: score desc
---
| Name | Score |
| - | - |
| Alpha | 10 |
| Beta | 10 |
| Gamma | 10 |`;

  const { ok, node } = parseAgentTable(fence, { tableIndex: 0 });
  assert.equal(ok, true);

  const scrollDiv = node.children[0];
  const table = scrollDiv.children[0];
  const tbody = table.children.find((c) => c.tagName === 'tbody');
  const trs = tbody.children;

  // All have score=10, so source order must be preserved: Alpha, Beta, Gamma
  // row-ids confirm source order: t0-r1, t0-r2, t0-r3
  assert.equal(trs[0].properties['data-row-id'], 't0-r1'); // Alpha first
  assert.equal(trs[1].properties['data-row-id'], 't0-r2'); // Beta second
  assert.equal(trs[2].properties['data-row-id'], 't0-r3'); // Gamma third
  assert.match(JSON.stringify(trs[0]), /Alpha/);
  assert.match(JSON.stringify(trs[1]), /Beta/);
  assert.match(JSON.stringify(trs[2]), /Gamma/);
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
