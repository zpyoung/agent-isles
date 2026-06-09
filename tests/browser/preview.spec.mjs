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

test('directory preview upgrades custom elements from selected file nested pack config', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-nested-pack-browser-'));
  mkdirSync(join(root, 'nested'), { recursive: true });
  mkdirSync(join(root, 'widget-pack'), { recursive: true });
  writeFileSync(join(root, 'nested', 'doc.md'), '# Nested Pack\n\n<nested-widget label="from-pack">Fallback</nested-widget>\n', 'utf8');
  writeFileSync(join(root, 'nested', 'isles.config.json'), JSON.stringify({ packs: ['../widget-pack'] }, null, 2));
  writeFileSync(join(root, 'widget-pack', 'agent-isles.pack.json'), JSON.stringify({
    agentIslesPackVersion: 1,
    name: 'nested-pack',
    version: '1.0.0',
    tags: [{ name: 'nested-widget', attributes: ['label'] }],
    assets: [{ type: 'module', path: 'nested-widget.js' }],
  }, null, 2));
  writeFileSync(
    join(root, 'widget-pack', 'nested-widget.js'),
    [
      'customElements.define("nested-widget", class extends HTMLElement {',
      '  connectedCallback() {',
      '    this.setAttribute("data-upgraded", "yes");',
      '    this.textContent = `UPGRADED ${this.getAttribute("label")}`;',
      '  }',
      '});',
      '',
    ].join('\n'),
    'utf8',
  );

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 60_000,
    includeUserPacks: false,
  });

  try {
    await page.goto(preview.url);
    await page.getByRole('button', { name: 'nested/doc.md' }).click();

    const previewFrame = page.frameLocator('iframe[title="Rendered Markdown preview"]');
    await expect(previewFrame.locator('nested-widget')).toHaveAttribute('data-upgraded', 'yes');
    await expect(previewFrame.locator('nested-widget')).toContainText('UPGRADED from-pack');
  } finally {
    await preview.close();
  }
});

test('directory preview provides reading controls and rendered table of contents', async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-reading-'));
  writeFileSync(join(root, 'guide.md'), '# Guide\n\n## Readable Width\n\nBody.\n\n### Font Scale\n\nMore body.\n', 'utf8');

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 60_000,
    includeUserPacks: false,
  });

  try {
    await page.goto(preview.url);
    const previewFrame = page.frameLocator('iframe[title="Rendered Markdown preview"]');

    await expect(page.getByRole('group', { name: 'Reading controls' })).toBeVisible();
    await expect(previewFrame.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
    await expect(previewFrame.getByRole('link', { name: 'Readable Width' })).toHaveAttribute('href', '#readable-width');

    const pageMetrics = previewFrame.locator('.agent-isles-page');
    await expect(pageMetrics).toHaveCSS('max-width', '1240px');

    await page.getByRole('button', { name: 'Wide width' }).click();
    await expect(pageMetrics).toHaveCSS('max-width', '1480px');

    await page.getByRole('button', { name: 'Large text' }).click();
    await expect(pageMetrics).toHaveCSS('font-size', '18px');
  } finally {
    await preview.close();
  }
});

test('directory preview supports copyable selection references and review comments', async ({ page, context }) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-annotations-'));
  writeFileSync(join(root, 'guide.md'), '# Guide\n\n## Milestone One\n\nSelect this sentence for the agent.\n', 'utf8');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 60_000,
    includeUserPacks: false,
  });

  try {
    await page.goto(preview.url);
    const frameHandle = await page.locator('iframe[title="Rendered Markdown preview"]').elementHandle();
    const frame = await frameHandle.contentFrame();

    await frame.locator('p', { hasText: 'Select this sentence for the agent.' }).evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await expect(page.getByRole('button', { name: 'Copy reference' })).toBeEnabled();
    await page.getByRole('button', { name: 'Copy reference' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('guide.md#milestone-one');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Select');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('agent.');

    await page.getByLabel('Comment on selected reference').fill('Tighten this milestone wording.');
    await page.getByRole('button', { name: 'Add comment' }).click();
    await expect(page.getByText('Tighten this milestone wording.')).toBeVisible();

    await page.getByRole('button', { name: 'Copy comments for agent' }).click();
    const commentsText = await page.evaluate(() => navigator.clipboard.readText());
    expect(commentsText).toContain('guide.md#milestone-one');
    expect(commentsText).toContain('Tighten this milestone wording.');
  } finally {
    await preview.close();
  }
});
