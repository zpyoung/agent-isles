import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  startLiveServer, resolveNewestScreen, eventsFile, injectLiveFrame, __internal,
} from '../src/live.mjs';

const { parseHoldSeconds, parseSinceSeconds, agentScreenMatches } = __internal;

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

// GET an agent long-poll route. `token`/`origin` set the matching headers when
// they are strings (omit to send none). Resolves once the response completes —
// including when the socket is force-closed after headers (shutdown 503), so the
// captured status survives a truncated body.
function agentGet(baseUrl, path, { token, origin } = {}) {
  return new Promise((resolvePromise, reject) => {
    const u = new URL(baseUrl + path);
    const headers = {};
    if (typeof token === 'string') headers.Authorization = `Bearer ${token}`;
    if (typeof origin === 'string') headers.Origin = origin;
    let settled = false;
    const req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      // Resolve on end OR close/error: the shutdown path force-closes the socket
      // right after the 503 head+body are sent, and we still want the captured
      // status (from headers) rather than treating a truncated body as a failure.
      const done = () => { if (settled) return; settled = true; resolvePromise({ status: res.statusCode, body }); };
      res.on('end', done);
      res.on('close', done);
      res.on('error', done);
    });
    req.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
    // No legit agent GET here waits more than a few hundred ms before responding,
    // so a long stall means a hang — fail fast instead of blocking the runner.
    req.setTimeout(20000, () => { req.destroy(new Error('agentGet timed out')); });
  });
}

const AGENT_EVENTS = '/__agent-isles/agent/events';

// Minimal WebSocket client for the signal twin: complete the upgrade handshake
// and return the raw socket. No Origin header, so the server's origin gate lets
// it through — the real browser client connects the same way.
function openSignalWs(baseUrl) {
  const u = new URL(baseUrl);
  const req = http.request({
    hostname: u.hostname, port: u.port, path: '/__agent-isles/signal',
    headers: {
      Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Key': Buffer.from('agent-isles-test').toString('base64'),
      'Sec-WebSocket-Version': '13',
    },
  });
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    req.on('upgrade', (_res, socket) => { if (!settled) { settled = true; resolvePromise(socket); } });
    // A normal HTTP response instead of a 101 (e.g. an auth/route regression)
    // would otherwise never resolve — fail fast rather than hang the runner.
    req.on('response', (res) => {
      if (settled) return;
      settled = true; req.destroy();
      reject(new Error(`WS upgrade refused: HTTP ${res.statusCode}`));
    });
    req.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
    req.setTimeout(10000, () => {
      if (settled) return;
      settled = true; req.destroy();
      reject(new Error('WS upgrade timed out'));
    });
    req.end();
  });
}

// Encode a masked client→server text frame (payloads here are small, < 126 bytes).
function encodeWsTextFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]);
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

test('injectLiveFrame inserts before the real </body>, not a </body> literal inside an inlined script', () => {
  // Inlined bundles (e.g. mermaid's DOMPurify iframe srcdoc template) contain
  // literal structural tags as JS string contents. The live frame must target
  // the real document tags, not the first textual match inside a <script>.
  const script = '<script>/*mermaid*/ var s = "<head></head><body>"+x+"</body></html>"; foo();</script>';
  const page = `<!doctype html><html><head><title>t</title></head><body><h1>Doc</h1>${script}</body></html>`;

  const out = injectLiveFrame(page);

  // The inlined script must survive intact — nothing spliced into its body.
  assert.ok(out.includes(script), 'inlined script was corrupted by injection');
  // The live client/bar must land after the script closes, not inside it.
  assert.ok(
    out.indexOf('id="isles-bar"') > out.lastIndexOf('foo();</script>'),
    'live bar/client was inserted before the inlined script closed',
  );
});

