import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { startLiveServer, resolveNewestScreen, eventsFile } from '../src/live.mjs';

async function waitFor(fn, timeoutMs = 4000, stepMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (await fn()) return true; await sleep(stepMs); }
  return false;
}

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

function openSse(url) {
  const req = http.get(url);
  const state = { text: '', req };
  req.on('response', (res) => { res.setEncoding('utf8'); res.on('data', (c) => { state.text += c; }); });
  req.on('error', () => {});
  return state;
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
    assert.match(res.body, /Agent Isles Live/);
    assert.doesNotMatch(res.body, /Quirk Brainstorming/);
    assert.match(res.body, /customElements\.define/);
    assert.match(res.body, /EventSource\(/);
    assert.match(res.body, /new WebSocket\(/);
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
    assert.ok(parsed.timestamp > 1_000_000_000);
    assert.ok(parsed.timestamp < 10_000_000_000);
  } finally { await server.close(); }
});

test('POST /__agent-isles/signal does not trigger a spurious live reload while watching', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-signal-watch-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Pick');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const eventsReq = http.get(server.url + '/events');
  let stream = '';
  eventsReq.on('response', (res) => {
    res.setEncoding('utf8');
    res.on('data', (c) => { stream += c; });
  });
  eventsReq.on('error', () => {});
  try {
    assert.ok(await waitFor(() => stream.includes('event: live:ready')));
    const r = await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'Option A' });
    assert.equal(r.status, 200);
    const before = readFileSync(eventsFile(dir), 'utf8');
    await sleep(350);
    assert.equal(readFileSync(eventsFile(dir), 'utf8'), before);
    assert.doesNotMatch(stream, /event: live:reload/);
  } finally {
    eventsReq.destroy();
    await server.close();
  }
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

test('writing a new screen clears prior events and broadcasts; server-info is written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-watch-'));
  writeFileSync(join(dir, 'screen-1.md'), '# One');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    const info = JSON.parse(readFileSync(join(dir, 'state', 'server-info'), 'utf8'));
    assert.equal(info.type, 'server-started');
    assert.equal(typeof info.url, 'string');
    assert.equal(info.screen_dir, dir);
    assert.equal(info.state_dir, join(dir, 'state'));

    await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A' });
    assert.ok(existsSync(join(dir, 'state', 'events')));

    writeFileSync(join(dir, 'screen-2.md'), '# Two'); // newer screen
    assert.ok(await waitFor(() => !existsSync(join(dir, 'state', 'events'))), 'events cleared when newest screen changed');
  } finally { await server.close(); }
});

test('close writes server-stopped and removes server-info', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-stop-'));
  writeFileSync(join(dir, 'screen-1.md'), '# One');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  await server.close();
  assert.ok(!existsSync(join(dir, 'state', 'server-info')));
  assert.ok(existsSync(join(dir, 'state', 'server-stopped')));
});

test('GET /<slug> renders that specific document', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-slug-'));
  writeFileSync(join(dir, 'alpha.md'), '# Alpha Doc\n\nALPHA_BODY_UNIQUE');
  writeFileSync(join(dir, 'beta.md'), '# Beta Doc\n\nBETA_BODY_UNIQUE');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/beta');
    assert.equal(res.status, 200);
    assert.match(res.body, /BETA_BODY_UNIQUE/);          // selected doc's body content present
    assert.doesNotMatch(res.body, /ALPHA_BODY_UNIQUE/);  // other doc's body content absent
  } finally { await server.close(); }
});

test('GET /<unknown-slug> returns 404', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-404-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/does-not-exist');
    assert.equal(res.status, 404);
  } finally { await server.close(); }
});

test('GET /__agent-isles/screens returns the document list as JSON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-screens-'));
  writeFileSync(join(dir, 'a.md'), '# Ay');
  writeFileSync(join(dir, 'b.md'), '# Bee');
  utimesSync(join(dir, 'a.md'), new Date(1000), new Date(1000));
  utimesSync(join(dir, 'b.md'), new Date(2000), new Date(2000));
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/__agent-isles/screens');
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.deepEqual(data.screens.map((s) => s.slug), ['a', 'b']);
    assert.equal(data.newest, 'b');
  } finally { await server.close(); }
});

test('GET / shows a sidebar when 2+ docs exist and none with a single doc', async () => {
  const one = mkdtempSync(join(tmpdir(), 'isles-live-one-'));
  writeFileSync(join(one, 'only.md'), '# Only');
  const many = mkdtempSync(join(tmpdir(), 'isles-live-many-'));
  writeFileSync(join(many, 'a.md'), '# A');
  writeFileSync(join(many, 'b.md'), '# B');
  const s1 = await startLiveServer(one, { port: 0 });
  const s2 = await startLiveServer(many, { port: 0 });
  try {
    const r1 = await get(s1.url + '/');
    assert.doesNotMatch(r1.body, /id="isles-sidebar"/);
    const r2 = await get(s2.url + '/');
    assert.match(r2.body, /id="isles-sidebar"/);
  } finally { await s1.close(); await s2.close(); }
});

