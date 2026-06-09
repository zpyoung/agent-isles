// scripts/dev/rebuild.mjs
import { spawn as nodeSpawn } from 'node:child_process';
import { join } from 'node:path';

const ROLLUP_CLI = join('node_modules', 'rollup', 'dist', 'bin', 'rollup');

export function runRollup(projectRoot, { skip = false, spawnFn = nodeSpawn } = {}) {
  if (skip) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawnFn(process.execPath, [join(projectRoot, ROLLUP_CLI), '-c'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`rollup exited with code ${code}`));
    });
  });
}
