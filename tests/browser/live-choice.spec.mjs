import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLiveServer } from '../../src/live.mjs';

async function waitForChoiceUpgrade(page, id) {
  const choice = page.locator(`agent-choice[id="${id}"]`);
  await expect(choice).toBeVisible();
  await page.waitForFunction((choiceId) => {
    const el = document.querySelector(`agent-choice[id="${choiceId}"]`);
    return customElements.get('agent-choice') && el && el.shadowRoot;
  }, id);
  await page.waitForFunction((choiceId) => {
    const el = document.querySelector(`agent-choice[id="${choiceId}"]`);
    return el?.shadowRoot?.querySelector('.choice');
  }, id);
  return choice;
}

test('clicking an agent-choice records a JSONL click event', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-'));
  writeFileSync(join(dir, 'screen-1.md'),
    '# Pick one\n\n<agent-option-set>\n<agent-choice id="a" title="Alpha">First</agent-choice>\n<agent-choice id="b" title="Beta">Second</agent-choice>\n</agent-option-set>\n');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    const choice = await waitForChoiceUpgrade(page, 'a');
    await choice.click();
    await expect.poll(() => {
      try {
        const p = join(dir, 'state', 'events');
        if (!existsSync(p)) return null;
        const first = readFileSync(p, 'utf8').trim().split('\n')[0];
        return first ? JSON.parse(first) : null;
      } catch { return null; }
    }).toMatchObject({ type: 'click', choice: 'a' });
  } finally {
    await server.close();
  }
});

test('multi-select records selected ids', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-multi-'));
  writeFileSync(join(dir, 'screen-1.md'),
    '# Pick many\n\n<agent-option-set data-multiselect>\n<agent-choice id="a" title="Alpha">First</agent-choice>\n<agent-choice id="b" title="Beta">Second</agent-choice>\n</agent-option-set>\n');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    const choiceA = await waitForChoiceUpgrade(page, 'a');
    const choiceB = await waitForChoiceUpgrade(page, 'b');
    await choiceA.click();
    await choiceB.click();
    await expect.poll(() => {
      try {
        const p = join(dir, 'state', 'events');
        if (!existsSync(p)) return false;
        const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
        return lines.some((rec) => Array.isArray(rec.selected)
          && rec.selected.length === 2
          && [...rec.selected].sort().join(',') === 'a,b');
      } catch { return false; }
    }).toBe(true);
  } finally {
    await server.close();
  }
});

test('dark-mode selected choice keeps a visible selected style', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-pw-dark-'));
  writeFileSync(join(dir, 'screen-1.md'),
    '# Pick one\n\n<agent-option-set>\n<agent-choice id="a" title="Alpha">First</agent-choice>\n</agent-option-set>\n');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await page.goto(server.url + '/');
    const choice = await waitForChoiceUpgrade(page, 'a');
    await choice.click();
    await expect(choice).toHaveAttribute('selected', '');
    await expect.poll(() => page.evaluate(() => {
      const choiceEl = document.querySelector('agent-choice[id="a"]');
      const card = choiceEl.shadowRoot.querySelector('.choice');
      const key = choiceEl.shadowRoot.querySelector('.key');
      return {
        cardBorderColor: getComputedStyle(card).borderColor,
        keyBackground: getComputedStyle(key).backgroundColor,
      };
    })).toEqual({
      cardBorderColor: 'rgb(102, 183, 255)',
      keyBackground: 'rgb(102, 183, 255)',
    });
  } finally {
    await server.close();
  }
});
