// src/renderer/agent-table.mjs — pure logic, no pipeline imports.
// Parses ```agent-table fenced blocks into hast nodes.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';

// ─── Status alias map ────────────────────────────────────────────────────────
// Source of truth: src/components/agent-status-board.js STATUS_ALIASES (lines 4-21).
// Extended with `done → green` and `at-risk → amber` to honor the spec's worked example.
// Unknown tokens → 'grey' (mirrors status-board's `|| 'grey'` fallback).
const STATUS_ALIASES = new Map([
  ['r', 'red'],
  ['red', 'red'],
  ['danger', 'red'],
  ['blocked', 'red'],
  ['a', 'amber'],
  ['amber', 'amber'],
  ['yellow', 'amber'],
  ['warning', 'amber'],
  ['at-risk', 'amber'],
  ['g', 'green'],
  ['green', 'green'],
  ['good', 'green'],
  ['ok', 'green'],
  ['done', 'green'],
  ['gray', 'grey'],
  ['grey', 'grey'],
  ['unknown', 'grey'],
  ['none', 'grey'],
]);

// ─── Recognised column types ─────────────────────────────────────────────────
const KNOWN_TYPES = new Set([
  'text', 'number', 'status', 'select', 'date', 'url', 'boolean', 'multi-select',
]);

// ─── Row count soft-limit ────────────────────────────────────────────────────
const ROW_COUNT_SOFT_LIMIT = 200;

// Single-value types (group-by is only valid on these).
const SINGLE_VALUE_TYPES = new Set([
  'text', 'select', 'status', 'boolean', 'date', 'number',
]);

// ─── Remark plugin: strip inline HTML from table cells ──────────────────────
// Without allowDangerousHtml, remark-rehype drops mdast `html` nodes but
// promotes their inner text to text nodes. This plugin removes both the
// html nodes AND ALL node indices between the first and last html node in
// the cell — regardless of node type (text, inlineCode, strong, delete, etc).
// Example: <script>`exec()`</script>safe — the script tags, the inlineCode
// node, AND any text between them are removed; "safe" after the closing tag
// remains because it is outside the first-to-last html span.
function remarkStripTableHtml() {
  return (tree) => {
    function visit(node) {
      if (node.type === 'tableCell') {
        const children = node.children || [];
        // Find first and last html node indices
        let firstHtml = -1;
        let lastHtml = -1;
        children.forEach((c, i) => {
          if (c.type === 'html') {
            if (firstHtml < 0) firstHtml = i;
            lastHtml = i;
          }
        });
        if (firstHtml >= 0) {
          // Remove all nodes from firstHtml to lastHtml (inclusive)
          node.children = children.filter((_, i) => i < firstHtml || i > lastHtml);
        }
      }
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
  };
}

// ─── Nested GFM processor (built once at module load) ────────────────────────
const nestedProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStripTableHtml)
  .use(remarkRehype);  // no allowDangerousHtml — raw HTML tags in cells are dropped

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract plain text content from a hast node tree. */
function hastText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (Array.isArray(node.children)) return node.children.map(hastText).join('');
  return '';
}

/** Walk a hast tree and find the first element with the given tagName. */
function findElement(node, tagName) {
  if (node.type === 'element' && node.tagName === tagName) return node;
  for (const child of node.children || []) {
    const found = findElement(child, tagName);
    if (found) return found;
  }
  return null;
}

/** Build a plain hast element (avoids hastscript dependency for simple nodes). */
function el(tagName, properties, children) {
  return { type: 'element', tagName, properties: properties || {}, children: children || [] };
}

/** Build a text node. */
function txt(value) {
  return { type: 'text', value: String(value) };
}

/** Strip position info from a hast node tree (nested parse positions are body-relative). */
function stripPositions(node) {
  if (!node || typeof node !== 'object') return node;
  const { position: _pos, ...rest } = node;
  if (Array.isArray(rest.children)) {
    rest.children = rest.children.map(stripPositions);
  }
  return rest;
}

