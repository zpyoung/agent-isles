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
