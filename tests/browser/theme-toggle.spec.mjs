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

    // Every agent-* island must receive the dark attribute on its host element,
    // since component dark mode keys off :host([data-bs-theme="dark"]). Scan
    // generically rather than against a hardcoded list so a newly added island
    // cannot silently regress — agent-flow did exactly that while the toggle
    // relied on a manually maintained tag list.
    const darkAudit = await page.evaluate(() => {
      const elements = [...document.querySelectorAll('*')].filter(
        (element) => element.localName.startsWith('agent-'),
      );
      return {
        total: elements.length,
        hasFlow: elements.some((element) => element.localName === 'agent-flow'),
        undimmed: elements
          .filter((element) => element.getAttribute('data-bs-theme') !== 'dark')
          .map((element) => element.localName),
      };
    });

    expect(darkAudit.total).toBeGreaterThan(0);
    expect(darkAudit.hasFlow).toBe(true);
    expect(darkAudit.undimmed).toEqual([]);

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
