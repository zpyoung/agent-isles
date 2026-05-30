import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AgentIslesInputError, renderMarkdownFile, renderMarkdownString, RENDER_MODES } from './render.mjs';
import { applyWritebackRequest, markdownTaskCheckboxWritebackOperation, WritebackContractError } from './writeback.mjs';

const markdownExtensions = new Set(['.md', '.markdown']);
const defaultHost = '127.0.0.1';
const defaultPort = 4173;
const defaultWatchIntervalMs = 250;

export const PREVIEW_DIR_NAME = 'agent-isles-preview';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function previewDir() {
  return join(tmpdir(), PREVIEW_DIR_NAME);
}

function previewTtlMs() {
  const raw = process.env.ISLES_PREVIEW_TTL_MS;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

function prunePreviewDir(dir, ttlMs, now) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir does not exist yet or is unreadable — nothing to prune
  }

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    try {
      const stats = statSync(entryPath);
      if (now - stats.mtimeMs > ttlMs) {
        rmSync(entryPath, { force: true });
      }
    } catch {
      // Best-effort: ignore files we cannot stat or remove (e.g. in use).
    }
  }
}

function defaultOpener(target) {
  const override = process.env.ISLES_PREVIEW_OPEN_CMD;
  if (override) {
    // ISLES_PREVIEW_OPEN_CMD must be a bare executable name or absolute path
    // (no embedded arguments — "open -a Firefox" will not work).
    const child = spawn(override, [target], { stdio: 'ignore', detached: true });
    child.once('error', () => {}); // launch failures must not crash the process
    child.unref();
    return;
  }

  const platform = process.platform;
  let command;
  let args;
  if (platform === 'darwin') {
    command = 'open';
    args = [target];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', target];
  } else {
    command = 'xdg-open';
    args = [target];
  }

  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.once('error', () => {}); // launch failures must not crash the process
  child.unref();
}

export async function previewMarkdown(options = {}) {
  const {
    markdown,
    projectDir = process.cwd(),
    renderMode,
    explicitPacks = [],
    includeUserPacks = true,
    showSource = false,
    open = false,
    opener = defaultOpener,
    dir = previewDir(),
    now = Date.now(),
  } = options;

  if (typeof markdown !== 'string') {
    throw new TypeError('previewMarkdown requires a markdown string');
  }

  const { html } = await renderMarkdownString(markdown, {
    assetMode: 'inline',
    renderMode,
    projectDir,
    explicitPacks,
    includeUserPacks,
    showSource,
  });

  mkdirSync(dir, { recursive: true });
  prunePreviewDir(dir, previewTtlMs(), now);

  const outFile = join(dir, `isles-preview-${now}-${randomUUID()}.html`);
  writeFileSync(outFile, html);

  const fileUrl = pathToFileURL(outFile).href;

  let opened = false;
  if (open) {
    try {
      // The opener contract is synchronous: a synchronous throw is caught
      // here; an async rejection is not part of the contract.
      opener(outFile);
      opened = true;
    } catch {
      opened = false;
    }
  }

  return { outFile, fileUrl, opened };
}


export class PreviewPathError extends Error {
  constructor(message, statusCode = 400, code = 'ERR_AGENT_ISLES_PREVIEW_PATH') {
    super(message);
    this.name = 'PreviewPathError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function discoverMarkdownFiles(rootDir) {
  const root = validatePreviewRoot(rootDir);
  const files = [];

  walk(root, '');

  return files.sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }
    return left.path.localeCompare(right.path, undefined, { sensitivity: 'base' });
  });

  function walk(directory, relativeDirectory) {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }

      const entryRelativePath = joinPreviewPath(relativeDirectory, entry.name);
      const fullPath = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, entryRelativePath);
        continue;
      }

      if (!entry.isFile() || !isMarkdownFile(entry.name)) {
        continue;
      }

      const stats = statSync(fullPath);
      files.push({
        path: entryRelativePath,
        name: entry.name,
        depth: entryRelativePath.split('/').length - 1,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      });
    }
  }
}