test('injectLiveFrame finds </body> without lowercasing index drift', () => {
  const page = '<!doctype html><html><head><title>t</title></head><body><p>İ</p></body></html>';

  const out = injectLiveFrame(page);

  assert.ok(
    out.includes('<p>İ</p><div id="isles-bar"'),
    'live frame was inserted at a drifted offset after Unicode case mapping',
  );
  assert.ok(out.includes('</body></html>'), 'closing body tag was corrupted');
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

test('broadcast drops an SSE client whose write throws', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-dead-sse-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0 });
  let ended = false;
  const deadClient = {
    write() { throw new Error('socket gone'); },
    end() { ended = true; },
  };
  try {
    server._clients.add(deadClient);
    server.broadcast('live:reload', { slug: 'a' });
    assert.equal(server._clients.has(deadClient), false);
    assert.equal(ended, true);

    // A second broadcast should not try the dead client again.
    server.broadcast('live:reload', { slug: 'a' });
    assert.equal(server._clients.size, 0);
  } finally { await server.close(); }
});

test('close completes with an active SSE client connected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-close-sse-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0 });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    await Promise.race([
      server.close(),
      sleep(1000).then(() => { throw new Error('server.close timed out'); }),
    ]);
    assert.equal(server._clients.size, 0);
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

test('GET /__agent-isles/tree returns a recursive nested document tree', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-tree-'));
  writeFileSync(join(dir, 'root.md'), '# Root');
  mkdirSync(join(dir, 'guides'));
  writeFileSync(join(dir, 'guides', 'intro.md'), '# Intro');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const res = await get(server.url + '/__agent-isles/tree');
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.deepEqual(data.docs.map((d) => d.slug).sort(), ['guides/intro', 'root']);
    // Folder node nests its file child.
    const folder = data.tree.find((n) => n.type === 'dir' && n.name === 'guides');
    assert.ok(folder, 'guides folder present in tree');
    assert.deepEqual(folder.children.map((c) => c.slug), ['guides/intro']);
  } finally { await server.close(); }
});

test('reader mode serves the SPA shell at / and the reader bundle route', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-reader-shell-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    const root = await get(server.url + '/');
    assert.equal(root.status, 200);
    assert.match(root.body, /__agent-isles\/reader\.js/);
    assert.doesNotMatch(root.body, /Waiting for the agent/); // not the agent-screen page
    const bundle = await get(server.url + '/__agent-isles/reader.js');
    assert.equal(bundle.status, 200);
    assert.ok(bundle.body.length > 1000);
  } finally { await server.close(); }
});

test('reader mode deep-links a known slug and 404s an unknown one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-reader-deep-'));
  writeFileSync(join(dir, 'alpha.md'), '# Alpha');
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    const known = await get(server.url + '/alpha');
    assert.equal(known.status, 200);
    assert.match(known.body, /__ISLES_INITIAL_SLUG="alpha"/);
    const unknown = await get(server.url + '/missing');
    assert.equal(unknown.status, 404);
  } finally { await server.close(); }
});

test('reader mode with readerFile scopes the tree and raw to one file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-reader-file-'));
  writeFileSync(join(dir, 'one.md'), '# One\n\nONE_BODY');
  writeFileSync(join(dir, 'two.md'), '# Two\n\nTWO_BODY');
  const server = await startLiveServer(dir, { port: 0, reader: true, readerFile: 'one.md' });
  try {
    const tree = JSON.parse((await get(server.url + '/__agent-isles/tree')).body);
    assert.deepEqual(tree.docs.map((d) => d.slug), ['one']);
    const rawOne = await get(server.url + '/__agent-isles/raw?slug=one');
    assert.equal(rawOne.status, 200);
    assert.match(rawOne.body, /ONE_BODY/);
    const rawTwo = await get(server.url + '/__agent-isles/raw?slug=two');
    assert.equal(rawTwo.status, 404); // sibling file is out of scope
  } finally { await server.close(); }
});

test('GET /__agent-isles/raw returns raw Markdown for a slug and 404s otherwise', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-raw-'));
  writeFileSync(join(dir, 'doc.md'), '# Doc\n\nRAW_BODY_UNIQUE');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const ok = await get(server.url + '/__agent-isles/raw?slug=doc');
    assert.equal(ok.status, 200);
    assert.match(ok.body, /RAW_BODY_UNIQUE/);
    assert.doesNotMatch(ok.body, /<h1/); // raw, not rendered
    const missing = await get(server.url + '/__agent-isles/raw?slug=nope');
    assert.equal(missing.status, 404);
    const traversal = await get(server.url + '/__agent-isles/raw?slug=..%2Fsecret');
    assert.equal(traversal.status, 404);
  } finally { await server.close(); }
});

