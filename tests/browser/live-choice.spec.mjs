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
        if (!existsSync(p)) return null;
        const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
        const last = lines[lines.length - 1];
        return last && Array.isArray(last.selected) ? [...last.selected].sort() : null;
      } catch { return null; }
    }).toEqual(['a', 'b']);
  } finally {
    await server.close();
  }
});
