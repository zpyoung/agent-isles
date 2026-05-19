import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const componentBundle = resolve('dist/agent-components.js');
const demo = resolve('examples/demo.md');

function assertCustomElementDefinition(bundle, tagName) {
  assert.match(bundle, new RegExp(`customElements\\.define\\(["']${tagName}["']`));
}

test('component bundle registers Gantt schedule islands', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-gantt', 'agent-gantt-phase', 'agent-gantt-task']) {
    assertCustomElementDefinition(bundle, tagName);
  }

  assert.doesNotMatch(bundle, /customElements\.define\(["']agent-gantt-note["']/);
  assert.doesNotMatch(bundle, /baselineWeeks|revisedWeeks|renderComparison/);
});

test('sanitized render mode preserves only focused Gantt chart tags and attributes', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
## Revised Migration Timeline

Use Markdown for titles, summaries, notes, and surrounding prose.

<agent-gantt aria-label="Revised migration timeline" weeks="28" milestones="12,15,28" baseline-label="Original" baseline-weeks="38" revised-label="Revised" revised-weeks="28" summary="26% faster" onclick="steal()">
  <agent-gantt-phase label="PHASE 1 — CORE BUILD">
    <agent-gantt-task label="Components + Storybook" start="3" end="5" tone="components" detail="2 wks — was 8 wks" onclick="steal()"></agent-gantt-task>
    <agent-gantt-task label="Testing — parallel" start="3" end="12" tone="testing" parallel></agent-gantt-task>
  </agent-gantt-phase>
  <agent-gantt-note badge="AI">Components: 8 wks → 2 wks.</agent-gantt-note>
  <script>bad()</script>
</agent-gantt>
`, { renderMode: 'sanitized' });

  assert.match(html, /<h2>Revised Migration Timeline<\/h2>/);
  assert.match(html, /<agent-gantt aria-label="Revised migration timeline" weeks="28" milestones="12,15,28">/);
  assert.match(html, /<agent-gantt-phase label="PHASE 1 — CORE BUILD">/);
  assert.match(html, /<agent-gantt-task label="Components \+ Storybook" start="3" end="5" tone="components" detail="2 wks — was 8 wks"><\/agent-gantt-task>/);
  assert.match(html, /<agent-gantt-task label="Testing — parallel" start="3" end="12" tone="testing" parallel(?:="")?><\/agent-gantt-task>/);
  assert.doesNotMatch(html, /agent-gantt-note/);
  assert.doesNotMatch(html, /baseline-label|baseline-weeks|revised-label|revised-weeks|summary=/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /bad\(\)/i);
});

test('demo includes a data-driven Gantt schedule example', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<h2>Revised Migration Timeline<\/h2>/);
  assert.match(html, /<agent-gantt aria-label="Revised migration timeline" weeks="28" milestones="12,15,28"/);
  assert.match(html, /<agent-gantt-phase label="PHASE 1 — CORE BUILD">/);
  assert.match(html, /<agent-gantt-task label="Components \+ Storybook" start="3" end="5" tone="components"/);
  assert.doesNotMatch(html, /agent-gantt-note/);
  assert.doesNotMatch(html, /baseline-label|baseline-weeks|revised-label|revised-weeks|summary=/);
});
