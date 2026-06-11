// tests/agent-table.test.mjs — follows tests/agent-flow.test.mjs conventions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { mock } from 'node:test';

const FENCED = '\n```agent-table\ntitle: Launch readiness\ncolumns: task:text | status:status | effort:number | spec:url\nsort: effort desc\n---\n| Task | Status | Effort | Spec |\n| - | - | - | - |\n| Writeback API | at-risk | 5 | javascript:alert(1) |\n| Renderer slice | done | 3 | https://github.com/x/pull/138 |\n```\n';

test('agent-table fenced blocks render to a semantic table island', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(`# Plan\n${FENCED}`);
  assert.match(html, /<agent-table[^>]*title="Launch readiness"/);
  assert.match(html, /<caption>Launch readiness<\/caption>/);
  assert.match(html, /<th scope="col"[^>]*data-key="effort"[^>]*data-type="number"/);
  assert.match(html, /data-row-id="t1-r1"/);
  assert.doesNotMatch(html, /<code class="hljs language-agent-table">/);
  assert.doesNotMatch(html, /<button/);
});

test('url protocol allowlist is enforced in TRUSTED mode (transform-level, not sanitize)', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(FENCED); // default mode is trusted — sanitize never runs
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /javascript:alert\(1\)/);          // inert text survives
  assert.match(html, /href="https:\/\/github.com\/x\/pull\/138"/);
});

test('multiple tables get unique server-emitted row-id prefixes', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(`${FENCED}\n${FENCED}`);
  assert.match(html, /data-row-id="t1-r1"/);
  assert.match(html, /data-row-id="t2-r1"/);
});

test('malformed block falls back to a plain code fence and warns (never crashes)', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const warn = mock.method(console, 'warn', () => {});
  try {
    const html = await renderMarkdown('```agent-table\ncolumns: a:text\n| no delimiter |\n```\n');
    assert.match(html, /language-agent-table/);          // left as a code fence
    assert.doesNotMatch(html, /<agent-table/);
    assert.equal(warn.mock.calls.length >= 1, true);
    assert.match(String(warn.mock.calls[0].arguments[0]), /\[agent-isles\] agent-table/);
  } finally {
    warn.mock.restore();
  }
});

test('sanitized mode preserves the agent-table subtree, caption, host attrs, and data-row-id', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const grouped = FENCED.replace('sort: effort desc', 'sort: effort desc\ngroup-by: status\ndensity: compact');
  const html = await renderMarkdown(grouped, { renderMode: 'sanitized' });
  assert.match(html, /<agent-table[^>]*group-by="status"/);
  assert.match(html, /density="compact"/);
  assert.match(html, /<caption>Launch readiness<\/caption>/);     // caption allowlisted
  assert.match(html, /<table>[\s\S]*<thead>[\s\S]*<tbody>/);
  assert.match(html, /data-row-id="t1-r1"/);                       // NOT user-content- clobbered
  assert.doesNotMatch(html, /user-content-/);
  assert.match(html, /data-sortval/);
});

test('sanitized mode still suppresses disallowed url protocols and strips active HTML', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const html = await renderMarkdown(FENCED, { renderMode: 'sanitized' });
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<button/);                            // buttons are JS-injected only
});

test('fence position is copied onto <agent-table> and survives rehype-raw (writeback-readiness)', async () => {
  const { unified } = await import('unified');
  const remarkParse = (await import('remark-parse')).default;
  const remarkGfm = (await import('remark-gfm')).default;
  const remarkRehype = (await import('remark-rehype')).default;
  const rehypeRaw = (await import('rehype-raw')).default;
  const { rehypeAgentTable } = await import('../src/renderer/rehype-plugins.mjs');

  let position = null;
  const capture = () => (tree) => {
    (function find(n) {
      if (n.tagName === 'agent-table') position = n.position;
      (n.children || []).forEach(find);
    })(tree);
  };
  const md = `before\n\n${FENCED}`;
  const processor = unified().use(remarkParse).use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeAgentTable).use(rehypeRaw).use(capture);
  await processor.run(processor.parse(md));
  assert.ok(position?.start?.offset >= 0 && position?.end?.offset > position.start.offset);
});

test('agent-table component enhances in light DOM and injects controls at runtime only', () => {
  const source = readFileSync(resolve('src/components/agent-table.js'), 'utf8');
  assert.match(source, /createRenderRoot\(\)\s*{\s*return this;?\s*}/);  // light DOM, deliberate divergence
  assert.match(source, /aria-sort/);
  assert.match(source, /aria-expanded/);
  assert.doesNotMatch(source, /<details/);                 // group-by must NOT use details/summary
  assert.match(source, /tbody/i);                          // multi-tbody lanes
  assert.match(source, /data-sortval/);
});

test('component bundle registers agent-table; theme-toggle propagation list is untouched', () => {
  const bundle = readFileSync(resolve('dist/agent-components.js'), 'utf8');
  assert.match(bundle, /customElements\.define\(["']agent-table["']/);
  const toggle = readFileSync(resolve('src/components/agent-theme-toggle.js'), 'utf8');
  assert.doesNotMatch(toggle, /'agent-table'/);            // light DOM inherits the document theme
});
