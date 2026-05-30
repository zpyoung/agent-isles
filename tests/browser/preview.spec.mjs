import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startPreviewServer } from '../../src/preview.mjs';

test('writeback preview toggles markdown task checkboxes and rolls back stale failures', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-writeback-browser-'));
  const sourcePath = join(root, 'plan.md');
  writeFileSync(sourcePath, '- [ ] duplicate\n  - [x] nested\n- [ ] duplicate\n', 'utf8');

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 60_000,
    includeUserPacks: false,
    writeback: true,
  });

  try {
    await page.goto(preview.url);
    const previewFrame = page.frameLocator('iframe[title="Rendered Markdown preview"]');
    const checkboxes = previewFrame.getByRole('checkbox');

    await expect(checkboxes).toHaveCount(3);
    await checkboxes.nth(2).click();
    await expect.poll(() => readFileSync(sourcePath, 'utf8')).toBe('- [ ] duplicate\n  - [x] nested\n- [x] duplicate\n');
    await checkboxes.nth(2).click();
    await expect.poll(() => readFileSync(sourcePath, 'utf8')).toBe('- [ ] duplicate\n  - [x] nested\n- [ ] duplicate\n');
    await checkboxes.nth(2).click();
    await expect.poll(() => readFileSync(sourcePath, 'utf8')).toBe('- [ ] duplicate\n  - [x] nested\n- [x] duplicate\n');

    const frameHandle = await page.locator('iframe[title="Rendered Markdown preview"]').elementHandle();
    const frame = await frameHandle.contentFrame();
    await frame.getByRole('checkbox').first().evaluate((input) => {
      const metadata = JSON.parse(input.getAttribute('data-agent-isles-writeback'));
      metadata.sourceVersion = 'sha256-stale';
      input.setAttribute('data-agent-isles-writeback', JSON.stringify(metadata));
    });
    await checkboxes.nth(0).click();
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(previewFrame.getByRole('alert')).toContainText('Writeback failed');
    expect(readFileSync(sourcePath, 'utf8')).toBe('- [ ] duplicate\n  - [x] nested\n- [x] duplicate\n');
  } finally {
    await preview.close();
  }
});

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