// ─── URL protocol allowlist ──────────────────────────────────────────────────
// Allowed: http(s):, mailto:, or relative (no scheme — fails /^[a-z][a-z0-9+.-]*:/i)
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function isAllowedUrl(href) {
  if (!href) return false;
  const h = href.trim();
  if (!SCHEME_RE.test(h)) return true;  // relative URL — no scheme
  return /^https?:/i.test(h) || /^mailto:/i.test(h);
}

// ─── ISO-8601 date regex (YYYY-MM-DD with optional time) ────────────────────
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/;

// ─── Module exports ──────────────────────────────────────────────────────────

/**
 * Parse the header section of a fenced agent-table block.
 * @param {string} headerText
 * @returns {{ ok: boolean, title?: string, columns?: Array<{key:string,type:string}>,
 *             sort?: {key:string,dir:string}|null, groupBy?: string|null,
 *             density?: string|null, warnings: string[] }}
 */
export function parseHeader(headerText) {
  const warnings = [];
  const lines = String(headerText || '').replace(/\r\n?/g, '\n').split('\n');

  const raw = {};
  for (const line of lines) {
    const match = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2];
    if (['title', 'columns', 'sort', 'group-by', 'density'].includes(key) && value) {
      raw[key] = value;
    }
  }

  // columns is required
  if (!raw.columns) {
    return { ok: false, warnings };
  }

  // Parse columns: "key:type | key:type | …"
  const columns = raw.columns.split('|').map((seg) => {
    const trimmed = seg.trim();
    const colon = trimmed.indexOf(':');
    if (colon < 0) {
      // untyped column → text
      return { key: trimmed, type: 'text' };
    }
    const key = trimmed.slice(0, colon).trim();
    const typeRaw = trimmed.slice(colon + 1).trim().toLowerCase();
    if (!KNOWN_TYPES.has(typeRaw)) {
      warnings.push(`Unknown column type "${typeRaw}" for column "${key}"; falling back to "text".`);
      return { key, type: 'text' };
    }
    return { key, type: typeRaw };
  }).filter((c) => c.key);

  const columnKeys = new Set(columns.map((c) => c.key));

  // Parse sort: "<key> [asc|desc]"
  let sort = null;
  if (raw.sort) {
    const parts = raw.sort.trim().split(/\s+/);
    const sortKey = parts[0];
    const sortDir = (parts[1] || 'asc').toLowerCase();
    if (!columnKeys.has(sortKey)) {
      warnings.push(`sort key "${sortKey}" not found in columns; sort dropped.`);
    } else {
      sort = { key: sortKey, dir: sortDir === 'desc' ? 'desc' : 'asc' };
    }
  }

  // Parse group-by
  let groupBy = null;
  if (raw['group-by']) {
    const gbKey = raw['group-by'].trim();
    if (!columnKeys.has(gbKey)) {
      warnings.push(`group-by key "${gbKey}" not found in columns; group-by dropped.`);
    } else {
      const col = columns.find((c) => c.key === gbKey);
      if (col && !SINGLE_VALUE_TYPES.has(col.type)) {
        warnings.push(`group-by key "${gbKey}" is a multi-select column; group-by dropped (multi-select columns cannot be used for grouping).`);
      } else {
        groupBy = gbKey;
      }
    }
  }

  return {
    ok: true,
    title: raw.title || null,
    columns,
    sort,
    groupBy,
    density: raw.density || null,
    warnings,
  };
}

/**
 * Parse the body of a fenced agent-table block as a nested GFM table.
 * @param {string} bodyText
 * @returns {{ ok: boolean, headerLabels?: string[], rows?: Array<Array<any>>, warnings: string[] }}
 */
