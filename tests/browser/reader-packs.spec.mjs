import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLiveServer } from '../../src/live.mjs';

// Reader pack loading (docs/plans/reader-pack-loading.md): a trusted local
// component pack declared in the project's isles.config.json must upgrade and
// behave in reader mode exactly as it did in the server-rendered shell — styles
// apply, the module registers the custom element, and its agent-isles:signal
// {type:'proceed'} reaches the WS signal channel and the agent long-poll.

// A minimal pack whose element renders a button and, on click, dispatches a
// bubbling agent-isles:signal proceed carrying the typed text. Its stylesheet
// paints the button a distinctive green so a computed-style read proves the
// pack CSS was injected.
const PACK_MODULE = `
class ProceedPack extends HTMLElement {
  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'proceed-pack-btn';
    btn.textContent = this.getAttribute('submit-label') || 'Start';
    btn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('agent-isles:signal', {
        bubbles: true,
        composed: true,
        detail: { type: 'proceed', text: this.getAttribute('value') || '' },
      }));
    });
    this.appendChild(btn);
  }
}
if (!customElements.get('proceed-pack')) customElements.define('proceed-pack', ProceedPack);
`;

const PACK_STYLE = `
proceed-pack .proceed-pack-btn { background-color: rgb(0, 128, 0); color: rgb(255, 255, 255); }
`;

function scaffoldProceedPack(root) {
  const packDir = join(root, 'packs', 'proceed-pack');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'proceed-pack.js'), PACK_MODULE);
  writeFileSync(join(packDir, 'proceed-pack.css'), PACK_STYLE);
  writeFileSync(join(packDir, 'agent-isles.pack.json'), JSON.stringify({
    agentIslesPackVersion: 1,
    name: 'proceed-pack',
    tags: [{ name: 'proceed-pack', attributes: ['submit-label', 'value'] }],
    assets: [
      { type: 'module', path: 'proceed-pack.js' },
      { type: 'style', path: 'proceed-pack.css' },
    ],
  }));
  writeFileSync(join(root, 'isles.config.json'), JSON.stringify({ packs: ['./packs/proceed-pack'] }));
}

function readProceedRecord(dir) {
  try {
    const p = join(dir, 'state', 'events');
    if (!existsSync(p)) return null;
    const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return lines.find((rec) => rec.type === 'proceed') || null;
  } catch { return null; }
}

test('reader loads a component pack: element upgrades, CSS applies, click satisfies an agent long-poll', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-reader-pack-'));
  scaffoldProceedPack(dir);
  writeFileSync(
    join(dir, 'doc.md'),
    '# Pack Screen\n\n<proceed-pack submit-label="Start" value="hello world"></proceed-pack>\n',
  );
  const server = await startLiveServer(dir, { port: 0, reader: true, watch: true });
  try {
    await page.goto(server.url + '/');

    // The injected pack module registered the custom element and it upgraded.
    await page.waitForFunction(() => Boolean(customElements.get('proceed-pack')));
    const btn = page.locator('proceed-pack .proceed-pack-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Start');

    // The pack stylesheet was injected and applies to the pack element.
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('proceed-pack .proceed-pack-btn');
      return el ? getComputedStyle(el).backgroundColor : null;
    })).toBe('rgb(0, 128, 0)');

    // Park an agent long-poll (no browser Origin from a Node fetch) before the
    // click, so the click resolves it — the full companion loop, not a replay.
    await expect.poll(() => server._clients.size).toBeGreaterThan(0); // SSE + WS wired
    const pollPromise = fetch(server.url + '/__agent-isles/agent/events?hold=8', {
      headers: { Authorization: `Bearer ${server.token}` },
    }).then(async (r) => ({ status: r.status, body: await r.text() }));
    await expect.poll(() => server._heldAgentRequests.size).toBe(1);

    await btn.click();

    // The proceed reached the signal channel and was written to state/events.
    await expect.poll(() => readProceedRecord(dir)).toMatchObject({ type: 'proceed', text: 'hello world' });

    // …and satisfied the parked long-poll with the same typed text.
    const poll = await pollPromise;
    expect(poll.status).toBe(200);
    expect(JSON.parse(poll.body)).toMatchObject({ type: 'proceed', text: 'hello world' });
  } finally {
    await server.close();
  }
});
