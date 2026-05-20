import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { normalizeDelta } from '../src/components/agent-delta.js';

const componentBundle = resolve('dist/agent-components.js');
const demo = resolve('examples/demo.md');

function assertCustomElementDefinition(bundle, tagName) {
  assert.match(bundle, new RegExp(`customElements\\.define\\(["']${tagName}["']`));
}

test('component bundle registers composable metric comparison primitives', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  assertCustomElementDefinition(bundle, 'agent-metric');
  assertCustomElementDefinition(bundle, 'agent-delta');
  assert.doesNotMatch(bundle, /customElements\.define\(["']agent-comparison-bar["']/);
});

test('delta normalization maps comparison direction to semantic tone', () => {
  assert.deepEqual(normalizeDelta('-10', 'lower-better'), {
    numericValue: -10,
    tone: 'good',
    directionLabel: 'lower is better',
  });
  assert.deepEqual(normalizeDelta('−10', 'lower-better'), {
    numericValue: -10,
    tone: 'good',
    directionLabel: 'lower is better',
  });
  assert.deepEqual(normalizeDelta('18', 'higher-better'), {
    numericValue: 18,
    tone: 'good',
    directionLabel: 'higher is better',
  });
  assert.deepEqual(normalizeDelta('0', 'neutral'), {
    numericValue: 0,
    tone: 'neutral',
    directionLabel: 'neutral comparison',
  });
});

test('sanitized render mode preserves metric tone and delta markup as safe composition', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
<div class="card" onclick="steal()">
  <agent-metric label="Original" value="38" unit="wks" tone="neutral" onclick="steal()"></agent-metric>
  <agent-metric label="Revised" value="28" unit="wks" tone="good"></agent-metric>
  <agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better" onclick="steal()">
    26% faster · ~10 weeks saved
  </agent-delta>
</div>
<script>bad()</script>
`, { renderMode: 'sanitized' });

  assert.match(html, /<div class="card">/);
  assert.match(html, /<agent-metric label="Original" value="38" unit="wks" tone="neutral"><\/agent-metric>/);
  assert.match(html, /<agent-metric label="Revised" value="28" unit="wks" tone="good"><\/agent-metric>/);
  assert.match(html, /<agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better">\s*26% faster · ~10 weeks saved\s*<\/agent-delta>/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /bad\(\)/i);
});

test('demo composes the Shopify timeline comparison from metric and delta primitives', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<agent-metric label="Original — no AI, new design" value="38" unit="wks" tone="neutral">/);
  assert.match(html, /<agent-metric label="Revised — AI \+ 1:1 parity \+ existing assets" value="28" unit="wks" tone="good">/);
  assert.match(html, /<agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better">/);
  assert.doesNotMatch(html, /<agent-comparison-bar/);
});
