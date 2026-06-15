import http from 'node:http';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  watch as fsWatch,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { renderMarkdownString } from './render.mjs';
import { listScreens, listScreenFiles, resolveSlug, readFileNoFollow } from './live-docs.mjs';
import { injectLiveFrame } from './live-shell.mjs';

export { injectLiveFrame };

const defaultHost = '127.0.0.1';

function stateDir(dir) { return join(dir, 'state'); }
export function eventsFile(dir) { return join(stateDir(dir), 'events'); }

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    let bytes = 0;
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', (c) => {
      if (settled) return;
      bytes += Buffer.byteLength(c, 'utf8');
      if (bytes > limit) {
        settled = true;
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      body += c;
    });
    req.on('end', () => { if (!settled) { settled = true; resolvePromise(body); } });
    req.on('error', (error) => { if (!settled) { settled = true; reject(error); } });
  });
}

function parseSignalDetail(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return {};
}

const SIGNAL_MAX_STR = 256;   // cap any single string field
const SIGNAL_MAX_SELECTED = 64; // cap selection list length
// Event-type vocabulary is open so custom pack components can define their own
// signals (e.g. "quirk-rating"), but constrained to a short lowercase token so
// records stay greppable and a sender can't smuggle arbitrary content in `type`.
const SIGNAL_TYPE_RE = /^[a-z][a-z0-9-]{0,31}$/;

function clampStr(value) {
  return value.length > SIGNAL_MAX_STR ? value.slice(0, SIGNAL_MAX_STR) : value;
}

export function appendSignalEvent(dir, detail) {
  // Untrusted input: a signal can arrive from any client that reaches the
  // localhost endpoint, and `selected`/`text` are surfaced into an agent's
  // context downstream. Constrain to bounded strings so a hostile or buggy
  // sender can't inject huge or structured payloads.
  const record = {
    type: typeof detail.type === 'string' && SIGNAL_TYPE_RE.test(detail.type) ? detail.type : 'click',
    choice: typeof detail.choice === 'string' ? clampStr(detail.choice) : null,
    text: typeof detail.text === 'string' ? clampStr(detail.text) : '',
    timestamp: Math.floor(Date.now() / 1000),
  };
  if (Array.isArray(detail.selected)) {
    record.selected = detail.selected
      .filter((s) => typeof s === 'string')
      .slice(0, SIGNAL_MAX_SELECTED)
      .map(clampStr);
  }
  if (typeof detail.screen === 'string' && detail.screen) {
    const screen = clampStr(detail.screen);
    record.screen = screen;
    const match = resolveSlug(dir, screen);
    if (match) record.screen_file = match.name;
  }
  mkdirSync(stateDir(dir), { recursive: true });
  appendFileSync(eventsFile(dir), JSON.stringify(record) + '\n');
  return record;
}

function webSocketAccept(key) {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

function parseWebSocketFrames(buffer) {
  const messages = [];
  let offset = 0;
  let shouldClose = false;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) { shouldClose = true; break; }
      length = Number(bigLength);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;

    const maskStart = offset + headerLength;
    const payloadStart = maskStart + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length));
    if (masked) {
      const mask = buffer.subarray(maskStart, maskStart + 4);
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }

    if (opcode === 0x1) messages.push(payload.toString('utf8'));
    if (opcode === 0x8) shouldClose = true;
    offset += frameLength;
    if (shouldClose) break;
  }
  return { messages, rest: buffer.subarray(offset), shouldClose };
}

export function resolveNewestScreen(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  let newest = null;
  let newestMtime = -1;
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const full = join(dir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue; // deleted between readdir and stat
    }
    if (!st.isFile()) continue;
    if (st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newest = full; }
  }
  return newest;
}

function waitingPage() {
  return injectLiveFrame(
    '<!doctype html><html><head><meta charset="utf-8"><title>Agent Isles Live</title></head>' +
    '<body><p style="padding:2rem;color:#888;font-family:system-ui,sans-serif">Waiting for the agent to push a screen…</p></body></html>'
  );
}

function newestOf(screens) {
  let active = null;
  for (const s of screens) if (!active || s.mtimeMs > active.mtimeMs) active = s;
  return active;
}

async function renderScreenHtml(dir, screen, screens, activeSlug) {
  let markdown;
  try {
    markdown = readFileNoFollow(screen.file); // O_NOFOLLOW: refuse race-swapped symlinks
  } catch {
    return waitingPage(); // file vanished / became a symlink between resolve and read
  }
  const { html } = await renderMarkdownString(markdown, {
    assetMode: 'inline',
    includeUserPacks: false,
    projectDir: dir,
  });
  return injectLiveFrame(html, { screens, activeSlug });
}

async function renderNewest(dir) {
  let screens;
  try {
    screens = listScreens(dir);
  } catch {
    return waitingPage();
  }
  const active = newestOf(screens);
  if (!active) return waitingPage();
  return renderScreenHtml(dir, active, screens, active.slug);
}

