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
        'agent-timeline',
        'agent-gantt',
        'agent-kpi',
        'agent-status-board',
        'agent-action-list',
        'agent-kanban',
      ];

      return coreTags.map((tag) => {
        const element = document.querySelector(tag);
        const adoptedCssText = [...(element?.shadowRoot?.adoptedStyleSheets || [])]
          .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
          .join('\n');
        const styleTagCssText = [...(element?.shadowRoot?.querySelectorAll('style') || [])]
          .map((style) => style.textContent || '')
          .join('\n');
        const cssText = `${adoptedCssText}\n${styleTagCssText}`;
        const hasDarkRule = cssText.includes('[data-bs-theme="dark"]');
        const background = element?.shadowRoot
          ? getComputedStyle(element.shadowRoot.querySelector('section, article, button, .decision, .risk, .metric, .delta, .copy-block, .map, .tabs, .timeline, .gantt, .kpi, .board, .action-list, .kanban') || element).backgroundColor
          : '';
        return { tag, present: Boolean(element), hasDarkRule, background };
      });
    });

    expect(darkAudit).toEqual(
      expect.arrayContaining(
        darkAudit.map(({ tag }) => expect.objectContaining({ tag, present: true, hasDarkRule: true })),
      ),
    );

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
