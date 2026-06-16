import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source-level guards for the click-feedback behavior. The full browser
// behavior (button → "Proceeding…" on click, no console errors) is verified
// with Playwright against a live server; these keep the feedback from silently
// regressing in fast `node --test` runs.
const comp = readFileSync(new URL('../src/components/agent-proceed.js', import.meta.url), 'utf8');

test('agent-proceed renders a processing state', () => {
  assert.match(comp, /_sent/);
  assert.match(comp, /Proceeding…/);
  assert.match(comp, /is-sent/);
});

test('agent-proceed guards against double-fire after click', () => {
  assert.match(comp, /this\._sent\)\s*return/);
  assert.match(comp, /this\._sent\s*=\s*true/);
});