async function renderBySlug(dir, slug) {
  const screens = listScreens(dir);
  const active = screens.find((s) => s.slug === slug);
  if (!active) return null; // 404
  return renderScreenHtml(dir, active, screens, active.slug);
}

export async function startLiveServer(dir, options = {}) {
  const host = options.host || defaultHost;
  const clients = new Set();
  const signalSockets = new Set();
  let closing = false;
  mkdirSync(stateDir(dir), { recursive: true });

  // Signal endpoints (POST + WS) can wake and steer a tool-wielding agent, so
  // reject cross-origin browser requests: a malicious page must not be able to
  // POST/connect to this localhost server and inject proceed signals. Requests
  // with no Origin header (curl, native WS clients, the Quirk bridge) are
  // allowed — only a browser sets Origin, and that's the CSRF/cross-site vector.
  // Populated once the port is bound (below); no requests arrive before then.
  let allowedOrigins = null;
  const originAllowed = (req) => {
    const origin = req.headers && req.headers.origin;
    if (!origin) return true;
    return allowedOrigins ? allowedOrigins.has(origin) : true;
  };

  const server = http.createServer(async (req, res) => {
    if (closing) {
      res.writeHead(503, { 'Connection': 'close' });
      res.end('Server closing');
      return;
    }
    try {
      const pathname = req.url.split('?')[0];
      if (req.method === 'GET' && pathname === '/') {
        const page = await renderNewest(dir);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
      }
      if (req.method === 'GET' && pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
        });
        res.write('retry: 500\nevent: live:ready\ndata: {}\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        res.on('error', () => dropClient(res));
        return;
      }
      if (req.method === 'GET' && pathname === '/__agent-isles/screens') {
        const screens = listScreens(dir).map(({ slug, name, title, mtimeMs }) => ({ slug, name, title, mtimeMs }));
        const newest = newestOf(screens);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ screens, newest: newest ? newest.slug : null }));
        return;
      }
      if (req.method === 'POST' && pathname === '/__agent-isles/signal') {
        if (!originAllowed(req)) { res.writeHead(403); res.end('Forbidden origin'); return; }
        const raw = await readBody(req);
        appendSignalEvent(dir, parseSignalDetail(raw));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      if (req.method === 'GET') {
        let slug;
        try {
          slug = decodeURIComponent((pathname || '/').replace(/^\/+/, ''));
        } catch {
          slug = null;
        }
        if (slug) {
          const page = await renderBySlug(dir, slug);
          if (page) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(page);
            return;
          }
        }
      }
      res.writeHead(404); res.end('Not found');
    } catch (error) {
      res.writeHead(500); res.end(String(error && error.message || error));
    }
  });

  server.on('upgrade', (req, socket) => {
    try {
      if (closing) { socket.destroy(); return; }
      if (req.url !== '/__agent-isles/signal') { socket.destroy(); return; }
      if (!originAllowed(req)) { socket.destroy(); return; }
      const key = req.headers['sec-websocket-key'];
      if (typeof key !== 'string' || key.length === 0) { socket.destroy(); return; }
      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${webSocketAccept(key)}`,
        '',
        '',
      ].join('\r\n'));
      signalSockets.add(socket);
      let buffered = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        const parsed = parseWebSocketFrames(buffered);
        buffered = parsed.rest;
        for (const message of parsed.messages) appendSignalEvent(dir, parseSignalDetail(message));
        if (parsed.shouldClose) socket.destroy();
      });
      socket.on('close', () => signalSockets.delete(socket));
      socket.on('error', () => signalSockets.delete(socket));
    } catch {
      socket.destroy();
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => { server.off('error', reject); resolvePromise(); });
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : options.port;
  const urlHost = options.urlHost || (host === '127.0.0.1' ? 'localhost' : host);
  const url = `http://${urlHost}:${port}`;

  // Allowed browser origins: the page is served from one of these host:port
  // combos, so a same-origin click matches; an attacker page on another
  // host/port does not. (A direct-IP setup beyond these would need its host
  // added — the documented setups use localhost / --url-host.)
  allowedOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://${urlHost}:${port}`,
    `http://${host}:${port}`,
  ]);

  const infoPayload = {
    type: 'server-started', pid: process.pid, port, host, url,
    screen_dir: dir, state_dir: stateDir(dir),
  };
  try {
    const infoTmp = join(stateDir(dir), 'server-info.tmp');
    try {
      writeFileSync(infoTmp, JSON.stringify(infoPayload) + '\n');
      renameSync(infoTmp, join(stateDir(dir), 'server-info'));
    } catch (e) {
      try { unlinkSync(infoTmp); } catch {}
      throw e;
    }
  } catch {}

  function dropClient(c) {
    clients.delete(c);
    try { c.end(); } catch {}
  }

  function broadcast(event, data) {
    const payload = JSON.stringify(data || {});
    for (const c of clients) {
      try { c.write(`event: ${event}\ndata: ${payload}\n\n`); }
      catch { dropClient(c); }
    }
  }

  function clearEvents() {
    rmSync(eventsFile(dir), { force: true });
  }

  function indexByName(screens) {
    const map = new Map();
    for (const s of screens) map.set(s.name, s);
    return map;
  }

  function snapshotOf(screens) {
    return screens.map((s) => `${s.name}:${s.mtimeMs}:${s.size}`).join('|');
  }

  let lastScreens = listScreenFiles(dir);
  let lastSnapshot = snapshotOf(lastScreens);
  let watcher = null;
  let debounceTimer = null;
  if (options.watch) {
    try {
      watcher = fsWatch(dir, (_evt, filename) => {
        if (filename && !String(filename).endsWith('.md')) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            const next = listScreenFiles(dir);
            const snap = snapshotOf(next);
            if (snap === lastSnapshot) return; // ignore state/ churn + non-.md + no-op events
            lastSnapshot = snap;
            const prevByName = indexByName(lastScreens);
            const nextByName = indexByName(next);
            const added = next.filter((s) => !prevByName.has(s.name));
            const removed = lastScreens.filter((s) => !nextByName.has(s.name));
            const changed = next.filter((s) => {
              const prev = prevByName.get(s.name);
              return prev && (prev.mtimeMs !== s.mtimeMs || prev.size !== s.size);
            });
            lastScreens = next;

            if (added.length || removed.length || changed.length) broadcast('live:screens', { count: next.length });
            for (const s of changed) broadcast('live:reload', { slug: s.slug });
            if (added.length) {
              let push = added[0];
              for (const s of added) if (s.mtimeMs > push.mtimeMs) push = s;
              clearEvents(); // a new screen pushed → reset the single-flow interaction state
              broadcast('live:advance', { slug: push.slug });
            }
          } catch { /* watcher must never crash the debounce timer */ }
        }, 120);
      });
      watcher.on('error', () => {});
    } catch {
      watcher = null; // degrade: serve without live reload rather than leak/throw
    }
  }

  let lifecycle;
  let closePromise = null;
  function close(reason = 'closed') {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      clearInterval(lifecycle);
      clearTimeout(debounceTimer);
      if (watcher) watcher.close();
      for (const c of clients) dropClient(c);
      clients.clear();
      for (const socket of signalSockets) socket.destroy();
      signalSockets.clear();
      try { unlinkSync(join(stateDir(dir), 'server-info')); } catch {}
      try { writeFileSync(join(stateDir(dir), 'server-stopped'), JSON.stringify({ reason, timestamp: Date.now() }) + '\n'); } catch {}
      await new Promise((r) => {
        server.close(() => r());
        server.closeAllConnections?.();
      });
    })();
    return closePromise;
  }

  let lastActivity = Date.now();
  server.on('request', () => { lastActivity = Date.now(); });
  const idleMs = (options.idleTimeoutMinutes ?? 30) * 60 * 1000;
  const ownerPid = options.ownerPid || null;
  function shutdown(reason) { void close(reason); }
  lifecycle = setInterval(() => {
    if (ownerPid) {
      try { process.kill(ownerPid, 0); }
      catch (e) { if (e.code !== 'EPERM') { shutdown('owner exited'); return; } }
    }
    if (clients.size === 0 && Date.now() - lastActivity > idleMs) shutdown('idle timeout');
  }, 60 * 1000);
  lifecycle.unref?.();

  return { url, port, host, dir, server, broadcast, close, clearEvents, _clients: clients };
}

