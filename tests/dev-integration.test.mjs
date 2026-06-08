// tests/dev-integration.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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

test('dev live restarts the server on src change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-dev-live-'));
  writeFileSync(join(dir, 'screen.md'), '# Hi');
  // A temp file under src/ is the change signal: a real create/write reliably fires
  // fs.watch on macOS, whereas a pure mtime touch (utimes) often does not.
  const probe = join(ROOT, 'src', '__dev_probe__.mjs');
  // --no-build avoids running rollup in tests; --no-open avoids launching a browser.
  const proc = spawn(process.execPath, [DEV, 'live', dir, '--no-build', '--no-open'], {
    cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    const info1 = await waitFor(() => readInfo(dir), 12000, 200);
    assert.ok(info1 && info1.pid, 'first server started');

    // Rewrite the probe on each poll → triggers a restart. Poll slowly (2s) so each
    // restart fully completes (kill → respawn → server-info rewrite) before the next
    // trigger; a fast cadence would thrash and race the server-info file.
    const restarted = await waitFor(() => {
      writeFileSync(probe, `// dev probe ${Date.now()}\n`);
      const info2 = readInfo(dir);
      return info2 && info2.pid && info2.pid !== info1.pid ? info2 : null;
    }, 16000, 2000);
    assert.ok(restarted, 'server restarted with a new pid after src change');
  } finally {
    rmSync(probe, { force: true });
    proc.kill('SIGTERM');
    await sleep(300);
  }
});
