# `isles preview` — Ephemeral Markdown Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use quirk:subagent-driven-development (recommended) or quirk:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `isles preview` CLI command that renders agent-supplied Markdown (from stdin or a file path) into a single self-contained HTML file in an OS temp directory and prints a `file://` URL, without persisting the source into the repo.

**Architecture:** Extract a file-free render core (`renderMarkdownString`) from the existing `renderMarkdownFile`, add a small `src/preview.mjs` orchestration module (inline render → temp write → prune → optional browser open), and wire a new `preview` command into `bin/isles.mjs`. Reuses the existing renderer end-to-end — no parallel pipeline.

**Tech Stack:** Node.js (ESM), `node:test`, `node:fs`/`node:os`/`node:child_process`/`node:url` built-ins only (no new dependencies). Unified/remark/rehype renderer already in place.

**Spec:** `docs/quirk/specs/2026-05-29-isles-preview-ephemeral-design.md`

---

## Prerequisite: base this work on inline asset mode (#103)

`isles preview` depends on inline single-file rendering (`assetMode: 'inline'`), which lives on branch `claude/renderer-support-inline-js` (issue #103) and is **not yet on `main`**. This plan's worktree branch (`claude/issue-102-isles-preview-spec`) is currently based on `main` and therefore does **not** have inline mode or the `escapeInlineScript`/`escapeInlineStyle`/fail-fast pack helpers.

Before starting Task 1, rebase this branch onto the inline-mode work so the inline code is present:

```bash
# From the worktree root: /Users/zpyoung/PycharmProjects/agent-isles-issue-102
git fetch origin
git rebase origin/claude/renderer-support-inline-js
# Verify inline mode is now present (must print a non-zero count):
grep -c "assetMode === 'inline'" src/render.mjs
```

Expected: the `grep` prints a number ≥ 1. If it prints `0`, inline mode is missing — stop and resolve the base branch before continuing. (If #103 has already merged to `main` by the time you run this, rebase onto `origin/main` instead.)

All file/line references below assume the post-#103 state of `src/render.mjs`.

---

### Task 1: Extract `renderMarkdownString` render core

```yaml
independent: false
dependencies: []
scope:
  files: [src/render.mjs, tests/render.test.mjs]
```

**Files:**
- Modify: `src/render.mjs` (add `renderMarkdownString`; rewrite `renderMarkdownFile` to call it — currently `src/render.mjs:395-429`)
- Test: `tests/render.test.mjs` (append new test)

**Why:** `previewMarkdown` (Task 2) must render a Markdown *string* (no input file) while still resolving packs against a project directory. Today that logic is locked inside `renderMarkdownFile`. Extracting it keeps a single render pipeline and leaves `renderMarkdownFile` behavior identical.

- [ ] **Step 1: Write the failing test**

Append to `tests/render.test.mjs`:

```javascript
test('renderMarkdownString renders a string to self-contained inline HTML without a source file', async () => {
  const { renderMarkdownString } = await import('../src/render.mjs');
  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-core-'));

  const { html, resolvedPacks, packAssetRecords, assetMode } = await renderMarkdownString(
    '# Hello\n\n<agent-decision verdict="go" title="Proceed">Ship it.</agent-decision>\n',
    { assetMode: 'inline', projectDir, includeUserPacks: false },
  );

  assert.equal(assetMode, 'inline');
  assert.ok(Array.isArray(resolvedPacks.packs));
  assert.ok(Array.isArray(packAssetRecords));
  // Rendered content survives.
  assert.match(html, /<h1>Hello<\/h1>/);
  assert.match(html, /<agent-decision verdict="go" title="Proceed">/);
  // Inline mode is self-contained: no external script/style references.
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.doesNotMatch(html, /href="https?:\/\//);
  assert.doesNotMatch(html, /src="\.\//);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern='renderMarkdownString renders a string' tests/render.test.mjs`
Expected: FAIL — `renderMarkdownString` is not exported (`undefined is not a function`).

- [ ] **Step 3: Add `renderMarkdownString` and rewrite `renderMarkdownFile`**

In `src/render.mjs`, **replace** the entire existing `renderMarkdownFile` function (`src/render.mjs:395-429`) with the following two functions:

```javascript
export async function renderMarkdownString(markdown, options = {}) {
  const assetMode = normalizeAssetMode(options.assetMode);
  const resolvedPacks = await resolvePackInputs({
    explicitPacks: options.explicitPacks || [],
    projectDir: options.projectDir ?? process.cwd(),
    includeUserPacks: options.includeUserPacks === true,
    userConfigDir: options.userConfigDir || null,
  });
  const packAssetRecords = buildPackAssetRecords(resolvedPacks.packs);
  const html = await renderMarkdown(markdown, {
    ...options,
    assetMode,
    resolvedPacks,
    packAssetRecords,
  });

  return { html, resolvedPacks, packAssetRecords, assetMode };
}

export async function renderMarkdownFile(inputPath, options = {}) {
  const filePath = validateMarkdownInput(inputPath);
  const markdown = readFileSync(filePath, 'utf8');
  const outFile = options.outFile ? resolve(options.outFile) : undefined;
  const { html, resolvedPacks, packAssetRecords, assetMode } = await renderMarkdownString(markdown, {
    ...options,
    sourcePath: filePath,
    projectDir: options.projectDir ?? dirname(filePath),
  });

  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);
    if (assetMode !== 'inline') {
      copyComponentBundle(dirname(outFile));
      if (assetMode === 'local') {
        copyLocalAssets(dirname(outFile));
      }
      copyPackAssets(dirname(outFile), packAssetRecords);
      writePackMetadata(dirname(outFile), packAssetRecords);
    }
  }

  return { html, outFile, resolvedPacks };
}
```

Note: `renderMarkdownFile`'s public return shape (`{ html, outFile, resolvedPacks }`) and pack-resolution semantics (`includeUserPacks === true`, `projectDir` defaulting to the file's directory) are unchanged.

- [ ] **Step 4: Run the new test and the full render suite to verify everything passes**

Run: `npm run build && node --test tests/render.test.mjs`
Expected: PASS — the new `renderMarkdownString` test passes and all pre-existing `render.test.mjs` tests still pass (no regression in `renderMarkdownFile`).

- [ ] **Step 5: Commit**

```bash
git add src/render.mjs tests/render.test.mjs
git commit -m "refactor: extract renderMarkdownString render core (#102)"
```

---

### Task 2: `src/preview.mjs` ephemeral orchestration module

```yaml
independent: false
dependencies: [T1]
scope:
  files: [src/preview.mjs, tests/preview.test.mjs]
```

**Files:**
- Create: `src/preview.mjs`
- Test: `tests/preview.test.mjs`

**Why:** This module owns the ephemeral lifecycle: render inline → ensure/prune the temp preview dir → write a uniquely-named HTML file → optionally open a browser → return the path and `file://` URL. The opener and target directory are injectable so tests never launch a real browser or pollute the real temp dir.

- [ ] **Step 1: Write the failing tests**

Create `tests/preview.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SIMPLE = '# Preview\n\n<agent-decision verdict="go" title="Go">Ship.</agent-decision>\n';

test('previewMarkdown renders inline HTML to a temp file and returns a file:// URL', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-test-'));

  const { outFile, fileUrl, opened } = await previewMarkdown({
    markdown: SIMPLE,
    includeUserPacks: false,
    dir,
  });

  assert.equal(opened, false);
  assert.ok(outFile.startsWith(dir), 'preview is written inside the target temp dir');
  assert.ok(existsSync(outFile), 'preview HTML file exists');
  assert.ok(fileUrl.startsWith('file://'), 'returns a file:// URL');
  assert.ok(fileUrl.endsWith('.html'));

  const html = (await import('node:fs')).readFileSync(outFile, 'utf8');
  assert.match(html, /<agent-decision verdict="go" title="Go">/);
  // Self-contained: no external or sibling-file asset references.
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.doesNotMatch(html, /src="\.\//);
});

test('previewMarkdown does not write the source markdown anywhere (non-persistence)', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-cwd-'));
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-out-'));

  await previewMarkdown({ markdown: SIMPLE, projectDir, includeUserPacks: false, dir });

  // The project directory is never touched — no source copy, no output.
  assert.deepEqual(readdirSync(projectDir), []);
});

test('previewMarkdown uses os.tmpdir()/agent-isles-preview by default', async () => {
  const { previewMarkdown, previewDir, PREVIEW_DIR_NAME } = await import('../src/preview.mjs');
  assert.equal(previewDir(), join(tmpdir(), PREVIEW_DIR_NAME));

  const { outFile } = await previewMarkdown({ markdown: SIMPLE, includeUserPacks: false });
  assert.ok(outFile.startsWith(join(tmpdir(), PREVIEW_DIR_NAME)));
});

test('previewMarkdown prunes stale files but keeps the fresh preview', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-prune-'));

  const stale = join(dir, 'isles-preview-stale.html');
  writeFileSync(stale, '<html></html>');
  const oldSeconds = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // 7 days ago
  utimesSync(stale, oldSeconds, oldSeconds);

  const { outFile } = await previewMarkdown({ markdown: SIMPLE, includeUserPacks: false, dir });

  assert.ok(!existsSync(stale), 'stale preview was pruned');
  assert.ok(existsSync(outFile), 'fresh preview survives');
});

test('previewMarkdown invokes the injected opener with the temp file when open is true', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-open-'));
  const calls = [];

  const { outFile, opened } = await previewMarkdown({
    markdown: SIMPLE,
    includeUserPacks: false,
    dir,
    open: true,
    opener: (target) => { calls.push(target); },
  });

  assert.equal(opened, true);
  assert.deepEqual(calls, [outFile]);
});

test('previewMarkdown reports opened=false when the opener throws but still returns the path', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-openfail-'));

  const { outFile, opened } = await previewMarkdown({
    markdown: SIMPLE,
    includeUserPacks: false,
    dir,
    open: true,
    opener: () => { throw new Error('no browser'); },
  });

  assert.equal(opened, false);
  assert.ok(existsSync(outFile));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/preview.test.mjs`
Expected: FAIL — `Cannot find module '../src/preview.mjs'`.

- [ ] **Step 3: Implement `src/preview.mjs`**

Create `src/preview.mjs`:

```javascript
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
    const child = spawn(override, [target], { stdio: 'ignore', detached: true });
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

  const unique = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const outFile = resolve(join(dir, `isles-preview-${unique}.html`));
  writeFileSync(outFile, html);

  const fileUrl = pathToFileURL(outFile).href;

  let opened = false;
  if (open) {
    try {
      opener(outFile);
      opened = true;
    } catch {
      opened = false;
    }
  }

  return { outFile, fileUrl, opened };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test tests/preview.test.mjs`
Expected: PASS — all six `previewMarkdown` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/preview.mjs tests/preview.test.mjs
git commit -m "feat: add ephemeral preview orchestration module (#102)"
```

---

### Task 3: Wire the `preview` command into the CLI

```yaml
independent: false
dependencies: [T2]
scope:
  files: [bin/isles.mjs, tests/preview-cli.test.mjs]
```

**Files:**
- Modify: `bin/isles.mjs` (add `preview` to dispatch + USAGE; add `parsePreviewArgs` and `runPreview`)
- Test: `tests/preview-cli.test.mjs`

**Why:** Exposes `previewMarkdown` as `isles preview`, reading Markdown from stdin or a file path, enforcing exactly-one input source, rejecting persistence/asset flags, and printing the `file://` URL.

- [ ] **Step 1: Write the failing tests**

Create `tests/preview-cli.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const islePath = fileURLToPath(new URL('../bin/isles.mjs', import.meta.url));
const SIMPLE = '# Preview\n\n<agent-decision verdict="go" title="Go">Ship.</agent-decision>\n';

function runPreview(args, { input, env } = {}) {
  return spawnSync(process.execPath, [islePath, 'preview', ...args], {
    cwd: process.cwd(),
    input,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

// Extract the printed absolute path (the line that is not the file:// URL).
function pathFromStdout(stdout) {
  const match = stdout.match(/^(\/.*\.html)$/m);
  return match ? match[1] : undefined;
}

test('isles preview --stdin renders inline HTML and prints a file:// URL', () => {
  const result = runPreview(['--stdin', '--no-user-packs'], { input: SIMPLE });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /file:\/\/\S+\.html/);

  const outPath = pathFromStdout(result.stdout);
  assert.ok(outPath && existsSync(outPath), 'printed path exists');
  assert.ok(outPath.startsWith(tmpdir()), 'preview lives under the OS temp dir');

  const html = readFileSync(outPath, 'utf8');
  assert.match(html, /<agent-decision verdict="go" title="Go">/);
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.doesNotMatch(html, /src="\.\//);
});

test('isles preview renders a Markdown file path without writing alongside the source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-file-'));
  const mdFile = join(dir, 'scratch.md');
  writeFileSync(mdFile, SIMPLE, 'utf8');

  const result = runPreview([mdFile, '--no-user-packs']);

  assert.equal(result.status, 0, result.stderr);
  const outPath = pathFromStdout(result.stdout);
  assert.ok(outPath && existsSync(outPath));
  assert.ok(!outPath.startsWith(dir), 'preview is not written next to the source file');
  // Source dir still contains only the source markdown.
  assert.deepEqual(readFileSync(mdFile, 'utf8'), SIMPLE);
});

test('isles preview --open invokes the configured opener and reports it', () => {
  // ISLES_PREVIEW_OPEN_CMD overrides the browser launch with a harmless command.
  const result = runPreview(['--stdin', '--no-user-packs', '--open'], {
    input: SIMPLE,
    env: { ISLES_PREVIEW_OPEN_CMD: process.execPath },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /opened/i);
});

test('isles preview rejects --assets (persistence/asset modes belong to render)', () => {
  const result = runPreview(['--stdin', '--assets', 'inline'], { input: SIMPLE });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /isles render/);
});

test('isles preview rejects --out', () => {
  const result = runPreview(['--stdin', '--out', 'x.html'], { input: SIMPLE });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /isles render/);
});

test('isles preview errors when both --stdin and a file path are given', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-preview-dual-'));
  const mdFile = join(dir, 'scratch.md');
  writeFileSync(mdFile, SIMPLE, 'utf8');

  const result = runPreview(['--stdin', mdFile], { input: SIMPLE });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /one input source/i);
});

test('isles preview errors when no input source is given', () => {
  const result = runPreview([], { input: '' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--stdin|input source/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/preview-cli.test.mjs`
Expected: FAIL — `isles preview` is an unknown command (exit 2 with "Unknown command: preview"), so the rendering/open assertions fail.

- [ ] **Step 3: Add the `preview` import, dispatch entry, and USAGE line**

In `bin/isles.mjs`, update the import from `../src/render.mjs` (`bin/isles.mjs:3-11`) to also pull in `validateMarkdownInput` (already imported) — no change needed there — and add a new import after the `watchMarkdownFile` import (`bin/isles.mjs:16`):

```javascript
import { previewMarkdown } from '../src/preview.mjs';
import { readFileSync as readFileSyncFd } from 'node:fs';
```

(`readFileSyncFd` is an alias used to read stdin via file descriptor `0`; `readFileSync` is already imported for files.)

In the `USAGE` template (`bin/isles.mjs:18-36`), add a usage line under the `watch` line and a command description. Replace the `Usage:` block's closing and `Commands:` block so they include `preview`:

Add after the `isles watch ...` usage line:

```
  isles preview (--stdin | <file.md>) [--open] [--mode trusted|sanitized] [--safe|--sanitize] [--show-source] [--pack <path>]... [--no-user-packs]
```

Add after the `watch` command description line:

```
  preview        Render ephemeral Markdown (stdin or a file) to a temp HTML file and print its file:// URL
```

In the command dispatch (`bin/isles.mjs:51-61`), add a branch before the final `else`:

```javascript
} else if (command === 'preview') {
  await runPreview(args);
```

- [ ] **Step 4: Add `parsePreviewArgs` and `runPreview`**

Append these two functions to the end of `bin/isles.mjs`:

```javascript
function parsePreviewArgs(args) {
  const parsed = {
    stdin: false,
    input: undefined,
    open: false,
    renderMode: RENDER_MODES.TRUSTED,
    showSource: false,
    explicitPacks: [],
    includeUserPacks: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--stdin') {
      parsed.stdin = true;
      continue;
    }

    if (arg === '--open') {
      parsed.open = true;
      continue;
    }

    if (arg === '--assets' || arg === '--out') {
      console.error(`${arg} is not supported by preview. Use "isles render" for persistent output and asset modes.`);
      process.exit(2);
    }

    if (arg === '--mode') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --mode. Use trusted or sanitized.');
        process.exit(2);
      }
      try {
        parsed.renderMode = normalizeRenderMode(value);
      } catch (error) {
        console.error(error.message);
        process.exit(2);
      }
      index += 1;
      continue;
    }

    if (arg === '--safe' || arg === '--sanitize') {
      parsed.renderMode = RENDER_MODES.SANITIZED;
      continue;
    }

    if (arg === '--show-source') {
      parsed.showSource = true;
      continue;
    }

    if (arg === '--pack') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --pack. Provide a pack directory path.');
        process.exit(2);
      }
      parsed.explicitPacks.push(value);
      index += 1;
      continue;
    }

    if (arg === '--no-user-packs') {
      parsed.includeUserPacks = false;
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(`Unknown preview option: ${arg}`);
      process.exit(2);
    }

    if (parsed.input) {
      console.error(`Unexpected extra argument: ${arg}`);
      process.exit(2);
    }

    parsed.input = arg;
  }

  return parsed;
}

async function runPreview(args) {
  const parsed = parsePreviewArgs(args);

  if (parsed.stdin && parsed.input) {
    console.error('Choose one input source: either --stdin or a Markdown file path, not both.\n');
    console.error(USAGE);
    process.exit(2);
  }

  if (!parsed.stdin && !parsed.input) {
    console.error('Missing input. Provide --stdin (pipe Markdown) or a Markdown file path.\n');
    console.error(USAGE);
    process.exit(2);
  }

  let markdown;
  let projectDir;
  try {
    if (parsed.stdin) {
      markdown = readFileSyncFd(0, 'utf8');
      projectDir = process.cwd();
    } else {
      const filePath = validateMarkdownInput(parsed.input);
      markdown = readFileSync(filePath, 'utf8');
      projectDir = dirname(resolve(filePath));
    }

    const { outFile, fileUrl, opened } = await previewMarkdown({
      markdown,
      projectDir,
      renderMode: parsed.renderMode,
      showSource: parsed.showSource,
      explicitPacks: parsed.explicitPacks,
      includeUserPacks: parsed.includeUserPacks,
      open: parsed.open,
    });

    console.log(fileUrl);
    console.log(outFile);
    if (parsed.open) {
      console.log(opened ? '[isles] opened in browser' : '[isles] could not open a browser; open the path above manually');
    }
  } catch (error) {
    if (error instanceof AgentIslesInputError) {
      console.error(error.message);
      process.exit(1);
    }

    if (error instanceof PackResolutionError || error.name === 'PackLoadError') {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}
```

- [ ] **Step 5: Run the preview CLI suite to verify it passes**

Run: `npm run build && node --test tests/preview-cli.test.mjs`
Expected: PASS — all seven `isles preview` CLI tests pass.

- [ ] **Step 6: Run the full unit suite for regressions**

Run: `node --test tests/*.test.mjs`
Expected: PASS — except the two pre-existing environmental failures in `tests/cli-packs.test.mjs` documented during the #103 work. If any *other* test fails, fix it before committing.

- [ ] **Step 7: Commit**

```bash
git add bin/isles.mjs tests/preview-cli.test.mjs
git commit -m "feat: add isles preview command for ephemeral previews (#102)"
```

---

### Task 4: Document the agent-facing preview workflow

```yaml
independent: false
dependencies: [T3]
scope:
  files: [README.md]
```

**Files:**
- Modify: `README.md` (add an "Ephemeral previews" section)

**Why:** Acceptance criteria require a README example showing piping Markdown into the ephemeral preview command, plus cleanup and security semantics.

- [ ] **Step 1: Find the insertion point**

Run: `grep -n "^## " README.md`
Expected: a list of section headings. Choose the heading immediately after the `render`/`watch` CLI usage section (e.g. after a "Watch mode" or "CLI" section) and insert the new section before the next top-level `##` heading. If a "Security" section exists, place this section just before it.

- [ ] **Step 2: Add the section**

Insert the following Markdown at the chosen point in `README.md`:

```markdown
## Ephemeral previews (`isles preview`)

Render agent-authored Markdown to a throwaway HTML preview without saving the source into your repo. Pipe Markdown over stdin and hand the printed `file://` URL to a browser tool:

```bash
printf '%s' "$markdown" | isles preview --stdin
# file:///var/folders/.../agent-isles-preview/isles-preview-1748540000000-ab12cd34.html
# /var/folders/.../agent-isles-preview/isles-preview-1748540000000-ab12cd34.html
```

Add `--open` to launch your default browser as well:

```bash
printf '%s' "$markdown" | isles preview --stdin --open
```

You can also point it at an already-temporary Markdown file. The file is only read — it is never written back or copied into the repo:

```bash
isles preview /tmp/scratch.md --open
```

`preview` accepts the same rendering flags as `render` (`--mode trusted|sanitized`, `--safe`/`--sanitize`, `--show-source`, `--pack <path>`, `--no-user-packs`). It does **not** accept `--assets` or `--out`: previews are always rendered as a single self-contained HTML file (inline assets, no sibling files). For persistent output or `cdn`/`local` asset modes, use `isles render`.

### Where previews go and how they're cleaned up

- Previews are written to `os.tmpdir()/agent-isles-preview/` (e.g. `/var/folders/...` on macOS, `/tmp/...` on Linux). They never land in your project, so `git status --short` stays clean.
- On each run, `preview` prunes files in that directory older than 24 hours, then writes the new one. The fresh preview is kept long enough for the browser to read it. Override the retention window with `ISLES_PREVIEW_TTL_MS` (milliseconds); set `ISLES_PREVIEW_TTL_MS=0` to prune everything but the current preview.
- Override the launch command for `--open` with `ISLES_PREVIEW_OPEN_CMD` (it is invoked as `<cmd> <file>`); by default `preview` uses `open` (macOS), `xdg-open` (Linux), or `start` (Windows).

### Security boundary

Ephemeral does **not** mean trusted. `preview` applies the same raw-HTML policy as `render`: `--mode trusted` (default) embeds raw HTML and the Agent Isles runtime; `--mode sanitized` strips unsafe markup. Inline runtime support means "the Agent Isles component runtime is embedded in the file," not "arbitrary author-supplied JavaScript is now allowed." Treat preview Markdown from untrusted sources with `--mode sanitized`, exactly as you would a file-based render.
```

- [ ] **Step 3: Verify the docs render and the example is accurate**

Run: `grep -n "isles preview --stdin" README.md`
Expected: matches the example lines just added. Visually confirm the fenced code blocks are balanced (the nested triple-backtick `bash` blocks must each open and close).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document isles preview ephemeral workflow (#102)"
```

---

### Task 5: Full verification pass

```yaml
independent: false
dependencies: [T4]
scope:
  files: []
```

**Files:** none (verification only)

**Why:** Confirm the acceptance criteria end-to-end: ephemeral render works, nothing persists, the normal file-based flow is intact, and the full suite is green.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: unit tests pass (except the two pre-existing `cli-packs.test.mjs` environmental failures) and the Playwright browser tests pass. No new failures attributable to preview.

- [ ] **Step 2: Smoke the ephemeral flow with an island and confirm non-persistence**

Run:

```bash
printf '# Smoke\n\n<agent-decision verdict="go" title="Go">Ship.</agent-decision>\n' | node ./bin/isles.mjs preview --stdin --no-user-packs
git status --short
```

Expected: a `file://...agent-isles-preview/...html` URL and absolute path are printed; opening that path in a browser shows the rendered island; `git status --short` shows no new tracked/untracked project files from the preview run (only any pre-existing untracked entries such as `.memsearch/`).

- [ ] **Step 3: Confirm the normal file-based render still works**

Run: `npm run render -- --out dist/demo.html --assets local`
Expected: `Rendered: .../dist/demo.html (trusted mode)` with no errors — the refactor in Task 1 did not regress `isles render`.

- [ ] **Step 4: Inspect a preview file for self-containment**

Run:

```bash
out=$(printf '# Self\n\ntext\n' | node ./bin/isles.mjs preview --stdin --no-user-packs | sed -n '2p')
grep -c 'src="https' "$out"; grep -c 'src="./' "$out"
```

Expected: both `grep -c` print `0` — the preview HTML references no external or sibling-file assets.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

If Steps 1–4 surfaced fixes, commit them:

```bash
git add -A
git commit -m "test: verify isles preview ephemeral flow end-to-end (#102)"
```

Otherwise, no commit is needed — the feature is complete.

---

## Self-Review notes

- **Spec coverage:** ephemeral input via stdin (T3) + file path (T3); inline single-file render (T1/T2); print `file://` path with optional `--open` (T2/T3); non-persistence (T2/T3/T5); temp location + 24h prune with `ISLES_PREVIEW_TTL_MS` override (T2/T4); `<agent-*>` islands work via reused renderer (T1/T2/T3 fixtures); tests for input path, non-persistence, and open/output behavior (T2/T3); README agent-facing example + cleanup + security (T4). All spec sections map to a task.
- **Dependency on #103:** captured as an explicit Prerequisite (rebase onto inline-mode branch) before Task 1.
- **Type consistency:** `renderMarkdownString` returns `{ html, resolvedPacks, packAssetRecords, assetMode }` (T1) and is consumed with exactly those fields in `renderMarkdownFile` (T1) and as `{ html }` in `previewMarkdown` (T2); `previewMarkdown` returns `{ outFile, fileUrl, opened }` consumed identically in `runPreview` (T3) and the tests (T2).
- **Parallelism:** the tasks form a strict chain (T1→T2→T3→T4→T5) because each builds on the previous module's exports; declared via `dependencies` with no overlapping `scope.files`, so no parallel waves are claimed where they don't exist.
- **No placeholders:** every code and test step contains complete, runnable content.
