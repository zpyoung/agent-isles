import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(moduleDir, '..', '..');
const inlineFixture = join(projectRoot, 'dist', 'inline-test.html');

test.beforeAll(() => {
  mkdirSync(dirname(inlineFixture), { recursive: true });
  execFileSync(
    process.execPath,
    [
      join(projectRoot, 'bin', 'isles.mjs'),
      'render',
      join(projectRoot, 'examples', 'demo.md'),
      '--out',
      inlineFixture,
      '--assets',
      'inline',
    ],
    { encoding: 'utf8' },
  );
});

test('inline HTML renders components without external assets', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/inline-test.html`);

    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-decision')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-metric')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-kpi')))).toBe(true);

    const decision = page.locator('agent-decision').first();
    await expect(decision).toBeVisible();
    await expect.poll(() => decision.evaluate((element) => Boolean(element.shadowRoot?.querySelector('.decision')))).toBe(true);

    const metrics = page.locator('agent-metric');
    await expect(metrics.first()).toBeVisible();

    const kpis = page.locator('agent-kpi');
    await expect(kpis.first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
