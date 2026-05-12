import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const fixture = resolve('tests/fixtures/simple.md');

test('renderMarkdownFile renders Markdown with preserved agent islands and injected assets', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(fixture);

  assert.match(html, /<h1>Demo Island<\/h1>/);
  assert.match(html, /<agent-decision verdict="go" title="Proceed">/);
  assert.match(html, /Ship the first renderer slice\./);
  assert.match(html, /bootstrap@5\.3\.3/);
  assert.match(html, /agent-components\.js/);
  assert.match(html, /Agent Isles theme/);
});

test('isles render writes a complete HTML file and component bundle to --out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-'));
  const outFile = join(dir, 'nested', 'simple.html');

  const stdout = execFileSync(process.execPath, ['bin/isles.mjs', 'render', fixture, '--out', outFile], {
    encoding: 'utf8',
  });
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Rendered:/);
  assert.match(stdout, new RegExp(outFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /<h1>Demo Island<\/h1>/);
  assert.match(html, /<script type="module" src="\.\/agent-components\.js"><\/script>/);
  assert.ok(existsSync(join(dir, 'nested', 'agent-components.js')));
});

test('isles render uses a deterministic dist output path by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-'));
  const outFile = join(dir, 'dist', 'simple.html');

  const stdout = execFileSync(process.execPath, [resolve('bin/isles.mjs'), 'render', fixture], {
    cwd: dir,
    encoding: 'utf8',
  });
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Rendered:/);
  assert.match(stdout, new RegExp(outFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /<h1>Demo Island<\/h1>/);
  assert.ok(existsSync(join(dir, 'dist', 'agent-components.js')));
});

test('renderMarkdownFile rejects missing inputs with a friendly error', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const missingFile = resolve('tests/fixtures/missing.md');

  await assert.rejects(
    () => renderMarkdownFile(missingFile),
    (error) => {
      assert.equal(error.code, 'ERR_AGENT_ISLES_INPUT_NOT_FOUND');
      assert.match(error.message, /Input file not found:/);
      assert.match(error.message, /tests\/fixtures\/missing\.md/);
      return true;
    },
  );
});

test('isles render rejects non-Markdown inputs before rendering', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-'));
  const txtFile = join(dir, 'notes.txt');
  writeFileSync(txtFile, '# Not Markdown');

  const result = spawnSync(process.execPath, [resolve('bin/isles.mjs'), 'render', txtFile], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported input file extension:/);
  assert.match(result.stderr, /Expected a Markdown file ending in \.md or \.markdown\./);
  assert.equal(result.stdout, '');
});