export function parseRows(bodyText) {
  const warnings = [];
  const body = String(bodyText || '').trim();

  let hast;
  try {
    const mdast = nestedProcessor.parse(body);
    hast = nestedProcessor.runSync(mdast);
  } catch (err) {
    return { ok: false, warnings: [...warnings, `parseRows: nested parse failed: ${err.message}`] };
  }

  // Find the first <table> element
  const tableEl = findElement(hast, 'table');
  if (!tableEl) {
    return { ok: false, warnings };
  }

  // Extract header labels from <thead><tr><th>
  const thead = findElement(tableEl, 'thead');
  if (!thead) {
    return { ok: false, warnings };
  }
  const headerRow = findElement(thead, 'tr');
  if (!headerRow) {
    return { ok: false, warnings };
  }
  const headerLabels = (headerRow.children || [])
    .filter((c) => c.type === 'element' && c.tagName === 'th')
    .map((th) => hastText(th).trim());

  // Extract rows from <tbody><tr><td>
  const tbody = findElement(tableEl, 'tbody');
  if (!tbody) {
    return { ok: true, headerLabels, rows: [], warnings };
  }

  const rows = (tbody.children || [])
    .filter((c) => c.type === 'element' && c.tagName === 'tr')
    .map((tr) =>
      (tr.children || [])
        .filter((c) => c.type === 'element' && c.tagName === 'td')
        .map((td) => (td.children || []).map(stripPositions))
    );

  return { ok: true, headerLabels, rows, warnings };
}

/**
 * Coerce hast cell children to a typed rendering.
 * @param {Array} cellChildren - hast children array (text/element nodes)
 * @param {string} columnType
 * @returns {{ children: Array, sortval: string|null, cellClass: string|null }}
 */
export function coerceCell(cellChildren, columnType) {
  // Extract plain text from the cell children
  const rawText = cellChildren.map(hastText).join('').trim();

  switch (columnType) {
    case 'number': {
      const n = Number(rawText);
      if (!isFinite(n) || rawText === '') {
        // non-finite or empty → raw-text fallback
        return { children: cellChildren, sortval: null, cellClass: 'agent-table-cell--number' };
      }
      return {
        children: [txt(rawText)],
        sortval: String(n),
        cellClass: 'agent-table-cell--number',
      };
    }

    case 'date': {
      if (!ISO_DATE_RE.test(rawText)) {
        return { children: cellChildren, sortval: null, cellClass: 'agent-table-cell--date' };
      }
      // Validate that the date is real (e.g. 2026-99-99 passes the regex but is an
      // invalid calendar date — treat as raw-text fallback rather than emitting a
      // <time dateTime="..."> with an invalid value or a non-null sortval).
      const dateVal = new Date(rawText);
      if (isNaN(dateVal.getTime())) {
        return { children: cellChildren, sortval: null, cellClass: 'agent-table-cell--date' };
      }
      // Friendly display: format as locale date
      const displayText = dateVal.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
      return {
        children: [el('time', { dateTime: rawText }, [txt(displayText)])],
        sortval: rawText,
        cellClass: 'agent-table-cell--date',
      };
    }

    case 'status': {
      const tone = STATUS_ALIASES.get(rawText.toLowerCase()) || 'grey';
      const label = rawText || tone;
      return {
        children: [
          el('span', { className: [`agent-table-pill`, `agent-table-pill--${tone}`] }, [txt(label)]),
        ],
        sortval: tone,
        cellClass: 'agent-table-cell--status',
      };
    }

    case 'select': {
      return {
        children: [
          el('span', { className: ['agent-table-chip'] }, [txt(rawText)]),
        ],
        sortval: rawText.toLowerCase(),
        cellClass: 'agent-table-cell--select',
      };
    }

    case 'boolean': {
      const lower = rawText.toLowerCase();
      const trueValues = new Set(['true', 'yes', 'x']);
      const falseValues = new Set(['false', 'no', '']);
      if (trueValues.has(lower)) {
        return {
          children: [
            el('span', { className: ['agent-table-bool'], 'aria-hidden': 'true' }, [txt('✓')]),
            el('span', { className: ['visually-hidden'] }, [txt('Yes')]),
          ],
          sortval: '1',
          cellClass: 'agent-table-cell--boolean',
        };
      }
      if (falseValues.has(lower)) {
        return {
          children: [
            el('span', { className: ['agent-table-bool'], 'aria-hidden': 'true' }, [txt('–')]),
            el('span', { className: ['visually-hidden'] }, [txt('No')]),
          ],
          sortval: '0',
          cellClass: 'agent-table-cell--boolean',
        };
      }
      // unrecognised value → raw-text fallback
      return { children: cellChildren, sortval: null, cellClass: 'agent-table-cell--boolean' };
    }

    case 'multi-select': {
      const chips = rawText
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => el('span', { className: ['agent-table-chip'] }, [txt(v)]));
      return {
        children: chips.length ? chips : cellChildren,
        sortval: rawText.toLowerCase(),
        cellClass: 'agent-table-cell--multi-select',
      };
    }

    case 'url': {
      if (!rawText) {
        return { children: cellChildren, sortval: null, cellClass: 'agent-table-cell--url' };
      }
      if (!isAllowedUrl(rawText)) {
        // Disallowed protocol → plain text (no <a>)
        return { children: [txt(rawText)], sortval: null, cellClass: 'agent-table-cell--url' };
      }
      return {
        children: [el('a', { href: rawText }, [txt(rawText)])],
        sortval: rawText.toLowerCase(),
        cellClass: 'agent-table-cell--url',
      };
    }

    case 'text':
    default: {
      // Rich inline children kept as-is; sortval = lowercased trimmed text
      return {
        children: cellChildren,
        sortval: rawText.toLowerCase() || null,
        cellClass: null,
      };
    }
  }
}

