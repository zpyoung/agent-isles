import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyWritebackRequest,
  createSourceVersion,
  markdownTaskCheckboxWritebackOperation,
  WritebackContractError,
} from '../src/writeback.mjs';
import { renderMarkdown, renderMarkdownFile } from '../src/render.mjs';
import { startPreviewServer } from '../src/preview.mjs';

function withTempWorkspace(callback) {
  const root = mkdtempSync(join(tmpdir(), 'agent-isles-checkbox-writeback-'));
  let result;
  try {
    result = callback(root);
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }

  if (result && typeof result.then === 'function') {
    return result.finally(() => rmSync(root, { recursive: true, force: true }));
  }

  rmSync(root, { recursive: true, force: true });
  return result;
}

function markerRange(source, marker, ordinal = 0) {
  let offset = -1;
  let from = 0;
  for (let index = 0; index <= ordinal; index += 1) {
    offset = source.indexOf(marker, from);
    assert.notEqual(offset, -1, `expected marker ${marker} ordinal ${ordinal}`);
    from = offset + marker.length;
  }
  const start = pointForOffset(source, offset);
  const end = pointForOffset(source, offset + marker.length);
  return {
    start,
    end,
  };
}

function pointForOffset(source, offset) {
  const prefix = source.slice(0, offset);
  const lines = prefix.split('\n');
  return {
    line: lines.length,
    column: lines.at(-1).length + 1,
    offset,
  };
}

function checkboxRequest({ source, checked, range, anchorText }) {
  return {
    sourcePath: 'plan.md',
    sourceVersion: createSourceVersion(source),
    target: {
      kind: 'markdown-task-checkbox',
      tagName: 'input',
      range,
      anchor: { text: anchorText },
    },
    operation: {
      type: 'markdown:set-task-checkbox',
      payload: { checked },
    },
  };
}

function checkboxContext(root) {
  return {
    rootPath: root,
    editMode: true,
    localhost: true,
    operations: {
      'markdown:set-task-checkbox': markdownTaskCheckboxWritebackOperation,
    },
  };
}

test('markdown checkbox writeback patches only the clicked source marker', () => {
  withTempWorkspace((root) => {
    const sourcePath = join(root, 'plan.md');
    const source = [
      '- [ ] duplicate task',
      '  - [x] nested done',
      '- [ ] duplicate task',
      '- [X] uppercase done',
      '',
    ].join('\n');
    writeFileSync(sourcePath, source, 'utf8');

    const result = applyWritebackRequest(checkboxRequest({
      source,
      checked: true,
      range: markerRange(source, '[ ]', 1),
      anchorText: '[ ]',
    }), checkboxContext(root));

    assert.equal(result.ok, true);
    assert.equal(readFileSync(sourcePath, 'utf8'), [
      '- [ ] duplicate task',
      '  - [x] nested done',
      '- [x] duplicate task',
      '- [X] uppercase done',
      '',
    ].join('\n'));
  });
});

test('markdown checkbox writeback unchecks checked markers and normalizes uppercase X', () => {
  withTempWorkspace((root) => {
    const sourcePath = join(root, 'plan.md');
    const source = '- [X] uppercase done\r\n- [x] lowercase done\r\n';
    writeFileSync(sourcePath, source, 'utf8');

    applyWritebackRequest(checkboxRequest({
      source,
      checked: false,
      range: markerRange(source, '[X]'),
      anchorText: '[X]',
    }), checkboxContext(root));

    assert.equal(readFileSync(sourcePath, 'utf8'), '- [ ] uppercase done\r\n- [x] lowercase done\r\n');
  });
});

test('markdown checkbox writeback rejects stale or non-marker ranges without writing', () => {
  withTempWorkspace((root) => {
    const sourcePath = join(root, 'plan.md');
    const source = '- [ ] task\n';
    writeFileSync(sourcePath, source, 'utf8');

    assert.throws(
      () => applyWritebackRequest(checkboxRequest({
        source,
        checked: true,
        range: { start: { offset: 2 }, end: { offset: 8 } },
        anchorText: '[ ] ta',
      }), checkboxContext(root)),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_MARKDOWN_CHECKBOX_CONFLICT',
    );

    writeFileSync(sourcePath, '- [x] task\n', 'utf8');
    assert.throws(
      () => applyWritebackRequest(checkboxRequest({
        source,
        checked: true,
        range: markerRange(source, '[ ]'),
        anchorText: '[ ]',
      }), checkboxContext(root)),
      (error) => error instanceof WritebackContractError && error.code === 'ERR_WRITEBACK_STALE_SOURCE',
    );

    assert.equal(readFileSync(sourcePath, 'utf8'), '- [x] task\n');
  });
});

test('writeback-enabled render maps duplicate and nested markdown task checkboxes to source markers', async () => {
  await withTempWorkspace(async (root) => {
    const sourcePath = join(root, 'plan.md');
    const markdown = '- [ ] duplicate\n  - [x] nested\n- [ ] duplicate\n';
    writeFileSync(sourcePath, markdown, 'utf8');

    const { html } = await renderMarkdownFile(sourcePath, {
      writeback: {
        enabled: true,
        rootPath: root,
        endpoint: '/__agent-isles/writeback',
      },
    });

    const metadata = readAllWritebackMetadata(html);
    assert.equal(metadata.length, 3);
    assert.deepEqual(metadata.map((item) => item.target.range), [
      markerRange(markdown, '[ ]', 0),
      markerRange(markdown, '[x]', 0),
      markerRange(markdown, '[ ]', 1),
    ]);
    assert.deepEqual(metadata.map((item) => item.target.anchor.text), ['[ ]', '[x]', '[ ]']);
    assert.deepEqual(metadata.map((item) => item.operation), [
      { type: 'markdown:set-task-checkbox' },
      { type: 'markdown:set-task-checkbox' },
      { type: 'markdown:set-task-checkbox' },
    ]);
    assert.doesNotMatch(html, /<input[^>]+disabled/);
  });
});

