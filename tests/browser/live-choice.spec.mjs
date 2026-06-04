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
    await expect.poll(() => existsSync(join(dir, 'state', 'events'))).toBe(true);
    const line = JSON.parse(readFileSync(join(dir, 'state', 'events'), 'utf8').trim().split('\n')[0]);
    expect(line.type).toBe('click');
    expect(line.choice).toBe('a');
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
      if (!existsSync(join(dir, 'state', 'events'))) return 0;
      return readFileSync(join(dir, 'state', 'events'), 'utf8').trim().split('\n').length;
    }).toBeGreaterThanOrEqual(2);
    const lines = readFileSync(join(dir, 'state', 'events'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const last = lines[lines.length - 1];
    expect(Array.isArray(last.selected)).toBe(true);
    expect(last.selected).toContain('a');
    expect(last.selected).toContain('b');
  } finally {
    await server.close();
  }
});
