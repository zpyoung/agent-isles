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
        'agent-flow',
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

    const flowHostTheme = await page.evaluate(() => document.querySelector('agent-flow')?.getAttribute('data-bs-theme'));
    expect(flowHostTheme).toBe('dark');

    const componentSurfaceAudit = await page.evaluate(() => {
      const readShadowStyle = (hostSelector, shadowSelector, property) => {
        const target = document.querySelector(hostSelector)?.shadowRoot?.querySelector(shadowSelector);
        return target ? getComputedStyle(target)[property] : null;
      };

      return {
        pageTheme: document.documentElement.getAttribute('data-bs-theme'),
        ganttLane: readShadowStyle('agent-gantt-phase', '.lane', 'backgroundImage'),
        kanbanLane: readShadowStyle('agent-kanban-lane', '.lane', 'backgroundColor'),
        kanbanHeading: readShadowStyle('agent-kanban-lane', '.lane-heading', 'color'),
        flowSurface: readShadowStyle('agent-flow', '.flow', 'backgroundColor'),
      };
    });
    expect(componentSurfaceAudit).toEqual(expect.objectContaining({
      pageTheme: 'dark',
      kanbanLane: 'rgba(15, 23, 42, 0.78)',
      kanbanHeading: 'rgb(248, 250, 252)',
      flowSurface: 'rgb(15, 23, 42)',
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
