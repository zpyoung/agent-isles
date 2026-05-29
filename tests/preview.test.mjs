import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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

  const html = readFileSync(outFile, 'utf8');
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

  let created;
  try {
    const { outFile } = await previewMarkdown({ markdown: SIMPLE, includeUserPacks: false });
    created = outFile;
    assert.ok(outFile.startsWith(join(tmpdir(), PREVIEW_DIR_NAME)));
  } finally {
    if (created) rmSync(created, { force: true });
  }
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
