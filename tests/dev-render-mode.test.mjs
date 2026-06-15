// tests/dev-render-mode.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderChildArgs, RELOAD_CLIENT, injectReloadClient } from '../scripts/dev/render-mode.mjs';

test('render child args force inline assets and an out file', () => {
  const args = renderChildArgs('/tmp/out.html', ['demo.md', '--mode', 'sanitized']);
  assert.deepEqual(args, ['render', 'demo.md', '--mode', 'sanitized', '--out', '/tmp/out.html', '--assets', 'inline']);
});

test('reload client subscribes to SSE and reloads', () => {
  assert.match(RELOAD_CLIENT, /EventSource\('\/events'\)/);
  assert.match(RELOAD_CLIENT, /location\.reload\(\)/);
});

test('injectReloadClient inserts the client before </body>', () => {
  const out = injectReloadClient('<html><body><h1>hi</h1></body></html>');
  assert.match(out, /<script>[\s\S]*EventSource[\s\S]*<\/script><\/body>/);
});
