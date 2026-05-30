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
  // Preview paths are absolute POSIX temp paths on macOS/Linux (this suite's CI targets).
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
  assert.deepEqual(readFileSync(mdFile, 'utf8'), SIMPLE);
});

test('isles preview --open invokes the configured opener and reports it', () => {
  // process.execPath is a harmless opener stub: it launches, fails to run the .html, and is unref'd/detached so its async exit is never observed.
  const result = runPreview(['--stdin', '--no-user-packs', '--open'], {
    input: SIMPLE,
    env: { ISLES_PREVIEW_OPEN_CMD: process.execPath },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /opening in browser/i);
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
