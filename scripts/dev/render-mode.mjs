// scripts/dev/render-mode.mjs
import { spawn as nodeSpawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../../bin/isles.mjs', import.meta.url));

export const RELOAD_CLIENT = `<script>
(function () {
  var es = new EventSource('/events');
  es.addEventListener('reload', function () { window.location.reload(); });
})();
</script>`;

// Mode B controls the rendered HTML, so inject our own reload client before the last </body>.
// Search the original string (case-insensitive regex) so multi-byte casing can't shift indices.
export function injectReloadClient(html) {
  const re = /<\/body>/gi;
  let idx = -1;
  let match;
  while ((match = re.exec(html)) !== null) idx = match.index;
  if (idx < 0) return `${html}${RELOAD_CLIENT}`;
  return `${html.slice(0, idx)}${RELOAD_CLIENT}${html.slice(idx)}`;
}

export function renderChildArgs(target, outFile, passthrough) {
  return ['render', ...passthrough, '--out', outFile, '--assets', 'inline'];
}

// Re-render via a fresh `isles render` process (always picks up current renderer/theme/component code).
export function renderOnce(target, outFile, passthrough, { spawnFn = nodeSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(process.execPath, [BIN, ...renderChildArgs(target, outFile, passthrough)], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`render exited with code ${code}`))));
  });
}

// Tiny static server: serves the latest rendered HTML at / and an SSE reload channel at /events.
export function startRenderServer(outFile, { port = 0 } = {}) {
  const clients = new Set();
  const server = createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 500\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    let html;
    try { html = injectReloadClient(readFileSync(outFile, 'utf8')); }
    catch { res.writeHead(503); res.end('rendering…'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const url = `http://localhost:${addr.port}/`;
      resolve({
        url,
        broadcastReload() { for (const res of clients) res.write('event: reload\ndata: {}\n\n'); },
        close() { for (const res of clients) res.end(); clients.clear(); return new Promise((r) => server.close(r)); },
      });
    });
  });
}
