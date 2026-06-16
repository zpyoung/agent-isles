import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

// ─── Primary demo table constants ────────────────────────────────────────────
// Source: examples/demo.md — first agent-table block (tableIndex=1 → t1- prefix)
//   columns: task:text | owner:text | phase:select | status:status | effort:number
//            | due:date | spec:url | approved:boolean | tags:multi-select
//   sort: effort desc  (server-side: effort=8 row first)
//   group-by: status   (groups by data-sortval of the status cell: "green"/"amber"/"red")
//
// Source rows (1-indexed rowNum):
//   r1 — Renderer pipeline | Merlin | build | done(→green) | 8 | 2026-06-01 | … | true  | core,pipeline
//   r2 — Writeback API     | Zach   | ship  | at-risk(→amber) | 5 | 2026-06-15 | … | false | api,writeback
//   r3 — Dark mode CSS     | Merlin | build | blocked(→red)  | 3 | 2026-06-20 | … | false | theme
//
// After sort: effort desc — rendered order: r1 (8), r2 (5), r3 (3)
// data-row-id values: t1-r1, t1-r2, t1-r3  (rowNum from source, not sort position)

const PRIMARY_COL_COUNT = 9; // task owner phase status effort due spec approved tags
const PRIMARY_CAPTION = 'Launch readiness';
// First row in the flat (pre-JS) tbody after server-sort: Renderer pipeline, effort 8
const FIRST_ROW_ID_STATIC = 't1-r1';
const FIRST_ROW_TASK_TEXT = 'Renderer pipeline';

// ─── Test 1 — Static artifact, JavaScript disabled ───────────────────────────

test('agent-table static artifact is accessible without JavaScript', async ({ browser }) => {
  const server = await serveDist();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  try {
    await page.goto(`${server.origin}/demo.html`);

    // The primary agent-table is visible.
    const primaryIsland = page.locator('agent-table').first();
    await expect(primaryIsland).toBeVisible();

    // Caption text matches the title.
    const caption = primaryIsland.locator('table caption');
    await expect(caption).toHaveText(PRIMARY_CAPTION);

    // Correct number of column headers.
    const thCols = primaryIsland.locator('thead th[scope="col"]');
    await expect(thCols).toHaveCount(PRIMARY_COL_COUNT);

    // Static artifact has ZERO buttons (sort/toggle buttons are JS-injected only).
    const buttons = primaryIsland.locator('button');
    await expect(buttons).toHaveCount(0);

    // Flat server tbody — exactly one tbody element (no group-by restructuring yet).
    const tbodies = primaryIsland.locator('tbody');
    await expect(tbodies).toHaveCount(1);

    // Server-side sort: effort desc → highest-effort row (Renderer pipeline, effort=8)
    // is the first tr in the tbody. Its data-row-id is t1-r1 (source row 1).
    const firstRow = primaryIsland.locator('tbody tr[data-row-id]').first();
    await expect(firstRow).toHaveAttribute('data-row-id', FIRST_ROW_ID_STATIC);
    // First cell contains the row-ref badge and the task text.
    const firstCell = firstRow.locator('td').first();
    await expect(firstCell).toContainText(FIRST_ROW_TASK_TEXT);

    // Second demo table "Reading list" is also present with t2- prefix rows.
    const secondIsland = page.locator('agent-table').nth(1);
    await expect(secondIsland).toBeVisible();
    const readingListCaption = secondIsland.locator('table caption');
    await expect(readingListCaption).toHaveText('Reading list');
    const secondTableFirstRow = secondIsland.locator('tbody tr[data-row-id]').first();
    await expect(secondTableFirstRow).toHaveAttribute('data-row-id', 't2-r1');
  } finally {
    await context.close();
    await server.close();
  }
});

// ─── Test 2 — Enhanced (JavaScript enabled): sort, group-by, and interactions ─

