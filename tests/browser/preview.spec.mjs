import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startPreviewServer } from '../../src/preview.mjs';

test('directory preview UI selects and renders multiple Markdown files', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-browser-'));
  mkdirSync(join(root, 'plans'), { recursive: true });
  writeFileSync(join(root, 'overview.md'), '# Overview\n\nChoose a plan.\n', 'utf8');
  writeFileSync(join(root, 'plans', 'launch.md'), '# Launch Plan\n\n<agent-decision verdict="go" title="Launch">Ship it.</agent-decision>\n', 'utf8');

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 50,
    includeUserPacks: false,
  });

  try {
    await page.goto(preview.url);
    await expect(page.getByRole('heading', { name: 'Agent Isles Preview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'overview.md' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'plans/launch.md' })).toBeVisible();

    const previewFrame = page.frameLocator('iframe[title="Rendered Markdown preview"]');
    await expect(previewFrame.locator('h1')).toContainText('Overview');

    await page.getByRole('button', { name: 'plans/launch.md' }).click();
    await expect(previewFrame.locator('h1')).toContainText('Launch Plan');
    await expect(previewFrame.locator('agent-decision')).toContainText('Ship it.');
    await expect(previewFrame.locator('agent-decision')).toHaveAttribute('verdict', 'go');
  } finally {
    await preview.close();
  }
});
