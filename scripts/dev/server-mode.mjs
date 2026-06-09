// scripts/dev/server-mode.mjs
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../../bin/isles.mjs', import.meta.url));

export function childArgsFor(subcommand, passthrough) {
  if (subcommand === 'live') return ['live', ...passthrough, '--__serve'];
  return ['preview', ...passthrough];
}

export function parsePreviewUrl(line) {
  const match = /\[isles\] open (\S+)/.exec(line);
  return match ? match[1] : null;
}

export function readLiveUrl(dir) {
  const infoPath = join(resolve(dir), 'state', 'server-info');
  if (!existsSync(infoPath)) return null;
  try {
    const info = JSON.parse(readFileSync(infoPath, 'utf8'));
    return typeof info.url === 'string' ? `${info.url}/` : null;
  } catch {
    return null;
  }
}

// Spawns (and lets the caller restart) the wrapped server child. Returns { spawn, kill }.
export function createServerProcess(subcommand, passthrough, { spawnFn = nodeSpawn } = {}) {
  let child = null;
  const args = childArgsFor(subcommand, passthrough);
  return {
    onLine: null, // assigned by caller to receive stdout lines (preview URL detection)
    spawn() {
      const self = this;
      let buffer = '';
      child = spawnFn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          if (self.onLine) self.onLine(line);
          else process.stdout.write(`${line}\n`);
        }
      });
      return child;
    },
    kill() {
      if (child && !child.killed) child.kill('SIGTERM');
      child = null;
    },
    current() { return child; },
  };
}
