import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { LIVE_CLIENT } from '../src/live-client.js';
import { appendSignalEvent, eventsFile } from '../src/live.mjs';

function lastRecord(dir) {
  return JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n').pop());
}

test('appendSignalEvent records custom pack signal types', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-signal-'));
  appendSignalEvent(dir, { type: 'quirk-rating', choice: 'stars-4', selected: ['stars-4'] });
  const rec = lastRecord(dir);
  assert.equal(rec.type, 'quirk-rating');
  assert.equal(rec.choice, 'stars-4');
  assert.deepEqual(rec.selected, ['stars-4']);
});

test('appendSignalEvent rejects malformed type tokens (falls back to click)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-signal-'));
  for (const bad of ['Proceed', '9lives', 'has space', 'x'.repeat(33), 42, { evil: true }, null]) {
    appendSignalEvent(dir, { type: bad, choice: 'a' });
    assert.equal(lastRecord(dir).type, 'click', `type ${JSON.stringify(bad)} should fall back to click`);
  }
});

test('live client forwards generic agent-isles:signal events', () => {
  let signalHandler;
  const sent = [];
  class EventSourceStub {
    addEventListener() {}
  }
  class WebSocketStub {
    static OPEN = 1;
    constructor() { this.readyState = WebSocketStub.OPEN; }
    addEventListener(name, handler) { if (name === 'open') handler(); }
    send(payload) { sent.push(payload); }
  }
  const context = {
    EventSource: EventSourceStub,
    WebSocket: WebSocketStub,
    window: {
      location: { protocol: 'http:', host: 'localhost:0' },
      setTimeout() {},
      WebSocket: WebSocketStub,
    },
    document: {
      addEventListener(name, handler) {
        if (name === 'agent-isles:signal') signalHandler = handler;
      },
      getElementById() { return null; },
      querySelector() { return null; },
    },
  };

  vm.runInNewContext(LIVE_CLIENT, context);
  assert.ok(signalHandler, 'live client should listen for agent-isles:signal');
  signalHandler({ detail: { type: 'quirk-rating', choice: 'stars-4' } });
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0]), { type: 'quirk-rating', choice: 'stars-4' });
});
