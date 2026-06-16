import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);

export async function serveDist() {
  const distDir = resolve('dist');
  const server = createServer((request, response) => {
    void handleStaticRequest(request, response, distDir).catch((error) => {
      response.writeHead(500);
      response.end(error.message);
    });
  });

  await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });

  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, rejectClose) => {
      // server.close() only fires its callback once every connection ends.
      // Chromium keeps idle HTTP keep-alive sockets pooled against this
      // server, so without forcibly destroying them close() hangs until the
      // browser context is torn down — the intermittent multi-minute test
      // timeouts. closeAllConnections() (Node 18.2+) drops those sockets so
      // close() resolves immediately. Mirrors src/live.mjs teardown.
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
      server.closeAllConnections?.();
    }),
  };
}

async function handleStaticRequest(request, response, distDir) {
  let pathname;
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://agent-isles.local');
    pathname = requestUrl.pathname === '/' ? '/demo.html' : decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  const filePath = resolve(distDir, `.${pathname}`);
  const relativePath = relative(distDir, filePath);

  if (relativePath.startsWith('..') || relativePath === '' || resolve(filePath) === distDir) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(500);
    response.end(error.message);
  }
}
