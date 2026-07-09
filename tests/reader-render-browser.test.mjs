import assert from 'node:assert/strict';
import test from 'node:test';
import { renderReaderMarkdown } from '../src/reader/render-browser.mjs';

test('renderReaderMarkdown renders Markdown to HTML with a heading TOC', async () => {
  const { html, toc } = await renderReaderMarkdown('# Title\n\n## Section\n\nHello **world**.');
  assert.match(html, /<h1[^>]*>/);
  assert.match(html, /<strong>world<\/strong>/);
  assert.deepEqual(
    toc.map((h) => ({ text: h.text, level: h.level })),
    [{ text: 'Title', level: 1 }, { text: 'Section', level: 2 }],
  );
  assert.ok(toc.every((h) => typeof h.id === 'string' && h.id.length > 0));
});

test('renderReaderMarkdown preserves raw HTML islands (trusted mode)', async () => {
  const md = '# Doc\n\n<agent-decision verdict="go" title="Ship">Body</agent-decision>\n';
  const { html } = await renderReaderMarkdown(md);
  assert.match(html, /<agent-decision[^>]*verdict="go"/);
  assert.match(html, /Ship/);
});

// Regression: reader pack loading (docs/plans/reader-pack-loading.md) relies on
// unknown pack custom elements reaching the DOM so the injected pack module can
// upgrade them. Pin that the client render pipeline passes them through with
// attributes intact. If an allowlist is ever added, it must admit loaded-pack tags.
test('renderReaderMarkdown passes an unknown pack custom element through with attributes intact', async () => {
  const md = '# Doc\n\n<quirk-free-text label="Topic" submit-label="Start"></quirk-free-text>\n';
  const { html } = await renderReaderMarkdown(md);
  assert.match(html, /<quirk-free-text[^>]*label="Topic"/);
  assert.match(html, /submit-label="Start"/);
});

test('renderReaderMarkdown transforms island fenced blocks', async () => {
  const md = [
    '```mermaid',
    'graph TD; A-->B;',
    '```',
    '',
    '```agent-flow',
    'kind: flowchart',
    '---',
    '{"kind":"flowchart","nodes":[]}',
    '```',
  ].join('\n');
  const { html } = await renderReaderMarkdown(md);
  assert.match(html, /class="mermaid"/);
  assert.match(html, /<agent-flow/);
});

test('renderReaderMarkdown highlights ordinary code fences', async () => {
  const { html } = await renderReaderMarkdown('```js\nconst x = 1;\n```');
  assert.match(html, /class="[^"]*hljs/);
});

test('renderReaderMarkdown leaves d2 blocks as plain code (no server render)', async () => {
  const { html } = await renderReaderMarkdown('```d2\na -> b\n```');
  // D2 is Node-only; client-side it degrades to a highlighted code block, not a figure.
  assert.doesNotMatch(html, /<figure[^>]*class="[^"]*d2/);
  assert.match(html, /language-d2|<code/);
});
