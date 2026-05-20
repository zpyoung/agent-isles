import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('metric and delta primitives hydrate as a composed comparison card', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    const originalMetric = page.locator('agent-metric[label="Original — no AI, new design"]');
    const revisedMetric = page.locator('agent-metric[label="Revised — AI + 1:1 parity + existing assets"]');
    const delta = page.locator('agent-delta[label="Timeline delta"]');

    await expect(originalMetric).toBeVisible();
    await expect(revisedMetric).toBeVisible();
    await expect(delta).toBeVisible();

    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-metric')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-delta')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-comparison-bar')))).toBe(false);

    await expect(originalMetric).toContainText('Original — no AI, new design');
    await expect(originalMetric).toContainText('38');
    await expect.poll(() => originalMetric.evaluate((element) => element.shadowRoot.querySelector('section').className)).toBe('metric tone-neutral');
    await expect(revisedMetric).toContainText('Revised — AI + 1:1 parity + existing assets');
    await expect(revisedMetric).toContainText('28');
    await expect(delta).toContainText('26% faster');
    await expect(delta).toHaveAttribute('aria-label', /lower is better/);
    await expect(delta).toHaveAttribute('aria-label', /Tone: good/);

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
