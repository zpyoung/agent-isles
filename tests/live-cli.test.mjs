import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

const cli = 'bin/isles.mjs';

test('isles live self-backgrounds, writes server-info, and --stop stops it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-live-cli-'));
  writeFileSync(join(dir, 'screen-1.md'), '# Hi');

  const launch = spawn(process.execPath, [cli, 'live', dir, '--port', '0'], { stdio: 'ignore' });
  const code = await new Promise((r) => launch.on('exit', r));
  assert.equal(code, 0, 'launch returns promptly with exit 0 (self-backgrounded)');

  let info = null;
  for (let i = 0; i < 50 && !info; i += 1) {
    if (existsSync(join(dir, 'state', 'server-info'))) {
      info = JSON.parse(readFileSync(join(dir, 'state', 'server-info'), 'utf8'));
    } else { await sleep(100); }
  }
  assert.ok(info, 'server-info written by backgrounded server');
  assert.match(info.url, /^http:\/\//);
  assert.equal(info.screen_dir, dir);

  const stop = spawn(process.execPath, [cli, 'live', dir, '--stop'], { stdio: 'ignore' });
  await new Promise((r) => stop.on('exit', r));
  for (let i = 0; i < 50 && !existsSync(join(dir, 'state', 'server-stopped')); i += 1) await sleep(100);
  assert.ok(existsSync(join(dir, 'state', 'server-stopped')), 'server-stopped written after --stop');
});