export function resolvePreviewFile(rootDir, requestedPath) {
  const root = validatePreviewRoot(rootDir);
  const rawPath = String(requestedPath || '').replace(/\\+/g, '/');

  if (!rawPath || rawPath.startsWith('/') || /^[a-zA-Z]:\//.test(rawPath)) {
    throw new PreviewPathError('Preview file selection must be a relative Markdown path.', 400);
  }

  const filePath = resolve(root, rawPath);
  if (!isInsideRoot(root, filePath)) {
    throw new PreviewPathError(`Refusing to read outside the preview root: ${rawPath}`, 403);
  }

  if (!existsSync(filePath)) {
    throw new PreviewPathError(`Preview file not found: ${rawPath}`, 404);
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new PreviewPathError(`Preview path is not a file: ${rawPath}`, 400);
  }

  if (!isMarkdownFile(filePath)) {
    throw new PreviewPathError(`Unsupported preview file extension: ${rawPath}. Expected .md or .markdown.`, 400);
  }

  return filePath;
}

export async function startPreviewServer(rootDir, options = {}) {
  const root = validatePreviewRoot(rootDir);
  const host = normalizeHost(options.host || defaultHost);
  const port = normalizePort(options.port ?? defaultPort);
  const watchIntervalMs = normalizeWatchInterval(options.watchIntervalMs ?? defaultWatchIntervalMs);
  const clients = new Set();
  let closed = false;
  let lastSnapshot = await buildDirectorySnapshot(root);

  const server = http.createServer(async (request, response) => {
    try {
      await routePreviewRequest({ request, response, root, options, clients });
    } catch (error) {
      sendJson(response, 500, {
        error: {
          message: error?.message || String(error),
        },
      });
    }
  });

  const interval = setInterval(async () => {
    if (closed) {
      return;
    }

    try {
      const nextSnapshot = await buildDirectorySnapshot(root);
      if (nextSnapshot.signature !== lastSnapshot.signature) {
        lastSnapshot = nextSnapshot;
        broadcastSse(clients, 'preview:update', { files: nextSnapshot.files });
      }
    } catch (error) {
      broadcastSse(clients, 'preview:error', { message: error?.message || String(error) });
    }
  }, watchIntervalMs);
  interval.unref?.();

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolvePromise();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${hostForUrl(host)}:${actualPort}`;

  async function close() {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(interval);
    for (const client of clients) {
      client.end();
    }
    clients.clear();
    await new Promise((resolvePromise, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolvePromise();
        }
      });
    });
  }

  return {
    close,
    host,
    port: actualPort,
    rootDir: root,
    server,
    url,
  };
}

async function routePreviewRequest({ request, response, root, options, clients }) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  const compactPath = requestUrl.pathname.split('/').filter(Boolean).join('/');
  const pathname = compactPath ? `/${compactPath}` : '/';

  if (request.method === 'GET' && pathname === '/') {
    sendHtml(response, buildPreviewShell(root));
    return;
  }

  if (request.method === 'GET' && pathname === '/api/files') {
    const files = await discoverMarkdownFiles(root);
    sendJson(response, 200, { root, files });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/render') {
    await handleRenderRequest(response, root, requestUrl.searchParams.get('path'), options);
    return;
  }

  if (request.method === 'GET' && pathname === '/events') {
    handleEventsRequest(response, clients);
    return;
  }

  if (request.method === 'OPTIONS' && pathname === '/__agent-isles/writeback' && options.writeback === true) {
    sendNoContent(response, 204);
    return;
  }

  if (request.method === 'POST' && pathname === '/__agent-isles/writeback' && options.writeback === true) {
    await handleWritebackRequest({ request, response, root });
    return;
  }

  if (request.method === 'GET' && pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { error: { message: 'Not found' } });
}

async function handleRenderRequest(response, root, requestedPath, options) {
  let filePath;
  let previewPath = requestedPath || '';

  try {
    filePath = resolvePreviewFile(root, previewPath);
    previewPath = toPreviewPath(root, filePath);
  } catch (error) {
    if (error instanceof PreviewPathError) {
      sendJson(response, error.statusCode, {
        error: {
          message: error.message,
          code: error.code,
        },
      });
      return;
    }
    throw error;
  }

  try {
    const result = await renderMarkdownFile(filePath, {
      renderMode: options.renderMode || RENDER_MODES.TRUSTED,
      assetMode: 'inline',
      showSource: options.showSource === true,
      explicitPacks: options.explicitPacks || [],
      includeUserPacks: options.includeUserPacks !== false,
      projectDir: root,
      title: `${previewPath} — Agent Isles Preview`,
      writeback: options.writeback === true ? {
        enabled: true,
        rootPath: root,
        endpoint: '/__agent-isles/writeback',
      } : undefined,
    });

    sendJson(response, 200, {
      path: previewPath,
      html: result.html,
    });
  } catch (error) {
    sendJson(response, 200, {
      path: previewPath,
      error: {
        message: error?.message || String(error),
      },
    });
  }
}

async function handleWritebackRequest({ request, response, root }) {
  let body;
  try {
    body = await readRequestBody(request, 1024 * 1024);
  } catch (error) {
    sendJson(response, 413, { ok: false, error: { message: error.message } });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body || '{}');
  } catch {
    sendJson(response, 400, { ok: false, error: { message: 'Writeback request body must be valid JSON.' } });
    return;
  }

  try {
    const result = applyWritebackRequest(payload, {
      rootPath: root,
      editMode: true,
      localhost: true,
      operations: {
        'markdown:set-task-checkbox': markdownTaskCheckboxWritebackOperation,
      },
    });
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof WritebackContractError) {
      sendJson(response, writebackStatusCode(error), { ok: false, error: error.toJSON() });
      return;
    }
    throw error;
  }
}

function readRequestBody(request, limitBytes) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > limitBytes) {
        reject(new Error('Writeback request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolvePromise(body));
    request.on('error', reject);
  });
}

function writebackStatusCode(error) {
  if (error.code === 'ERR_WRITEBACK_STALE_SOURCE' || error.code === 'ERR_WRITEBACK_ANCHOR_MISMATCH' || error.code === 'ERR_WRITEBACK_MARKDOWN_CHECKBOX_CONFLICT') {
    return 409;
  }
  if (error.code === 'ERR_WRITEBACK_DISABLED' || error.code === 'ERR_WRITEBACK_NON_LOCAL') {
    return 403;
  }
  if (error.code === 'ERR_WRITEBACK_SOURCE_NOT_FOUND') {
    return 404;
  }
  return 400;
}

function handleEventsRequest(response, clients) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write('retry: 500\n');
  response.write('event: preview:ready\n');
  response.write('data: {}\n\n');
  clients.add(response);
  response.on('close', () => {
    clients.delete(response);
  });
}

async function buildDirectorySnapshot(root) {
  const files = await discoverMarkdownFiles(root);
  const signature = JSON.stringify(files.map((file) => [file.path, file.size, file.updatedAt]));
  return { files, signature };
}

function broadcastSse(clients, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function buildPreviewShell(root) {
  const rootLabel = escapeHtml(root);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Isles Preview</title>
  <style>
    :root { color-scheme: light dark; --isles-border: #d8dee9; --isles-blue: #315efb; --isles-bg: #f7f8fb; --isles-panel: #ffffff; --isles-text: #172033; --isles-muted: #596579; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: minmax(18rem, 24rem) 1fr; background: var(--isles-bg); color: var(--isles-text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    aside { border-right: 1px solid var(--isles-border); background: var(--isles-panel); padding: 1.25rem; overflow-y: auto; }
    main { min-width: 0; display: grid; grid-template-rows: auto 1fr; }
    h1 { font-size: 1.2rem; margin: 0 0 0.35rem; }
    .root { color: var(--isles-muted); font-size: 0.85rem; overflow-wrap: anywhere; margin: 0 0 1rem; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.8rem 1rem; background: var(--isles-panel); border-bottom: 1px solid var(--isles-border); flex-wrap: wrap; }
    .toolbar strong { overflow-wrap: anywhere; }
    .status { color: var(--isles-muted); font-size: 0.9rem; }
    .reading-controls { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 0.35rem; }
    .reading-controls span { color: var(--isles-muted); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .control-button { border: 1px solid var(--isles-border); border-radius: 999px; background: #fff; color: inherit; cursor: pointer; font: inherit; font-size: 0.82rem; padding: 0.32rem 0.62rem; }
    .control-button[aria-pressed="true"] { background: var(--isles-blue); border-color: var(--isles-blue); color: #fff; }
    .file-list { display: grid; gap: 0.25rem; }
    .file-button { width: 100%; border: 0; border-radius: 0.55rem; background: transparent; color: inherit; cursor: pointer; display: block; font: inherit; padding: 0.45rem 0.55rem; text-align: left; overflow-wrap: anywhere; }
    .file-button:hover, .file-button:focus { background: #eef2ff; outline: 2px solid transparent; }
    .file-button[aria-current="page"] { background: var(--isles-blue); color: #fff; }
    .preview-frame { width: 100%; height: 100%; border: 0; background: #fff; }
    .empty, .error { margin: 1rem; padding: 1rem; border: 1px solid var(--isles-border); border-radius: 0.75rem; background: var(--isles-panel); }
    .error { color: #8a1f11; border-color: #f3b8ad; white-space: pre-wrap; }
    [hidden] { display: none !important; }
    @media (max-width: 800px) { body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; } aside { max-height: 42vh; border-right: 0; border-bottom: 1px solid var(--isles-border); } }
  </style>
</head>
<body>
  <aside>
    <h1>Agent Isles Preview</h1>
    <p class="root">${rootLabel}</p>
    <nav id="file-list" class="file-list" aria-label="Markdown files"></nav>
  </aside>
  <main>
    <div class="toolbar">
      <strong id="active-file">No file selected</strong>
      <div class="reading-controls" role="group" aria-label="Reading controls">
        <span>Width</span>
        <button type="button" class="control-button" data-width="760px" aria-pressed="false">Focus width</button>
        <button type="button" class="control-button" data-width="960px" aria-pressed="true">Comfort width</button>
        <button type="button" class="control-button" data-width="1200px" aria-pressed="false">Wide width</button>
        <span>Text</span>
        <button type="button" class="control-button" data-font-size="15px" data-line-height="1.65" aria-pressed="false">Small text</button>
        <button type="button" class="control-button" data-font-size="16px" data-line-height="1.7" aria-pressed="true">Regular text</button>
        <button type="button" class="control-button" data-font-size="18px" data-line-height="1.75" aria-pressed="false">Large text</button>
      </div>
      <span id="status" class="status">Loading…</span>
    </div>
    <section id="empty" class="empty">No Markdown files found under this preview root yet.</section>
    <pre id="error" class="error" hidden></pre>
    <iframe id="preview-frame" class="preview-frame" title="Rendered Markdown preview" sandbox="allow-scripts" hidden></iframe>
  </main>
  <script>
    const fileList = document.querySelector('#file-list');
    const activeFile = document.querySelector('#active-file');
    const status = document.querySelector('#status');
    const frame = document.querySelector('#preview-frame');
    const errorPanel = document.querySelector('#error');
    const emptyPanel = document.querySelector('#empty');
    const readerControls = Array.from(document.querySelectorAll('.control-button'));
    const readerSettings = { width: '960px', fontSize: '16px', lineHeight: '1.7' };
    let files = [];
    let selectedPath = null;

    async function loadFiles({ preserveSelection = true } = {}) {
      const response = await fetch('/api/files');
      const payload = await response.json();
      files = payload.files || [];
      renderFileList();

      if (files.length === 0) {
        selectedPath = null;
        activeFile.textContent = 'No file selected';
        status.textContent = 'Waiting for Markdown files';
        emptyPanel.hidden = false;
        errorPanel.hidden = true;
        frame.hidden = true;
        return;
      }

      const stillExists = files.some((file) => file.path === selectedPath);
      if (!preserveSelection || !selectedPath || !stillExists) {
        selectedPath = files[0].path;
      }
      await renderSelectedFile();
    }

    function renderFileList() {
      fileList.textContent = '';
      for (const file of files) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'file-button';
        button.textContent = file.path;
        button.style.paddingLeft = (0.55 + file.depth * 1.1) + 'rem';
        if (file.path === selectedPath) {
          button.setAttribute('aria-current', 'page');
        }
        button.addEventListener('click', async () => {
          selectedPath = file.path;
          renderFileList();
          await renderSelectedFile();
        });
        fileList.append(button);
      }
    }

    async function renderSelectedFile() {
      if (!selectedPath) {
        return;
      }
      activeFile.textContent = selectedPath;
      status.textContent = 'Rendering…';
      emptyPanel.hidden = true;
      const response = await fetch('/api/render?path=' + encodeURIComponent(selectedPath));
      const payload = await response.json();
      if (payload.error) {
        frame.hidden = true;
        errorPanel.hidden = false;
        errorPanel.textContent = payload.error.message;
        status.textContent = 'Render error';
        return;
      }
      errorPanel.hidden = true;
      frame.hidden = false;
      frame.srcdoc = decoratePreviewHtml(payload.html);
      status.textContent = 'Rendered';
    }

    function decoratePreviewHtml(html) {
      const style = '<style id="agent-isles-preview-reading-settings">:root{--agent-isles-page-max-width:' + readerSettings.width + ';--agent-isles-page-font-size:' + readerSettings.fontSize + ';--agent-isles-page-line-height:' + readerSettings.lineHeight + ';}</style>';
      if (String(html).includes('</head>')) {
        return String(html).replace('</head>', style + '</head>');
      }
      return style + String(html);
    }

    function updateReaderControlState(changedButton) {
      const groupAttribute = changedButton.dataset.width ? 'width' : 'fontSize';
      for (const button of readerControls) {
        if ((groupAttribute === 'width' && button.dataset.width) || (groupAttribute === 'fontSize' && button.dataset.fontSize)) {
          button.setAttribute('aria-pressed', button === changedButton ? 'true' : 'false');
        }
      }
    }

    for (const button of readerControls) {
      button.addEventListener('click', async () => {
        if (button.dataset.width) {
          readerSettings.width = button.dataset.width;
        }
        if (button.dataset.fontSize) {
          readerSettings.fontSize = button.dataset.fontSize;
          readerSettings.lineHeight = button.dataset.lineHeight || readerSettings.lineHeight;
        }
        updateReaderControlState(button);
        if (selectedPath) {
          await renderSelectedFile();
        }
      });
    }

    const events = new EventSource('/events');
    events.addEventListener('preview:update', async () => {
      const previousSelection = selectedPath;
      await loadFiles({ preserveSelection: true });
      if (selectedPath && selectedPath === previousSelection) {
        await renderSelectedFile();
      }
    });
    events.addEventListener('preview:error', (event) => {
      status.textContent = 'Watch error';
      errorPanel.hidden = false;
      errorPanel.textContent = JSON.parse(event.data).message;
    });

    loadFiles().catch((error) => {
      status.textContent = 'Load error';
      errorPanel.hidden = false;
      errorPanel.textContent = error.message;
    });
  </script>
</body>
</html>`;
}