// --- Agent long-poll endpoint (docs/plans/agent-events-long-poll.md) ---

test('agent/events returns a queued proceed record, then drains it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-queued-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'go', text: 'Go' });
    const r1 = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r1.status, 200);
    const rec = JSON.parse(r1.body);
    assert.equal(rec.type, 'proceed');
    assert.equal(rec.choice, 'go');
    assert.equal(rec.text, 'Go');
    const r2 = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r2.status, 204);
    assert.equal(r2.body, '');
  } finally { await server.close(); }
});

test('agent/events parks a request and resolves the instant a proceed arrives', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-park-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const pending = agentGet(server.url, AGENT_EVENTS + '?hold=5', { token: server.token });
    assert.ok(await waitFor(() => server._heldAgentRequests.size === 1), 'request parked');
    const t0 = Date.now();
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'go' });
    const r = await pending;
    // Push-resolution, not hold-expiry: a click must wake the parked request in
    // milliseconds, well under the 5s hold. (5s window vs <1s bound → not flaky.)
    assert.ok(Date.now() - t0 < 1000, 'resolved on push, not at hold expiry');
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).choice, 'go');
  } finally { await server.close(); }
});

test('agent/events 204s on hold expiry and retains a click posted afterward', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-retain-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const r1 = await agentGet(server.url, AGENT_EVENTS + '?hold=0.2', { token: server.token });
    assert.equal(r1.status, 204); // nothing arrived within the hold window
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'later' });
    const r2 = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r2.status, 200); // the between-invocations click was not lost
    assert.equal(JSON.parse(r2.body).choice, 'later');
  } finally { await server.close(); }
});

test('agent/events since filter uses >= (equal delivered, older filtered out)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-since-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'c' });
    const t = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n').pop()).timestamp;
    // Record older than the filter → no match, not consumed.
    const older = await agentGet(server.url, `${AGENT_EVENTS}?hold=0&since=${t + 1000}`, { token: server.token });
    assert.equal(older.status, 204);
    // Equal timestamp still delivers (>=, not >).
    const equal = await agentGet(server.url, `${AGENT_EVENTS}?hold=0&since=${t}`, { token: server.token });
    assert.equal(equal.status, 200);
    assert.equal(JSON.parse(equal.body).choice, 'c');
  } finally { await server.close(); }
});

test('agent/events screen filter matches slug or filename; unstamped matches any', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-screen-'));
  writeFileSync(join(dir, 'screen-2.md'), '# Two');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'a', screen: 'screen-2' });
    const miss = await agentGet(server.url, AGENT_EVENTS + '?hold=0&screen=other', { token: server.token });
    assert.equal(miss.status, 204); // mismatched stamp → no delivery, record retained
    const byFile = await agentGet(server.url, AGENT_EVENTS + '?hold=0&screen=screen-2.md', { token: server.token });
    assert.equal(byFile.status, 200); // matches screen_file

    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'b', screen: 'screen-2' });
    const bySlug = await agentGet(server.url, AGENT_EVENTS + '?hold=0&screen=screen-2', { token: server.token });
    assert.equal(bySlug.status, 200); // matches screen slug
    assert.equal(JSON.parse(bySlug.body).choice, 'b');

    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'c' }); // no screen stamp
    const anyFilter = await agentGet(server.url, AGENT_EVENTS + '?hold=0&screen=whatever', { token: server.token });
    assert.equal(anyFilter.status, 200); // unstamped record matches any filter
    assert.equal(JSON.parse(anyFilter.body).choice, 'c');
  } finally { await server.close(); }
});

test('agent/events delivers the newest of two clicks and consumes both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-newest-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'first' });
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'second' });
    const r1 = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r1.status, 200);
    assert.equal(JSON.parse(r1.body).choice, 'second'); // latest wins
    const r2 = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r2.status, 204); // the superseded click was consumed too
  } finally { await server.close(); }
});

