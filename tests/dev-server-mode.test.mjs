// tests/dev-server-mode.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { childArgsFor, parsePreviewUrl } from '../scripts/dev/server-mode.mjs';

test('live child args use the foreground --__serve mode', () => {
  const args = childArgsFor('live', ['./screens', '--port', '4000']);
  assert.deepEqual(args, ['live', './screens', '--port', '4000', '--__serve']);
});

test('preview child args pass through unchanged', () => {
  const args = childArgsFor('preview', ['./screens']);
  assert.deepEqual(args, ['preview', './screens']);
});

test('parsePreviewUrl extracts the URL from the [isles] open line', () => {
  assert.equal(parsePreviewUrl('[isles] open http://localhost:51234/'), 'http://localhost:51234/');
  assert.equal(parsePreviewUrl('[isles] previewing /x'), null);
  assert.equal(parsePreviewUrl('random'), null);
});
