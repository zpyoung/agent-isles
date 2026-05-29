import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { Readable } from 'node:stream';

const cli = resolve('bin/isles.mjs');

test('isles preview renders Markdown from stdin to temp HTML', () => {
  const markdown = `# Ephemeral Preview Test

This is a test of the ephemeral preview feature.

<agent-decision verdict="go" title="Preview">
  The preview command should render without persisting source.
</agent-decision>
`;

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `Expected success but got: ${result.stderr}`);
  assert.match(result.stdout, /Preview:/);
  assert.match(result.stdout, /agent-isles-preview-/);
  assert.match(result.stdout, /preview\.html/);

  // Extract the temp file path from stdout
  const match = result.stdout.match(/Preview: (.+preview\.html)/);
  assert.ok(match, 'Expected to find preview file path in output');
  const previewFile = match[1];

  // Verify the HTML file exists
  assert.ok(existsSync(previewFile), `Expected preview file to exist: ${previewFile}`);

  // Verify the HTML content
  const html = readFileSync(previewFile, 'utf8');
  assert.match(html, /<h1>Ephemeral Preview Test<\/h1>/);
  assert.match(html, /<agent-decision verdict="go" title="Preview">/);
  assert.match(html, /The preview command should render without persisting source\./);
  assert.match(html, /agent-components\.js/);
  assert.match(html, /bootstrap@5\.3\.3/);
});

test('isles preview accepts --mode sanitized', () => {
  const markdown = `# Safe Preview

<div onclick="bad()">Safe text</div>
<script>alert('owned')</script>
`;

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin', '--mode', 'sanitized'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const match = result.stdout.match(/Preview: (.+preview\.html)/);
  const previewFile = match[1];
  const html = readFileSync(previewFile, 'utf8');

  assert.match(html, /<div>Safe text<\/div>/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script>/i);
});

test('isles preview accepts --safe alias', () => {
  const markdown = `# Safe Preview

<div onclick="bad()">Text</div>
`;

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin', '--safe'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const match = result.stdout.match(/Preview: (.+preview\.html)/);
  const previewFile = match[1];
  const html = readFileSync(previewFile, 'utf8');

  assert.doesNotMatch(html, /onclick=/i);
});

test('isles preview uses CDN assets by default', () => {
  const markdown = '# CDN Test';

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const match = result.stdout.match(/Preview: (.+preview\.html)/);
  const previewFile = match[1];
  const html = readFileSync(previewFile, 'utf8');

  assert.match(html, /https:\/\/cdn\.jsdelivr\.net/);
  assert.match(html, /bootstrap@5\.3\.3/);
});

test('isles preview --open reports browser opening intent', () => {
  const markdown = '# Open Test';

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin', '--open'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Preview:/);
  assert.match(result.stdout, /Opening in browser/);
});

test('isles preview creates temp files in OS temp directory', () => {
  const markdown = '# Temp Location Test';

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const match = result.stdout.match(/Preview: (.+preview\.html)/);
  const previewFile = match[1];

  // Verify it's in the OS temp directory
  const osTmpDir = tmpdir();
  assert.ok(
    previewFile.startsWith(osTmpDir),
    `Expected preview file to be in ${osTmpDir}, but got ${previewFile}`,
  );

  // Verify the temp directory follows naming convention
  assert.match(previewFile, /agent-isles-preview-/);
});

test('isles preview copies component bundle to temp directory', () => {
  const markdown = '# Component Bundle Test';

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const match = result.stdout.match(/Preview: (.+preview\.html)/);
  const previewFile = match[1];
  const previewDir = resolve(previewFile, '..');

  // Verify component bundle exists in temp dir
  const componentBundle = resolve(previewDir, 'agent-components.js');
  assert.ok(existsSync(componentBundle), `Expected component bundle at ${componentBundle}`);
});

test('isles preview rejects empty stdin', () => {
  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin'], {
    input: '',
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No Markdown content received/i);
});

test('isles preview does not persist source Markdown to temp directory', () => {
  const markdown = `# Source Persistence Test

This Markdown should NOT be saved to the filesystem.
`;

  const result = spawnSync(process.execPath, [cli, 'preview', '--stdin'], {
    input: markdown,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const match = result.stdout.match(/Preview: (.+preview\.html)/);
  const previewFile = match[1];
  const previewDir = resolve(previewFile, '..');

  // List all files in temp directory
  const files = readdirSync(previewDir);

  // Verify no .md or .markdown files exist
  const markdownFiles = files.filter((file) => file.endsWith('.md') || file.endsWith('.markdown'));
  assert.equal(
    markdownFiles.length,
    0,
    `Expected no Markdown files in temp directory, but found: ${markdownFiles.join(', ')}`,
  );

  // Verify only expected files exist (preview.html and agent-components.js)
  assert.ok(files.includes('preview.html'));
  assert.ok(files.includes('agent-components.js'));
});

test('previewMarkdown API accepts custom stdin stream', async () => {
  const { previewMarkdown } = await import('../src/preview.mjs');
  const markdown = '# Custom Stream Test\n\nTest content.';

  // Create a readable stream from the markdown string
  const stdin = Readable.from([markdown]);

  const result = await previewMarkdown({
    stdin,
    renderMode: 'trusted',
    assetMode: 'cdn',
    open: false,
  });

  assert.ok(existsSync(result.outFile));
  const html = readFileSync(result.outFile, 'utf8');
  assert.match(html, /<h1>Custom Stream Test<\/h1>/);
  assert.match(html, /Test content\./);
});
