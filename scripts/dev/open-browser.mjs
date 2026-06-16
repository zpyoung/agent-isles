// scripts/dev/open-browser.mjs
import { spawn as nodeSpawn } from 'node:child_process';

export function openerCommand(platform) {
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'cmd';
  return 'xdg-open';
}

export function openBrowser(url, { platform = process.platform, spawnFn = nodeSpawn } = {}) {
  const cmd = openerCommand(platform);
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawnFn(cmd, args, { stdio: 'ignore', detached: true });
    child.on?.('error', () => {});
    child.unref?.();
  } catch {
    // best-effort; ignore launch failures
  }
}