test('adding a new screen clears the agent queue (stale click cannot satisfy a wait)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-advance-'));
  writeFileSync(join(dir, 'screen-1.md'), '# One');
  const server = await startLiveServer(dir, { port: 0, watch: true });
  try {
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'stale', screen: 'screen-1' });
    assert.ok(existsSync(eventsFile(dir)));
    writeFileSync(join(dir, 'screen-2.md'), '# Two');
    assert.ok(await waitFor(() => !existsSync(eventsFile(dir))), 'events cleared on new screen');
    const r = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r.status, 204);
  } finally { await server.close(); }
});

test('agent routes reject a missing/wrong token with 401 and any Origin with 403', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-auth-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    assert.equal((await agentGet(server.url, AGENT_EVENTS + '?hold=0', {})).status, 401);
    assert.equal((await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: 'wrong' })).status, 401);
    const withOrigin = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token, origin: 'http://evil.example' });
    assert.equal(withOrigin.status, 403);
    // health enforces the same and reports pid.
    assert.equal((await agentGet(server.url, '/__agent-isles/agent/health', {})).status, 401);
    const health = await agentGet(server.url, '/__agent-isles/agent/health', { token: server.token });
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true, pid: process.pid });
  } finally { await server.close(); }
});

test('server-info includes a hex token and keeps existing fields unchanged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-info-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const info = JSON.parse(readFileSync(join(dir, 'state', 'server-info'), 'utf8'));
    assert.match(info.token, /^[0-9a-f]{32}$/);
    assert.equal(info.token, server.token);
    assert.equal(info.type, 'server-started');
    assert.equal(info.screen_dir, dir);
    assert.equal(info.state_dir, join(dir, 'state'));
    assert.equal(typeof info.port, 'number');
    assert.equal(info.pid, process.pid);
  } finally { await server.close(); }
});

test('a click broadcasts live:signal on the SSE channel', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-broadcast-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'go', text: 'Go' });
    assert.ok(await waitFor(() => sse.text.includes('event: live:signal')), 'live:signal broadcast');
    assert.match(sse.text, /event: live:signal\ndata: {.*"choice":"go".*}/);
  } finally { sse.req.destroy(); await server.close(); }
});

test('non-proceed signals are broadcast and written but never queued', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-nonproceed-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  const sse = openSse(server.url + '/events');
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    await postJson(server.url + '/__agent-isles/signal', { type: 'quirk-rating', choice: '5' });
    const rec = JSON.parse(readFileSync(eventsFile(dir), 'utf8').trim().split('\n')[0]);
    assert.equal(rec.type, 'quirk-rating'); // still written to the file
    assert.ok(await waitFor(() => sse.text.includes('event: live:signal')), 'still broadcast');
    const r = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r.status, 204); // but not queued for the agent
  } finally { sse.req.destroy(); await server.close(); }
});

test('idle check reports idle with no clients and no holds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-idle-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0, idleTimeoutMinutes: 0 });
  try {
    await sleep(20);
    assert.equal(server._idleShouldStop(), true);
  } finally { await server.close(); }
});

test('an open agent hold blocks idle shutdown and receives 503 on close', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-hold-idle-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0, idleTimeoutMinutes: 0 });
  const pending = agentGet(server.url, AGENT_EVENTS + '?hold=5', { token: server.token });
  try {
    assert.ok(await waitFor(() => server._heldAgentRequests.size === 1), 'request parked');
    await sleep(20);
    assert.equal(server._idleShouldStop(), false); // the open hold counts as an active client
    await server.close();
    const r = await pending;
    assert.equal(r.status, 503); // held request released at shutdown
  } finally { await server.close(); }
});

test('parseHoldSeconds: default 100, clamps to [0,110], non-finite falls back', () => {
  for (const raw of [undefined, null, '', 'abc', 'NaN']) assert.equal(parseHoldSeconds(raw), 100);
  assert.equal(parseHoldSeconds('0'), 0);
  assert.equal(parseHoldSeconds('50'), 50);
  assert.equal(parseHoldSeconds('0.2'), 0.2);
  assert.equal(parseHoldSeconds('110'), 110);
  assert.equal(parseHoldSeconds('200'), 110);  // upper clamp keeps holds under the 120s kill
  assert.equal(parseHoldSeconds('-5'), 0);      // lower clamp
});

