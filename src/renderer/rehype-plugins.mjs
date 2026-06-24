// Node-only rehype/remark plugins: D2 diagram rendering (spawns the `d2` binary
// or a WASM engine), writeback metadata, and source task-marker collection.
// Browser-safe island transforms live in ./rehype-islands.mjs and are
// re-exported here so src/render.mjs and tests keep a single import surface.
import { spawn } from 'node:child_process';
import { D2 } from '@terrastruct/d2';
import { createSourceVersion, sourcePathForWriteback, WRITEBACK_CONTRACT_VERSION } from '../writeback.mjs';
import {
  extractLanguageCodeBlock,
  visitChildren,
  readStringProperty,
} from './rehype-islands.mjs';

export { defaultOutFile, normalizeRenderMode } from './input.mjs';

// Browser-safe island transforms — single import surface for existing callers.
export {
  rehypeAgentMermaid,
  rehypeAgentFlow,
  rehypeAgentTable,
  rehypeAgentHeadingAnchors,
} from './rehype-islands.mjs';

export function rehypeAgentD2() {
  return async (tree) => {
    await transformD2CodeBlocks(tree);
  };
}

async function transformD2CodeBlocks(node) {
  if (!Array.isArray(node.children)) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const d2Code = extractLanguageCodeBlock(child, 'd2');

    if (d2Code) {
      const svg = await renderD2Svg(d2Code.value, child.position);
      node.children[index] = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['beoe', 'd2'] },
        children: [{ type: 'raw', value: svg }],
      };
      continue;
    }

    await transformD2CodeBlocks(child);
  }
}

// The WASM engine peaks at ~6.5GB RSS per instantiation regardless of diagram
// size, so renders are cached by source, the native `d2` binary is preferred
// when on PATH, and WASM work is serialized so at most one engine is alive.
const D2_SVG_CACHE_LIMIT = 64;
const d2SvgCache = new Map();
let d2WasmQueue = Promise.resolve();

async function renderD2Svg(source, position) {
  let pending = d2SvgCache.get(source);
  if (!pending) {
    pending = renderD2SvgUncached(source);
    d2SvgCache.set(source, pending);
    pending.catch(() => d2SvgCache.delete(source));
    if (d2SvgCache.size > D2_SVG_CACHE_LIMIT) {
      d2SvgCache.delete(d2SvgCache.keys().next().value);
    }
  }

  try {
    return await pending;
  } catch (error) {
    const location = formatPosition(position);
    const message = error?.message || String(error);
    throw new Error(`D2 diagram render failed${location}: ${message}`);
  }
}

async function renderD2SvgUncached(source) {
  const nativeSvg = await renderD2WithNativeBinary(source);
  if (nativeSvg !== null) {
    return nativeSvg;
  }
  return renderD2WithWasmEngine(source);
}

function renderD2WithNativeBinary(source) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('d2', ['-', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let svg = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { svg += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        resolvePromise(null);
      } else {
        rejectPromise(error);
      }
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise(svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, ''));
      } else {
        rejectPromise(new Error(stderr.trim() || `d2 exited with code ${code}`));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(source);
  });
}

function renderD2WithWasmEngine(source) {
  const task = async () => {
    const d2 = new D2();
    try {
      const result = await d2.compile(source, { noXMLTag: true });
      return await d2.render(result.diagram, { ...result.renderOptions, noXMLTag: true });
    } finally {
      await d2.worker?.terminate?.();
    }
  };
  const run = d2WasmQueue.then(task, task);
  d2WasmQueue = run.then(() => undefined, () => undefined);
  return run;
}

function formatPosition(position) {
  const start = position?.start;
  if (!start?.line) {
    return '';
  }

  return ` at line ${start.line}${start.column ? `, column ${start.column}` : ''}`;
}

