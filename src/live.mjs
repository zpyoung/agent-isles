import http from 'node:http';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdownString } from './render.mjs';
import { LIVE_CLIENT } from './live-client.js';

const defaultHost = '127.0.0.1';
const BUNDLE_PATH = fileURLToPath(new URL('../dist/agent-components.js', import.meta.url));

export function resolveNewestScreen(dir) {
  let newest = null;
  let newestMtime = -1;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (!st.isFile()) continue;
    if (st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newest = full; }
  }
  return newest;
}

const WAITING = '<p style="color:#888">Waiting for the agent to push a screen…</p>';

function liveShell(bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Quirk Brainstorming</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;min-height:100vh}
  .isles-header{padding:.5rem 1.5rem;border-bottom:1px solid #d1d1d6;font-size:.85rem;color:#888}
  .isles-main{flex:1;padding:2rem;overflow-y:auto}
  .isles-bar{padding:.5rem 1.5rem;border-top:1px solid #d1d1d6;text-align:center;font-size:.78rem;color:#888}
  @media (prefers-color-scheme: dark){body{background:#1d1d1f;color:#f5f5f7}.isles-header,.isles-bar{border-color:#424245}}
</style></head>
<body>
  <div class="isles-header">Quirk Brainstorming</div>
  <div class="isles-main">${bodyHtml}</div>
  <div class="isles-bar"><span id="isles-indicator">Click an option above, then return to the terminal</span></div>
  <script type="module" src="/__agent-isles/agent-components.js"></script>
  <script>${LIVE_CLIENT}</script>
</body></html>`;
}

async function renderNewest(dir) {
  const screen = resolveNewestScreen(dir);
  if (!screen) return liveShell(WAITING);
  const markdown = readFileSync(screen, 'utf8');
  const { html } = await renderMarkdownString(markdown, {
    assetMode: 'inline',
    includeUserPacks: false,
    projectDir: dir,
  });
  // renderMarkdownString returns a full page; extract its <body> inner to wrap in the live shell.
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = match ? match[1] : html;
  return liveShell(body);
}

export async function startLiveServer(dir, options = {}) {
  const host = options.host || defaultHost;
  const clients = new Set();

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
      if (req.method === 'GET' && req.url === '/__agent-isles/agent-components.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(readFileSync(BUNDLE_PATH, 'utf8'));
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

  return { url, port, host, dir, server, broadcast, close, _clients: clients };
}
