import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLiveServer } from '../../src/live.mjs';

test('sidebar lists docs and clicking one navigates to it', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-multi-nav-'));
  writeFileSync(join(dir, 'alpha.md'), '# Alpha Doc');
  writeFileSync(join(dir, 'beta.md'), '# Beta Doc');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    await page.goto(server.url + '/alpha');
    await expect(page.locator('#isles-sidebar')).toBeVisible();
    await page.locator('#isles-sidebar a[data-slug="beta"]').click();
    await expect(page).toHaveURL(server.url + '/beta');
    await expect(page.locator('h1')).toHaveText('Beta Doc');
  } finally {
    await server.close();
  }
});

test('writing a brand-new screen auto-advances the viewer to it', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-advance-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Screen One');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    await page.goto(server.url + '/');
    await expect(page.locator('h1')).toHaveText('Screen One');
    writeFileSync(join(dir, 'screen-2.md'), '# Screen Two');
    await expect(page.locator('h1')).toHaveText('Screen Two');
    await expect(page).toHaveURL(server.url + '/screen-2');
  } finally {
    await server.close();
  }
});

test('editing a non-viewed doc does not reload the current view', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-isolate-'));
  writeFileSync(join(dir, 'a.md'), '# Doc A');
  writeFileSync(join(dir, 'b.md'), '# Doc B');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    await page.goto(server.url + '/a');
    await page.evaluate(() => { window.__stayMarker = 'present'; });
    writeFileSync(join(dir, 'b.md'), '# Doc B edited and clearly longer now');
    // Give the watcher + SSE a beat; the current page must NOT have reloaded.
    await page.waitForTimeout(600);
    await expect.poll(() => page.evaluate(() => window.__stayMarker)).toBe('present');
    await expect(page.locator('h1')).toHaveText('Doc A');
  } finally {
    await server.close();
  }
});
