import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const componentBundle = resolve('dist/agent-components.js');
const demo = resolve('examples/demo.md');

function assertCustomElementDefinition(bundle, tagName) {
  assert.match(bundle, new RegExp(`customElements\\.define\\(["']${tagName}["']`));
}

test('component bundle registers Kanban board island family', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-kanban', 'agent-kanban-lane', 'agent-kanban-card']) {
    assertCustomElementDefinition(bundle, tagName);
  }
});

test('renderMarkdown preserves a continuous multi-lane Kanban source island', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
# Launch board

<agent-kanban label="Launch board" lanes="backlog,doing,blocked,done">
  <agent-kanban-lane key="backlog" label="Backlog">
    <agent-kanban-card title="Draft release notes" owner="Merlin" meta="P2" tone="neutral">
      Summarize merged component work and release risks.
    </agent-kanban-card>
  </agent-kanban-lane>
  <agent-kanban-lane key="doing" label="Doing">
    <agent-kanban-card title="Render smoke" owner="Merlin" status="active" meta="P1" tone="active">
      Verify the demo after component bundle changes.
    </agent-kanban-card>
  </agent-kanban-lane>
  <agent-kanban-lane key="blocked" label="Blocked"></agent-kanban-lane>
</agent-kanban>
`);

  assert.match(html, /<agent-kanban label="Launch board" lanes="backlog,doing,blocked,done">/);
  assert.match(html, /<agent-kanban-lane key="backlog" label="Backlog">[\s\S]*<agent-kanban-lane key="doing" label="Doing">[\s\S]*<agent-kanban-lane key="blocked" label="Blocked">/);
  assert.match(html, /<agent-kanban-card title="Render smoke" owner="Merlin" status="active" meta="P1" tone="active">\s*Verify the demo after component bundle changes\.\s*<\/agent-kanban-card>/);
  assert.doesNotMatch(html, /&lt;agent-kanban-lane/);
});

test('sanitized render mode preserves safe Kanban markup and drops active HTML', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
<agent-kanban label="Launch board" lanes="backlog,doing" density="compact" onclick="steal()">
  <agent-kanban-lane key="backlog" label="Backlog" empty="No queued work" onclick="steal()">
    <agent-kanban-card title="Draft release notes" owner="Merlin" meta="P2" status="ready" tone="neutral" href="javascript:alert(1)" onclick="steal()">
      Summarize merged component work.
      <script>bad()</script>
    </agent-kanban-card>
  </agent-kanban-lane>
</agent-kanban>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-kanban label="Launch board" lanes="backlog,doing" density="compact">/);
  assert.match(html, /<agent-kanban-lane key="backlog" label="Backlog" empty="No queued work">/);
  assert.match(html, /<agent-kanban-card title="Draft release notes" owner="Merlin" meta="P2" status="ready" tone="neutral">\s*Summarize merged component work\.\s*<\/agent-kanban-card>/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<agent-kanban-card[^>]*href=/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /bad\(\)/i);
});

test('demo documents Kanban with a continuous nested raw-HTML source example', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const source = readFileSync(demo, 'utf8');

  assert.match(source, /data-agent-components="agent-kanban agent-kanban-lane agent-kanban-card"/);
  assert.match(source, /<agent-kanban label="Launch board" lanes="backlog,doing,blocked,done">\n\s*<agent-kanban-lane key="backlog" label="Backlog">\n\s*<agent-kanban-card title="Draft release notes" owner="Merlin" meta="P2" tone="neutral">/);
  assert.doesNotMatch(source, /<agent-kanban[^>]*>[\s\S]*?\n\s*\n\s*<agent-kanban-lane/);

  const { html } = await renderMarkdownFile(demo);
  assert.match(html, /<agent-kanban label="Launch board" lanes="backlog,doing,blocked,done">/);
  assert.match(html, /<agent-kanban-lane key="blocked" label="Blocked" empty="No blocked work">\s*<\/agent-kanban-lane>/);
  assert.match(html, /<agent-kanban-card title="Render smoke" owner="Merlin" meta="P1" status="active" tone="active">/);
});
