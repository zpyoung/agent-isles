import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('theme toggle hydrates and switches Bootstrap color mode', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-theme-toggle')))).toBe(true);

    const toggle = page.locator('agent-theme-toggle').first();
    await expect(toggle).toBeVisible();
    await expect.poll(() => toggle.evaluate((element) => Boolean(element.shadowRoot?.querySelector('button')))).toBe(true);

    const button = toggle.locator('button');
    await expect(button).toHaveAttribute('aria-pressed', /^(true|false)$/);

    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
    expect(['light', 'dark']).toContain(initialTheme);

    await button.click();
    const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
    expect(toggledTheme).toBe(initialTheme === 'dark' ? 'light' : 'dark');
    await expect(button).toHaveAttribute('aria-pressed', toggledTheme === 'dark' ? 'true' : 'false');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('agent-isles-theme'))).toBe(toggledTheme);

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
