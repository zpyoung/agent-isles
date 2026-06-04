import http from 'node:http';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
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
        try { detail = JSON.parse(raw || '{}'); } catch { detail = {}; }
        const record = {
          type: 'click',
          choice: detail.choice ?? null,
          text: typeof detail.text === 'string' ? detail.text : '',
          timestamp: Date.now(),
        };
        if (Array.isArray(detail.selected)) record.selected = detail.selected;
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

  function broadcast(event) {
    for (const c of clients) c.write(`event: ${event}\ndata: {}\n\n`);
  }

  async function close() {
    for (const c of clients) c.end();
    clients.clear();
    await new Promise((r) => server.close(() => r()));
  }

  function clearEvents() {
    rmSync(eventsFile(dir), { force: true });
  }

  return { url, port, host, dir, server, broadcast, close, clearEvents, _clients: clients };
}
