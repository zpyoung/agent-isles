import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const demo = resolve('examples/demo.md');

test('renderMarkdown converts a Mermaid fence into a client-renderable diagram block', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const markdown = `# Mermaid Test

\`\`\`mermaid
graph TD
  A[Markdown] --> B[Agent Isles]
  B --> C[Browser-ready HTML]
\`\`\`
`;

  const html = await renderMarkdown(markdown);

  assert.match(html, /<figure class="agent-mermaid" data-agent-mermaid(?:="")?>/);
  assert.match(html, /<pre class="mermaid" data-agent-mermaid-source(?:="")?>/);
  assert.match(html, /graph TD/);
  assert.match(html, /A\[Markdown\] --> B\[Agent Isles\]/);
  assert.match(html, /Mermaid render failed/);
  assert.match(html, /mermaid\.initialize/);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@11\/dist\/mermaid\.min\.js/);
  assert.doesNotMatch(html, /```mermaid/);
});

test('Mermaid diagrams preserve non-Mermaid code fences', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const markdown = `# Mermaid and Code

\`\`\`mermaid
sequenceDiagram
  participant A
  participant B
  A->>B: ping
\`\`\`

\`\`\`javascript
const answer = 42;
\`\`\`
`;

  const html = await renderMarkdown(markdown);

  assert.match(html, /<figure class="agent-mermaid" data-agent-mermaid(?:="")?>/);
  assert.match(html, /sequenceDiagram/);
  assert.match(html, /<code class="[^"]*language-javascript[^"]*">/);
  assert.match(html, /hljs-keyword/);
  assert.match(html, /answer/);
});

test('Mermaid diagrams work with sanitized mode', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const markdown = `# Safe Mermaid

\`\`\`mermaid
graph LR
  user --> server
  server --> database
\`\`\`
`;

  const html = await renderMarkdown(markdown, { renderMode: 'sanitized' });

  assert.match(html, /<figure class="agent-mermaid" data-agent-mermaid(?:="")?>/);
  assert.match(html, /<pre class="mermaid" data-agent-mermaid-source(?:="")?>/);
  assert.match(html, /graph LR/);
  assert.match(html, /user --> server/);
  assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@11\/dist\/mermaid\.min\.js"><\/script>/);
});

test('local asset mode copies Mermaid runtime only when diagrams are present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-mermaid-local-'));
  const inputFile = join(dir, 'diagram.md');
  const outFile = join(dir, 'diagram.html');
  writeFileSync(inputFile, '# Diagram\n\n```mermaid\ngraph TD\n  A --> B\n```\n');

  execFileSync(
    process.execPath,
    [resolve('bin/isles.mjs'), 'render', inputFile, '--assets', 'local', '--out', outFile, '--no-user-packs'],
    { encoding: 'utf8' },
  );
  const html = readFileSync(outFile, 'utf8');

  assert.match(html, /<script src="\.\/assets\/mermaid\.min\.js"><\/script>/);
  assert.ok(existsSync(join(dir, 'assets', 'mermaid.min.js')));
});

test('inline asset mode embeds Mermaid runtime only when diagrams are present', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown('# Inline Mermaid\n\n```mermaid\ngraph TD\n  A --> B\n```\n', { assetMode: 'inline' });

  assert.match(html, /\/\* Mermaid runtime \*\//);
  assert.match(html, /\/\* Agent Isles Mermaid renderer \*\//);
  assert.doesNotMatch(html, /<script[^>]*src="[^"]*mermaid/i);
  assert.doesNotMatch(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid/i);
});

test('renderMarkdown omits Mermaid runtime when no Mermaid fence is present', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown('# No diagrams\n\n```text\nmermaid is just text here\n```\n');

  assert.doesNotMatch(html, /data-agent-mermaid/);
  assert.doesNotMatch(html, /mermaid\.min\.js/);
  assert.doesNotMatch(html, /Agent Isles Mermaid renderer/);
});

test('demo includes a Mermaid diagram fixture', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<h3>Mermaid diagram fences<\/h3>/);
  assert.match(html, /<figure class="agent-mermaid" data-agent-mermaid(?:="")?>/);
  assert.match(html, /markdown\[Markdown source\] --> renderer\[Agent Isles renderer\]/);
});
