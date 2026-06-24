import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLiveServer } from '../../src/live.mjs';

// Reader mode renders Markdown client-side from raw files. These specs drive the
// SPA bundle (dist/isles-reader.js) in a real browser.

test('reader renders a folder tree and the active document client-side', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-reader-pw-tree-'));
  writeFileSync(join(dir, 'root.md'), '# Root Doc\n\nROOT_BODY_UNIQUE');
  mkdirSync(join(dir, 'guides'));
  writeFileSync(join(dir, 'guides', 'intro.md'), '# Intro Doc\n\nINTRO_BODY_UNIQUE');
  const server = await startLiveServer(dir, { port: 0, reader: true, watch: true });
  try {
    await page.goto(server.url + '/root');
    // The document rendered (client-side) into the main pane.
    await expect(page.locator('#isles-doc h1')).toHaveText('Root Doc');
    await expect(page.locator('#isles-doc')).toContainText('ROOT_BODY_UNIQUE');
    // The nested folder tree is present with the sibling doc.
    await expect(page.locator('#isles-sidebar')).toBeVisible();
    await expect(page.locator('#isles-tree a[data-slug="guides/intro"]')).toHaveCount(1);
    // Navigate via the tree → the other doc renders without a full reload.
    await page.evaluate(() => { window.__readerStay = 'present'; });
    await page.locator('#isles-tree a[data-slug="guides/intro"]').click();
    await expect(page.locator('#isles-doc h1')).toHaveText('Intro Doc');
    await expect(page.locator('#isles-doc')).toContainText('INTRO_BODY_UNIQUE');
    expect(await page.evaluate(() => window.__readerStay)).toBe('present');
  } finally {
    await server.close();
  }
});

test('reader hydrates an Agent Isles island', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-reader-pw-island-'));
  writeFileSync(
    join(dir, 'doc.md'),
    '# With Island\n\n<agent-decision verdict="go" title="Ship it">Body text.</agent-decision>\n',
  );
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    await page.goto(server.url + '/');
    const decision = page.locator('agent-decision');
    await expect(decision).toHaveCount(1);
    // The Lit component upgraded and rendered its shadow DOM (title surfaced).
    await expect(decision).toContainText('Ship it');
  } finally {
    await server.close();
  }
});

test('reader live-reloads the open document when its file changes', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-reader-pw-reload-'));
  writeFileSync(join(dir, 'note.md'), '# Note\n\nFIRST_VERSION');
  const server = await startLiveServer(dir, { port: 0, reader: true, watch: true });
  try {
    await page.goto(server.url + '/note');
    await expect(page.locator('#isles-doc')).toContainText('FIRST_VERSION');
    await expect.poll(() => server._clients.size).toBe(1);
    writeFileSync(join(dir, 'note.md'), '# Note\n\nSECOND_VERSION updated');
    await expect(page.locator('#isles-doc')).toContainText('SECOND_VERSION');
  } finally {
    await server.close();
  }
});
