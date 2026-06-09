import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  discoverMarkdownFiles,
  resolvePreviewFile,
  startPreviewServer,
} from '../src/preview.mjs';

const cli = 'bin/isles.mjs';

const SIMPLE = '# Preview\n\n<agent-decision verdict="go" title="Go">Ship.</agent-decision>\n';

test('previewMarkdown renders inline HTML to a temp file and returns a file:// URL', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-test-'));

  const { outFile, fileUrl, opened } = await previewMarkdown({
    markdown: SIMPLE,
    includeUserPacks: false,
    dir,
  });

  assert.equal(opened, false);
  assert.ok(outFile.startsWith(dir), 'preview is written inside the target temp dir');
  assert.ok(existsSync(outFile), 'preview HTML file exists');
  assert.ok(fileUrl.startsWith('file://'), 'returns a file:// URL');
  assert.ok(fileUrl.endsWith('.html'));

  const html = readFileSync(outFile, 'utf8');
  assert.match(html, /<agent-decision verdict="go" title="Go">/);
  // Self-contained: no external or sibling-file asset references.
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.doesNotMatch(html, /src="\.\//);
});

test('previewMarkdown does not write the source markdown anywhere (non-persistence)', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-cwd-'));
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-out-'));

  await previewMarkdown({ markdown: SIMPLE, projectDir, includeUserPacks: false, dir });

  // The project directory is never touched — no source copy, no output.
  assert.deepEqual(readdirSync(projectDir), []);
});

test('previewMarkdown uses os.tmpdir()/agent-isles-preview by default', async () => {
  const { previewMarkdown, previewDir, PREVIEW_DIR_NAME } = await import('../src/preview.mjs');
  assert.equal(previewDir(), join(tmpdir(), PREVIEW_DIR_NAME));

  let created;
  try {
    const { outFile } = await previewMarkdown({ markdown: SIMPLE, includeUserPacks: false });
    created = outFile;
    assert.ok(outFile.startsWith(join(tmpdir(), PREVIEW_DIR_NAME)));
  } finally {
    if (created) rmSync(created, { force: true });
  }
});

test('previewMarkdown prunes stale files but keeps the fresh preview', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-prune-'));

  const stale = join(dir, 'isles-preview-stale.html');
  writeFileSync(stale, '<html></html>');
  const oldSeconds = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // 7 days ago
  utimesSync(stale, oldSeconds, oldSeconds);

  const { outFile } = await previewMarkdown({ markdown: SIMPLE, includeUserPacks: false, dir });

  assert.ok(!existsSync(stale), 'stale preview was pruned');
  assert.ok(existsSync(outFile), 'fresh preview survives');
});

test('previewMarkdown invokes the injected opener with the temp file when open is true', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-open-'));
  const calls = [];

  const { outFile, opened } = await previewMarkdown({
    markdown: SIMPLE,
    includeUserPacks: false,
    dir,
    open: true,
    opener: (target) => { calls.push(target); },
  });

  assert.equal(opened, true);
  assert.deepEqual(calls, [outFile]);
});

test('previewMarkdown reports opened=false when the opener throws but still returns the path', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-openfail-'));

  const { outFile, opened } = await previewMarkdown({
    markdown: SIMPLE,
    includeUserPacks: false,
    dir,
    open: true,
    opener: () => { throw new Error('no browser'); },
  });

  assert.equal(opened, false);
  assert.ok(existsSync(outFile));
});

test('previewMarkdown does not crash when the default opener command is missing', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-badopen-'));
  process.env.ISLES_PREVIEW_OPEN_CMD = '/nonexistent/agent-isles-opener-xyz';
  try {
    const { outFile } = await previewMarkdown({ markdown: SIMPLE, includeUserPacks: false, dir, open: true });
    assert.ok(existsSync(outFile));
    // Give the async spawn 'error' event a chance to fire; the process must survive it.
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(existsSync(outFile));
  } finally {
    delete process.env.ISLES_PREVIEW_OPEN_CMD;
  }
});


