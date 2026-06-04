import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startLiveServer, resolveNewestScreen, eventsFile } from '../src/live.mjs';

function get(url) {
  return new Promise((resolvePromise, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolvePromise({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function postJson(url, obj) {
  return new Promise((resolvePromise, reject) => {
    const data = JSON.stringify(obj);
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { res.setEncoding('utf8'); let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolvePromise({ status: res.statusCode, body: b })); });
    req.on('error', reject); req.write(data); req.end();
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

test('resolveNewestScreen returns null for a nonexistent directory', () => {
  assert.equal(resolveNewestScreen('/no/such/dir/xyz'), null);
});

test('GET / renders the newest screen as a full inline page with live chrome', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-render-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Hello Live\n\n<agent-decision verdict="go" title="Go">Ship.</agent-decision>\n');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/');
    assert.equal(res.status, 200);
    assert.match(res.body, /Hello Live/);
    assert.match(res.body, /agent-decision/);
    assert.match(res.body, /id="isles-indicator"/);
    assert.match(res.body, /customElements\.define/);
    assert.match(res.body, /EventSource\(/);
  } finally {
    await server.close();
  }
});

test('GET / returns an injected waiting page for an empty directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-empty-'));
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/');
    assert.equal(res.status, 200);
    assert.match(res.body, /Waiting for the agent/);
    assert.match(res.body, /EventSource\(/);
  } finally {
    await server.close();
  }
});

test('POST /__agent-isles/signal appends one JSONL line per selection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-signal-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Pick');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const r = await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'Option A' });
    assert.equal(r.status, 200);
    const events = readFileSync(join(dir, 'state', 'events'), 'utf8').trim().split('\n');
    assert.equal(events.length, 1);
    const parsed = JSON.parse(events[0]);
    assert.equal(parsed.type, 'click');
    assert.equal(parsed.choice, 'a');
    assert.equal(parsed.text, 'Option A');
    assert.equal(typeof parsed.timestamp, 'number');
  } finally { await server.close(); }
});

test('signal record honors the JSONL contract edges', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-contract-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    assert.equal(eventsFile(dir), join(dir, 'state', 'events'));
    const r1 = await postJson(server.url + '/__agent-isles/signal', { text: 123, selected: ['a', 'b'] });
    assert.deepEqual(JSON.parse(r1.body), { ok: true });
    const r2 = await postJson(server.url + '/__agent-isles/signal', { choice: 'c', selected: 'nope' });
    assert.deepEqual(JSON.parse(r2.body), { ok: true });
    const lines = readFileSync(eventsFile(dir), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines[0].choice, null);
    assert.equal(lines[0].text, '');
    assert.deepEqual(lines[0].selected, ['a', 'b']);
    assert.equal(lines[1].choice, 'c');
    assert.equal(lines[1].text, '');
    assert.ok(!('selected' in lines[1]));
  } finally { await server.close(); }
});

test('clearEvents removes the events file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-clear-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Pick');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A' });
    assert.ok(existsSync(join(dir, 'state', 'events')));
    server.clearEvents();
    assert.ok(!existsSync(join(dir, 'state', 'events')));
  } finally { await server.close(); }
});
