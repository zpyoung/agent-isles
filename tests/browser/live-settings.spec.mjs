import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLiveServer } from '../../src/live.mjs';

function makeDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, 'screen-1.md'), '# Hello\n\nSome content.\n');
  return dir;
}

const fontSize = (page) => page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--agent-isles-page-font-size').trim());
const maxWidth = (page) => page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--agent-isles-page-max-width').trim());
const theme = (page) => page.evaluate(() =>
  document.documentElement.getAttribute('data-bs-theme'));

test('gear opens the popover and Escape closes it', async ({ page }) => {
  const dir = makeDir('isles-set-open-');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    const panel = page.locator('#isles-settings');
    await expect(panel).toBeHidden();
    await page.locator('#isles-settings-btn').click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  } finally {
    await server.close();
  }
});

test('changing Text drives the font-size variable and persists across reload', async ({ page }) => {
  const dir = makeDir('isles-set-text-');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    await page.locator('#isles-settings-btn').click();
    await page.locator('#isles-settings button[data-font-size="18px"]').click();
    await expect.poll(() => fontSize(page)).toBe('18px');
    await page.reload();
    await expect.poll(() => fontSize(page)).toBe('18px');
  } finally {
    await server.close();
  }
});

test('theme control sets data-bs-theme; reset returns reading prefs to defaults', async ({ page }) => {
  const dir = makeDir('isles-set-theme-');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    await page.locator('#isles-settings-btn').click();
    await page.locator('#isles-settings button[data-theme="dark"]').click();
    await expect.poll(() => theme(page)).toBe('dark');
    await page.locator('#isles-settings button[data-width="1200px"]').click();
    await page.locator('#isles-settings button[data-font-size="18px"]').click();
    await expect.poll(() => maxWidth(page)).toBe('1200px');
    await page.locator('#isles-settings-reset').click();
    await expect.poll(() => maxWidth(page)).toBe('960px');
    await expect.poll(() => fontSize(page)).toBe('16px');
  } finally {
    await server.close();
  }
});

const themeMode = (page) => page.evaluate(() => {
  const raw = localStorage.getItem('agent-isles-live-settings');
  return raw ? JSON.parse(raw).themeMode : null;
});

test('selecting Auto in one tab stays Auto in another (THEME_KEY mirror not adopted)', async ({ context }) => {
  const dir = makeDir('isles-set-sync-');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    // Pin the system scheme so Auto resolves deterministically (CI may default to dark).
    await page1.emulateMedia({ colorScheme: 'light' });
    await page2.emulateMedia({ colorScheme: 'light' });
    await page1.goto(server.url + '/');
    await page2.goto(server.url + '/');

    // Pin both tabs to Dark from tab 1 and confirm it propagates.
    await page1.locator('#isles-settings-btn').click();
    await page1.locator('#isles-settings button[data-theme="dark"]').click();
    await expect.poll(() => theme(page2)).toBe('dark');

    // Switch tab 1 back to Auto; tab 2 must also land on Auto — not the resolved literal.
    await page1.locator('#isles-settings button[data-theme="auto"]').click();
    await expect.poll(() => themeMode(page1)).toBe('auto');
    await expect.poll(() => themeMode(page2)).toBe('auto');
    // Tab 2 must actually re-apply the resolved Auto theme (light by default), proving it
    // reacted to the storage event rather than merely sharing localStorage.
    await expect.poll(() => theme(page2)).toBe('light');
  } finally {
    await server.close();
  }
});