function validatePreviewRoot(rootDir) {
  const root = resolve(rootDir || '.');
  if (!existsSync(root)) {
    throw new AgentIslesInputError(`Preview directory not found: ${root}`, 'ERR_AGENT_ISLES_PREVIEW_ROOT_NOT_FOUND');
  }
  if (!statSync(root).isDirectory()) {
    throw new AgentIslesInputError(`Preview root is not a directory: ${root}`, 'ERR_AGENT_ISLES_PREVIEW_ROOT_NOT_DIRECTORY');
  }
  return root;
}

function isMarkdownFile(filePath) {
  return markdownExtensions.has(extname(filePath).toLowerCase());
}

function isInsideRoot(root, filePath) {
  return filePath === root || filePath.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function toPreviewPath(root, filePath) {
  return relative(root, filePath).split(sep).join('/');
}

function joinPreviewPath(...parts) {
  return parts.filter(Boolean).join('/');
}

function normalizeHost(host) {
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
    return host;
  }
  throw new AgentIslesInputError(`Preview host must be localhost-only, not ${host}.`, 'ERR_AGENT_ISLES_PREVIEW_HOST');
}

function hostForUrl(host) {
  return host === '::1' ? '[::1]' : host;
}

function normalizePort(port) {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new AgentIslesInputError(`Invalid preview port: ${port}`, 'ERR_AGENT_ISLES_PREVIEW_PORT');
  }
  return parsed;
}

function normalizeWatchInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 25) {
    return defaultWatchIntervalMs;
  }
  return parsed;
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(html);
}

function sendNoContent(response, statusCode = 204) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': 'null',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  response.end();
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'null',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