test('parseSinceSeconds: default 0, integer epoch seconds, invalid/negative -> 0', () => {
  for (const raw of [undefined, null, '', 'abc', '-5', '0']) assert.equal(parseSinceSeconds(raw), 0);
  assert.equal(parseSinceSeconds('1700000000'), 1700000000);
  assert.equal(parseSinceSeconds('1.9'), 1); // floored integer parse
});

test('agentScreenMatches: empty filter and unstamped records match any; else slug or file', () => {
  assert.equal(agentScreenMatches({ timestamp: 1 }, null), true);            // no filter
  assert.equal(agentScreenMatches({ timestamp: 1 }, 'anything'), true);      // unstamped matches any
  assert.equal(agentScreenMatches({ screen: 'a', screen_file: 'a.md' }, 'a'), true);    // slug
  assert.equal(agentScreenMatches({ screen: 'a', screen_file: 'a.md' }, 'a.md'), true); // file
  assert.equal(agentScreenMatches({ screen: 'a', screen_file: 'a.md' }, 'b'), false);   // mismatch
  assert.equal(agentScreenMatches({ screen: 'a' }, 'a'), true);              // slug only
  assert.equal(agentScreenMatches({ screen_file: 'a.md' }, 'a.md'), true);   // file only
});

test('agent/events with no hold param parks (defaults to 100, not an instant 204)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-defaulthold-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const pending = agentGet(server.url, AGENT_EVENTS, { token: server.token }); // no hold=
    assert.ok(await waitFor(() => server._heldAgentRequests.size === 1), 'defaulted hold parks the request');
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'go' });
    const r = await pending;
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).choice, 'go');
  } finally { await server.close(); }
});

test('a proceed delivered over the WebSocket signal twin is queued and broadcast', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-ws-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  const sse = openSse(server.url + '/events');
  let socket;
  try {
    assert.ok(await waitFor(() => sse.text.includes('event: live:ready')));
    socket = await openSignalWs(server.url);
    socket.write(encodeWsTextFrame(JSON.stringify({ type: 'proceed', choice: 'ws' })));
    assert.ok(await waitFor(() => sse.text.includes('event: live:signal')), 'ws click broadcast');
    const r = await agentGet(server.url, AGENT_EVENTS + '?hold=1', { token: server.token });
    assert.equal(r.status, 200); // the WS-delivered click reached the agent queue
    assert.equal(JSON.parse(r.body).choice, 'ws');
  } finally { if (socket) socket.destroy(); sse.req.destroy(); await server.close(); }
});

test('the agent queue is bounded: newest 64 kept, oldest evicted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-bound-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    for (let i = 0; i < 70; i += 1) {
      await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: String(i) });
    }
    assert.equal(server._agentQueue.length, 64);            // bounded
    assert.equal(server._agentQueue[0].choice, '6');        // oldest 6 (0..5) evicted
    assert.equal(server._agentQueue[63].choice, '69');      // newest retained
  } finally { await server.close(); }
});

test('agent/events cleans up a held request when the client aborts mid-hold', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-agent-abort-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0 });
  try {
    const u = new URL(server.url);
    const req = http.get({
      hostname: u.hostname, port: u.port, path: AGENT_EVENTS + '?hold=30',
      headers: { Authorization: `Bearer ${server.token}` },
    });
    req.on('error', () => {}); // the abort surfaces as a client-side error we ignore
    assert.ok(await waitFor(() => server._heldAgentRequests.size === 1), 'request parked');
    req.destroy(); // client hangs up mid-hold
    assert.ok(await waitFor(() => server._heldAgentRequests.size === 0), 'held entry dropped on abort');
    // No loss/leak: a click after the abort is retained and delivered to the next poll.
    await postJson(server.url + '/__agent-isles/signal', { type: 'proceed', choice: 'after-abort' });
    const r = await agentGet(server.url, AGENT_EVENTS + '?hold=0', { token: server.token });
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).choice, 'after-abort');
  } finally { await server.close(); }
});