test('discoverMarkdownFiles recursively lists supported Markdown files in tree order', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-tree-'));
  mkdirSync(join(root, 'nested', 'deeper'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# Readme\n', 'utf8');
  writeFileSync(join(root, 'nested', 'Plan.markdown'), '# Plan\n', 'utf8');
  writeFileSync(join(root, 'nested', 'ignore.txt'), 'ignore\n', 'utf8');
  writeFileSync(join(root, 'nested', 'deeper', 'notes.md'), '# Notes\n', 'utf8');

  const files = await discoverMarkdownFiles(root);

  assert.deepEqual(files.map((file) => file.path), [
    'README.md',
    'nested/Plan.markdown',
    'nested/deeper/notes.md',
  ]);
  assert.deepEqual(files.map((file) => file.depth), [0, 1, 2]);
});

test('resolvePreviewFile confines browser-selected paths to the preview root', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-confine-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  const insideFile = join(root, 'docs', 'inside.md');
  const outsideFile = join(tmpdir(), `agent-isles-outside-${Date.now()}.md`);
  writeFileSync(insideFile, '# Inside\n', 'utf8');
  writeFileSync(outsideFile, '# Outside\n', 'utf8');

  assert.equal(resolvePreviewFile(root, 'docs/inside.md'), resolve(insideFile));
  assert.throws(
    () => resolvePreviewFile(root, '../' + outsideFile.split('/').pop()),
    /outside the preview root/i,
  );
  assert.throws(
    () => resolvePreviewFile(root, '/etc/passwd'),
    /relative Markdown path/i,
  );
});

test('preview server lists files, renders selected Markdown, rejects traversal, and emits live update events', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-server-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'index.md'), '# Preview Home\n\nWelcome.\n', 'utf8');
  writeFileSync(join(root, 'docs', 'second.md'), '# Second Doc\n\n<agent-decision verdict="go" title="Preview">Ship it.</agent-decision>\n', 'utf8');

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 50,
    includeUserPacks: false,
  });

  try {
    const files = await fetchJson(`${preview.url}/api/files`);
    assert.deepEqual(files.files.map((file) => file.path), ['index.md', 'docs/second.md']);

    const rendered = await fetchJson(`${preview.url}/api/render?path=docs/second.md`);
    assert.equal(rendered.path, 'docs/second.md');
    assert.match(rendered.html, /<h1>Second Doc<\/h1>/);
    assert.match(rendered.html, /<agent-decision verdict="go" title="Preview">Ship it\.<\/agent-decision>/);
    assert.match(rendered.html, /\/\* Agent Isles component runtime \*\//);

    const traversal = await fetch(`${preview.url}/api/render?path=..%2Foutside.md`);
    assert.equal(traversal.status, 403);
    const traversalBody = await traversal.json();
    assert.match(traversalBody.error.message, /outside the preview root/i);

    const event = await waitForSseEvent(`${preview.url}/events`, () => {
      writeFileSync(join(root, 'docs', 'new.md'), '# New File\n', 'utf8');
    });
    assert.equal(event.event, 'preview:update');
    assert.ok(event.data.files.some((file) => file.path === 'docs/new.md'));
  } finally {
    await preview.close();
  }
});

test('preview server resolves pack config relative to the selected nested Markdown file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-nested-pack-'));
  mkdirSync(join(root, 'nested'), { recursive: true });
  mkdirSync(join(root, 'widget-pack'), { recursive: true });
  writeFileSync(join(root, 'nested', 'doc.md'), '# Nested Pack\n\n<nested-widget label="from-pack">Fallback</nested-widget>\n', 'utf8');
  writeFileSync(join(root, 'nested', 'isles.config.json'), JSON.stringify({ packs: ['../widget-pack'] }, null, 2));
  writeFileSync(join(root, 'widget-pack', 'agent-isles.pack.json'), JSON.stringify({
    agentIslesPackVersion: 1,
    name: 'nested-pack',
    version: '1.0.0',
    tags: [{ name: 'nested-widget', attributes: ['label'] }],
    assets: [{ type: 'module', path: 'nested-widget.js' }],
  }, null, 2));
  writeFileSync(
    join(root, 'widget-pack', 'nested-widget.js'),
    'customElements.define("nested-widget", class extends HTMLElement {});\n',
    'utf8',
  );

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 50,
    includeUserPacks: false,
  });

  try {
    const rendered = await fetchJson(`${preview.url}/api/render?path=nested/doc.md`);
    assert.equal(rendered.path, 'nested/doc.md');
    assert.match(rendered.html, /<nested-widget label="from-pack">Fallback<\/nested-widget>/);
    assert.match(rendered.html, /\/\* Pack: nested-pack@1\.0\.0 - nested-widget\.js \*\//);
    assert.match(rendered.html, /customElements\.define\("nested-widget"/);
    assert.doesNotMatch(rendered.html, /<script[^>]*src="[^"]*nested-widget\.js"/i);
  } finally {
    await preview.close();
  }
});

test('preview server returns render errors as in-page data without crashing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-error-'));
  writeFileSync(join(root, 'bad.md'), '# Broken\n\n```d2\na ->\n```\n', 'utf8');

  const preview = await startPreviewServer(root, {
    port: 0,
    watchIntervalMs: 50,
    includeUserPacks: false,
  });

  try {
    const response = await fetch(`${preview.url}/api/render?path=bad.md`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.path, 'bad.md');
    assert.match(body.error.message, /D2 diagram render failed/i);

    const files = await fetchJson(`${preview.url}/api/files`);
    assert.deepEqual(files.files.map((file) => file.path), ['bad.md']);
  } finally {
    await preview.close();
  }
});

