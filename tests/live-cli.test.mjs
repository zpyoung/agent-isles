import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

const cli = 'bin/isles.mjs';

function runCli(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
  });
}

test('isles live self-backgrounds, writes fresh server-info, and --stop stops it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-cli-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Hi');
  const state = join(dir, 'state');
  const infoPath = join(state, 'server-info');
  const stoppedPath = join(state, 'server-stopped');
  mkdirSync(state, { recursive: true });
  const stale = { type: 'server-started', pid: 999999, port: 65535, host: '127.0.0.1', url: 'http://localhost:65535', screen_dir: dir, state_dir: state };
  writeFileSync(infoPath, JSON.stringify(stale) + '\n');
  writeFileSync(stoppedPath, JSON.stringify({ reason: 'stale' }) + '\n');

  try {
    const launch = await runCli(['live', dir, '--port', '0']);
    assert.equal(launch.code, 0, `launch returns promptly with exit 0 (self-backgrounded): ${launch.stderr}`);
    const launchedInfo = JSON.parse(launch.stdout.trim());
    assert.equal(launchedInfo.screen_dir, dir);
    assert.notEqual(launchedInfo.pid, stale.pid, 'launcher prints fresh server-info, not the stale file');
    assert.notEqual(launchedInfo.port, stale.port, 'launcher waits for the new child port');

    let info = null;
    for (let i = 0; i < 50 && !info; i += 1) {
      if (existsSync(infoPath)) {
        info = JSON.parse(readFileSync(infoPath, 'utf8'));
      } else { await sleep(100); }
    }
    assert.ok(info, 'server-info written by backgrounded server');
    assert.match(info.url, /^http:\/\//);
    assert.equal(info.screen_dir, dir);
    assert.equal(info.pid, launchedInfo.pid);
  } finally {
    await runCli(['live', dir, '--stop']);
  }

  for (let i = 0; i < 50 && !existsSync(stoppedPath); i += 1) await sleep(100);
  assert.ok(existsSync(stoppedPath), 'server-stopped written after --stop');
});
