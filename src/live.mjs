import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdownString } from './render.mjs';
import { buildReaderShell } from './renderer/page.mjs';
import { listScreens, listScreenFiles, resolveSlug, readFileNoFollow } from './live-docs.mjs';
import { listReaderDocs, buildDocTree, resolveDocSlug } from './reader/sources.mjs';
import { injectLiveFrame } from './live-shell.mjs';
import { resolvePackInputs } from './pack-resolver.mjs';
import { buildPackAssetRecords } from './renderer/pack-assets.mjs';

const READER_BUNDLE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'isles-reader.js');

export { injectLiveFrame };

const defaultHost = '127.0.0.1';

function stateDir(dir) { return join(dir, 'state'); }
export function eventsFile(dir) { return join(stateDir(dir), 'events'); }

// Content type for a served pack asset, derived from its manifest-declared type
// rather than the file extension: the manifest permits any extension for a
// `module` (e.g. `.cjs`, extensionless), and a module MUST carry a JavaScript
// MIME type or the reader's import() is rejected. The manifest schema only
// allows `module`/`style`, so the octet-stream fallback is defensive.
function packAssetContentType(asset) {
  if (asset.type === 'module') return 'text/javascript; charset=utf-8';
  if (asset.type === 'style') return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

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

// Agent long-poll endpoint (docs/plans/agent-events-long-poll.md): the live
// server hands the newest `proceed` click to a waiting agent bridge over a
// one-request/one-response GET, replacing the bridge's file-poll loop.
const AGENT_QUEUE_MAX = 64;      // clicks only ever span the current screen; bound the buffer
const AGENT_HOLD_DEFAULT = 100;  // seconds a request parks waiting for a click
const AGENT_HOLD_MAX = 110;      // stay under the consumer harness's 120s command kill

// Lenient screen filter mirroring the bridge's `_screen_matches`: an empty
// filter matches anything, a record with no screen stamp matches any filter,
// otherwise the filter must equal the record's `screen` slug or `screen_file`.
function agentScreenMatches(record, screenFilter) {
  if (!screenFilter) return true;
  const stamped = record.screen != null || record.screen_file != null;
  if (!stamped) return true;
  return record.screen === screenFilter || record.screen_file === screenFilter;
}

function parseSinceSeconds(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseHoldSeconds(raw) {
  const n = Number(raw);
  if (raw == null || raw === '' || !Number.isFinite(n)) return AGENT_HOLD_DEFAULT;
  return Math.max(0, Math.min(AGENT_HOLD_MAX, n));
}

// Not part of the public module surface — exposed only so tests can unit-cover
// the query-param parsing and screen-matching edges directly. Do not depend on
// this from outside the package.
export const __internal = { agentScreenMatches, parseSinceSeconds, parseHoldSeconds };

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
  // Agent long-poll state: an in-memory queue of `proceed` records and the set
  // of currently-parked agent requests. The per-session bearer token gates both
  // agent routes and is published in state/server-info for the bridge to read.
  const agentQueue = [];
  const heldAgentRequests = new Set();
  const sessionToken = randomBytes(16).toString('hex');
  let closing = false;
  // Reader mode: serve the client-rendered reader SPA at `/` instead of the
  // server-rendered agent-screen page. readerFile scopes the tree to a single
  // file (file-mode `isles live <file.md>`). Both default off for back-compat.
  const readerMode = options.reader === true;
  const readerFile = typeof options.readerFile === 'string' ? options.readerFile : null;
  const readerDocs = () => {
    const result = listReaderDocs(dir);
    if (!readerFile) return result;
    // Preserve the scan's truncated flag: a scoped view must not claim the tree
    // was complete when the underlying walk hit MAX_DOCS/MAX_DEPTH.
    return { docs: result.docs.filter((d) => d.relPath === readerFile), truncated: result.truncated };
  };
  mkdirSync(stateDir(dir), { recursive: true });

  // Resolve trusted local component packs once per session and expose them to
  // the reader over HTTP (GET /__agent-isles/pack-manifest + /pack-asset). The
  // reader injects these at boot so a pack island upgrades and behaves exactly
  // as it does on the server-rendered shell path. Same scope as that path:
  // project config only, no user/CLI packs. Packs are static for a session, so
  // resolve+cache here. A broken pack must never brick the reader — any
  // resolution/load failure degrades to "no packs" with a single stderr note.
  let packAssetRecords = [];
  try {
    const resolved = await resolvePackInputs({ projectDir: dir, includeUserPacks: false });
    packAssetRecords = buildPackAssetRecords(resolved.packs);
  } catch (error) {
    process.stderr.write(`[isles live] component pack resolution failed; serving no packs: ${(error && error.message) || error}\n`);
  }
  // Precompute the manifest body: `pack` indexes packAssetRecords; `path` is the
  // asset's pack-relative path, matched back exactly by the pack-asset route.
  const packManifestBody = JSON.stringify({
    assets: packAssetRecords.flatMap((record, packIndex) =>
      record.assets.map((asset) => ({
        type: asset.type,
        url: `/__agent-isles/pack-asset?pack=${packIndex}&path=${encodeURIComponent(asset.normalizedPath)}`,
      })),
    ),
  });

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

  // Agent routes are non-browser by definition: bearing an Origin header at all
  // (even empty) means a browser is calling and is refused outright (the CSRF
  // vector). Otherwise a constant-time bearer-token check gates access.
  function agentRequestAuthorized(req, res) {
    if (req.headers && 'origin' in req.headers) { res.writeHead(403); res.end('Forbidden origin'); return false; }
    const provided = req.headers && req.headers.authorization;
    const expected = `Bearer ${sessionToken}`;
    const ok = typeof provided === 'string'
      && Buffer.byteLength(provided) === Buffer.byteLength(expected)
      && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) { res.writeHead(401); res.end('Unauthorized'); return false; }
    return true;
  }

  // Consume and return the last matching record in insertion order — the queue
  // is append-ordered, so this is the bridge's `latest_proceed_event` ("last
  // matching line") and stays correct even if the wall clock steps backwards
  // between two clicks. Every older matching click it supersedes is dropped too
  // — at-most-once delivery, no stale click survives.
  function takeNewestAgentMatch(screenFilter, since) {
    let bestIdx = -1;
    for (let i = 0; i < agentQueue.length; i += 1) {
      const r = agentQueue[i];
      if (r.timestamp >= since && agentScreenMatches(r, screenFilter)) bestIdx = i;
    }
    if (bestIdx === -1) return null;
    const winner = agentQueue[bestIdx];
    for (let i = agentQueue.length - 1; i >= 0; i -= 1) {
      const r = agentQueue[i];
      if (r.timestamp >= since && agentScreenMatches(r, screenFilter)) agentQueue.splice(i, 1);
    }
    return winner;
  }

  function resolveHeldAgentRequest(held, record) {
    if (held.done) return;
    held.done = true;
    clearTimeout(held.timer);
    heldAgentRequests.delete(held);
    try {
      held.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      held.res.end(JSON.stringify(record));
    } catch {}
  }

  function enqueueAgentRecord(record) {
    if (!record || record.type !== 'proceed') return; // only proceed satisfies agent waits
    agentQueue.push(record);
    if (agentQueue.length > AGENT_QUEUE_MAX) agentQueue.splice(0, agentQueue.length - AGENT_QUEUE_MAX);
    for (const held of [...heldAgentRequests]) {
      const match = takeNewestAgentMatch(held.screen, held.since);
      if (match) resolveHeldAgentRequest(held, match);
    }
  }

  function clearAgentQueue() { agentQueue.length = 0; }

  const server = http.createServer(async (req, res) => {
    if (closing) {
      res.writeHead(503, { 'Connection': 'close' });
      res.end('Server closing');
      return;
    }
    try {
      const pathname = req.url.split('?')[0];
      if (req.method === 'GET' && pathname === '/') {
        if (readerMode) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildReaderShell({ assetMode: 'inline' }));
          return;
        }
        const page = await renderNewest(dir);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
      }
      // Reader SPA bundle (client renderer + components + UI), served to the shell.
      if (readerMode && req.method === 'GET' && pathname === '/__agent-isles/reader.js') {
        let bundle;
        try { bundle = readFileSync(READER_BUNDLE_PATH); }
        catch { res.writeHead(404); res.end('Reader bundle missing — run `npm run build`.'); return; }
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        });
        res.end(bundle);
        return;
      }
      // Resolved component-pack assets for the reader to inject at boot. Empty
      // list when the project declares no packs — the reader skips injection.
      if (req.method === 'GET' && pathname === '/__agent-isles/pack-manifest') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        });
        res.end(packManifestBody);
        return;
      }
      // One asset file from a startup-resolved pack. `pack` indexes the resolved
      // list; `path` must exactly match an asset declared in that pack's
      // manifest, so the route serves only manifest-listed files — no path
      // arithmetic on user input, so traversal is impossible by construction.
      if (req.method === 'GET' && pathname === '/__agent-isles/pack-asset') {
        let params;
        try { params = new URL(req.url, 'http://localhost').searchParams; } catch { params = new URLSearchParams(); }
        const packIndex = Number.parseInt(params.get('pack') ?? '', 10);
        const assetPath = params.get('path') || '';
        const record = Number.isInteger(packIndex) && packIndex >= 0 ? packAssetRecords[packIndex] : undefined;
        const asset = record && record.assets.find((a) => a.normalizedPath === assetPath);
        if (!asset) { res.writeHead(404); res.end('Not found'); return; }
        let contents;
        try { contents = readFileNoFollow(asset.resolvedPath); } // O_NOFOLLOW: refuse race-swapped symlinks
        catch { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': packAssetContentType(asset),
          'Cache-Control': 'no-cache, no-transform',
        });
        res.end(contents);
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
      // Reader tree: the recursive folder/file document set for the reader SPA.
      // Additive alongside /screens (which stays flat for the agent-screen flow).
      if (req.method === 'GET' && pathname === '/__agent-isles/tree') {
        const { docs, truncated } = readerDocs();
        const tree = buildDocTree(docs);
        const slim = docs.map(({ slug, name, title, relPath, dir: subdir, mtimeMs }) => (
          { slug, name, title, relPath, dir: subdir, mtimeMs }
        ));
        let newest = null;
        let newestMtime = -1;
        for (const d of docs) if (d.mtimeMs > newestMtime) { newestMtime = d.mtimeMs; newest = d.slug; }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ tree, docs: slim, newest, truncated }));
        return;
      }
      // Raw Markdown for a document, by reader slug, for client-side rendering.
      // Reads with O_NOFOLLOW via resolveDocSlug → never serves outside the root.
      if (req.method === 'GET' && pathname === '/__agent-isles/raw') {
        let slug = null;
        try { slug = new URL(req.url, 'http://localhost').searchParams.get('slug'); } catch {}
        const match = resolveDocSlug(dir, slug || '');
        if (!match || (readerFile && match.relPath !== readerFile)) { res.writeHead(404); res.end('Not found'); return; }
        let markdown;
        try { markdown = readFileNoFollow(match.file); } catch { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Agent-Isles-Slug': match.slug,
        });
        res.end(markdown);
        return;
      }
      // Agent readiness probe.
      if (req.method === 'GET' && pathname === '/__agent-isles/agent/health') {
        if (!agentRequestAuthorized(req, res)) return;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, pid: process.pid }));
        return;
      }
      // Agent long-poll: return the newest matching proceed record, or park the
      // request until one arrives or `hold` elapses (then 204). Records that
      // arrive between invocations stay queued, so nothing is lost.
      if (req.method === 'GET' && pathname === '/__agent-isles/agent/events') {
        if (!agentRequestAuthorized(req, res)) return;
        let params;
        try { params = new URL(req.url, 'http://localhost').searchParams; } catch { params = new URLSearchParams(); }
        const screenFilter = params.get('screen') || null;
        const since = parseSinceSeconds(params.get('since'));
        const hold = parseHoldSeconds(params.get('hold'));
        const immediate = takeNewestAgentMatch(screenFilter, since);
        if (immediate) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(immediate));
          return;
        }
        if (hold <= 0) { res.writeHead(204); res.end(); return; }
        const held = { res, screen: screenFilter, since, done: false, timer: null };
        held.timer = setTimeout(() => {
          if (held.done) return;
          held.done = true;
          heldAgentRequests.delete(held);
          try { res.writeHead(204); res.end(); } catch {}
        }, hold * 1000);
        heldAgentRequests.add(held);
        req.on('close', () => {
          if (held.done) return;
          held.done = true;
          clearTimeout(held.timer);
          heldAgentRequests.delete(held);
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/__agent-isles/signal') {
        if (!originAllowed(req)) { res.writeHead(403); res.end('Forbidden origin'); return; }
        const raw = await readBody(req);
        const record = appendSignalEvent(dir, parseSignalDetail(raw));
        enqueueAgentRecord(record);
        broadcast('live:signal', record);
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
          if (readerMode) {
            // Deep-link: serve the shell seeded with the requested doc, or 404
            // if it does not resolve (preserves the /<unknown> → 404 contract).
            const match = resolveDocSlug(dir, slug);
            if (match && (!readerFile || match.relPath === readerFile)) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(buildReaderShell({ assetMode: 'inline', initialSlug: match.slug }));
              return;
            }
          } else {
            const page = await renderBySlug(dir, slug);
            if (page) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(page);
              return;
            }
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
        for (const message of parsed.messages) {
          const record = appendSignalEvent(dir, parseSignalDetail(message));
          enqueueAgentRecord(record);
          broadcast('live:signal', record);
        }
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
    screen_dir: dir, state_dir: stateDir(dir), token: sessionToken,
  };
  try {
    const infoTmp = join(stateDir(dir), 'server-info.tmp');
    const infoPath = join(stateDir(dir), 'server-info');
    try {
      // 0600: server-info now carries the agent bearer token — keep it readable
      // only by the owner, same trust domain as the events file. Remove any
      // stale tmp first so writeFileSync *creates* fresh at 0600 (its mode only
      // applies on creation, and 0o600 survives a typical umask); a leftover tmp
      // from a crashed older build can't leak the token at a looser mode.
      rmSync(infoTmp, { force: true });
      writeFileSync(infoTmp, JSON.stringify(infoPayload) + '\n', { mode: 0o600 });
      renameSync(infoTmp, infoPath);
      try { chmodSync(infoPath, 0o600); } catch {}
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
              // A new screen resets single-flow state: drop the events file AND
              // the in-memory queue so a stale click can't satisfy a wait for it.
              clearEvents();
              clearAgentQueue();
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
      for (const held of heldAgentRequests) {
        if (held.done) continue;
        held.done = true;
        clearTimeout(held.timer);
        try { held.res.writeHead(503); held.res.end('Server closing'); } catch {}
      }
      heldAgentRequests.clear();
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
  // A parked agent hold counts as an active client: otherwise the server can
  // idle-shut mid-brainstorm when the browser tab is closed but the agent waits.
  function idleShouldStop() {
    return clients.size === 0 && heldAgentRequests.size === 0 && Date.now() - lastActivity > idleMs;
  }
  lifecycle = setInterval(() => {
    if (ownerPid) {
      try { process.kill(ownerPid, 0); }
      catch (e) { if (e.code !== 'EPERM') { shutdown('owner exited'); return; } }
    }
    if (idleShouldStop()) shutdown('idle timeout');
  }, 60 * 1000);
  lifecycle.unref?.();

  return {
    url, port, host, dir, server, broadcast, close, clearEvents, clearAgentQueue,
    token: sessionToken,
    _clients: clients, _agentQueue: agentQueue, _heldAgentRequests: heldAgentRequests,
    _idleShouldStop: idleShouldStop,
  };
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