export function rehypeAgentWritebackMetadata(options = {}) {
  return (tree) => {
    const writebackOptions = options.writeback || {};
    const enabled = writebackOptions.enabled === true;
    const markdownTaskMarkers = options.markdownTaskMarkers || [];
    let generatedId = 0;
    let markdownTaskIndex = 0;

    visitChildren(tree, (_children, _index, node, parent) => {
      if (node?.type !== 'element') {
        return undefined;
      }

      const operationType = readWritebackOperationType(node.properties);
      stripWritebackProperties(node.properties);

      if (isMarkdownTaskCheckboxInput(node, parent, _index)) {
        const marker = markdownTaskMarkers[markdownTaskIndex];
        markdownTaskIndex += 1;

        if (!enabled || !marker) {
          return undefined;
        }

        const sourcePath = sourcePathForWriteback(options.sourcePath, writebackOptions.rootPath);
        if (!sourcePath) {
          return undefined;
        }

        delete node.properties.disabled;
        node.properties['aria-label'] = marker.checked ? 'Mark task incomplete' : 'Mark task complete';
        node.properties['data-agent-isles-writeback'] = JSON.stringify({
          contractVersion: WRITEBACK_CONTRACT_VERSION,
          sourcePath,
          sourceVersion: createSourceVersion(options.sourceMarkdown || ''),
          target: {
            kind: 'markdown-task-checkbox',
            tagName: 'input',
            range: marker.range,
            anchor: { text: marker.marker },
          },
          operation: { type: 'markdown:set-task-checkbox' },
        });
        return undefined;
      }

      if (!enabled || !operationType) {
        return undefined;
      }

      if (!isAgentComponentTag(node.tagName) || !node.position?.start || !node.position?.end) {
        return undefined;
      }

      generatedId += 1;
      const componentId = readStringProperty(node.properties, 'id') || `${node.tagName}-${generatedId}`;
      const sourcePath = sourcePathForWriteback(options.sourcePath, writebackOptions.rootPath);
      if (!sourcePath) {
        return undefined;
      }

      const metadata = {
        contractVersion: WRITEBACK_CONTRACT_VERSION,
        sourcePath,
        sourceVersion: createSourceVersion(options.sourceMarkdown || ''),
        target: {
          componentId,
          tagName: node.tagName,
          range: {
            start: copyPositionPoint(node.position.start),
            end: copyPositionPoint(node.position.end),
          },
        },
        operation: { type: operationType },
      };

      node.properties['data-agent-isles-writeback'] = JSON.stringify(metadata);
      return undefined;
    });
  };
}

function isMarkdownTaskCheckboxInput(node, parent, index) {
  if (node?.tagName !== 'input') {
    return false;
  }

  const properties = node.properties || {};
  const isCheckbox = readStringProperty(properties, 'type') === 'checkbox' || properties.type === 'checkbox';
  if (!isCheckbox || !Object.hasOwn(properties, 'disabled')) {
    return false;
  }

  return index === 0 && parent?.tagName === 'li' && hasClassName(parent.properties, 'task-list-item');
}

function hasClassName(properties = {}, className) {
  const value = properties.className;
  if (Array.isArray(value)) {
    return value.includes(className);
  }
  if (typeof value === 'string') {
    return value.split(/\s+/).includes(className);
  }
  return false;
}

export function remarkCollectMarkdownTaskMarkers({ records, sourceMarkdown } = {}) {
  const targetRecords = Array.isArray(records) ? records : [];
  const source = String(sourceMarkdown || '');

  return (tree) => {
    visitMarkdownListItems(tree, (node) => {
      if (typeof node.checked !== 'boolean') {
        return;
      }

      const record = markerRecordForListItem(node, source);
      if (record) {
        targetRecords.push(record);
      }
    });
  };
}

function visitMarkdownListItems(node, visitor) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (node.type === 'listItem') {
    visitor(node);
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    visitMarkdownListItems(child, visitor);
  }
}

function markerRecordForListItem(node, source) {
  const itemStart = node.position?.start;
  if (!Number.isInteger(itemStart?.offset)) {
    return null;
  }

  const lineEnd = findLineEnd(source, itemStart.offset);
  const firstChildOffset = firstChildStartOffset(node);
  const searchEnd = Number.isInteger(firstChildOffset) ? Math.min(firstChildOffset, lineEnd) : lineEnd;
  const prefix = source.slice(itemStart.offset, searchEnd);
  const taskMatch = prefix.match(/^([ \t]*(?:[-+*]|\d+[.)])[ \t]+)(\[[ xX]\])(?=\s|$)/);
  if (!taskMatch) {
    return null;
  }

  const marker = taskMatch[2];
  const markerOffset = itemStart.offset + taskMatch[1].length;
  const markerColumn = itemStart.column + taskMatch[1].length;
  return {
    marker,
    checked: node.checked,
    range: {
      start: { line: itemStart.line, column: markerColumn, offset: markerOffset },
      end: { line: itemStart.line, column: markerColumn + marker.length, offset: markerOffset + marker.length },
    },
  };
}

function firstChildStartOffset(node) {
  if (!Array.isArray(node.children)) {
    return null;
  }

  for (const child of node.children) {
    const offset = child?.position?.start?.offset;
    if (Number.isInteger(offset)) {
      return offset;
    }
  }

  return null;
}

function findLineEnd(source, startOffset) {
  const newlineOffset = source.slice(startOffset).search(/[\r\n]/);
  return newlineOffset === -1 ? source.length : startOffset + newlineOffset;
}

function readWritebackOperationType(properties = {}) {
  return readStringProperty(properties, 'data-agent-isles-writeback-op')
    || readStringProperty(properties, 'dataAgentIslesWritebackOp');
}

function stripWritebackProperties(properties = {}) {
  delete properties['data-agent-isles-writeback-op'];
  delete properties.dataAgentIslesWritebackOp;
  delete properties['data-agent-isles-writeback'];
  delete properties.dataAgentIslesWriteback;
}

function isAgentComponentTag(tagName) {
  return typeof tagName === 'string' && tagName.startsWith('agent-');
}

function copyPositionPoint(point) {
  const copy = {
    line: point.line,
    column: point.column,
  };

  if (Number.isInteger(point.offset)) {
    copy.offset = point.offset;
  }

  return copy;
}