/**
 * Build a hast tree for an agent-table island.
 * @param {{ rowsResult, columns, sort, groupBy, density, title, warnings }} parsed
 * @param {{ tableIndex?: number }} [options]
 * @returns {{ node: object, warnings: string[] }}
 */
export function buildHast(parsed, { tableIndex } = {}) {
  const warnings = [...(parsed.warnings || [])];
  const { rowsResult } = parsed;
  const columns = parsed.columns || [];
  const title = parsed.title || null;
  const sortSpec = parsed.sort || null;
  const density = parsed.density || null;
  const groupBy = parsed.groupBy || null;
  const idx = tableIndex ?? 0;

  // Build thead
  const thNodes = columns.map((col) => {
    // Find label from headerLabels (positional match) or fall back to key
    const colIndex = columns.indexOf(col);
    const label = (rowsResult.headerLabels && rowsResult.headerLabels[colIndex]) || col.key;
    return el('th', { scope: 'col', 'data-key': col.key, 'data-type': col.type }, [txt(label)]);
  });
  const thead = el('thead', {}, [el('tr', {}, thNodes)]);

  // Gather raw rows
  const rawRows = rowsResult.rows || [];

  // Handle rows exceeding the soft limit
  if (rawRows.length > ROW_COUNT_SOFT_LIMIT) {
    warnings.push(`agent-table: table has ${rawRows.length} rows (> ${ROW_COUNT_SOFT_LIMIT}). Consider using a dedicated data tool for large datasets.`);
  }

  // Build typed cells for each row, attaching source row index (1-based)
  const typedRows = rawRows.map((rowCells, sourceIdx) => {
    const rowNum = sourceIdx + 1;

    // Warn once per row when the row is shorter than the declared column count
    if (rowCells.length > 0 && rowCells.length < columns.length) {
      warnings.push(`Row ${rowNum}: fewer cells than declared columns; padding with empty cells.`);
    }

    const cells = columns.map((col, colIdx) => {
      const raw = rowCells[colIdx] || [];
      const { children: coercedChildren, sortval, cellClass } = coerceCell(raw, col.type);

      const tdProps = {};
      if (cellClass) tdProps.className = [cellClass];
      if (sortval !== null && sortval !== undefined) tdProps['data-sortval'] = sortval;

      // First cell gets the row-ref badge
      const cellContent = colIdx === 0
        ? [el('span', { className: ['agent-table-rowref'] }, [txt(`#${rowNum}`)]), txt(' '), ...coercedChildren]
        : coercedChildren;

      return el('td', tdProps, cellContent);
    });

    return { rowNum, cells };
  });

  // Apply server-side sort if specified
  let sortedTypedRows = [...typedRows];
  if (sortSpec) {
    const colIdx = columns.findIndex((c) => c.key === sortSpec.key);
    if (colIdx >= 0) {
      const colType = columns[colIdx].type;
      sortedTypedRows.sort((a, b) => {
        // Get sortval from the td at colIdx
        const aVal = a.cells[colIdx]?.properties?.['data-sortval'] ?? '';
        const bVal = b.cells[colIdx]?.properties?.['data-sortval'] ?? '';

        let cmp;
        if (colType === 'number') {
          cmp = (Number(aVal) || 0) - (Number(bVal) || 0);
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }

        // Apply direction ONLY to the value comparison.
        // The tiebreak is always ascending source order so that data-row-id/#n
        // remain stable regardless of sort direction (spec guarantee).
        if (sortSpec.dir === 'desc') cmp = -cmp;
        if (cmp === 0) cmp = a.rowNum - b.rowNum;

        return cmp;
      });
    }
  }

  // Build tbody
  let tbodyChildren;
  if (sortedTypedRows.length === 0) {
    // Zero rows → empty-state row
    const emptyTd = el('td', { colSpan: columns.length || 1, className: ['agent-table-empty'] }, [
      txt('No rows.'),
    ]);
    tbodyChildren = [el('tr', {}, [emptyTd])];
  } else {
    tbodyChildren = sortedTypedRows.map(({ rowNum, cells }) =>
      el('tr', { 'data-row-id': `t${idx}-r${rowNum}` }, cells)
    );
  }
  const tbody = el('tbody', {}, tbodyChildren);

  // Build the table
  const tableChildren = [];
  if (title) tableChildren.push(el('caption', {}, [txt(title)]));
  tableChildren.push(thead, tbody);
  const table = el('table', {}, tableChildren);

  // Wrap in scroll div
  const scrollDiv = el('div', { className: ['agent-table-scroll'] }, [table]);

  // Build agent-table host element
  const hostProps = {};
  if (title) hostProps.title = title;
  if (groupBy) hostProps['group-by'] = groupBy;
  if (sortSpec) hostProps.sort = `${sortSpec.key} ${sortSpec.dir}`;
  if (density) hostProps.density = density;

  const node = el('agent-table', hostProps, [scrollDiv]);

  return { node, warnings };
}

