import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('comparison bar hydrates with accessible summary and visible labels', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    const comparison = page.locator('agent-comparison-bar').first();
    await expect(comparison).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-comparison-bar')))).toBe(true);
    await expect(comparison).toHaveAttribute('aria-label', /Timeline comparison/);
    await expect(comparison).toContainText('Original — no AI, new design');
    await expect(comparison).toContainText('Revised — AI + 1:1 parity + existing assets');
    await expect(comparison).toContainText('26% faster');
    await expect.poll(() => comparison.evaluate((element) => {
      const baseline = element.shadowRoot?.querySelector('[data-testid="baseline-bar"]');
      const revised = element.shadowRoot?.querySelector('[data-testid="revised-bar"]');
      return baseline?.style.getPropertyValue('--bar-width') === '100%' && revised?.style.getPropertyValue('--bar-width') === '74%';
    })).toBe(true);

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
