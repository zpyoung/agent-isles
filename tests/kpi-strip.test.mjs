import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const componentBundle = resolve('dist/agent-components.js');
const demo = resolve('examples/demo.md');

function assertCustomElementDefinition(bundle, tagName) {
  assert.match(bundle, new RegExp(`customElements\\.define\\(["']${tagName}["']`));
}

test('component bundle registers KPI strip islands', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  assertCustomElementDefinition(bundle, 'agent-kpi-strip');
  assertCustomElementDefinition(bundle, 'agent-kpi');
});

test('sanitized render mode preserves safe KPI strip markup', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
<agent-kpi-strip columns="3" label="Migration milestones" onclick="steal()">
  <agent-kpi label="Phase 1 dev complete" value="~12" unit="wks" delta="was ~26 wks" tone="success" onclick="steal()">
    From kick-off
  </agent-kpi>
  <script>bad()</script>
</agent-kpi-strip>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-kpi-strip columns="3" label="Migration milestones">/);
  assert.match(html, /<agent-kpi label="Phase 1 dev complete" value="~12" unit="wks" delta="was ~26 wks" tone="success">\s*From kick-off\s*<\/agent-kpi>/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /bad\(\)/i);
});

test('demo includes a grouped KPI strip example', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<agent-kpi-strip columns="3" label="Migration milestones">/);
  assert.match(html, /<agent-kpi label="Phase 1 dev complete" value="~12" unit="wks" delta="was ~26 wks" tone="success">/);
  assert.match(html, /<agent-kpi label="Phase 2 complete" value="~28" unit="wks" delta="was ~38 wks" tone="primary">/);
});
