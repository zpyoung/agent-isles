import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const componentBundle = resolve('dist/agent-components.js');
const agentFlowSource = resolve('src/components/agent-flow.js');
const demo = resolve('examples/demo.md');

function assertCustomElementDefinition(bundle, tagName) {
  assert.match(bundle, new RegExp(`customElements\\.define\\(["']${tagName}["']`));
}

test('agent-flow fenced blocks render to JSON-first flow islands', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
# Architecture

\`\`\`agent-flow
kind: c4
title: Agent Isles Architecture
mode: editor
---
{
  "version": "0.1",
  "kind": "c4",
  "nodes": {
    "user": { "id": "user", "type": "person", "label": "Developer" },
    "system": { "id": "system", "type": "softwareSystem", "label": "Agent Isles" }
  },
  "edges": {
    "authors": { "id": "authors", "source": "user", "target": "system", "label": "Authors Markdown" }
  },
  "views": {
    "context": { "id": "context", "title": "System Context", "nodeIds": ["user", "system"] }
  }
}
\`\`\`
`);

  assert.match(html, /<agent-flow kind="c4" title="Agent Isles Architecture" mode="editor">/);
  assert.match(html, /"type": "person"/);
  assert.match(html, /"source": "user"/);
  assert.doesNotMatch(html, /<code class="hljs language-agent-flow">/);
});

test('agent-flow fenced block enums are normalized from headers and JSON kind inference', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const headerHtml = await renderMarkdown(`
\`\`\`agent-flow
kind: C4
title: Mixed Case Header
mode: Editor
---
{"version":"0.1","kind":"flowchart","nodes":{},"edges":{},"views":{}}
\`\`\`
`);
  assert.match(headerHtml, /<agent-flow kind="c4" title="Mixed Case Header" mode="editor">/);

  const inferredHtml = await renderMarkdown(`
\`\`\`agent-flow
{"version":"0.1","kind":"C4","nodes":{},"edges":{},"views":{}}
\`\`\`
`);
  assert.match(inferredHtml, /<agent-flow kind="c4" mode="viewer">/);
});

test('agent-flow source includes accessible SVG node interactions', () => {
  const source = readFileSync(agentFlowSource, 'utf8');

  assert.match(source, /aria-labelledby/);
  assert.match(source, /selectNodeFromKeyboard/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.doesNotMatch(source, /role="img"/);
});

test('sanitized render mode preserves safe agent-flow attributes and drops active HTML', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
<agent-flow kind="c4" title="Safe diagram" mode="viewer" view="context" onclick="steal()">
{"version":"0.1","kind":"c4","nodes":{"user":{"id":"user","type":"person","label":"Developer"}},"edges":{},"views":{"context":{"id":"context","title":"Context","nodeIds":["user"]}}}
<script>bad()</script>
</agent-flow>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-flow kind="c4" title="Safe diagram" mode="viewer" view="context">/);
  assert.match(html, /"type":"person"/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /bad\(\)/i);
});

test('component bundle registers the agent-flow island', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  assertCustomElementDefinition(bundle, 'agent-flow');
  assert.match(bundle, /C4 Model/);
  assert.match(bundle, /Flowchart/);
});

test('demo documents agent-flow with a JSON-first c4 source example', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const source = readFileSync(demo, 'utf8');

  assert.match(source, /data-agent-components="agent-flow"/);
  assert.match(source, /```agent-flow\nkind: c4\ntitle: Agent Isles Architecture\nmode: viewer\n---/);
  assert.match(source, /"type": "softwareSystem"/);

  const { html } = await renderMarkdownFile(demo);
  assert.match(html, /<agent-flow kind="c4" title="Agent Isles Architecture" mode="viewer">/);
  assert.match(html, /"label": "Agent Isles"/);
});