/**
 * Orchestrator: parse a complete agent-table fenced block source.
 * @param {string} source - the full fence body (header + '---' + table body)
 * @param {{ tableIndex?: number }} options
 * @returns {{ ok: boolean, node?: object, warnings: string[] }}
 */
export function parseAgentTable(source, { tableIndex } = {}) {
  const warnings = [];
  const text = String(source || '').replace(/\r\n?/g, '\n');

  // Split once and reuse for both the separator search and slicing
  const lines = text.split('\n');
  const sepIdx = lines.findIndex((line) => line.trim() === '---');
  if (sepIdx < 0) {
    warnings.push('agent-table: missing "---" separator between header and table body.');
    return { ok: false, warnings };
  }

  const headerText = lines.slice(0, sepIdx).join('\n');
  const bodyText = lines.slice(sepIdx + 1).join('\n');

  // Parse header
  const headerResult = parseHeader(headerText);
  if (!headerResult.ok) {
    warnings.push(...headerResult.warnings, 'agent-table: header parse failed (columns required).');
    return { ok: false, warnings };
  }
  warnings.push(...headerResult.warnings);

  // Parse rows
  const rowsResult = parseRows(bodyText);
  if (!rowsResult.ok) {
    warnings.push(...rowsResult.warnings, 'agent-table: body is not a GFM table.');
    return { ok: false, warnings };
  }
  warnings.push(...rowsResult.warnings);

  // Build hast
  const { node, warnings: buildWarnings } = buildHast(
    {
      headerResult,
      rowsResult,
      columns: headerResult.columns,
      sort: headerResult.sort,
      groupBy: headerResult.groupBy,
      density: headerResult.density,
      title: headerResult.title,
      warnings: [],
    },
    { tableIndex }
  );
  warnings.push(...buildWarnings);

  return { ok: true, node, warnings };
}
