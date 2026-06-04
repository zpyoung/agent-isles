import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const defaultHost = '127.0.0.1';
const defaultPort = 0;
const defaultIdleTimeoutMinutes = 30;
const defaultOwnerPollIntervalMs = 1000;
const launchTimeoutMs = 15000;

export class LiveServerError extends Error {
  constructor(message, code = 'ERR_AGENT_ISLES_LIVE') {
    super(message);
    this.name = 'LiveServerError';
    this.code = code;
  }
}

export async function startLiveServer(rootDir, options = {}) {
  const root = resolveRequiredRoot(rootDir);
  const screenDir = resolve(options.screenDir || join(root, 'screens'));
  const stateDir = resolve(options.stateDir || join(root, 'state'));
  mkdirSync(screenDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  const infoPath = join(stateDir, 'server-info');
  const stoppedPath = join(stateDir, 'server-stopped');
  rmSync(stoppedPath, { force: true });

  const host = normalizeHost(options.host || defaultHost);
  const port = normalizePort(options.port ?? defaultPort);
  const explicitPort = options.explicitPort === true || options.port !== undefined;
  const urlHost = normalizeUrlHost(options.urlHost || defaultUrlHost(host));
  const idleTimeoutMs = normalizeIdleTimeoutMs(options.idleTimeoutMs ?? minutesToMs(options.idleTimeoutMinutes ?? defaultIdleTimeoutMinutes));
  const ownerPid = normalizeOwnerPid(options.ownerPid);
  const ownerPollIntervalMs = normalizeOwnerPollIntervalMs(options.ownerPollIntervalMs ?? defaultOwnerPollIntervalMs);

  let closed = false;
  let lastActivity = Date.now();
  const server = http.createServer((request, response) => {
    lastActivity = Date.now();
    routeLiveRequest({ request, response, root, screenDir, stateDir });
  });

  try {
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolvePromise();
      });
    });
  } catch (error) {
    const wrapped = normalizeListenError(error, host, port, explicitPort);
    writeStoppedFile({ infoPath, stoppedPath, reason: 'startup-error', error: wrapped.message });
    throw wrapped;
  }

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${hostForUrl(urlHost)}:${actualPort}`;

  const info = {
    type: 'server-started',
    pid: process.pid,
    host,
    port: actualPort,
    url,
    screen_dir: screenDir,
    state_dir: stateDir,
  };
  writeFileSync(infoPath, `${JSON.stringify(info, null, 2)}\n`, 'utf8');

  const idleInterval = setInterval(() => {
    if (!closed && Date.now() - lastActivity >= idleTimeoutMs) {
      void close('idle-timeout');
    }
  }, Math.min(Math.max(idleTimeoutMs, 25), 1000));
  idleInterval.unref?.();

  const ownerInterval = ownerPid ? setInterval(() => {
    if (!closed && !isProcessAlive(ownerPid)) {
      void close('owner-pid-exit');
    }
  }, ownerPollIntervalMs) : undefined;
  ownerInterval?.unref?.();

  async function close(reason = 'shutdown') {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(idleInterval);
    if (ownerInterval) {
      clearInterval(ownerInterval);
    }
    rmSync(infoPath, { force: true });
    writeStoppedFile({ infoPath, stoppedPath, reason });
    await closeHttpServer(server);
  }

  return {
    close,
    host,
    port: actualPort,
    rootDir: root,
    screenDir,
    server,
    stateDir,
    url,
  };
}

export async function launchLiveServer(rootDir, options = {}) {
  const root = resolveRequiredRoot(rootDir);
  const stateDir = resolve(options.stateDir || join(root, 'state'));
  mkdirSync(stateDir, { recursive: true });
  const infoPath = join(stateDir, 'server-info');
  const stoppedPath = join(stateDir, 'server-stopped');
  rmSync(infoPath, { force: true });
  rmSync(stoppedPath, { force: true });

  const child = spawn(options.nodePath || process.execPath, options.childArgs || [], {
    cwd: options.cwd || process.cwd(),
    detached: true,
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'ignore',
  });

  let exited = false;
  let exitCode = null;
  let exitSignal = null;
  child.once('exit', (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
  });

  const started = Date.now();
  while (Date.now() - started < (options.timeoutMs || launchTimeoutMs)) {
    if (existsSync(infoPath)) {
      const info = JSON.parse(readFileSync(infoPath, 'utf8'));
      child.unref();
      return { childPid: child.pid, info };
    }

    if (existsSync(stoppedPath)) {
      const stopped = JSON.parse(readFileSync(stoppedPath, 'utf8'));
      throw new LiveServerError(stopped.error || `isles live stopped during launch: ${stopped.reason || 'unknown'}`, 'ERR_AGENT_ISLES_LIVE_LAUNCH_FAILED');
    }

    if (exited) {
      throw new LiveServerError(`isles live child exited before writing server-info (code=${exitCode ?? 'null'} signal=${exitSignal ?? 'null'}).`, 'ERR_AGENT_ISLES_LIVE_LAUNCH_FAILED');
    }

    await delay(50);
  }

  try {
    child.kill('SIGTERM');
  } catch {}
  throw new LiveServerError(`Timed out waiting for isles live to write ${infoPath}.`, 'ERR_AGENT_ISLES_LIVE_LAUNCH_TIMEOUT');
}

export function minutesToMs(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) {
    throw new LiveServerError(`Invalid idle timeout: ${minutes}. Expected a non-negative minute value.`, 'ERR_AGENT_ISLES_LIVE_IDLE_TIMEOUT');
  }
  return value * 60 * 1000;
}

function routeLiveRequest({ request, response, root, screenDir, stateDir }) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  const pathname = requestUrl.pathname;

  if (request.method === 'GET' && pathname === '/') {
    sendHtml(response, buildLiveShell({ root, screenDir, stateDir }));
    return;
  }

  if (request.method === 'GET' && pathname === '/health') {
    sendJson(response, 200, { ok: true, type: 'agent-isles-live' });
    return;
  }

  if (request.method === 'GET' && pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { error: { message: 'Not found' } });
}

function buildLiveShell({ root, screenDir, stateDir }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Isles Live</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 2rem; }
    header { border-bottom: 1px solid color-mix(in srgb, CanvasText 20%, transparent); margin-bottom: 1.5rem; }
    code { word-break: break-all; }
  </style>
</head>
<body>
  <header><h1>Agent Isles Live</h1></header>
  <main>
    <p>Live server foundation is running.</p>
    <dl>
      <dt>Root</dt><dd><code>${escapeHtml(root)}</code></dd>
      <dt>Screen directory</dt><dd><code>${escapeHtml(screenDir)}</code></dd>
      <dt>State directory</dt><dd><code>${escapeHtml(stateDir)}</code></dd>
    </dl>
  </main>
</body>
</html>`;
}

