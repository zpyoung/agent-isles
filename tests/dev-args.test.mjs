// tests/dev-args.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDevArgs } from '../scripts/dev.mjs';

test('parses subcommand, target, and passthrough', () => {
  const r = parseDevArgs(['live', './screens', '--port', '4000']);
  assert.equal(r.subcommand, 'live');
  assert.equal(r.target, './screens');
  assert.deepEqual(r.passthrough, ['./screens', '--port', '4000']);
  assert.equal(r.open, true);
  assert.equal(r.build, true);
});

test('extracts dev-only flags and keeps them out of passthrough', () => {
  const r = parseDevArgs(['render', 'demo.md', '--no-open', '--no-build']);
  assert.equal(r.subcommand, 'render');
  assert.equal(r.target, 'demo.md');
  assert.equal(r.open, false);
  assert.equal(r.build, false);
  assert.deepEqual(r.passthrough, ['demo.md']);
});

test('rejects unknown subcommand', () => {
  assert.throws(() => parseDevArgs(['watch', 'demo.md']), /Unsupported dev subcommand/);
});

test('requires a subcommand', () => {
  assert.throws(() => parseDevArgs([]), /Usage: pnpm dev/);
});
