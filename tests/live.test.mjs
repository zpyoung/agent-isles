import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const cli = 'bin/isles.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('isles live self-backgrounds and writes localhost server-info', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-live-cli-'));

  const launched = spawnSync(process.execPath, [cli, 'live', root, '--port', '0', '--idle-timeout', '5', '--no-user-packs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(launched.status, 0, launched.stderr);
  const infoPath = join(root, 'state', 'server-info');
  await waitFor(() => existsSync(infoPath), () => diagnostic(launched.stdout, launched.stderr));

  const info = readJson(infoPath);
  assert.equal(info.type, 'server-started');
  assert.equal(info.host, '127.0.0.1');
  assert.match(info.url, /^http:\/\/localhost:\d+$/);
  assert.equal(info.screen_dir, resolve(root, 'screens'));
  assert.equal(info.state_dir, resolve(root, 'state'));
  assert.ok(existsSync(info.screen_dir), 'screen_dir exists');
  assert.ok(existsSync(info.state_dir), 'state_dir exists');

  const response = await fetch(info.url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Agent Isles Live/);

  try {
    assert.ok(info.pid, 'server-info includes pid for cleanup');
    process.kill(info.pid, 'SIGTERM');
    await waitFor(() => existsSync(join(root, 'state', 'server-stopped')) && !existsSync(infoPath), () => JSON.stringify(info));
  } catch (error) {
    if (info.pid) {
      try { process.kill(info.pid, 'SIGKILL'); } catch {}
    }
    throw error;
  }
});

test('isles live server-info URL uses --url-host while binding the requested host and port', async () => {
  const { startLiveServer } = await import('../src/live.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-live-urlhost-'));

  const live = await startLiveServer(root, {
    host: '127.0.0.1',
    port: 0,
    urlHost: 'localhost',
    idleTimeoutMs: 60_000,
    includeUserPacks: false,
  });

  try {
    const info = readJson(join(root, 'state', 'server-info'));
    assert.equal(info.host, '127.0.0.1');
    assert.equal(info.port, live.port);
    assert.equal(info.url, `http://localhost:${live.port}`);
  } finally {
    await live.close('test cleanup');
  }
});

test('isles live reports an explicit port conflict clearly', async () => {
  const { startLiveServer } = await import('../src/live.mjs');
  const firstRoot = mkdtempSync(join(tmpdir(), 'agent-isles-live-first-'));
  const secondRoot = mkdtempSync(join(tmpdir(), 'agent-isles-live-second-'));
  const first = await startLiveServer(firstRoot, { host: '127.0.0.1', port: 0, idleTimeoutMs: 60_000, includeUserPacks: false });

  try {
    await assert.rejects(
      () => startLiveServer(secondRoot, { host: '127.0.0.1', port: first.port, explicitPort: true, idleTimeoutMs: 60_000, includeUserPacks: false }),
      /Port .* is already in use/i,
    );
  } finally {
    await first.close('test cleanup');
  }
});

test('isles live idle timeout removes server-info and writes server-stopped', async () => {
  const { startLiveServer } = await import('../src/live.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-live-idle-'));
  const live = await startLiveServer(root, { port: 0, idleTimeoutMs: 120, includeUserPacks: false });

  await waitFor(() => existsSync(join(root, 'state', 'server-stopped')) && !existsSync(join(root, 'state', 'server-info')), () => `port=${live.port}`, 3000);
  const stopped = readJson(join(root, 'state', 'server-stopped'));
  assert.equal(stopped.type, 'server-stopped');
  assert.equal(stopped.reason, 'idle-timeout');
});

test('isles live exits when owner pid dies', async () => {
  const { startLiveServer } = await import('../src/live.mjs');
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-live-owner-'));
  const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const live = await startLiveServer(root, {
    port: 0,
    ownerPid: owner.pid,
    ownerPollIntervalMs: 50,
    idleTimeoutMs: 60_000,
    includeUserPacks: false,
  });

  owner.kill('SIGTERM');
  await waitFor(() => existsSync(join(root, 'state', 'server-stopped')) && !existsSync(join(root, 'state', 'server-info')), () => `owner=${owner.pid} live=${live.port}`, 3000);
  const stopped = readJson(join(root, 'state', 'server-stopped'));
  assert.equal(stopped.reason, 'owner-pid-exit');
});

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