test('GET /__agent-isles/screens tolerates a query string', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-screens-q-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/__agent-isles/screens?x=1');
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.deepEqual(data.screens.map((s) => s.slug), ['a']);
  } finally { await server.close(); }
});

test('signal records are stamped with the screen slug + filename when provided', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-stamp-'));
  writeFileSync(join(dir, 'screen-2.md'), '# Two');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const r = await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A', screen: 'screen-2' });
    assert.equal(r.status, 200);
    const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n')[0]);
    assert.equal(rec.screen, 'screen-2');
    assert.equal(rec.screen_file, 'screen-2.md');
  } finally { await server.close(); }
});

test('signal records omit screen fields when no screen is provided (back-compat)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-nostamp-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A' });
    const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n')[0]);
    assert.ok(!('screen' in rec));
    assert.ok(!('screen_file' in rec));
  } finally { await server.close(); }
});

test('signal with an unknown screen slug records screen but no screen_file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-stamp-unknown-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { choice: 'a', screen: 'ghost' });
    const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n')[0]);
    assert.equal(rec.screen, 'ghost');
    assert.ok(!('screen_file' in rec));
  } finally { await server.close(); }
});

test('adding a new screen broadcasts live:advance and clears prior events', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-advance-'));
  writeFileSync(join(dir, 'screen-1.md'), '# One');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    await postJson(server.url + '/__agent-isles/signal', { choice: 'a', text: 'A' });
    assert.ok(existsSync(eventsFile(dir)));
    writeFileSync(join(dir, 'screen-2.md'), '# Two');
    assert.ok(await waitFor(() => sse.text.includes('event: live:advance')), 'advance broadcast');
    assert.match(sse.text, /event: live:advance\ndata: {"slug":"screen-2"}/);
    assert.ok(await waitFor(() => !existsSync(eventsFile(dir))), 'events cleared on push');
  } finally { sse.req.destroy(); await server.close(); }
});

test('editing an existing screen broadcasts live:reload with its slug, not advance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-edit-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  writeFileSync(join(dir, 'b.md'), '# B');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    writeFileSync(join(dir, 'a.md'), '# A edited and longer');
    utimesSync(join(dir, 'a.md'), new Date(Date.now()), new Date(Date.now() + 5000));
    assert.ok(await waitFor(() => sse.text.includes('event: live:reload')), 'reload broadcast');
    assert.match(sse.text, /event: live:reload\ndata: {"slug":"a"}/);
    assert.doesNotMatch(sse.text, /event: live:advance/);
  } finally { sse.req.destroy(); await server.close(); }
});

test('adding a screen broadcasts live:screens (membership change)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-membership-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    writeFileSync(join(dir, 'b.md'), '# B');
    assert.ok(await waitFor(() => sse.text.includes('event: live:screens')), 'screens broadcast on add');
  } finally { sse.req.destroy(); await server.close(); }
});

test('served client wires typed SSE handlers and slug-aware reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-client-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  writeFileSync(join(dir, 'b.md'), '# B');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const body = (await get(server.url + '/a')).body;
    assert.match(body, /addEventListener\('live:advance'/);
    assert.match(body, /addEventListener\('live:reload'/);
    assert.match(body, /addEventListener\('live:screens'/);
    assert.match(body, /__agent-isles\/screens/);          // sidebar refresh fetch
    assert.match(body, /__ISLES_ACTIVE_SLUG="a"/);         // active slug embedded
  } finally { await server.close(); }
});

test('editing an existing screen also broadcasts live:screens (updated-badge trigger)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-edit-screens-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  writeFileSync(join(dir, 'b.md'), '# B');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    writeFileSync(join(dir, 'b.md'), '# B much longer now');
    utimesSync(join(dir, 'b.md'), new Date(Date.now()), new Date(Date.now() + 5000));
    assert.ok(await waitFor(() => sse.text.includes('event: live:screens')), 'screens broadcast on edit');
  } finally { sse.req.destroy(); await server.close(); }
});

test('served client includes the updated-badge logic', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-badge-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  writeFileSync(join(dir, 'b.md'), '# B');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const body = (await get(server.url + '/a')).body;
    assert.match(body, /isles-updated/);
    assert.match(body, /data-mtime=/);
  } finally { await server.close(); }
});
