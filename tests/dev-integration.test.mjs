// tests/dev-integration.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEV = join(ROOT, 'scripts', 'dev.mjs');

async function waitFor(fn, timeoutMs = 8000, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const v = await fn(); if (v) return v; await sleep(stepMs); }
  return null;
}
function readInfo(dir) {
  const p = join(dir, 'state', 'server-info');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

test('dev live restarts the server and notifies the browser on src change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-dev-live-'));
  writeFileSync(join(dir, 'screen.md'), '# Hi');
  // --no-build avoids running rollup in tests; --no-open avoids launching a browser.
  const proc = spawn(process.execPath, [DEV, 'live', dir, '--no-build', '--no-open'], {
    cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    const info1 = await waitFor(() => readInfo(dir));
    assert.ok(info1 && info1.pid, 'first server started');

    // Subscribe to SSE so a reconnect/reload is observable.
    const reloads = [];
    const sse = http.get(`${info1.url}/events`, (res) => {
      res.setEncoding('utf8');
      res.on('data', (c) => { if (c.includes('live:reload') || c.includes('event:')) reloads.push(c); });
    });

    // Touch a renderer source file → supervisor should restart the child (new pid).
    const srcFile = join(ROOT, 'src', 'renderer', 'page.mjs');
    const now = new Date();
    utimesSync(srcFile, now, now);

    const restarted = await waitFor(() => {
      const info2 = readInfo(dir);
      return info2 && info2.pid && info2.pid !== info1.pid ? info2 : null;
    });
    sse.destroy();
    assert.ok(restarted, 'server restarted with a new pid after src change');
  } finally {
    proc.kill('SIGTERM');
    await sleep(300);
  }
});
