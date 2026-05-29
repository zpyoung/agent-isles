import { watch } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { defaultOutFile, renderMarkdownFile } from './render.mjs';

const rebuildDelayMs = 75;

export async function watchMarkdownFile(inputPath, options = {}) {
  const sourceFile = resolve(inputPath);
  const sourceDir = dirname(sourceFile);
  const sourceName = basename(sourceFile);
  const outFile = resolve(options.outFile || defaultOutFile(sourceFile));
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const renderOptions = {
    outFile,
    renderMode: options.renderMode,
    assetMode: options.assetMode,
    showSource: options.showSource,
    explicitPacks: options.explicitPacks,
    includeUserPacks: options.includeUserPacks,
    projectDir: options.projectDir ?? sourceDir,
  };

  let timer;
  let closed = false;
  let rendering = false;
  let pending = false;

  async function render(kind) {
    if (closed) {
      return;
    }

    if (rendering) {
      pending = true;
      return;
    }

    rendering = true;
    try {
      await renderMarkdownFile(sourceFile, renderOptions);
      stdout.write(`[isles] ${kind}: ${outFile}\n`);
    } catch (error) {
      const label = kind === 'rendered' ? 'initial render failed' : 'rebuild failed';
      stderr.write(`[isles] ${label}: ${formatError(error)}\n`);
    } finally {
      rendering = false;
      if (pending && !closed) {
        pending = false;
        await render('rebuilt');
      }
    }
  }

  await render('rendered');
  stdout.write(`[isles] watching ${sourceFile}\n`);

  const watcher = watch(sourceDir, { persistent: true }, (_eventType, filename) => {
    if (filename && filename.toString() !== sourceName) {
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(() => {
      void render('rebuilt');
    }, rebuildDelayMs);
  });

  function close() {
    if (closed) {
      return;
    }

    closed = true;
    clearTimeout(timer);
    watcher.close();
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
    stdout.write('[isles] stopped\n');
  }

  function handleSignal() {
    close();
    if (options.exitOnSignal) {
      process.exit(0);
    }
  }

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  return { close, inputPath: sourceFile, outFile };
}

function formatError(error) {
  return error && error.message ? error.message : String(error);
}
