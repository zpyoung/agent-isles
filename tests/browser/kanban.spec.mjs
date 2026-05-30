import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('Kanban islands hydrate source-order lanes, cards, counts, and empty states', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    for (const tag of ['agent-kanban', 'agent-kanban-lane', 'agent-kanban-card']) {
      await expect
        .poll(() => page.evaluate((customElementTag) => Boolean(customElements.get(customElementTag)), tag))
        .toBe(true);
    }

    const board = page.locator('agent-kanban[label="Launch board"]').first();
    await expect(board).toBeVisible();
    await expect
      .poll(() => board.evaluate((element) => element.shadowRoot?.querySelector('.board-title')?.textContent?.trim()))
      .toBe('Launch board');
    await expect
      .poll(() => board.evaluate((element) => element.shadowRoot?.querySelector('.board-count')?.textContent?.trim()))
      .toBe('3 cards');

    const laneLabels = await board.evaluate((element) =>
      [...element.querySelectorAll('agent-kanban-lane')].map((lane) => lane.getAttribute('label')),
    );
    expect(laneLabels).toEqual(['Backlog', 'Doing', 'Blocked', 'Done']);

    const laneSummaries = await board.evaluate((element) =>
      [...element.querySelectorAll('agent-kanban-lane')].map((lane) => ({
        label: lane.shadowRoot?.querySelector('.lane-heading')?.textContent?.replace(/\s+/g, ' ').trim(),
        count: lane.shadowRoot?.querySelector('.lane-count')?.textContent?.trim(),
        empty: lane.shadowRoot?.querySelector('.empty-state')?.textContent?.trim() || '',
      })),
    );
    expect(laneSummaries).toEqual([
      { label: 'Backlog', count: '1 card', empty: '' },
      { label: 'Doing', count: '2 cards', empty: '' },
      { label: 'Blocked', count: '0 cards', empty: 'No blocked work' },
      { label: 'Done', count: '0 cards', empty: 'No completed cards yet' },
    ]);

    const renderSmoke = page.locator('agent-kanban-card[title="Render smoke"]');
    await expect(renderSmoke).toBeVisible();
    await expect
      .poll(() => renderSmoke.evaluate((element) => element.shadowRoot?.querySelector('.card-title')?.textContent?.trim()))
      .toBe('Render smoke');
    await expect
      .poll(() => renderSmoke.evaluate((element) => element.shadowRoot?.querySelector('.tone-label')?.textContent?.trim()))
      .toBe('Status: Active');
    await expect
      .poll(() => renderSmoke.evaluate((element) => element.shadowRoot?.textContent?.includes('Owner: Merlin') ?? false))
      .toBe(true);
    await expect
      .poll(() => renderSmoke.evaluate((element) => element.shadowRoot?.textContent?.includes('Meta: P1') ?? false))
      .toBe(true);
    await expect(renderSmoke).toContainText('Verify the demo after component bundle changes.');

    await page.setViewportSize({ width: 390, height: 900 });
    const boardBox = await board.boundingBox();
    const firstLaneBox = await board.locator('agent-kanban-lane').first().boundingBox();
    expect(boardBox).not.toBeNull();
    expect(firstLaneBox).not.toBeNull();
    expect(firstLaneBox.width).toBeLessThanOrEqual(boardBox.width);

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
