import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderMarkdownString } from './render.mjs';

export const PREVIEW_DIR_NAME = 'agent-isles-preview';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function previewDir() {
  return join(tmpdir(), PREVIEW_DIR_NAME);
}

function previewTtlMs() {
  const raw = process.env.ISLES_PREVIEW_TTL_MS;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

function prunePreviewDir(dir, ttlMs, now) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir does not exist yet or is unreadable — nothing to prune
  }

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    try {
      const stats = statSync(entryPath);
      if (now - stats.mtimeMs > ttlMs) {
        rmSync(entryPath, { force: true });
      }
    } catch {
      // Best-effort: ignore files we cannot stat or remove (e.g. in use).
    }
  }
}

function defaultOpener(target) {
  const override = process.env.ISLES_PREVIEW_OPEN_CMD;
  if (override) {
    // ISLES_PREVIEW_OPEN_CMD must be a bare executable name or absolute path
    // (no embedded arguments — "open -a Firefox" will not work).
    const child = spawn(override, [target], { stdio: 'ignore', detached: true });
    child.once('error', () => {}); // launch failures must not crash the process
    child.unref();
    return;
  }

  const platform = process.platform;
  let command;
  let args;
  if (platform === 'darwin') {
    command = 'open';
    args = [target];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', target];
  } else {
    command = 'xdg-open';
    args = [target];
  }

  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.once('error', () => {}); // launch failures must not crash the process
  child.unref();
}

export async function previewMarkdown(options = {}) {
  const {
    markdown,
    projectDir = process.cwd(),
    renderMode,
    explicitPacks = [],
    includeUserPacks = true,
    showSource = false,
    open = false,
    opener = defaultOpener,
    dir = previewDir(),
    now = Date.now(),
  } = options;

  if (typeof markdown !== 'string') {
    throw new TypeError('previewMarkdown requires a markdown string');
  }

  const { html } = await renderMarkdownString(markdown, {
    assetMode: 'inline',
    renderMode,
    projectDir,
    explicitPacks,
    includeUserPacks,
    showSource,
  });

  mkdirSync(dir, { recursive: true });
  prunePreviewDir(dir, previewTtlMs(), now);

  const outFile = join(dir, `isles-preview-${now}-${randomUUID()}.html`);
  writeFileSync(outFile, html);

  const fileUrl = pathToFileURL(outFile).href;

  let opened = false;
  if (open) {
    try {
      // The opener contract is synchronous: a synchronous throw is caught
      // here; an async rejection is not part of the contract.
      opener(outFile);
      opened = true;
    } catch {
      opened = false;
    }
  }

  return { outFile, fileUrl, opened };
}
