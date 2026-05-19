import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

test('Gantt schedule hydrates phases, milestones, legend, and accessible task details', async ({ page }) => {
  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/demo.html`);

    const gantt = page.locator('agent-gantt').first();
    await expect(gantt).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-gantt')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-gantt-task')))).toBe(true);
    await expect(gantt).toHaveAttribute('aria-label', 'Revised migration timeline');
    await expect(page.locator('h2', { hasText: 'Revised Migration Timeline' })).toBeVisible();
    await expect(gantt).toContainText('PHASE 1 — CORE BUILD');
    await expect(gantt).toContainText('Week 12 milestone');
    await expect(gantt).toContainText('Components');
    await expect(gantt).not.toContainText('26% faster');
    await expect(page.locator('agent-gantt-note')).toHaveCount(0);

    const task = page.locator('agent-gantt-task[label="Components + Storybook"]').first();
    await expect(task).toHaveAttribute('aria-label', /Components \+ Storybook, weeks 3 through 5/);
    await expect.poll(() => task.evaluate((element) => Boolean(element.shadowRoot?.querySelector('details')))).toBe(true);
    await task.locator('summary').click();
    await expect(task).toContainText('2 wks — was 8 wks');

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