function resolveRequiredRoot(rootDir) {
  if (!rootDir) {
    throw new LiveServerError('Missing directory for live mode.', 'ERR_AGENT_ISLES_LIVE_ROOT');
  }
  return resolve(String(rootDir));
}

function normalizeHost(host) {
  const value = String(host || '').trim();
  if (!value) {
    throw new LiveServerError('Missing host for live mode.', 'ERR_AGENT_ISLES_LIVE_HOST');
  }
  return value === 'localhost' ? '127.0.0.1' : value;
}

function normalizeUrlHost(urlHost) {
  const value = String(urlHost || '').trim();
  if (!value) {
    throw new LiveServerError('Missing URL host for live mode.', 'ERR_AGENT_ISLES_LIVE_URL_HOST');
  }
  return value;
}

function normalizePort(port) {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new LiveServerError(`Invalid port: ${port}. Expected an integer from 0 to 65535.`, 'ERR_AGENT_ISLES_LIVE_PORT');
  }
  return value;
}

function normalizeIdleTimeoutMs(timeoutMs) {
  const value = Number(timeoutMs);
  if (!Number.isFinite(value) || value < 0) {
    throw new LiveServerError(`Invalid idle timeout: ${timeoutMs}. Expected a non-negative duration.`, 'ERR_AGENT_ISLES_LIVE_IDLE_TIMEOUT');
  }
  return value;
}

function normalizeOwnerPid(ownerPid) {
  if (ownerPid === undefined || ownerPid === null || ownerPid === '') {
    return undefined;
  }
  const value = Number(ownerPid);
  if (!Number.isInteger(value) || value <= 0) {
    throw new LiveServerError(`Invalid owner pid: ${ownerPid}. Expected a positive integer.`, 'ERR_AGENT_ISLES_LIVE_OWNER_PID');
  }
  return value;
}

function normalizeOwnerPollIntervalMs(intervalMs) {
  const value = Number(intervalMs);
  if (!Number.isFinite(value) || value <= 0) {
    throw new LiveServerError(`Invalid owner-pid poll interval: ${intervalMs}.`, 'ERR_AGENT_ISLES_LIVE_OWNER_POLL');
  }
  return value;
}

function normalizeListenError(error, host, port, explicitPort) {
  if (error?.code === 'EADDRINUSE' && explicitPort) {
    return new LiveServerError(`Port ${port} is already in use on ${host}. Choose another --port or omit --port for a free port.`, 'ERR_AGENT_ISLES_LIVE_PORT_IN_USE');
  }
  return error;
}

function defaultUrlHost(host) {
  if (host === '127.0.0.1' || host === '::1' || host === 'localhost') {
    return 'localhost';
  }
  return host;
}

function hostForUrl(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function closeHttpServer(server) {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolvePromise();
      }
    });
  });
}

function writeStoppedFile({ infoPath, stoppedPath, reason, error }) {
  rmSync(infoPath, { force: true });
  const payload = {
    type: 'server-stopped',
    reason,
    timestamp: Math.floor(Date.now() / 1000),
  };
  if (error) {
    payload.error = error;
  }
  writeFileSync(stoppedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sendHtml(response, html) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