export async function runLiveForeground(dir, options = {}) {
  const server = await startLiveServer(dir, { ...options, watch: true });
  const infoPath = join(dir, 'state', 'server-info');
  let published = false;
  try {
    published = existsSync(infoPath) && statSync(infoPath).isFile();
    if (published) JSON.parse(readFileSync(infoPath, 'utf8'));
  } catch {
    published = false;
  }
  if (!published) {
    await server.close('startup-failed: could not publish server-info');
    process.exit(1);
  }
  let terminating = false;
  const onTerm = () => { if (terminating) return; terminating = true; server.close('signal').then(() => process.exit(0)); };
  process.once('SIGTERM', onTerm);
  process.once('SIGINT', onTerm);
  return server;
}

export function stopLive(dir) {
  const infoPath = join(dir, 'state', 'server-info');
  if (!existsSync(infoPath)) return false;
  let info;
  try { info = JSON.parse(readFileSync(infoPath, 'utf8')); } catch { return false; }
  if (!info || !Number.isInteger(info.pid) || info.pid <= 0) return false;
  if (typeof info.screen_dir !== 'string' || info.screen_dir !== dir) return false;
  try { process.kill(info.pid, 'SIGTERM'); return true; }
  catch (e) { if (e && e.code === 'ESRCH') { try { unlinkSync(infoPath); } catch {} } return false; }
}
