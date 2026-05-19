import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { calculateComparisonWidths } from '../src/components/agent-comparison-bar.js';

const componentBundle = resolve('dist/agent-components.js');
const demo = resolve('examples/demo.md');

function assertCustomElementDefinition(bundle, tagName) {
  assert.match(bundle, new RegExp(`customElements\\.define\\(["']${tagName}["']`));
}

test('component bundle registers comparison bar island', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  assertCustomElementDefinition(bundle, 'agent-comparison-bar');
});

test('comparison widths preserve proportional lower-better and higher-better values', () => {
  assert.deepEqual(calculateComparisonWidths(38, 28, 'lower-better'), {
    baselineWidth: 100,
    revisedWidth: 74,
    preferred: 'revised',
  });
  assert.deepEqual(calculateComparisonWidths(72, 90, 'higher-better'), {
    baselineWidth: 80,
    revisedWidth: 100,
    preferred: 'revised',
  });
});

test('sanitized render mode preserves safe comparison bar markup', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
<agent-comparison-bar
  label="Timeline comparison"
  baseline-label="Original"
  baseline-value="38"
  revised-label="Revised"
  revised-value="28"
  unit="wks"
  summary="26% faster · ~10 weeks saved"
  direction="lower-better"
  onclick="steal()">
</agent-comparison-bar>
<script>bad()</script>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-comparison-bar label="Timeline comparison" baseline-label="Original" baseline-value="38" revised-label="Revised" revised-value="28" unit="wks" summary="26% faster · ~10 weeks saved" direction="lower-better">\s*<\/agent-comparison-bar>/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /bad\(\)/i);
});

test('demo includes a Shopify timeline comparison bar example', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<agent-comparison-bar/);
  assert.match(html, /baseline-value="38"/);
  assert.match(html, /revised-value="28"/);
  assert.match(html, /summary="26% faster · ~10 weeks saved"/);
});
