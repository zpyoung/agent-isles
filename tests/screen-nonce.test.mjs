import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { LIVE_CLIENT } from '../src/live-client.js';
import { appendSignalEvent, eventsFile, injectLiveFrame } from '../src/live.mjs';

test('injectLiveFrame embeds the screen nonce on the page', () => {
  const out = injectLiveFrame('<!doctype html><html><body>x</body></html>', 'layout-v2.md');
  assert.match(out, /window\.__islesScreen=("layout-v2\.md"|'layout-v2\.md')/);
});

test('injectLiveFrame embeds null when no screen is given', () => {
  const out = injectLiveFrame('<!doctype html><html><body>x</body></html>');
  assert.match(out, /window\.__islesScreen=null/);
});

test('appendSignalEvent records the screen nonce when present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-nonce-'));
  appendSignalEvent(dir, { type: 'proceed', selected: ['a'], screen: 'layout-v2.md' });
  const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n').pop());
  assert.equal(rec.screen, 'layout-v2.md');
});

test('appendSignalEvent omits screen when absent or non-string', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-nonce-'));
  appendSignalEvent(dir, { type: 'proceed', selected: ['a'], screen: 42 });
  const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n').pop());
  assert.equal('screen' in rec, false);
});

test('live client stamps window.__islesScreen onto outgoing signals', () => {
  let proceedHandler;
  const sent = [];
  class EventSourceStub { addEventListener() {} }
  class WebSocketStub {
    static OPEN = 1;
    constructor() { this.readyState = WebSocketStub.OPEN; }
    addEventListener(name, handler) { if (name === 'open') handler(); }
    send(payload) { sent.push(payload); }
  }
  const win = {
    location: { protocol: 'http:', host: 'localhost:0' },
    setTimeout() {},
    WebSocket: WebSocketStub,
    __islesScreen: 'layout-v2.md',
  };
  const context = {
    EventSource: EventSourceStub,
    WebSocket: WebSocketStub,
    window: win,
    document: {
      addEventListener(name, handler) { if (name === 'agent-isles:proceed') proceedHandler = handler; },
      getElementById() { return null; },
      querySelector() { return null; },
    },
  };

  vm.runInNewContext(LIVE_CLIENT, context);
  proceedHandler({ detail: { type: 'proceed', selected: ['x'] } });
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0]).screen, 'layout-v2.md');
});