// --- Component pack loading for the reader (docs/plans/reader-pack-loading.md) ---

// GET that also captures response headers (the base `get` helper drops them),
// so pack-asset content-type assertions can inspect them.
function getWithHeaders(url) {
  return new Promise((resolvePromise, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolvePromise({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

// Write a minimal trusted local pack (one module + one style) under
// <root>/packs/<name>, returning its directory. The module body embeds a
// "<name>:<moduleFile>" marker so a served response can be traced to its source.
function scaffoldPack(root, { name = 'demo-widget-pack', tag = 'demo-widget', moduleFile = 'widget.js', styleFile = 'widget.css' } = {}) {
  const packDir = join(root, 'packs', name);
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, moduleFile), `customElements.define('${tag}', class extends HTMLElement {}); /* ${name}:${moduleFile} */\n`);
  writeFileSync(join(packDir, styleFile), `${tag}{display:block}\n`);
  writeFileSync(join(packDir, 'agent-isles.pack.json'), JSON.stringify({
    agentIslesPackVersion: 1,
    name,
    tags: [{ name: tag, attributes: ['title'] }],
    assets: [{ type: 'module', path: moduleFile }, { type: 'style', path: styleFile }],
  }));
  return packDir;
}

test('pack-manifest lists a project pack module+style; pack-asset serves each with correct content types', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-pack-manifest-'));
  writeFileSync(join(dir, 's.md'), '# x');
  scaffoldPack(dir);
  writeFileSync(join(dir, 'isles.config.json'), JSON.stringify({ packs: ['./packs/demo-widget-pack'] }));
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    const manifest = await get(server.url + '/__agent-isles/pack-manifest');
    assert.equal(manifest.status, 200);
    const { assets } = JSON.parse(manifest.body);
    assert.equal(assets.length, 2);
    const mod = assets.find((a) => a.type === 'module');
    const style = assets.find((a) => a.type === 'style');
    assert.equal(mod.url, '/__agent-isles/pack-asset?pack=0&path=widget.js');
    assert.equal(style.url, '/__agent-isles/pack-asset?pack=0&path=widget.css');

    const modRes = await getWithHeaders(server.url + mod.url);
    assert.equal(modRes.status, 200);
    assert.match(modRes.headers['content-type'], /text\/javascript/);
    assert.match(modRes.headers['cache-control'], /no-cache/);
    assert.match(modRes.body, /customElements\.define/);

    const styleRes = await getWithHeaders(server.url + style.url);
    assert.equal(styleRes.status, 200);
    assert.match(styleRes.headers['content-type'], /text\/css/);
    assert.match(styleRes.body, /demo-widget/);
  } finally { await server.close(); }
});

test('pack-manifest is empty when the project declares no packs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-pack-none-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    const manifest = await get(server.url + '/__agent-isles/pack-manifest');
    assert.equal(manifest.status, 200);
    assert.deepEqual(JSON.parse(manifest.body), { assets: [] });
  } finally { await server.close(); }
});

test('a broken pack config degrades to an empty manifest and the server stays up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-pack-broken-'));
  writeFileSync(join(dir, 's.md'), '# x');
  // Points at a pack directory that does not exist → resolution throws at startup.
  writeFileSync(join(dir, 'isles.config.json'), JSON.stringify({ packs: ['./packs/does-not-exist'] }));
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    const manifest = await get(server.url + '/__agent-isles/pack-manifest');
    assert.equal(manifest.status, 200);
    assert.deepEqual(JSON.parse(manifest.body), { assets: [] });
    // The reader shell still serves — a broken pack must not brick the reader.
    const root = await get(server.url + '/');
    assert.equal(root.status, 200);
    assert.match(root.body, /__agent-isles\/reader\.js/);
  } finally { await server.close(); }
});

