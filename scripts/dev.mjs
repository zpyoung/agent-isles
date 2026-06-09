import { watch, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyChange } from './dev/classify.mjs';
import { createDebouncer } from './dev/debounce.mjs';
import { runRollup } from './dev/rebuild.mjs';
import { openBrowser } from './dev/open-browser.mjs';
import { createServerProcess, parsePreviewUrl, readLiveUrl } from './dev/server-mode.mjs';
import { startRenderServer, renderOnce } from './dev/render-mode.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUBCOMMANDS = new Set(['live', 'preview', 'render']);
const USAGE = 'Usage: pnpm dev <live|preview|render> <target> [args...] [--no-open] [--no-build]';

export function parseDevArgs(argv) {
  if (argv.length === 0) throw new Error(USAGE);
  const [subcommand, ...rest] = argv;
  if (!SUBCOMMANDS.has(subcommand)) {
    throw new Error(`Unsupported dev subcommand: ${subcommand}. ${USAGE}`);
  }
  let open = true;
  let build = true;
  const passthrough = [];
  for (const arg of rest) {
    if (arg === '--no-open') { open = false; continue; }
    if (arg === '--no-build') { build = false; continue; }
    passthrough.push(arg);
  }
  const target = passthrough.find((a) => !a.startsWith('-'));
  if (!target) throw new Error(`Missing <target> for dev ${subcommand}. ${USAGE}`);
  return { subcommand, target, passthrough, open, build };
}

function watchRoots(opts) {
  const roots = [join(PROJECT_ROOT, 'src')];
  // Watch any --pack <path> directories so pack authoring hot-reloads.
  for (let i = 0; i < opts.passthrough.length; i += 1) {
    if (opts.passthrough[i] === '--pack' && opts.passthrough[i + 1]) {
      roots.push(resolve(opts.passthrough[i + 1]));
    }
  }
  // Watch the target file/dir itself.
  roots.push(resolve(opts.target));
  return [...new Set(roots)];
}

function startWatching(roots, onBatch) {
  const debounced = createDebouncer((paths) => onBatch(paths), 150);
  const watchers = [];
  const seen = new Set();
  for (const root of roots) {
    for (const { path, isDirectory } of watchTargets(root)) {
      if (seen.has(path)) continue;
      seen.add(path);
      try {
        const w = watch(path, { recursive: false }, (_evt, file) => {
          if (!isDirectory) {
            debounced(path);
            return;
          }
          const leaf = file ? String(file) : '';
          debounced(leaf ? join(path, leaf) : path);
        });
        w.on('error', () => {});
        watchers.push(w);
      } catch { /* path may not exist or be unwatchable; skip */ }
    }
  }
  return () => { for (const w of watchers) { try { w.close(); } catch {} } };
}

function watchTargets(root) {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    return [];
  }
  if (!stats.isDirectory()) return [{ path: root, isDirectory: false }];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    out.push({ path: dir, isDirectory: true });
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'state') continue;
      stack.push(join(dir, entry.name));
    }
  }
  return out;
}

async function runServerMode(opts) {
  await runRollup(PROJECT_ROOT, { skip: !opts.build });
  const proc = createServerProcess(opts.subcommand, opts.passthrough);
  let opened = false;
  const openOnce = (url) => { if (!opened && url) { opened = true; if (opts.open) openBrowser(url); console.log(`[dev] ${url}`); } };
  if (opts.subcommand === 'preview') {
    proc.onLine = (line) => { const url = parsePreviewUrl(line); if (url) openOnce(url); else console.log(line); };
  }
  proc.spawn();
  if (opts.subcommand === 'live') {
    const dir = resolve(opts.target);
    const url = await (async () => { for (let i = 0; i < 80; i += 1) { const u = readLiveUrl(dir); if (u) return u; await new Promise((r) => setTimeout(r, 100)); } return null; })();
    openOnce(url);
  }

  let inFlight = false;
  const onBatch = async (paths) => {
    const decision = classifyChange(paths, PROJECT_ROOT);
    if (decision.ignored || !decision.restart) return;
    if (inFlight) return; // a rebuild+restart is already running; coalesce this batch
    inFlight = true;
    try {
      if (decision.rebuild) await runRollup(PROJECT_ROOT, { skip: !opts.build });
      console.log('[dev] source changed → restarting server');
      proc.kill();
      await new Promise((r) => setTimeout(r, 150));
      proc.spawn();
    } catch (error) {
      console.error(`[dev] rebuild failed, keeping last server: ${error.message}`);
    } finally {
      inFlight = false;
    }
  };
  const stopWatching = startWatching(watchRoots(opts), onBatch);

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopWatching();
    const child = proc.current();
    proc.kill();
    waitForExit(child).finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function runRenderMode(opts) {
  const outDir = mkdtempSync(join(tmpdir(), 'isles-dev-render-'));
  const outFile = join(outDir, 'index.html');
  const rerender = async ({ rebuild } = {}) => {
    if (rebuild) await runRollup(PROJECT_ROOT, { skip: !opts.build });
    await renderOnce(outFile, opts.passthrough);
  };
  await rerender({ rebuild: opts.build });
  const srv = await startRenderServer(outFile, { port: 0 });
  console.log(`[dev] ${srv.url}`);
  if (opts.open) openBrowser(srv.url);

  let inFlight = false;
  const onBatch = async (paths) => {
    const decision = classifyChange(paths, PROJECT_ROOT);
    const targetChanged = paths.some((p) => p === resolve(opts.target));
    if (decision.ignored && !targetChanged) return;
    if (inFlight) return; // a re-render is already running; coalesce this batch
    inFlight = true;
    try {
      await rerender({ rebuild: decision.rebuild });
      srv.broadcastReload();
    } catch (error) {
      console.error(`[dev] re-render failed: ${error.message}`);
    } finally {
      inFlight = false;
    }
  };
  const stopWatching = startWatching(watchRoots(opts), onBatch);

  const shutdown = () => { stopWatching(); srv.close().finally(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function waitForExit(child, timeoutMs = 5000) {
  return new Promise((resolveDone) => {
    if (!child || child.exitCode !== null) { resolveDone(); return; }
    let done = false;
    const doneOnce = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolveDone();
    };
    const timeout = setTimeout(doneOnce, timeoutMs);
    child.once('exit', doneOnce);
    child.once('close', doneOnce);
  });
}

async function main() {
  let opts;
  try { opts = parseDevArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exit(2); }
  if (opts.subcommand === 'render') await runRenderMode(opts);
  else await runServerMode(opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
