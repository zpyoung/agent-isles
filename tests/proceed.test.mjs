import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { appendSignalEvent, eventsFile } from '../src/live.mjs';

test('appendSignalEvent writes a proceed record when detail.type is proceed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-proceed-'));
  appendSignalEvent(dir, { type: 'proceed', selected: ['two-column'], text: 'Proceed →' });
  const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n').pop());
  assert.equal(rec.type, 'proceed');
  assert.deepEqual(rec.selected, ['two-column']);
});

test('appendSignalEvent still defaults to a click record', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-proceed-'));
  appendSignalEvent(dir, { choice: 'a', text: 'A', selected: ['a'] });
  const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n').pop());
  assert.equal(rec.type, 'click');
});

test('agent-proceed survives sanitized rendering with its attributes', async () => {
  const { renderMarkdownString, RENDER_MODES } = await import('../src/render.mjs');
  const md = '# Go\n\n<agent-proceed label="Proceed →" allow-empty></agent-proceed>\n';
  const { html } = await renderMarkdownString(md, {
    renderMode: RENDER_MODES.SANITIZED,
    includeUserPacks: false,
  });
  assert.match(html, /<agent-proceed/);
  assert.match(html, /label="Proceed/);
  assert.match(html, /allow-empty/);
});

test('proceed island and live client speak the same event name', () => {
  const comp = readFileSync(new URL('../src/components/agent-proceed.js', import.meta.url), 'utf8');
  assert.match(comp, /customElements\.define\(["']agent-proceed["']/);
  assert.match(comp, /agent-isles:proceed/);
  const client = readFileSync(new URL('../src/live-client.js', import.meta.url), 'utf8');
  assert.match(client, /agent-isles:proceed/);
});
