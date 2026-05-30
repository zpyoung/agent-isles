import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const cli = 'bin/isles.mjs';

test('isles watch renders immediately, rebuilds on Markdown changes, and exits on SIGINT', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-watch-'));
  const inputFile = join(dir, 'watch-demo.md');
  const outFile = join(dir, 'watch-demo.html');
  writeFileSync(inputFile, '# Initial Watch\n\nFirst pass.\n', 'utf8');

  const child = spawn(process.execPath, [cli, 'watch', inputFile, '--out', outFile], {
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
    await waitFor(() => stdout.includes('[isles] rendered'), () => diagnostic(stdout, stderr));
    assert.match(readFileSync(outFile, 'utf8'), /<h1>Initial Watch<\/h1>/);

    writeFileSync(inputFile, '# Updated Watch\n\nSecond pass.\n', 'utf8');

    await waitFor(() => stdout.includes('[isles] rebuilt'), () => diagnostic(stdout, stderr));
    assert.match(readFileSync(outFile, 'utf8'), /<h1>Updated Watch<\/h1>/);

    const rebuiltCount = countOccurrences(stdout, '[isles] rebuilt');
    const replacementFile = join(dir, 'watch-demo.md.tmp');
    writeFileSync(replacementFile, '# Atomic Save Watch\n\nThird pass.\n', 'utf8');
    renameSync(replacementFile, inputFile);

    await waitFor(
      () => countOccurrences(stdout, '[isles] rebuilt') > rebuiltCount,
      () => diagnostic(stdout, stderr),
    );
    assert.match(readFileSync(outFile, 'utf8'), /<h1>Atomic Save Watch<\/h1>/);
    assert.match(stdout, /\[isles\] watching .*watch-demo\.md/);

    const close = onceClose(child, () => diagnostic(stdout, stderr));
    child.kill('SIGINT');
    const result = await close;
    assert.equal(result.code, 0, diagnostic(stdout, stderr));
    assert.equal(result.signal, null, diagnostic(stdout, stderr));
    assert.match(stdout, /\[isles\] stopped/);
  } finally {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
});

test('isles watch honors --assets inline and rebuilds inline output', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-watch-inline-'));
  const inputFile = join(dir, 'watch-inline.md');
  const outFile = join(dir, 'watch-inline.html');
  writeFileSync(inputFile, '# Inline Watch\n\nFirst pass.\n', 'utf8');

  const child = spawn(process.execPath, [cli, 'watch', inputFile, '--out', outFile, '--assets', 'inline'], {
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
    await waitFor(() => stdout.includes('[isles] rendered'), () => diagnostic(stdout, stderr));
    let html = readFileSync(outFile, 'utf8');
    assert.match(html, /<h1>Inline Watch<\/h1>/);
    assert.match(html, /\/\* Bootstrap CSS \*\//);
    assert.match(html, /\/\* Agent Isles component runtime \*\//);
    assert.doesNotMatch(html, /<script[^>]*src="https?:\/\//i, 'initial inline render must not reference CDN scripts');
    assert.doesNotMatch(html, /<script[^>]*src="[^"]*\.js"/i, 'initial inline render must not reference external JS files');

    writeFileSync(inputFile, '# Inline Watch Updated\n\nSecond pass.\n', 'utf8');

    await waitFor(() => stdout.includes('[isles] rebuilt'), () => diagnostic(stdout, stderr));
    html = readFileSync(outFile, 'utf8');
    assert.match(html, /<h1>Inline Watch Updated<\/h1>/);
    assert.match(html, /\/\* Agent Isles component runtime \*\//);
    assert.doesNotMatch(html, /<script[^>]*src="https?:\/\//i, 'inline rebuild must not reference CDN scripts');
    assert.doesNotMatch(html, /<script[^>]*src="[^"]*\.js"/i, 'inline rebuild must not reference external JS files');

    const close = onceClose(child, () => diagnostic(stdout, stderr));
    child.kill('SIGINT');
    await close;
  } finally {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
});

function onceClose(child, diagnostics, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for child process to close.\n${diagnostics()}`));
    }, timeoutMs);

    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function waitFor(predicate, diagnostics, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out waiting for condition.\n${diagnostics()}`);
}

function diagnostic(stdout, stderr) {
  return `stdout:\n${stdout}\nstderr:\n${stderr}`;
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}