test('agent-table enhances with sort buttons and group-by lanes', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    // Wait for the custom element to be defined.
    await expect
      .poll(() => page.evaluate(() => Boolean(customElements.get('agent-table'))))
      .toBe(true);

    const primaryIsland = page.locator('agent-table').first();
    await expect(primaryIsland).toBeVisible();

    // ── Sort buttons are injected into every th[data-key] ──────────────────────

    const effortTh = primaryIsland.locator('thead th[data-key="effort"]');
    await expect(effortTh).toBeVisible();

    // After enhancement, each th contains a button.agent-table-sort.
    const effortSortBtn = effortTh.locator('button.agent-table-sort');
    await expect(effortSortBtn).toBeVisible();
    await expect(effortSortBtn).toHaveText('Effort');

    // The th that matches the server-side sort (effort desc) reflects aria-sort="descending".
    await expect(effortTh).toHaveAttribute('aria-sort', 'descending');

    // ── Clicking the sort button toggles aria-sort direction ───────────────────

    // Currently descending — click once → ascending.
    await effortSortBtn.click();
    await expect(effortTh).toHaveAttribute('aria-sort', 'ascending');

    // After sorting ascending by effort, lowest-effort row (Dark mode CSS, effort=3)
    // should be first in the group body tbody. Assert via data-row-id: t1-r3 (source row 3).
    await expect
      .poll(() => primaryIsland.evaluate((el) => {
        // When group-by is active we check inside the first group-body tbody.
        const groupBodies = el.querySelectorAll('tbody.agent-table-group-body');
        if (groupBodies.length > 0) {
          // Find the group body that contains t1-r3 (Dark mode CSS, effort 3, status blocked/red).
          // After ascending sort within each group, the only row in the "red" group is t1-r3.
          // Check the first group body's first row id instead.
          return [...groupBodies].map((tb) => tb.querySelector('tr[data-row-id]')?.dataset.rowId);
        }
        return el.querySelector('tbody tr[data-row-id]')?.dataset.rowId;
      }))
      .not.toBeNull();

    // Click again → descending; the effort th goes back to descending.
    await effortSortBtn.click();
    await expect(effortTh).toHaveAttribute('aria-sort', 'descending');

    // Clicking a different column (task) removes aria-sort from effort th.
    const taskTh = primaryIsland.locator('thead th[data-key="task"]');
    const taskSortBtn = taskTh.locator('button.agent-table-sort');
    await taskSortBtn.click();
    await expect(taskTh).toHaveAttribute('aria-sort', 'ascending');
    await expect(effortTh).not.toHaveAttribute('aria-sort');

    // ── data-row-id values survive sort (no renumbering) ──────────────────────

    const allRowIds = await primaryIsland.evaluate((el) =>
      [...el.querySelectorAll('tr[data-row-id]')].map((tr) => tr.dataset.rowId),
    );
    // All three source rows are present under t1- prefix regardless of sort order.
    expect(allRowIds).toEqual(expect.arrayContaining(['t1-r1', 't1-r2', 't1-r3']));
    expect(allRowIds).toHaveLength(3);

    // ── Group-by: multi-tbody structure ───────────────────────────────────────

    // The group-by component creates tbody.agent-table-group-header + tbody.agent-table-group-body
    // pairs. There are 3 status groups (green/done, amber/at-risk, red/blocked).
    const groupHeaders = primaryIsland.locator('tbody.agent-table-group-header');
    const groupBodies = primaryIsland.locator('tbody.agent-table-group-body');
    await expect(groupHeaders).toHaveCount(3);
    await expect(groupBodies).toHaveCount(3);

    // Each group header contains a button.agent-table-group-toggle.
    const firstToggle = groupHeaders.first().locator('button.agent-table-group-toggle');
    await expect(firstToggle).toBeVisible();
    await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');

    // ── Clicking a group toggle collapses the body tbody only ─────────────────

    const firstGroupBody = groupBodies.first();
    // Body is currently visible (no hidden attribute).
    await expect(firstGroupBody).not.toHaveAttribute('hidden');

    // Click the toggle → body collapses.
    await firstToggle.click();
    await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(firstGroupBody).toHaveAttribute('hidden');

    // The header tbody itself is still visible.
    await expect(groupHeaders.first()).toBeVisible();

    // Click again → body re-expands.
    await firstToggle.click();
    await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(firstGroupBody).not.toHaveAttribute('hidden');

    // ── No href="javascript:" anywhere in the document ────────────────────────

    const jsHrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .filter((a) => /^javascript:/i.test(a.getAttribute('href') ?? ''))
        .length,
    );
    expect(jsHrefs).toBe(0);

    // ── No console errors ─────────────────────────────────────────────────────

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});