test('pack-asset 404s on undeclared path, out-of-range/invalid pack, and traversal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-pack-guard-'));
  writeFileSync(join(dir, 's.md'), '# x');
  scaffoldPack(dir);
  writeFileSync(join(dir, 'isles.config.json'), JSON.stringify({ packs: ['./packs/demo-widget-pack'] }));
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    // A real file inside the pack dir but not a declared asset.
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=0&path=agent-isles.pack.json')).status, 404);
    // Pack index past the resolved list.
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=9&path=widget.js')).status, 404);
    // Negative / non-numeric pack index.
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=-1&path=widget.js')).status, 404);
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=abc&path=widget.js')).status, 404);
    // Traversal attempt — fails the declared-asset match, no path arithmetic.
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=0&path=..%2F..%2Fisles.config.json')).status, 404);
  } finally { await server.close(); }
});

test('pack-asset refuses a symlinked asset (O_NOFOLLOW) while serving genuine files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-pack-symlink-'));
  writeFileSync(join(dir, 's.md'), '# x');
  const secret = join(dir, 'secret.js');
  writeFileSync(secret, 'SECRET_OUTSIDE_PACK');
  const packDir = join(dir, 'packs', 'sym-pack');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'widget.css'), 'demo-widget{display:block}\n');
  // A declared module asset that is a symlink to a file outside the pack. The
  // loader accepts it (statSync follows the link), but the read must refuse it.
  symlinkSync(secret, join(packDir, 'widget.js'));
  writeFileSync(join(packDir, 'agent-isles.pack.json'), JSON.stringify({
    agentIslesPackVersion: 1,
    name: 'sym-pack',
    assets: [{ type: 'module', path: 'widget.js' }, { type: 'style', path: 'widget.css' }],
  }));
  writeFileSync(join(dir, 'isles.config.json'), JSON.stringify({ packs: ['./packs/sym-pack'] }));
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    const sym = await get(server.url + '/__agent-isles/pack-asset?pack=0&path=widget.js');
    assert.equal(sym.status, 404);
    assert.doesNotMatch(sym.body, /SECRET_OUTSIDE_PACK/);
    // The genuine (non-symlink) style asset still serves.
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=0&path=widget.css')).status, 200);
  } finally { await server.close(); }
});

test('pack-manifest and pack-asset keep the pack index aligned across multiple packs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-pack-multi-'));
  writeFileSync(join(dir, 's.md'), '# x');
  // Distinct tags: two packs claiming the same tag would trip the resolver's
  // tag-conflict guard. Config order fixes the resolved index (a=0, b=1).
  scaffoldPack(dir, { name: 'pack-a', tag: 'demo-widget-a', moduleFile: 'a.js', styleFile: 'a.css' });
  scaffoldPack(dir, { name: 'pack-b', tag: 'demo-widget-b', moduleFile: 'b.js', styleFile: 'b.css' });
  writeFileSync(join(dir, 'isles.config.json'), JSON.stringify({ packs: ['./packs/pack-a', './packs/pack-b'] }));
  const server = await startLiveServer(dir, { port: 0, reader: true });
  try {
    const { assets } = JSON.parse((await get(server.url + '/__agent-isles/pack-manifest')).body);
    // Two packs × (module + style) = 4 assets; group the emitted URLs by pack index.
    const byPack = new Map();
    for (const a of assets) {
      const m = a.url.match(/pack=(\d+)&path=([^&]+)$/);
      const idx = Number(m[1]);
      if (!byPack.has(idx)) byPack.set(idx, []);
      byPack.get(idx).push(decodeURIComponent(m[2]));
    }
    assert.deepEqual([...byPack.get(0)].sort(), ['a.css', 'a.js']);
    assert.deepEqual([...byPack.get(1)].sort(), ['b.css', 'b.js']);

    // Each index serves ITS OWN pack's file (not a swap): the marker proves source.
    const a0 = await get(server.url + '/__agent-isles/pack-asset?pack=0&path=a.js');
    assert.equal(a0.status, 200);
    assert.match(a0.body, /pack-a:a\.js/);
    const b1 = await get(server.url + '/__agent-isles/pack-asset?pack=1&path=b.js');
    assert.equal(b1.status, 200);
    assert.match(b1.body, /pack-b:b\.js/);

    // A path declared by the other pack is rejected — the match is scoped per pack.
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=1&path=a.js')).status, 404);
    assert.equal((await get(server.url + '/__agent-isles/pack-asset?pack=0&path=b.js')).status, 404);
  } finally { await server.close(); }
});
