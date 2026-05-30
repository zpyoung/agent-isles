import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentIslesInputError,
  RENDER_MODES,
  buildPackAssetRecords,
  defaultOutFile,
  normalizeRenderMode,
  renderMarkdown,
  renderMarkdownFile,
  renderMarkdownString,
  validateMarkdownInput,
} from '../src/render.mjs';
import {
  AgentIslesInputError as ModularInputError,
  RENDER_MODES as MODULAR_RENDER_MODES,
  defaultOutFile as modularDefaultOutFile,
  normalizeRenderMode as modularNormalizeRenderMode,
  validateMarkdownInput as modularValidateMarkdownInput,
} from '../src/renderer/input.mjs';
import {
  rehypeAgentD2,
  rehypeAgentHeadingAnchors,
  rehypeAgentMermaid,
  rehypeAgentWritebackMetadata,
  remarkCollectMarkdownTaskMarkers,
} from '../src/renderer/rehype-plugins.mjs';
import { buildHtmlPage, hasMermaidDiagrams } from '../src/renderer/page.mjs';
import { buildPackAssetRecords as modularBuildPackAssetRecords } from '../src/renderer/pack-assets.mjs';
import { buildSanitizedSchema, dropUnsafeRawHtmlElements } from '../src/renderer/sanitize.mjs';

test('src/render.mjs remains a compatibility facade over focused renderer modules', () => {
  assert.equal(AgentIslesInputError, ModularInputError);
  assert.equal(RENDER_MODES, MODULAR_RENDER_MODES);
  assert.equal(validateMarkdownInput, modularValidateMarkdownInput);
  assert.equal(defaultOutFile, modularDefaultOutFile);
  assert.equal(normalizeRenderMode, modularNormalizeRenderMode);
  assert.equal(buildPackAssetRecords, modularBuildPackAssetRecords);

  assert.equal(typeof renderMarkdown, 'function');
  assert.equal(typeof renderMarkdownFile, 'function');
  assert.equal(typeof renderMarkdownString, 'function');
});

test('focused renderer modules expose cohesive responsibilities', () => {
  assert.equal(typeof remarkCollectMarkdownTaskMarkers, 'function');
  assert.equal(typeof rehypeAgentMermaid, 'function');
  assert.equal(typeof rehypeAgentD2, 'function');
  assert.equal(typeof rehypeAgentHeadingAnchors, 'function');
  assert.equal(typeof rehypeAgentWritebackMetadata, 'function');
  assert.equal(typeof buildHtmlPage, 'function');
  assert.equal(typeof hasMermaidDiagrams, 'function');
  assert.equal(typeof buildSanitizedSchema, 'function');
  assert.equal(typeof dropUnsafeRawHtmlElements, 'function');
});

test('sanitizer module extends the safe schema with safe pack declarations only', () => {
  const schema = buildSanitizedSchema({
    packs: [
      {
        tags: [
          { name: 'safe-card', attributes: ['tone', 'onclick', 'style', 'srcdoc'] },
        ],
      },
    ],
  });

  assert.ok(schema.tagNames.includes('agent-risk'));
  assert.ok(schema.tagNames.includes('safe-card'));
  assert.deepEqual(schema.attributes['safe-card'], ['tone']);
});
