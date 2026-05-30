import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { renderMarkdown, renderMarkdownFile } from '../src/render.mjs';
import { createSourceVersion } from '../src/writeback.mjs';

function withTempWorkspace(callback) {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-render-writeback-'));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('static render output does not expose writeback metadata by default', async () => {
  const markdown = '<agent-decision data-agent-isles-writeback-op="fixture:set-decision-state">Pending</agent-decision>';

  const html = await renderMarkdown(markdown);

  assert.doesNotMatch(html, /data-agent-isles-writeback=/);
  assert.doesNotMatch(html, /agent-isles-writeback-endpoint/);
  assert.match(html, /<agent-decision>Pending<\/agent-decision>/);
});

test('writeback-enabled render attaches component-scoped source metadata to opted-in targets', async () => {
  await withTempWorkspace(async (root) => {
    const sourcePath = join(root, 'plan.md');
    const markdown = [
      '# Plan',
      '',
      '<agent-decision id="decision-1" data-agent-isles-writeback-op="fixture:set-decision-state">Pending</agent-decision>',
      '',
    ].join('\n');
    writeFileSync(sourcePath, markdown, 'utf8');

    const { html } = await renderMarkdownFile(sourcePath, {
      writeback: {
        enabled: true,
        rootPath: root,
        endpoint: '/__agent-isles/writeback',
      },
    });

    assert.match(html, /<meta name="agent-isles-writeback-endpoint" content="\/__agent-isles\/writeback" \/>/);
    const metadata = readWritebackMetadata(html);
    assert.ok(metadata, 'expected writeback metadata attribute on opted-in component');

    assert.deepEqual(metadata, {
      contractVersion: 1,
      sourcePath: 'plan.md',
      sourceVersion: createSourceVersion(markdown),
      target: {
        componentId: 'decision-1',
        tagName: 'agent-decision',
        range: {
          start: { line: 3, column: 1, offset: 8 },
          end: { line: 3, column: 116, offset: 123 },
        },
      },
      operation: { type: 'fixture:set-decision-state' },
    });
  });
});

test('writeback metadata remains available in sanitized edit renders for safe data attributes', async () => {
  const markdown = '<agent-decision data-agent-isles-writeback-op="fixture:set-decision-state" onclick="evil()">Pending</agent-decision><script>evil()</script>';

  const html = await renderMarkdown(markdown, {
    renderMode: 'sanitized',
    sourcePath: '/workspace/plan.md',
    writeback: {
      enabled: true,
      rootPath: '/workspace',
      endpoint: '/__agent-isles/writeback',
    },
  });

  assert.ok(readWritebackMetadata(html));
  assert.doesNotMatch(html, /onclick/);
  assert.doesNotMatch(html, /<script>evil\(\)<\/script>/);
});

function readWritebackMetadata(html) {
  const match = html.match(/data-agent-isles-writeback="([^"]+)"/);
  if (!match) {
    return null;
  }

  const decoded = match[1]
    .replaceAll('&#x22;', '"')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x26;', '&')
    .replaceAll('&amp;', '&');
  return JSON.parse(decoded);
}
