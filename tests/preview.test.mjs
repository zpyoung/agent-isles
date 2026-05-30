import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  discoverMarkdownFiles,
  resolvePreviewFile,
  startPreviewServer,
} from '../src/preview.mjs';

const cli = 'bin/isles.mjs';

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
