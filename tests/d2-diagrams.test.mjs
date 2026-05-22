import assert from 'node:assert/strict';
import test from 'node:test';

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

  // JavaScript code should be syntax highlighted
  assert.match(html, /<code class="language-javascript">/);
  assert.match(html, /function/);
  assert.match(html, /hello/);
});
