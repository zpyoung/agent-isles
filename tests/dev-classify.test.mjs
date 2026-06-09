// tests/dev-classify.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChange } from '../scripts/dev/classify.mjs';

const ROOT = '/repo';

test('component source → rebuild + restart', () => {
  const r = classifyChange(['/repo/src/components/option-set.js'], ROOT);
  assert.equal(r.rebuild, true);
  assert.equal(r.restart, true);
  assert.equal(r.ignored, false);
});

test('renderer/theme/server source → restart, no rebuild', () => {
  const r = classifyChange(['/repo/src/renderer/page.mjs'], ROOT);
  assert.equal(r.rebuild, false);
  assert.equal(r.restart, true);
});

test('dist output is ignored (prevents rebuild loop)', () => {
  const r = classifyChange(['/repo/dist/agent-components.js'], ROOT);
  assert.equal(r.ignored, true);
  assert.equal(r.rebuild, false);
  assert.equal(r.restart, false);
});

test('server state dir is ignored', () => {
  const r = classifyChange(['/repo/screens/state/server-info'], ROOT);
  assert.equal(r.ignored, true);
});

test('node_modules and .git are ignored', () => {
  assert.equal(classifyChange(['/repo/node_modules/x/y.js'], ROOT).ignored, true);
  assert.equal(classifyChange(['/repo/.git/index'], ROOT).ignored, true);
});

test('a batch is rebuild if ANY path is a component, restart if ANY is source', () => {
  const r = classifyChange(
    ['/repo/dist/agent-components.js', '/repo/src/components/x.js', '/repo/src/live.mjs'],
    ROOT,
  );
  assert.equal(r.rebuild, true);
  assert.equal(r.restart, true);
  assert.equal(r.ignored, false);
});

test('non-source markdown change → not ignored, no rebuild/restart (server handles it)', () => {
  const r = classifyChange(['/repo/screens/demo.md'], ROOT);
  assert.equal(r.ignored, false);
  assert.equal(r.rebuild, false);
  assert.equal(r.restart, false);
});

test('windows paths classify and ignore correctly', () => {
  const root = 'C:\\repo';
  assert.equal(classifyChange(['C:\\repo\\dist\\agent-components.js'], root).ignored, true);
  const r = classifyChange(['C:\\repo\\src\\components\\option-set.js'], root);
  assert.equal(r.rebuild, true);
  assert.equal(r.restart, true);
});
