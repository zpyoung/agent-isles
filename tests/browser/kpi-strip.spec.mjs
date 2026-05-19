import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('KPI strip hydrates with accessible labels and responsive layout semantics', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    const strip = page.locator('agent-kpi-strip').first();
    await expect(strip).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-kpi-strip')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-kpi')))).toBe(true);
    await expect.poll(() => strip.evaluate((element) => Boolean(element.shadowRoot?.querySelector('[role="list"]')))).toBe(true);
    await expect(strip).toHaveAttribute('aria-label', 'Migration milestones');

    const cards = page.locator('agent-kpi');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toHaveAttribute('aria-label', /Phase 1 dev complete/);
    await expect.poll(() => cards.first().evaluate((element) => Boolean(element.shadowRoot?.querySelector('.kpi')))).toBe(true);

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