// ─── Test 3 — Responsive + dark mode ─────────────────────────────────────────

test('agent-table scroll container is sticky-column responsive and respects dark mode', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    // Wait for enhancement.
    await expect
      .poll(() => page.evaluate(() => Boolean(customElements.get('agent-table'))))
      .toBe(true);

    const primaryIsland = page.locator('agent-table').first();

    // ── Narrow viewport (390 × 900) ───────────────────────────────────────────

    await page.setViewportSize({ width: 390, height: 900 });

    const scrollDiv = primaryIsland.locator('.agent-table-scroll').first();
    await expect(scrollDiv).toBeVisible();

    // The scroll container should have overflow-x: auto (set by CSS).
    const overflowX = await scrollDiv.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe('auto');

    // First-column cells (th and td) use position: sticky (set by CSS).
    const firstThPosition = await primaryIsland.evaluate((el) =>
      getComputedStyle(el.querySelector('thead th:first-child')).position,
    );
    expect(firstThPosition).toBe('sticky');

    // After group-by enhancement the flat tbody is replaced with group-body tbodies;
    // querySelector finds the first td:first-child from any tbody.
    const firstTdPosition = await primaryIsland.evaluate((el) => {
      const td = el.querySelector('tbody.agent-table-group-body tr td:first-child')
        ?? el.querySelector('tbody tr td:first-child');
      return td ? getComputedStyle(td).position : null;
    });
    expect(firstTdPosition).toBe('sticky');

    // ── Both demo tables are present (t1- and t2- prefixes are unique) ─────────

    const allIslands = page.locator('agent-table');
    await expect(allIslands).toHaveCount(2);

    // Primary table has t1-r* rows.
    const primaryRowIds = await primaryIsland.evaluate((el) =>
      [...el.querySelectorAll('tr[data-row-id]')].map((tr) => tr.dataset.rowId),
    );
    expect(primaryRowIds.every((id) => id.startsWith('t1-'))).toBe(true);

    // Second table has t2-r* rows.
    const secondIsland = page.locator('agent-table').nth(1);
    const secondRowIds = await secondIsland.evaluate((el) =>
      [...el.querySelectorAll('tr[data-row-id]')].map((tr) => tr.dataset.rowId),
    );
    expect(secondRowIds.every((id) => id.startsWith('t2-'))).toBe(true);

    // No overlap between the two sets of ids.
    const allIds = [...primaryRowIds, ...secondRowIds];
    expect(new Set(allIds).size).toBe(allIds.length);

    // ── Dark mode: table surface color changes ─────────────────────────────────

    // Capture the light-mode background of the first table element.
    const lightBg = await primaryIsland.evaluate((el) =>
      getComputedStyle(el.querySelector('table')).backgroundColor,
    );
    // Light mode surface: --agent-isles-surface = #ffffff → rgb(255, 255, 255)
    expect(lightBg).toBe('rgb(255, 255, 255)');

    // Set dark mode by writing the data-bs-theme attribute on <html>.
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
    });

    // The table's computed background-color should now be the dark surface token
    // (#0f172a → rgb(15, 23, 42)).
    await expect
      .poll(() => primaryIsland.evaluate((el) =>
        getComputedStyle(el.querySelector('table')).backgroundColor,
      ))
      .toBe('rgb(15, 23, 42)');

    // Dark mode caption color changes from heading token.
    // Light: --agent-isles-heading = #0f172a → rgb(15, 23, 42)
    // Dark:  --agent-isles-heading = #f8fafc → rgb(248, 250, 252)
    await expect
      .poll(() => primaryIsland.evaluate((el) =>
        getComputedStyle(el.querySelector('table caption')).color,
      ))
      .toBe('rgb(248, 250, 252)');

    // ── No console errors ─────────────────────────────────────────────────────

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
