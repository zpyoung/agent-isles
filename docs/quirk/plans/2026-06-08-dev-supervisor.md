# Dev Supervisor with Hot Reload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use quirk:subagent-driven-development (recommended) or quirk:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-only `pnpm dev <subcommand>` supervisor that runs an agent-isles serve command, watches the project source, rebuilds, and hot-reloads the browser — without adding anything to the published `isles` CLI.

**Architecture:** A standalone `scripts/dev.mjs` (excluded from the npm package via the existing `files` allowlist) wraps the browser-viewable subcommands. **Mode A** (`live`, `preview`) spawns the existing foreground server child and *restarts* it on source change; the browser reloads via a "reload-on-reconnect" tweak in the shipped SSE clients. **Mode B** (`render`) runs a tiny static+SSE server inside `scripts/dev.mjs` and re-shells `isles render` per change (fresh Node process ⇒ always-current code), injecting its own reload client. A debounced recursive `fs.watch` over `src/**` + the target + `--pack` dirs drives a pure change-classifier that decides rebuild/restart/ignore.

**Tech Stack:** Node 22 ESM, `node:child_process` (`spawn`), `node:fs` (`fs.watch` recursive), `node:http`, rollup CLI, `node --test`. No new dependencies.

---

## File Structure

**New (repo-only, unpublished — under `scripts/`, which is not in `package.json` `files`):**
- `scripts/dev.mjs` — entry: parse argv, wire watcher → classify → rebuild → mode, browser-open, signal cleanup.
- `scripts/dev/classify.mjs` — pure `classifyChange(changedPaths, projectRoot)` → `{ rebuild, restart, ignored }`.
- `scripts/dev/debounce.mjs` — pure `createDebouncer(fn, ms, timers?)`.
- `scripts/dev/rebuild.mjs` — `runRollup(projectRoot, { skip, spawnFn? })`.
- `scripts/dev/open-browser.mjs` — `openerCommand(platform)`, `openBrowser(url, { platform?, spawnFn? })`.
- `scripts/dev/server-mode.mjs` — Mode A: `childArgsFor(subcommand, passthrough)`, `parsePreviewUrl(line)`, `readLiveUrl(dir)`, `startServerMode(...)`.
- `scripts/dev/render-mode.mjs` — Mode B: `RELOAD_CLIENT`, `renderChildArgs(target, tmp, passthrough)`, `startRenderMode(...)`.

**Modified (shipped `src` — minimal "reload-on-reconnect" only):**
- `src/live-client.js` — reload on SSE reconnect.
- `src/preview.mjs` — reload on SSE reconnect (inline client near line 788).
- `package.json` — add `"dev"` script.

**Tests:**
- `tests/dev-classify.test.mjs`, `tests/dev-debounce.test.mjs`, `tests/dev-rebuild.test.mjs`, `tests/dev-open-browser.test.mjs`, `tests/dev-args.test.mjs`, `tests/dev-server-mode.test.mjs`, `tests/dev-render-mode.test.mjs`, `tests/dev-live-client.test.mjs`, `tests/dev-integration.test.mjs`, and additions to `tests/preview.test.mjs`.

---

### Task 1: `package.json` dev script + argv parser

```yaml
independent: true
dependencies: []
scope:
  files: [package.json, scripts/dev.mjs, tests/dev-args.test.mjs]
```

**Files:**
- Modify: `package.json` (scripts block)
- Create: `scripts/dev.mjs` (skeleton exporting `parseDevArgs`)
- Test: `tests/dev-args.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-args.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDevArgs } from '../scripts/dev.mjs';

test('parses subcommand, target, and passthrough', () => {
  const r = parseDevArgs(['live', './screens', '--port', '4000']);
  assert.equal(r.subcommand, 'live');
  assert.equal(r.target, './screens');
  assert.deepEqual(r.passthrough, ['./screens', '--port', '4000']);
  assert.equal(r.open, true);
  assert.equal(r.build, true);
});

test('extracts dev-only flags and keeps them out of passthrough', () => {
  const r = parseDevArgs(['render', 'demo.md', '--no-open', '--no-build']);
  assert.equal(r.subcommand, 'render');
  assert.equal(r.target, 'demo.md');
  assert.equal(r.open, false);
  assert.equal(r.build, false);
  assert.deepEqual(r.passthrough, ['demo.md']);
});

test('rejects unknown subcommand', () => {
  assert.throws(() => parseDevArgs(['watch', 'demo.md']), /Unsupported dev subcommand/);
});

test('requires a subcommand', () => {
  assert.throws(() => parseDevArgs([]), /Usage: pnpm dev/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-args.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/dev.mjs'` / `parseDevArgs is not a function`.

