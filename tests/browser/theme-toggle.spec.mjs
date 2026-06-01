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

    if (toggledTheme !== 'dark') {
      await button.click();
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'))).toBe('dark');
    }

    const darkAudit = await page.evaluate(() => {
      const coreTags = [
        'agent-decision',
        'agent-risk',
        'agent-metric',
        'agent-delta',
        'agent-copy-block',
        'agent-theme-toggle',
        'agent-dependency-map',
        'agent-dependency',
        'agent-tabs',
        'agent-tab',
        'agent-timeline',
        'agent-step',
        'agent-gantt',
        'agent-gantt-phase',
        'agent-gantt-task',
        'agent-kpi',
        'agent-status-board',
        'agent-status-item',
        'agent-action-list',
        'agent-action',
        'agent-kanban',
        'agent-kanban-lane',
        'agent-kanban-card',
      ];

      return coreTags.map((tag) => {
        const element = document.querySelector(tag);
        return {
          tag,
          present: Boolean(element),
          hostTheme: element?.getAttribute('data-bs-theme') || '',
        };
      });
    });

    expect(darkAudit).toEqual(
      expect.arrayContaining(
        darkAudit.map(({ tag }) => expect.objectContaining({
          tag,
          present: true,
          hostTheme: 'dark',
        })),
      ),
    );

    const componentSurfaceAudit = await page.evaluate(() => ({
      pageTheme: document.documentElement.getAttribute('data-bs-theme'),
      ganttLane: getComputedStyle(document.querySelector('agent-gantt-phase')?.shadowRoot?.querySelector('.lane')).backgroundImage,
      kanbanLane: getComputedStyle(document.querySelector('agent-kanban-lane')?.shadowRoot?.querySelector('.lane')).backgroundColor,
      kanbanHeading: getComputedStyle(document.querySelector('agent-kanban-lane')?.shadowRoot?.querySelector('.lane-heading')).color,
    }));
    expect(componentSurfaceAudit).toEqual(expect.objectContaining({
      pageTheme: 'dark',
      kanbanLane: 'rgba(15, 23, 42, 0.78)',
      kanbanHeading: 'rgb(248, 250, 252)',
    }));
    expect(componentSurfaceAudit.ganttLane).toContain('rgba(15, 23, 42, 0.88)');

    await page.evaluate(() => {
      const lateMetric = document.createElement('agent-metric');
      lateMetric.setAttribute('label', 'Late-loaded metric');
      lateMetric.setAttribute('value', '42');
      lateMetric.setAttribute('delta', '+4%');
      lateMetric.setAttribute('id', 'late-theme-metric');
      document.querySelector('main')?.append(lateMetric);
    });
    await page.waitForFunction(() => {
      const element = document.querySelector('#late-theme-metric');
      return element?.getAttribute('data-bs-theme') === 'dark' && Boolean(element.shadowRoot);
    });

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
