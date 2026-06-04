import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { serveDist } from './support/static-server.mjs';

function optionSetTestHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Option set test</title>
    <script type="module" src="./agent-components.js"></script>
  </head>
  <body>
    <agent-option-set title="Pick one">
      <agent-choice id="a" title="Alpha">Alpha body</agent-choice>
      <agent-choice id="b" title="Beta">Beta body</agent-choice>
    </agent-option-set>
    <agent-option-set title="Pick many" data-multiselect>
      <agent-choice id="x" title="X-ray">X body</agent-choice>
      <agent-choice id="y" title="Yankee">Y body</agent-choice>
    </agent-option-set>
  </body>
</html>`;
}

test('option-set islands hydrate and toggle single/multi selections', async ({ page }) => {
  const outFile = resolve('dist/option-set-test.html');
  writeFileSync(outFile, optionSetTestHtml());

  const server = await serveDist();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.origin}/option-set-test.html`);

    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-option-set')))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(customElements.get('agent-choice')))).toBe(true);

    const single = page.locator('agent-option-set[title="Pick one"]');
    const multi = page.locator('agent-option-set[title="Pick many"]');

    await single.locator('agent-choice#user-content-a, agent-choice#a').click();
    await expect.poll(() => single.locator('agent-choice#user-content-a, agent-choice#a').evaluate((el) => el.hasAttribute('selected'))).toBe(true);
    await expect.poll(() => single.locator('agent-choice#user-content-a, agent-choice#a').evaluate((el) => el.dataset.selected)).toBe('true');

    await single.locator('agent-choice#user-content-b, agent-choice#b').click();
    await expect.poll(() => single.locator('agent-choice#user-content-a, agent-choice#a').evaluate((el) => el.hasAttribute('selected'))).toBe(false);
    await expect.poll(() => single.locator('agent-choice#user-content-b, agent-choice#b').evaluate((el) => el.hasAttribute('selected'))).toBe(true);

    await multi.locator('agent-choice#user-content-x, agent-choice#x').click();
    await multi.locator('agent-choice#user-content-y, agent-choice#y').click();
    await expect.poll(() => multi.locator('agent-choice#user-content-x, agent-choice#x').evaluate((el) => el.hasAttribute('selected'))).toBe(true);
    await expect.poll(() => multi.locator('agent-choice#user-content-y, agent-choice#y').evaluate((el) => el.hasAttribute('selected'))).toBe(true);

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
