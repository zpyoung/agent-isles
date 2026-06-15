// tests/dev-rebuild.test.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { runRollup } from '../scripts/dev/rebuild.mjs';

function fakeSpawn(exitCode) {
  const calls = [];
  const spawnFn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', exitCode));
    return child;
  };
  return { spawnFn, calls };
}

test('skip=true resolves without spawning', async () => {
  const { spawnFn, calls } = fakeSpawn(0);
  await runRollup('/repo', { skip: true, spawnFn });
  assert.equal(calls.length, 0);
});

test('runs rollup CLI with -c on the project root', async () => {
  const { spawnFn, calls } = fakeSpawn(0);
  await runRollup('/repo', { skip: false, spawnFn });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes('-c'));
  assert.match(calls[0].args[0], /rollup/);
  assert.equal(calls[0].opts.cwd, '/repo');
});

test('rejects on non-zero exit', async () => {
  const { spawnFn } = fakeSpawn(1);
  await assert.rejects(() => runRollup('/repo', { skip: false, spawnFn }), /rollup exited with code 1/);
});