- [ ] **Step 3: Create `scripts/dev.mjs` skeleton**

```javascript
// scripts/dev.mjs
// Repo-only dev supervisor. NOT shipped (scripts/ is excluded from package.json "files").
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

// main() is wired in Task 10.
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  try {
    parseDevArgs(process.argv.slice(2));
    console.log('[dev] argv parsed; orchestration wired in Task 10');
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
```

- [ ] **Step 4: Add the `dev` script to `package.json`**

In `package.json`, inside `"scripts"`, add this entry after `"render"`:

```json
    "dev": "node ./scripts/dev.mjs",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/dev-args.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/dev.mjs tests/dev-args.test.mjs
git commit -m "feat(dev): add pnpm dev script + argv parser"
```

---

### Task 2: Change classifier

```yaml
independent: true
dependencies: []
scope:
  files: [scripts/dev/classify.mjs, tests/dev-classify.test.mjs]
```

**Files:**
- Create: `scripts/dev/classify.mjs`
- Test: `tests/dev-classify.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-classify.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChange } from '../scripts/dev/classify.mjs';

const ROOT = '/repo';

test('component source → rebuild + restart', () => {
  const r = classifyChange(['/repo/src/components/option-set.js'], ROOT);
  assert.equal(r.rebuild, true);
  assert.equal(r.restart, true);
  assert.equal(r.ignored, false);
});

test('renderer/theme/server source → restart, no rebuild', () => {
  const r = classifyChange(['/repo/src/renderer/page.mjs'], ROOT);
  assert.equal(r.rebuild, false);
  assert.equal(r.restart, true);
});

test('dist output is ignored (prevents rebuild loop)', () => {
  const r = classifyChange(['/repo/dist/agent-components.js'], ROOT);
  assert.equal(r.ignored, true);
  assert.equal(r.rebuild, false);
  assert.equal(r.restart, false);
});

test('server state dir is ignored', () => {
  const r = classifyChange(['/repo/screens/state/server-info'], ROOT);
  assert.equal(r.ignored, true);
});

test('node_modules and .git are ignored', () => {
  assert.equal(classifyChange(['/repo/node_modules/x/y.js'], ROOT).ignored, true);
  assert.equal(classifyChange(['/repo/.git/index'], ROOT).ignored, true);
});

test('a batch is rebuild if ANY path is a component, restart if ANY is source', () => {
  const r = classifyChange(
    ['/repo/dist/agent-components.js', '/repo/src/components/x.js', '/repo/src/live.mjs'],
    ROOT,
  );
  assert.equal(r.rebuild, true);
  assert.equal(r.restart, true);
  assert.equal(r.ignored, false);
});

test('non-source markdown change → not ignored, no rebuild/restart (server handles it)', () => {
  const r = classifyChange(['/repo/screens/demo.md'], ROOT);
  assert.equal(r.ignored, false);
  assert.equal(r.rebuild, false);
  assert.equal(r.restart, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-classify.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/dev/classify.mjs
// Pure decision function: given changed absolute paths, decide what the supervisor does.

const IGNORE_SEGMENTS = ['/dist/', '/node_modules/', '/.git/', '/state/'];

function isIgnored(path) {
  return IGNORE_SEGMENTS.some((seg) => path.includes(seg));
}

function isComponentSource(path, root) {
  return path.startsWith(`${root}/src/components/`);
}

function isOtherSource(path, root) {
  return path.startsWith(`${root}/src/`) && !isComponentSource(path, root);
}

export function classifyChange(changedPaths, root) {
  const relevant = changedPaths.filter((p) => !isIgnored(p));
  if (relevant.length === 0) {
    return { rebuild: false, restart: false, ignored: true };
  }
  const rebuild = relevant.some((p) => isComponentSource(p, root));
  const restart = relevant.some((p) => isComponentSource(p, root) || isOtherSource(p, root));
  return { rebuild, restart, ignored: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dev-classify.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/classify.mjs tests/dev-classify.test.mjs
git commit -m "feat(dev): add change classifier"
```

