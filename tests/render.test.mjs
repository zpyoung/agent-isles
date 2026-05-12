import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
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

test('isles render writes a complete HTML file to --out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-'));
  const outFile = join(dir, 'simple.html');

  const stdout = execFileSync(process.execPath, ['bin/isles.mjs', 'render', fixture, '--out', outFile], {
    encoding: 'utf8',
  });
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Rendered:/);
  assert.match(stdout, new RegExp(outFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /<h1>Demo Island<\/h1>/);
  assert.match(html, /<script type="module" src="\.\/agent-components\.js"><\/script>/);
});