test('rendered preview pages include heading anchors and a table of contents', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');

  const { html } = await renderMarkdownString('# Preview Guide\n\n## Readable Width\n\nBody.\n\n### Font Scale\n\nMore body.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
  });

  assert.match(html, /<nav class="agent-isles-toc" aria-label="Table of contents">/);
  assert.match(html, /<a href="#readable-width">Readable Width<\/a>/);
  assert.match(html, /<a href="#font-scale">Font Scale<\/a>/);
  assert.match(html, /<span id="readable-width" class="agent-isles-heading-anchor" aria-hidden="true"><\/span><h2>Readable Width<\/h2>/);
  assert.match(html, /<span id="font-scale" class="agent-isles-heading-anchor" aria-hidden="true"><\/span><h3>Font Scale<\/h3>/);
});

test('multi-heading pages wrap content and TOC in a sticky-TOC layout', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');

  const { html } = await renderMarkdownString('# Guide\n\n## Alpha\n\nBody.\n\n## Beta\n\nMore body.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
  });

  assert.match(html, /class="agent-isles-page container py-4 agent-isles-page--with-toc"/);
  assert.match(html, /<div class="agent-isles-layout">/);
  assert.match(html, /<div class="agent-isles-content">/);
  // Existing TOC markup is preserved unchanged.
  assert.match(html, /<nav class="agent-isles-toc" aria-label="Table of contents">/);
});

test('single-heading pages stay single-column with no TOC layout', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');

  const { html } = await renderMarkdownString('# Guide\n\n## Only Section\n\nBody.\n', {
    assetMode: 'inline',
    includeUserPacks: false,
  });

  assert.doesNotMatch(html, /agent-isles-page--with-toc/);
  assert.doesNotMatch(html, /agent-isles-layout/);
  assert.doesNotMatch(html, /<nav class="agent-isles-toc"/);
});

test('isles preview starts a localhost directory server and exits cleanly on SIGINT', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-preview-cli-'));
  writeFileSync(join(root, 'one.md'), '# CLI Preview\n', 'utf8');

  const child = spawn(process.execPath, [cli, 'preview', root, '--port', '0', '--no-user-packs'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    await waitFor(() => /http:\/\/127\.0\.0\.1:\d+\//.test(stdout), () => diagnostic(stdout, stderr));
    const url = stdout.match(/http:\/\/127\.0\.0\.1:\d+\//)[0];
    const files = await fetchJson(`${url}api/files`);
    assert.deepEqual(files.files.map((file) => file.path), ['one.md']);

    const close = onceClose(child, () => diagnostic(stdout, stderr));
    child.kill('SIGINT');
    const result = await close;
    assert.equal(result.code, 0, diagnostic(stdout, stderr));
    assert.match(stdout, /\[isles\] stopped/);
  } finally {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
});

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    assert.fail(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

function waitForSseEvent(url, trigger, timeoutMs = 5000) {
  return new Promise((resolvePromise, reject) => {
    let triggered = false;
    let buffer = '';
    const timeout = setTimeout(() => {
      request.destroy();
      reject(new Error(`Timed out waiting for SSE event from ${url}`));
    }, timeoutMs);

    const request = http.get(url, (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        buffer += chunk;
        if (!triggered) {
          triggered = true;
          trigger();
        }

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const event = parseSseMessage(part);
          if (event.event === 'preview:update') {
            clearTimeout(timeout);
            request.destroy();
            resolvePromise(event);
            return;
          }
        }
      });
    });

    request.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function parseSseMessage(message) {
  const event = { event: 'message', data: '' };
  for (const line of message.split('\n')) {
    if (line.startsWith('event: ')) {
      event.event = line.slice('event: '.length);
    } else if (line.startsWith('data: ')) {
      event.data += line.slice('data: '.length);
    }
  }
  event.data = event.data ? JSON.parse(event.data) : null;
  return event;
}

function onceClose(child, diagnostics, timeoutMs = 5000) {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for child process to close.\n${diagnostics()}`));
    }, timeoutMs);

    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolvePromise({ code, signal });
    });
  });
}

async function waitFor(predicate, diagnostics, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.fail(`Timed out waiting for condition.\n${diagnostics()}`);
}

function diagnostic(stdout, stderr) {
  return `stdout:\n${stdout}\nstderr:\n${stderr}`;
}