test('writeback-enabled render ignores raw HTML checkboxes while mapping Markdown task items', async () => {
  await withTempWorkspace(async (root) => {
    const sourcePath = join(root, 'plan.md');
    const markdown = '<input type="checkbox"> raw HTML\n\n- [ ] task\n';
    writeFileSync(sourcePath, markdown, 'utf8');

    const { html } = await renderMarkdownFile(sourcePath, {
      writeback: {
        enabled: true,
        rootPath: root,
        endpoint: '/__agent-isles/writeback',
      },
    });

    const metadata = readAllWritebackMetadata(html);
    assert.equal(metadata.length, 1);
    assert.deepEqual(metadata[0].target.range, markerRange(markdown, '[ ]'));
    assert.doesNotMatch(html, /<p><input type="checkbox"[^>]*data-agent-isles-writeback/);
    assert.match(html, /<li class="task-list-item"><input type="checkbox" aria-label="Mark task complete" data-agent-isles-writeback=/);
  });
});

test('writeback-enabled render maps only parser-recognized Markdown task checkboxes', async () => {
  await withTempWorkspace(async (root) => {
    const sourcePath = join(root, 'plan.md');
    const markdown = [
      '```',
      '- [ ] sample in code',
      '```',
      '    - [ ] indented code',
      '- [ ] real task',
      '- [ ] another task',
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

    const metadata = readAllWritebackMetadata(html);
    assert.equal(metadata.length, 2);
    assert.deepEqual(metadata.map((item) => item.target.range), [
      markerRange(markdown, '[ ]', 2),
      markerRange(markdown, '[ ]', 3),
    ]);
  });
});

test('static and non-writeback renders keep markdown task checkboxes inert', async () => {
  const markdown = '- [ ] task\n';
  const html = await renderMarkdown(markdown);

  assert.doesNotMatch(html, /agent-isles-writeback-endpoint/);
  assert.doesNotMatch(html, /data-agent-isles-writeback=/);
  assert.match(html, /<input[^>]+type="checkbox"[^>]+disabled/);
});

test('preview writeback endpoint is local opt-in and applies checkbox requests', async () => {
  await withTempWorkspace(async (root) => {
    const sourcePath = join(root, 'plan.md');
    const markdown = '- [ ] task\n';
    writeFileSync(sourcePath, markdown, 'utf8');

    const inertPreview = await startPreviewServer(root, { port: 0, includeUserPacks: false });
    try {
      const inertResponse = await fetch(`${inertPreview.url}/__agent-isles/writeback`, { method: 'POST' });
      assert.equal(inertResponse.status, 404);
    } finally {
      await inertPreview.close();
    }

    const preview = await startPreviewServer(root, { port: 0, includeUserPacks: false, writeback: true });
    try {
      const response = await fetch(`${preview.url}/__agent-isles/writeback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(checkboxRequest({
          source: markdown,
          checked: true,
          range: markerRange(markdown, '[ ]'),
          anchorText: '[ ]',
        })),
      });
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(readFileSync(sourcePath, 'utf8'), '- [x] task\n');
    } finally {
      await preview.close();
    }
  });
});

test('preview writeback rejects cross-origin browser requests', async () => {
  await withTempWorkspace(async (root) => {
    const sourcePath = join(root, 'plan.md');
    const markdown = '- [ ] task\n';
    writeFileSync(sourcePath, markdown, 'utf8');

    const preview = await startPreviewServer(root, { port: 0, includeUserPacks: false, writeback: true });
    try {
      const body = JSON.stringify(checkboxRequest({
        source: markdown,
        checked: true,
        range: markerRange(markdown, '[ ]'),
        anchorText: '[ ]',
      }));

      // A cross-site browser POST carries an Origin header that does not match the
      // preview server, so the file-mutating writeback is refused without writing.
      const crossOrigin = await fetch(`${preview.url}/__agent-isles/writeback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
        body,
      });
      assert.equal(crossOrigin.status, 403);
      assert.equal(readFileSync(sourcePath, 'utf8'), markdown, 'source is untouched by a rejected cross-origin request');

      // A same-origin POST (Origin matches the served page) still applies.
      const sameOrigin = await fetch(`${preview.url}/__agent-isles/writeback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: preview.url },
        body,
      });
      assert.equal(sameOrigin.status, 200);
      assert.equal(readFileSync(sourcePath, 'utf8'), '- [x] task\n');
    } finally {
      await preview.close();
    }
  });
});

function readAllWritebackMetadata(html) {
  return [...html.matchAll(/data-agent-isles-writeback="([^"]+)"/g)].map((match) => JSON.parse(decodeHtmlAttribute(match[1])));
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll('&#x22;', '"')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x26;', '&')
    .replaceAll('&amp;', '&');
}
