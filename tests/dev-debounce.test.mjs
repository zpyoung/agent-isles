// tests/dev-debounce.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDebouncer } from '../scripts/dev/debounce.mjs';

function fakeTimers() {
  let pending = null;
  return {
    setTimeout: (fn) => { pending = fn; return 1; },
    clearTimeout: () => { pending = null; },
    flush: () => { if (pending) { const fn = pending; pending = null; fn(); } },
    hasPending: () => pending !== null,
  };
}

test('coalesces multiple calls into one, passing accumulated args', () => {
  const timers = fakeTimers();
  const calls = [];
  const d = createDebouncer((batch) => calls.push(batch), 150, timers);
  d('a'); d('b'); d('c');
  assert.equal(calls.length, 0, 'not called before flush');
  timers.flush();
  assert.deepEqual(calls, [['a', 'b', 'c']]);
});

test('resets accumulation after firing', () => {
  const timers = fakeTimers();
  const calls = [];
  const d = createDebouncer((batch) => calls.push(batch), 150, timers);
  d('a'); timers.flush();
  d('b'); timers.flush();
  assert.deepEqual(calls, [['a'], ['b']]);
});