---

### Task 3: Debouncer

```yaml
independent: true
dependencies: []
scope:
  files: [scripts/dev/debounce.mjs, tests/dev-debounce.test.mjs]
```

**Files:**
- Create: `scripts/dev/debounce.mjs`
- Test: `tests/dev-debounce.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-debounce.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDebouncer } from '../scripts/dev/debounce.mjs';

function fakeTimers() {
  let pending = null;
  return {
    setTimeout: (fn) => { pending = fn; return 1; },
    clearTimeout: () => { pending = null; },
    flush: () => { if (pending) { const fn = pending; pending = null; fn(); } },
    hasPending: () => pending !== null,
  };
}

test('coalesces multiple calls into one, passing accumulated args', () => {
  const timers = fakeTimers();
  const calls = [];
  const d = createDebouncer((batch) => calls.push(batch), 150, timers);
  d('a'); d('b'); d('c');
  assert.equal(calls.length, 0, 'not called before flush');
  timers.flush();
  assert.deepEqual(calls, [['a', 'b', 'c']]);
});

test('resets accumulation after firing', () => {
  const timers = fakeTimers();
  const calls = [];
  const d = createDebouncer((batch) => calls.push(batch), 150, timers);
  d('a'); timers.flush();
  d('b'); timers.flush();
  assert.deepEqual(calls, [['a'], ['b']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-debounce.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/dev/debounce.mjs
// Coalesces rapid calls into a single trailing call that receives all accumulated args.

export function createDebouncer(fn, ms, timers = globalThis) {
  let handle = null;
  let batch = [];
  return (arg) => {
    batch.push(arg);
    if (handle !== null) timers.clearTimeout(handle);
    handle = timers.setTimeout(() => {
      const current = batch;
      batch = [];
      handle = null;
      fn(current);
    }, ms);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dev-debounce.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/debounce.mjs tests/dev-debounce.test.mjs
git commit -m "feat(dev): add debouncer"
```

---

### Task 4: Rollup rebuild wrapper

```yaml
independent: true
dependencies: []
scope:
  files: [scripts/dev/rebuild.mjs, tests/dev-rebuild.test.mjs]
```

**Files:**
- Create: `scripts/dev/rebuild.mjs`
- Test: `tests/dev-rebuild.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-rebuild.test.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { runRollup } from '../scripts/dev/rebuild.mjs';

function fakeSpawn(exitCode) {
  const calls = [];
  const spawnFn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', exitCode));
    return child;
  };
  return { spawnFn, calls };
}

test('skip=true resolves without spawning', async () => {
  const { spawnFn, calls } = fakeSpawn(0);
  await runRollup('/repo', { skip: true, spawnFn });
  assert.equal(calls.length, 0);
});

test('runs rollup CLI with -c on the project root', async () => {
  const { spawnFn, calls } = fakeSpawn(0);
  await runRollup('/repo', { skip: false, spawnFn });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes('-c'));
  assert.match(calls[0].args[0], /rollup/);
  assert.equal(calls[0].opts.cwd, '/repo');
});

test('rejects on non-zero exit', async () => {
  const { spawnFn } = fakeSpawn(1);
  await assert.rejects(() => runRollup('/repo', { skip: false, spawnFn }), /rollup exited with code 1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-rebuild.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
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
```

> Note: the test passes `args[0]` matching `/rollup/` — `join(projectRoot, ROLLUP_CLI)` ends with `rollup`, satisfying it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dev-rebuild.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/rebuild.mjs tests/dev-rebuild.test.mjs
git commit -m "feat(dev): add rollup rebuild wrapper"
```

---

### Task 5: Browser opener

```yaml
independent: true
dependencies: []
scope:
  files: [scripts/dev/open-browser.mjs, tests/dev-open-browser.test.mjs]
