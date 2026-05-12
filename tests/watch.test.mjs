import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    assert.match(stdout, /\[isles\] watching .*watch-demo\.md/);

    const close = onceClose(child);
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

function onceClose(child) {
  return new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
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
