import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startLiveServer, resolveNewestScreen } from '../src/live.mjs';

function get(url) {
  return new Promise((resolvePromise, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolvePromise({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('resolveNewestScreen picks the most recently modified top-level .md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-newest-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  writeFileSync(join(dir, 'b.md'), '# B');
  utimesSync(join(dir, 'a.md'), new Date(1000), new Date(1000));
  utimesSync(join(dir, 'b.md'), new Date(2000), new Date(2000));
  assert.equal(resolveNewestScreen(dir), join(dir, 'b.md'));
});

test('GET / renders the newest screen wrapped in the live shell', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-render-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Hello Live\n\n<agent-decision verdict="go" title="Go">Ship.</agent-decision>\n');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/');
    assert.equal(res.status, 200);
    assert.match(res.body, /Hello Live/);
    assert.match(res.body, /agent-decision/);
    assert.match(res.body, /agent-components\.js/);  // component bundle wired via /__agent-isles/agent-components.js
    assert.match(res.body, /EventSource\(/);          // live client present
  } finally {
    await server.close();
  }
});

test('GET /__agent-isles/agent-components.js serves the built bundle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-bundle-'));
  writeFileSync(join(dir, 's.md'), '# X');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/__agent-isles/agent-components.js');
    assert.equal(res.status, 200);
    assert.match(res.body, /customElements\.define/);
  } finally {
    await server.close();
  }
});