```

**Files:**
- Create: `scripts/dev/open-browser.mjs`
- Test: `tests/dev-open-browser.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-open-browser.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { openerCommand, openBrowser } from '../scripts/dev/open-browser.mjs';

test('maps platform to opener command', () => {
  assert.equal(openerCommand('darwin'), 'open');
  assert.equal(openerCommand('linux'), 'xdg-open');
  assert.equal(openerCommand('win32'), 'cmd');
});

test('openBrowser spawns the opener with the url', () => {
  const calls = [];
  const spawnFn = (cmd, args) => { calls.push({ cmd, args }); return { on() {}, unref() {} }; };
  openBrowser('http://localhost:9/', { platform: 'darwin', spawnFn });
  assert.equal(calls[0].cmd, 'open');
  assert.deepEqual(calls[0].args, ['http://localhost:9/']);
});

test('win32 uses cmd /c start', () => {
  const calls = [];
  const spawnFn = (cmd, args) => { calls.push({ cmd, args }); return { on() {}, unref() {} }; };
  openBrowser('http://localhost:9/', { platform: 'win32', spawnFn });
  assert.deepEqual(calls[0].args, ['/c', 'start', '', 'http://localhost:9/']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-open-browser.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dev-open-browser.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/open-browser.mjs tests/dev-open-browser.test.mjs
git commit -m "feat(dev): add cross-platform browser opener"
```

---

### Task 6: Shipped touchpoint — `live-client.js` reload-on-reconnect

```yaml
independent: true
dependencies: []
scope:
  files: [src/live-client.js, tests/dev-live-client.test.mjs]
```

**Files:**
- Modify: `src/live-client.js:4-6`
- Test: `tests/dev-live-client.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-live-client.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_CLIENT } from '../src/live-client.js';

function run() {
  const listeners = {};
  let reloads = 0;
  const es = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn());
  const stubEventSource = function () { return es; };
  const stubWebSocket = function () { return { addEventListener() {}, readyState: 0 }; };
  stubWebSocket.OPEN = 1;
  const win = { location: { reload: () => { reloads += 1; } }, setTimeout: () => 0, WebSocket: stubWebSocket };
  const doc = { addEventListener: () => {} };
  // eslint-disable-next-line no-new-func
  new Function('EventSource', 'WebSocket', 'window', 'document', LIVE_CLIENT)(
    stubEventSource, stubWebSocket, win, doc,
  );
  return { fire, reloads: () => reloads };
}

test('first SSE open does NOT reload', () => {
  const { fire, reloads } = run();
  fire('open');
  assert.equal(reloads(), 0);
});

test('reconnect (second open) reloads once', () => {
  const { fire, reloads } = run();
  fire('open');   // initial connect
  fire('error');  // server restarted, connection dropped
  fire('open');   // reconnected
  assert.equal(reloads(), 1);
});

test('explicit live:reload still reloads', () => {
  const { fire, reloads } = run();
  fire('live:reload');
  assert.equal(reloads(), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-live-client.test.mjs`
Expected: FAIL — "reconnect (second open) reloads once" fails (no `open` handling yet; `reloads()` is 0).

- [ ] **Step 3: Edit `src/live-client.js`**

Replace lines 4-6 (the IIFE opening + the two `var es` lines):

```javascript
(function () {
  var wasConnected = false;
  var es = new EventSource('/events');
  es.addEventListener('live:reload', function () { window.location.reload(); });
  es.addEventListener('open', function () {
    // A reconnect after a drop means the server restarted (e.g. pnpm dev) — reload to pick up new code.
    if (wasConnected) { window.location.reload(); }
    wasConnected = true;
  });
  es.addEventListener('error', function () { /* EventSource auto-reconnects; 'open' handles reload */ });
```

Leave the rest of the IIFE (the WebSocket signal code) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dev-live-client.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the existing live suite to confirm no regression**

Run: `node --test tests/live.test.mjs`
Expected: PASS (existing tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/live-client.js tests/dev-live-client.test.mjs
git commit -m "feat(live): reload on SSE reconnect after server restart"
```

---

### Task 7: Shipped touchpoint — preview client reload-on-reconnect

```yaml
independent: true
dependencies: []
scope:
  files: [src/preview.mjs, tests/preview.test.mjs]
```

**Files:**
- Modify: `src/preview.mjs` (inline SSE client, near line 788)
- Test: `tests/preview.test.mjs` (add one test)

- [ ] **Step 1: Write the failing test**

Append to `tests/preview.test.mjs` (it already imports `startPreviewServer`, `http`, `assert`, `test`, and the temp-dir helpers; reuse the same imports/style already present in that file):

```javascript
test('preview dir HTML includes reload-on-reconnect guard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-preview-reconnect-'));
  writeFileSync(join(dir, 'a.md'), '# A');
  const preview = await startPreviewServer(dir, { port: 0 });
  try {
    const res = await fetch(`${preview.url}/`);
    const html = await res.text();
    assert.match(html, /wasConnected/);
  } finally {
    await preview.close();
  }
});
```

> If `tests/preview.test.mjs` lacks `mkdtempSync`/`writeFileSync`/`tmpdir`/`join` imports, add them to its existing import lines (`node:fs`, `node:os`, `node:path`). Node 22 has global `fetch`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview.test.mjs`
Expected: FAIL — `html` does not match `/wasConnected/`.

- [ ] **Step 3: Edit the preview inline client in `src/preview.mjs`**

Find (near line 788):

```javascript
    const events = new EventSource('/events');
    events.addEventListener('preview:update', async () => {
```

Replace the `const events = new EventSource('/events');` line with:

```javascript
    let wasConnected = false;
    const events = new EventSource('/events');
    events.addEventListener('open', () => {
      // Reconnect after a drop ⇒ server restarted (pnpm dev). Reload to pick up new code.
      if (wasConnected) { window.location.reload(); }
      wasConnected = true;
    });
```

Leave the existing `preview:update` and `preview:error` listeners that follow unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/preview.test.mjs`
Expected: PASS (including the new test).

- [ ] **Step 5: Commit**

```bash
git add src/preview.mjs tests/preview.test.mjs
git commit -m "feat(preview): reload on SSE reconnect after server restart"
```

---

### Task 8: Mode A — server-mode helpers

```yaml
independent: true
dependencies: []
scope:
  files: [scripts/dev/server-mode.mjs, tests/dev-server-mode.test.mjs]
```

**Files:**
- Create: `scripts/dev/server-mode.mjs`
- Test: `tests/dev-server-mode.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-server-mode.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { childArgsFor, parsePreviewUrl } from '../scripts/dev/server-mode.mjs';

test('live child args use the foreground --__serve mode', () => {
  const args = childArgsFor('live', ['./screens', '--port', '4000']);
  assert.deepEqual(args, ['live', './screens', '--port', '4000', '--__serve']);
});

test('preview child args pass through unchanged', () => {
  const args = childArgsFor('preview', ['./screens']);
  assert.deepEqual(args, ['preview', './screens']);
});

test('parsePreviewUrl extracts the URL from the [isles] open line', () => {
  assert.equal(parsePreviewUrl('[isles] open http://localhost:51234/'), 'http://localhost:51234/');
  assert.equal(parsePreviewUrl('[isles] previewing /x'), null);
  assert.equal(parsePreviewUrl('random'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-server-mode.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
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
      child = spawnFn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        for (const line of chunk.split('\n')) {
          if (line.trim() && this.onLine) this.onLine(line.trim());
          else if (line.trim()) process.stdout.write(`${line}\n`);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dev-server-mode.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/server-mode.mjs tests/dev-server-mode.test.mjs
git commit -m "feat(dev): add Mode A server-process helpers"
```

---

### Task 9: Mode B — render-mode server + render child

```yaml
independent: true
dependencies: []
scope:
  files: [scripts/dev/render-mode.mjs, tests/dev-render-mode.test.mjs]
```

**Files:**
- Create: `scripts/dev/render-mode.mjs`
- Test: `tests/dev-render-mode.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/dev-render-mode.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderChildArgs, RELOAD_CLIENT, injectReloadClient } from '../scripts/dev/render-mode.mjs';

test('render child args force inline assets and an out file', () => {
  const args = renderChildArgs('demo.md', '/tmp/out.html', ['demo.md', '--mode', 'sanitized']);
  assert.deepEqual(args, ['render', 'demo.md', '--mode', 'sanitized', '--out', '/tmp/out.html', '--assets', 'inline']);
});

test('reload client subscribes to SSE and reloads', () => {
  assert.match(RELOAD_CLIENT, /EventSource\('\/events'\)/);
  assert.match(RELOAD_CLIENT, /location\.reload\(\)/);
});

test('injectReloadClient inserts the client before </body>', () => {
  const out = injectReloadClient('<html><body><h1>hi</h1></body></html>');
  assert.match(out, /<script>[\s\S]*EventSource[\s\S]*<\/script><\/body>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-render-mode.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/dev/render-mode.mjs
import { spawn as nodeSpawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../../bin/isles.mjs', import.meta.url));

export const RELOAD_CLIENT = `<script>
(function () {
  var es = new EventSource('/events');
  es.addEventListener('reload', function () { window.location.reload(); });
})();
</script>`;

// Mode B controls the rendered HTML, so inject our own reload client before </body>.
export function injectReloadClient(html) {
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx < 0) return `${html}${RELOAD_CLIENT}`;
  return `${html.slice(0, idx)}${RELOAD_CLIENT}${html.slice(idx)}`;
}

export function renderChildArgs(target, outFile, passthrough) {
  return ['render', ...passthrough, '--out', outFile, '--assets', 'inline'];
}

// Re-render via a fresh `isles render` process (always picks up current renderer/theme/component code).
export function renderOnce(target, outFile, passthrough, { spawnFn = nodeSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(process.execPath, [BIN, ...renderChildArgs(target, outFile, passthrough)], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`render exited with code ${code}`))));
  });
}

// Tiny static server: serves the latest rendered HTML at / and an SSE reload channel at /events.
export function startRenderServer(outFile, { port = 0 } = {}) {
  const clients = new Set();
  const server = createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 500\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    let html;
    try { html = injectReloadClient(readFileSync(outFile, 'utf8')); }
    catch { res.writeHead(503); res.end('rendering…'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const url = `http://localhost:${addr.port}/`;
      resolve({
        url,
        broadcastReload() { for (const res of clients) res.write('event: reload\ndata: {}\n\n'); },
        close() { for (const res of clients) res.end(); clients.clear(); return new Promise((r) => server.close(r)); },
      });
    });
  });
}
```

> Note: `injectReloadClient` reuses the same last-`</body>` strategy as the live-server fix, so a `</body>` literal inside an inlined bundle can't break it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dev-render-mode.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/render-mode.mjs tests/dev-render-mode.test.mjs
git commit -m "feat(dev): add Mode B render server + render-once"
```

---

### Task 10: Orchestration + integration

```yaml
dependencies: [T1, T2, T3, T4, T5, T8, T9]
scope:
  files: [scripts/dev.mjs, tests/dev-integration.test.mjs]
```

**Files:**
- Modify: `scripts/dev.mjs` (add `main()` + entry wiring; keep `parseDevArgs`)
- Test: `tests/dev-integration.test.mjs`

- [ ] **Step 1: Write the failing integration test**

```javascript
// tests/dev-integration.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEV = join(ROOT, 'scripts', 'dev.mjs');

async function waitFor(fn, timeoutMs = 8000, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const v = await fn(); if (v) return v; await sleep(stepMs); }
  return null;
}
function readInfo(dir) {
  const p = join(dir, 'state', 'server-info');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

test('dev live restarts the server and notifies the browser on src change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-dev-live-'));
  writeFileSync(join(dir, 'screen.md'), '# Hi');
  // --no-build avoids running rollup in tests; --no-open avoids launching a browser.
  const proc = spawn(process.execPath, [DEV, 'live', dir, '--no-build', '--no-open'], {
    cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    const info1 = await waitFor(() => readInfo(dir));
    assert.ok(info1 && info1.pid, 'first server started');

    // Subscribe to SSE so a reconnect/reload is observable.
    const reloads = [];
    const sse = http.get(`${info1.url}/events`, (res) => {
      res.setEncoding('utf8');
      res.on('data', (c) => { if (c.includes('live:reload') || c.includes('event:')) reloads.push(c); });
    });

    // Touch a renderer source file → supervisor should restart the child (new pid).
    const srcFile = join(ROOT, 'src', 'renderer', 'page.mjs');
    const now = new Date();
    utimesSync(srcFile, now, now);

    const restarted = await waitFor(() => {
      const info2 = readInfo(dir);
      return info2 && info2.pid && info2.pid !== info1.pid ? info2 : null;
    });
    sse.destroy();
    assert.ok(restarted, 'server restarted with a new pid after src change');
  } finally {
    proc.kill('SIGTERM');
    await sleep(300);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dev-integration.test.mjs`
Expected: FAIL — `scripts/dev.mjs` only parses argv; no server is started, so `readInfo` stays null and the assertion fails/times out.

- [ ] **Step 3: Wire orchestration into `scripts/dev.mjs`**

Replace the entry block at the bottom of `scripts/dev.mjs` (the `const isEntry = ...` block from Task 1) with the imports (add at top, below the existing constants) and a `main()`:

Add these imports at the very top of the file:

```javascript
import { watch } from 'node:fs';
import { mkdtempSync } from 'node:fs';
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
```

Replace the entry block with:

```javascript
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
  for (const root of roots) {
    try {
      const w = watch(root, { recursive: true }, (_evt, file) => {
        if (file) debounced(join(root, file));
      });
      w.on('error', () => {});
      watchers.push(w);
    } catch { /* path may not exist or be unwatchable; skip */ }
  }
  return () => { for (const w of watchers) { try { w.close(); } catch {} } };
}

async function runServerMode(opts) {
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

  const onBatch = async (paths) => {
    const decision = classifyChange(paths, PROJECT_ROOT);
    if (decision.ignored || !decision.restart) return;
    try {
      if (decision.rebuild) await runRollup(PROJECT_ROOT, { skip: !opts.build });
      console.log('[dev] source changed → restarting server');
      proc.kill();
      await new Promise((r) => setTimeout(r, 150));
      proc.spawn();
    } catch (error) {
      console.error(`[dev] rebuild failed, keeping last server: ${error.message}`);
    }
  };
  const stopWatching = startWatching(watchRoots(opts), onBatch);

  const shutdown = () => { stopWatching(); proc.kill(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function runRenderMode(opts) {
  const outDir = mkdtempSync(join(tmpdir(), 'isles-dev-render-'));
  const outFile = join(outDir, 'index.html');
  const rerender = async ({ rebuild } = {}) => {
    if (rebuild) await runRollup(PROJECT_ROOT, { skip: !opts.build });
    await renderOnce(opts.target, outFile, opts.passthrough);
  };
  await rerender({ rebuild: opts.build });
  const srv = await startRenderServer(outFile, { port: 0 });
  console.log(`[dev] ${srv.url}`);
  if (opts.open) openBrowser(srv.url);

  const onBatch = async (paths) => {
    const decision = classifyChange(paths, PROJECT_ROOT);
    const targetChanged = paths.some((p) => p === resolve(opts.target));
    if (decision.ignored && !targetChanged) return;
    try {
      await rerender({ rebuild: decision.rebuild });
      srv.broadcastReload();
    } catch (error) {
      console.error(`[dev] re-render failed: ${error.message}`);
    }
  };
  const stopWatching = startWatching(watchRoots(opts), onBatch);

  const shutdown = () => { stopWatching(); srv.close().finally(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
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
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `node --test tests/dev-integration.test.mjs`
Expected: PASS — a second `server-info` with a new pid appears after touching `src/renderer/page.mjs`.

- [ ] **Step 5: Smoke-test all three modes manually**

```bash
pnpm dev live examples 2>/dev/null & sleep 2; curl -s -o /dev/null -w "live %{http_code}\n" "$(node -e 'console.log(JSON.parse(require("fs").readFileSync("examples/state/server-info","utf8")).url)')/"; kill %1
pnpm dev render examples/demo.md --no-open & sleep 3; kill %1
```
Expected: `live 200`; render prints a `[dev] http://localhost:…/` URL.

- [ ] **Step 6: Run the full unit suite to confirm no regressions**

Run: `node --test tests/*.test.mjs`
Expected: PASS (all suites, including the new `dev-*` suites).

- [ ] **Step 7: Commit**

```bash
git add scripts/dev.mjs tests/dev-integration.test.mjs
git commit -m "feat(dev): wire supervisor orchestration (watch → classify → rebuild → restart)"
```

---

### Task 11: Document `pnpm dev` in the README

```yaml
independent: true
dependencies: [T10]
scope:
  files: [README.md]
```

**Files:**
- Modify: `README.md` (add a "Development" subsection)

- [ ] **Step 1: Add documentation**

Add this section to `README.md` (under an existing "Development"/"Contributing" heading, or create one near the end):

```markdown
## Development: `pnpm dev` (hot reload)

`pnpm dev` is a repo-only supervisor (not part of the published `isles` CLI). It runs a
serve command, watches `src/**`, rebuilds the component bundle, and hot-reloads the browser.

```bash
pnpm dev live <dir>          # foreground live server + reload on source change
pnpm dev preview <dir>       # directory preview + reload on source change
pnpm dev render <file.md>    # single-file preview server + reload on source change
```

Flags: `--no-open` (don't launch the browser), `--no-build` (skip the rollup rebuild step).
Editing component source (`src/components/**`) triggers a rollup rebuild; editing renderer/
theme/server source restarts the wrapped server; the browser reloads automatically via SSE.
```

- [ ] **Step 2: Verify the README renders**

Run: `node ./bin/isles.mjs render README.md --out /tmp/readme-check.html --assets inline`
Expected: `Rendered: …` with no error.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(dev): document pnpm dev hot-reload workflow"
```

---

## Self-Review

**1. Spec coverage**
- `pnpm dev <subcommand>` wrapper for live/preview/render → Tasks 1, 8, 9, 10. ✓
- Watch scope = markdown + packs + renderer/theme src → `watchRoots` (src + `--pack` dirs + target) and `classifyChange` → Tasks 2, 10. ✓
- Component vs renderer source handling (rebuild vs restart; render uses fresh process) → classify (T2), server-mode restart (T8/T10), render-once fresh process (T9). ✓
- Auto-open with `--no-open` → Tasks 1, 5, 10. ✓
- Repo-only / unpublished → `scripts/` is outside the `files` allowlist (verified); no `bin`-map change. ✓
- Shipped touchpoint = reload-on-reconnect in live + preview SSE clients → Tasks 6, 7. ✓
- `render` stays out of shipped code → Mode B injects its own client and shells the existing `render` (T9). ✓
- Error handling: bad subcommand exits 2 (T1); rollup failure keeps last server (T10 `onBatch` catch); watcher errors degrade (T10 `startWatching` try/catch). ✓
- Testing: classify, debounce, rebuild, opener, args, server-mode, render-mode, live-client, preview, integration → Tasks 2–10. ✓
- Deferred (rollup `--watch`; proxy alternative) → intentionally not implemented. ✓

**2. Placeholder scan** — no TBD/TODO; every code step contains complete code. ✓

**3. Type/name consistency** — `parseDevArgs` returns `{subcommand,target,passthrough,open,build}` (used identically in T1/T10); `classifyChange(paths, root) → {rebuild,restart,ignored}` (T2/T10); `createDebouncer(fn, ms, timers)` (T3/T10); `runRollup(root,{skip,spawnFn})` (T4/T10); `openBrowser(url,{platform,spawnFn})` (T5/T10); `createServerProcess`/`parsePreviewUrl`/`readLiveUrl` (T8/T10); `startRenderServer`/`renderOnce`/`renderChildArgs`/`injectReloadClient`/`RELOAD_CLIENT` (T9/T10). ✓

**4. Parallelism declarations** — T1–T9 each own distinct files and declare `independent: true` with non-overlapping `scope.files`; they can run in one wave. T10 depends on T1–T9 (shares `scripts/dev.mjs` with T1) and runs after. T11 depends on T10. No two independent tasks share a file. ✓
