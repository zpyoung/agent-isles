import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
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

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

async function waitFor(fn, timeoutMs = 5000, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await sleep(stepMs);
  }
  return false;
}

test('isles live --stop refuses to signal server-info pid without matching screen_dir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-cli-stop-guard-'));
  const state = join(dir, 'state');
  const infoPath = join(state, 'server-info');
  mkdirSync(state, { recursive: true });
  let sentinel;

  try {
    sentinel = spawn(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { stdio: 'ignore' });
    assert.ok(Number.isInteger(sentinel.pid) && sentinel.pid > 0, 'sentinel started');
    assert.ok(pidAlive(sentinel.pid), 'sentinel pid is alive before --stop');

    writeFileSync(infoPath, JSON.stringify({
      type: 'server-started',
      pid: sentinel.pid,
      port: 65535,
      host: '127.0.0.1',
      url: 'http://localhost:65535',
      state_dir: state,
    }) + '\n');

    const stop = await runCli(['live', dir, '--stop']);
    assert.equal(stop.code, 0, `--stop failed: ${stop.stderr}`);
    await sleep(150);
    assert.ok(pidAlive(sentinel.pid), 'sentinel pid remains alive when screen_dir is missing');
    assert.equal(sentinel.exitCode, null, 'sentinel process was not terminated');
    assert.equal(sentinel.signalCode, null, 'sentinel process was not signaled');
  } finally {
    if (sentinel) {
      if (pidAlive(sentinel.pid)) sentinel.kill('SIGTERM');
      await waitFor(() => !pidAlive(sentinel.pid), 1000, 25);
      if (pidAlive(sentinel.pid)) sentinel.kill('SIGKILL');
      await waitFor(() => !pidAlive(sentinel.pid), 1000, 25);
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

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
  let pid;

  try {
    const launch = await runCli(['live', dir, '--port', '0']);
    assert.equal(launch.code, 0, `launch returns promptly with exit 0 (self-backgrounded): ${launch.stderr}`);
    const launchedInfo = JSON.parse(launch.stdout.trim());
    pid = launchedInfo.pid;
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
    if (pid) await waitFor(() => !pidAlive(pid));
  }

  assert.ok(await waitFor(() => existsSync(stoppedPath)), 'server-stopped written after --stop');
  assert.ok(!pidAlive(pid), 'server pid is gone after --stop');
});

test('isles live relaunch is idempotent and --stop stops the reused server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-cli-relaunch-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Hi again');
  const infoPath = join(dir, 'state', 'server-info');
  const stoppedPath = join(dir, 'state', 'server-stopped');
  let pid;

  try {
    const first = await runCli(['live', dir, '--port', '0']);
    assert.equal(first.code, 0, `first launch failed: ${first.stderr}`);
    const firstInfo = JSON.parse(first.stdout.trim());
    pid = firstInfo.pid;
    assert.ok(Number.isInteger(pid) && pid > 0, 'first launch reports a sane pid');
    assert.ok(pidAlive(pid), 'first server pid is alive');

    const second = await runCli(['live', dir, '--port', '0']);
    assert.equal(second.code, 0, `second launch failed: ${second.stderr}`);
    const secondInfo = JSON.parse(second.stdout.trim());
    assert.equal(secondInfo.pid, pid, 'relaunch reuses the running server pid');
    assert.equal(secondInfo.port, firstInfo.port, 'relaunch reuses the running server port');
    assert.equal(JSON.parse(readFileSync(infoPath, 'utf8')).pid, pid, 'server-info still belongs to the first server');
    assert.ok(pidAlive(pid), 'reused server remains alive before --stop');
  } finally {
    await runCli(['live', dir, '--stop']);
    if (pid) await waitFor(() => !pidAlive(pid));
  }

  assert.ok(await waitFor(() => existsSync(stoppedPath)), 'server-stopped written after one --stop');
  assert.ok(!pidAlive(pid), 'reused server pid is gone after --stop');
});

test('isles live invalid args exit 2 without starting a server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-cli-badargs-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Bad args');
  const infoPath = join(dir, 'state', 'server-info');

  const badPort = await runCli(['live', dir, '--port', 'abc']);
  assert.equal(badPort.code, 2);
  assert.match(badPort.stderr, /--port must be an integer 0-65535/);
  assert.ok(!existsSync(infoPath), 'bad --port does not start a server');

  const missingHost = await runCli(['live', dir, '--host']);
  assert.equal(missingHost.code, 2);
  assert.match(missingHost.stderr, /--host requires a value/);
  assert.ok(!existsSync(infoPath), 'missing --host value does not start a server');
});
