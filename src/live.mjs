import http from 'node:http';
import {
  appendFileSync,
  existsSync,
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
import { LIVE_CLIENT } from './live-client.js';

const defaultHost = '127.0.0.1';

function stateDir(dir) { return join(dir, 'state'); }
export function eventsFile(dir) { return join(stateDir(dir), 'events'); }

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolvePromise(body));
    req.on('error', reject);
  });
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
      st = statSync(full);
    } catch {
      continue; // deleted between readdir and stat
    }
    if (!st.isFile()) continue;
    if (st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newest = full; }
  }
  return newest;
}

function screenSnapshot(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return ''; }
  const parts = [];
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    try {
      const s = statSync(join(dir, name));
      if (s.isFile()) parts.push(`${name}:${s.mtimeMs}:${s.size}`);
    } catch { /* deleted mid-scan */ }
  }
  return parts.sort().join('|');
}

function injectLiveFrame(pageHtml) {
  const overlayStyle = `<style>
    body{padding-top:2.2rem;padding-bottom:2.2rem}
    #isles-header{position:fixed;top:0;left:0;right:0;height:2.2rem;display:flex;align-items:center;padding:0 1.5rem;font:500 .8rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-bottom:1px solid rgba(127,127,127,.25);z-index:99999}
    #isles-bar{position:fixed;bottom:0;left:0;right:0;padding:.45rem 1.5rem;text-align:center;font:.78rem system-ui,sans-serif;color:#888;background:rgba(127,127,127,.07);border-top:1px solid rgba(127,127,127,.25);z-index:99999}
  </style>`;
  const headerHtml = `<div id="isles-header">Quirk Brainstorming</div>`;
  const barHtml = `<div id="isles-bar"><span id="isles-indicator">Click an option above, then return to the terminal</span></div>`;
  const clientHtml = `<script>${LIVE_CLIENT}</script>`;
  let out = pageHtml;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${overlayStyle}</head>`) : `${overlayStyle}${out}`;
  out = /<body[^>]*>/i.test(out) ? out.replace(/(<body[^>]*>)/i, `$1${headerHtml}`) : `${headerHtml}${out}`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${barHtml}${clientHtml}</body>`) : `${out}${barHtml}${clientHtml}`;
  return out;
}

function waitingPage() {
  return injectLiveFrame(
    '<!doctype html><html><head><meta charset="utf-8"><title>Quirk Brainstorming</title></head>' +
    '<body><p style="padding:2rem;color:#888;font-family:system-ui,sans-serif">Waiting for the agent to push a screen…</p></body></html>'
  );
}

async function renderNewest(dir) {
  let screen;
  try {
    screen = resolveNewestScreen(dir);
  } catch {
    return waitingPage();
  }
  if (!screen) return waitingPage();
  let markdown;
  try {
    markdown = readFileSync(screen, 'utf8');
  } catch {
    return waitingPage(); // file vanished between resolve and read (delete race)
  }
  const { html } = await renderMarkdownString(markdown, {
    assetMode: 'inline',
    includeUserPacks: false,
    projectDir: dir,
  });
  return injectLiveFrame(html);
}

export async function startLiveServer(dir, options = {}) {
  const host = options.host || defaultHost;
  const clients = new Set();
  mkdirSync(stateDir(dir), { recursive: true });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
        const page = await renderNewest(dir);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
      }
      if (req.method === 'GET' && req.url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
        });
        res.write('retry: 500\nevent: live:ready\ndata: {}\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (req.method === 'POST' && req.url === '/__agent-isles/signal') {
        const raw = await readBody(req);
        let detail = {};
        try {
          const parsed = JSON.parse(raw || '{}');
          if (parsed && typeof parsed === 'object') detail = parsed;
        } catch { detail = {}; }
        const record = {
          type: 'click',
          choice: detail.choice ?? null,
          text: typeof detail.text === 'string' ? detail.text : '',
          timestamp: Date.now(),
        };
        if (Array.isArray(detail.selected)) record.selected = detail.selected;
        mkdirSync(stateDir(dir), { recursive: true });
        appendFileSync(eventsFile(dir), JSON.stringify(record) + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      res.writeHead(404); res.end('Not found');
    } catch (error) {
      res.writeHead(500); res.end(String(error && error.message || error));
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

  function broadcast(event) {
    for (const c of clients) c.write(`event: ${event}\ndata: {}\n\n`);
  }

  function clearEvents() {
    rmSync(eventsFile(dir), { force: true });
  }

  let lastScreen = resolveNewestScreen(dir);
  let lastSnapshot = screenSnapshot(dir);
  let watcher = null;
  let debounceTimer = null;
  if (options.watch) {
    try {
      watcher = fsWatch(dir, (_evt, filename) => {
        if (filename && !String(filename).endsWith('.md')) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const snap = screenSnapshot(dir);
          if (snap === lastSnapshot) return; // ignore state/ churn + non-.md + no-op events
          lastSnapshot = snap;
          const next = resolveNewestScreen(dir);
          if (next !== lastScreen) { // includes screen -> none and none -> screen
            lastScreen = next;
            clearEvents();
          }
          broadcast('live:reload');
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
    closePromise = (async () => {
      clearInterval(lifecycle);
      clearTimeout(debounceTimer);
      if (watcher) watcher.close();
      for (const c of clients) c.end();
      clients.clear();
      try { unlinkSync(join(stateDir(dir), 'server-info')); } catch {}
      try { writeFileSync(join(stateDir(dir), 'server-stopped'), JSON.stringify({ reason, timestamp: Date.now() }) + '\n'); } catch {}
      await new Promise((r) => server.close(() => r()));
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
  let terminating = false;
  const onTerm = () => { if (terminating) return; terminating = true; server.close('signal').then(() => process.exit(0)); };
  process.once('SIGTERM', onTerm);
  process.once('SIGINT', onTerm);
  return server;
}

export function stopLive(dir) {
  const infoPath = join(dir, 'state', 'server-info');
  if (!existsSync(infoPath)) return false;
  try {
    const info = JSON.parse(readFileSync(infoPath, 'utf8'));
    if (info.pid) process.kill(info.pid, 'SIGTERM');
    return true;
  } catch (e) {
    if (e && e.code === 'ESRCH') { try { unlinkSync(infoPath); } catch {} }
    return false;
  }
}
