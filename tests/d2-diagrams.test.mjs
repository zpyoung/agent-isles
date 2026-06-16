import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function makeD2Stub() {
  const dir = mkdtempSync(join(tmpdir(), 'isles-d2-stub-'));
  const countFile = join(dir, 'invocations.log');
  const script = [
    '#!/bin/sh',
    'cat > /dev/null',
    `printf 'invoked\\n' >> "${countFile}"`,
    `printf '<?xml version="1.0" encoding="utf-8"?>\\n<svg xmlns="http://www.w3.org/2000/svg"><!-- STUB-NATIVE-D2 --><text>stub</text></svg>'`,
    '',
  ].join('\n');
  writeFileSync(join(dir, 'd2'), script);
  chmodSync(join(dir, 'd2'), 0o755);
  return { dir, countFile };
}

function countStubInvocations(countFile) {
  return readFileSync(countFile, 'utf8').trim().split('\n').length;
}

test('renderMarkdown converts a D2 fence into an SVG diagram', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const markdown = `# D2 Test

Basic D2 diagram:

\`\`\`d2
x -> y: hello world
\`\`\`
`;

  const html = await renderMarkdown(markdown);

  // Check that the D2 fence was converted to SVG
  assert.match(html, /<figure class="beoe d2">/);
  assert.match(html, /<svg[^>]*>/);
  assert.match(html, /<text[^>]*>x<\/text>/);
  assert.match(html, /<text[^>]*>y<\/text>/);
  assert.match(html, /<text[^>]*>hello world<\/text>/);
  // Ensure the original code fence is gone
  assert.doesNotMatch(html, /```d2/);
});

test('D2 rendering works with sanitized mode', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const markdown = `# Safe D2

\`\`\`d2
user -> server: request
server -> database: query
\`\`\`
`;

  const html = await renderMarkdown(markdown, { renderMode: 'sanitized' });

  // Check that SVG elements are preserved in sanitized mode
  assert.match(html, /<figure class="beoe d2">/);
  assert.match(html, /<svg[^>]*>/);
  assert.match(html, /<text[^>]*>user<\/text>/);
  assert.match(html, /<text[^>]*>server<\/text>/);
  assert.match(html, /<text[^>]*>database<\/text>/);
});

test('D2 diagrams coexist with syntax-highlighted code blocks', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const markdown = `# D2 and Code

D2 diagram:

\`\`\`d2
service -> api: call
\`\`\`

JavaScript code:

\`\`\`javascript
function hello() {
  return "world";
}
\`\`\`
`;

  const html = await renderMarkdown(markdown);

  // D2 diagram should be rendered as SVG
  assert.match(html, /<figure class="beoe d2">/);
  assert.match(html, /<text[^>]*>service<\/text>/);

  // JavaScript code should be syntax highlighted.
  assert.match(html, /<code class="[^"]*language-javascript[^"]*">/);
  assert.match(html, /hljs-keyword/);
  assert.match(html, /function/);
  assert.match(html, /hello/);
});

test('prefers a native d2 binary on PATH over the WASM engine', async (t) => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const stub = makeD2Stub();
  const originalPath = process.env.PATH;
  process.env.PATH = `${stub.dir}:${originalPath}`;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(stub.dir, { recursive: true, force: true });
  });

  const html = await renderMarkdown('```d2\nstub_native_case -> works\n```\n');

  assert.match(html, /STUB-NATIVE-D2/);
  assert.doesNotMatch(html, /<\?xml/);
  assert.strictEqual(countStubInvocations(stub.countFile), 1);
});

test('caches rendered SVG for identical d2 source within a process', async (t) => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const stub = makeD2Stub();
  const originalPath = process.env.PATH;
  process.env.PATH = `${stub.dir}:${originalPath}`;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(stub.dir, { recursive: true, force: true });
  });

  const markdown = '```d2\ncached_case -> hit\n```\n';
  const first = await renderMarkdown(markdown);
  const second = await renderMarkdown(markdown);

  assert.match(first, /STUB-NATIVE-D2/);
  assert.match(second, /STUB-NATIVE-D2/);
  assert.strictEqual(countStubInvocations(stub.countFile), 1);
});

test('falls back to the WASM engine when no d2 binary is on PATH', async (t) => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const emptyDir = mkdtempSync(join(tmpdir(), 'isles-d2-nopath-'));
  const originalPath = process.env.PATH;
  process.env.PATH = emptyDir;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(emptyDir, { recursive: true, force: true });
  });

  const html = await renderMarkdown('```d2\nwasm_fallback_case -> engine\n```\n');

  assert.match(html, /<figure class="beoe d2">/);
  assert.match(html, /<text[^>]*>wasm_fallback_case<\/text>/);
});

test('invalid D2 input reports a clear render diagnostic', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const markdown = `# Bad D2

\`\`\`d2
x ->
\`\`\`
`;

  await assert.rejects(
    renderMarkdown(markdown),
    /D2 diagram render failed at line \d+, column \d+:/,
  );
});
