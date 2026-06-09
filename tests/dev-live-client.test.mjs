// tests/dev-live-client.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_CLIENT } from '../src/live-client.js';

function run() {
  const listeners = {};
  let reloads = 0;
  const es = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn());
  const stubEventSource = function () { return es; };
  const stubWebSocket = function () { return { addEventListener() {}, readyState: 0 }; };
  stubWebSocket.OPEN = 1;
  const win = { location: { reload: () => { reloads += 1; } }, setTimeout: () => 0, WebSocket: stubWebSocket };
  const doc = { addEventListener: () => {} };
  // eslint-disable-next-line no-new-func
  new Function('EventSource', 'WebSocket', 'window', 'document', LIVE_CLIENT)(
    stubEventSource, stubWebSocket, win, doc,
  );
  return { fire, reloads: () => reloads };
}

test('first SSE open does NOT reload', () => {
  const { fire, reloads } = run();
  fire('open');
  assert.equal(reloads(), 0);
});

test('reconnect (second open) reloads once', () => {
  const { fire, reloads } = run();
  fire('open');   // initial connect
  fire('error');  // server restarted, connection dropped
  fire('open');   // reconnected
  assert.equal(reloads(), 1);
});

test('explicit live:reload still reloads', () => {
  const { fire, reloads } = run();
  fire('live:reload');
  assert.equal(reloads(), 1);
});
