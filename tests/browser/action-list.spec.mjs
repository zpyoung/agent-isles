import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('action list islands hydrate and honor grouping/filtering/layout', async ({ page }) => {
  test.setTimeout(60_000);
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-action-list')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-action')))).toBe(true);

    const grouped = page.locator('agent-action-list[label="From this demo"]').first();
    await expect(grouped).toBeVisible();

    await expect
      .poll(() => grouped.evaluate((element) => element.shadowRoot?.querySelectorAll('details.group').length ?? 0))
      .toBeGreaterThanOrEqual(2);

    await expect
      .poll(() => grouped.evaluate((element) => element.shadowRoot?.querySelectorAll('tbody tr.action-row').length ?? 0))
      .toBe(3);

    await expect
      .poll(() => grouped.evaluate((element) => element.shadowRoot?.querySelectorAll('tbody tr.action-row.done').length ?? 0))
      .toBe(0);

    const minimal = page.locator('agent-action-list[label="From standup (minimal)"]').first();
    await expect(minimal).toBeVisible();
    await expect
      .poll(() => minimal.evaluate((element) => Boolean(element.shadowRoot?.querySelector('table.action-table'))))
      .toBe(true);

    const minimalHeaders = await minimal.evaluate((element) =>
      [...element.shadowRoot.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim().toLowerCase()),
    );
    expect(minimalHeaders).not.toContain('priority');
    expect(minimalHeaders).not.toContain('due');

    const kanban = page.locator('agent-action-list[label="Launch follow-ups (kanban)"]').first();
    await expect(kanban).toBeVisible();
    await expect
      .poll(() => kanban.evaluate((element) => element.shadowRoot?.querySelectorAll('.lane').length ?? 0))
      .toBe(3);
    await expect
      .poll(() => kanban.evaluate((element) => Boolean(element.shadowRoot?.querySelector('.lane[aria-label=\"Done\"]'))))
      .toBe(false);

    const priority = page.locator('agent-action-list[label="Launch follow-ups (priority lanes)"]').first();
    await expect(priority).toBeVisible();
    await expect
      .poll(() => priority.evaluate((element) => element.shadowRoot?.querySelectorAll('.lane').length ?? 0))
      .toBe(3);
    await expect
      .poll(() => priority.evaluate((element) => element.shadowRoot?.querySelectorAll('article.card.done').length ?? 0))
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() =>
        priority.evaluate((element) => element.shadowRoot?.textContent?.includes('Mirror component docs to the wiki.') ?? false),
      )
      .toBe(true);

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
