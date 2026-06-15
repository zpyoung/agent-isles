import { D2 } from '@terrastruct/d2';
import { createSourceVersion, sourcePathForWriteback, WRITEBACK_CONTRACT_VERSION } from '../writeback.mjs';

export { defaultOutFile, normalizeRenderMode } from './input.mjs';

export function rehypeAgentMermaid() {
  return (tree) => {
    transformMermaidCodeBlocks(tree);
  };
}

function transformMermaidCodeBlocks(node) {
  if (!Array.isArray(node.children)) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const mermaidCode = extractLanguageCodeBlock(child, 'mermaid');

    if (mermaidCode) {
      node.children[index] = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['agent-mermaid'], dataAgentMermaid: true },
        children: [
          {
            type: 'element',
            tagName: 'pre',
            properties: { className: ['mermaid'], dataAgentMermaidSource: true },
            children: [{ type: 'text', value: mermaidCode.value }],
          },
        ],
      };
      continue;
    }

    transformMermaidCodeBlocks(child);
  }
}

export function rehypeAgentD2() {
  return async (tree) => {
    await transformD2CodeBlocks(tree);
  };
}

export function rehypeAgentFlow() {
  return (tree) => {
    transformAgentFlowCodeBlocks(tree);
  };
}

function transformAgentFlowCodeBlocks(node) {
  if (!Array.isArray(node.children)) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const flowCode = extractLanguageCodeBlock(child, 'agent-flow');

    if (flowCode) {
      const { attributes, documentSource } = parseAgentFlowCodeBlock(flowCode.value);
      node.children[index] = {
        type: 'element',
        tagName: 'agent-flow',
        properties: attributes,
        children: [{ type: 'text', value: documentSource }],
      };
      continue;
    }

    transformAgentFlowCodeBlocks(child);
  }
}

function parseAgentFlowCodeBlock(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const separatorIndex = lines.findIndex((line) => line.trim() === '---');
  const attributes = {};
  let bodyLines = lines;

  if (separatorIndex >= 0) {
    for (const line of lines.slice(0, separatorIndex)) {
      const match = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/.exec(line);
      if (!match) {
        continue;
      }
      const key = match[1].toLowerCase();
      const value = match[2];
      if (['kind', 'title', 'mode', 'view'].includes(key) && value) {
        attributes[key] = normalizeAgentFlowAttribute(key, value);
      }
    }
    bodyLines = lines.slice(separatorIndex + 1);
  }

  const documentSource = bodyLines.join('\n').trim();
  if (!attributes.kind) {
    const documentKind = readAgentFlowDocumentKind(documentSource);
    if (documentKind) attributes.kind = documentKind;
  }
  if (!attributes.mode) attributes.mode = 'viewer';

  return { attributes, documentSource };
}

function readAgentFlowDocumentKind(documentSource) {
  try {
    const document = JSON.parse(documentSource);
    return typeof document.kind === 'string' && document.kind.trim() ? document.kind.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

function normalizeAgentFlowAttribute(key, value) {
  const trimmed = value.trim();
  return ['kind', 'mode'].includes(key) ? trimmed.toLowerCase() : trimmed;
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

function extractLanguageCodeBlock(node, language) {
  if (node?.type !== 'element' || node.tagName !== 'pre') {
    return null;
  }

  const codeNode = node.children?.find((child) => child.type === 'element' && child.tagName === 'code');
  const classNames = codeNode?.properties?.className || [];
  const languageClassName = `language-${language}`;
  const hasLanguage = Array.isArray(classNames)
    ? classNames.includes(languageClassName)
    : String(classNames).split(/\s+/).includes(languageClassName);

  if (!hasLanguage) {
    return null;
  }

  return {
    value: codeNode.children?.map((child) => child.value || '').join('') || '',
  };
}

async function renderD2Svg(source, position) {
  const d2 = new D2();

  try {
    const result = await d2.compile(source, { noXMLTag: true });
    return await d2.render(result.diagram, { ...result.renderOptions, noXMLTag: true });
  } catch (error) {
    const location = formatPosition(position);
    const message = error?.message || String(error);
    throw new Error(`D2 diagram render failed${location}: ${message}`);
  } finally {
    await d2.worker?.terminate?.();
  }
}

function formatPosition(position) {
  const start = position?.start;
  if (!start?.line) {
    return '';
  }

  return ` at line ${start.line}${start.column ? `, column ${start.column}` : ''}`;
}

export function rehypeAgentHeadingAnchors(options = {}) {
  return (tree) => {
    const toc = options.toc || [];
    const seenIds = new Map();

    visitChildren(tree, (children, index, node) => {
      if (node?.type !== 'element' || !/^h[1-6]$/.test(node.tagName)) {
        return undefined;
      }

      const text = plainText(node).replace(/\s+/g, ' ').trim();
      if (!text) {
        return undefined;
      }

      node.properties ||= {};
      const level = Number(node.tagName.slice(1));
      const existingId = readStringProperty(node.properties, 'id');
      const id = existingId || uniqueHeadingId(slugifyHeading(text), seenIds);

      if (level <= 3) {
        toc.push({ id, text, level });
      }

      if (!existingId) {
        children.splice(index, 0, {
          type: 'element',
          tagName: 'span',
          properties: { id, className: ['agent-isles-heading-anchor'], ariaHidden: 'true' },
          children: [],
        });
        return index + 2;
      }

      return undefined;
    });
  };
}

function plainText(node) {
  if (!node) {
    return '';
  }
  if (node.type === 'text') {
    return node.value || '';
  }
  if (!Array.isArray(node.children)) {
    return '';
  }
  return node.children.map(plainText).join('');
}

function slugifyHeading(text) {
  const slug = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return slug || 'section';
}

function uniqueHeadingId(baseId, seenIds) {
  const count = seenIds.get(baseId) || 0;
  seenIds.set(baseId, count + 1);
  return count === 0 ? baseId : `${baseId}-${count + 1}`;
}

function visitChildren(node, visitor) {
  if (!Array.isArray(node.children)) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const nextIndex = visitor(node.children, index, child, node);

    if (typeof nextIndex === 'number') {
      index = nextIndex - 1;
      continue;
    }

    visitChildren(child, visitor);
  }
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

function readStringProperty(properties = {}, propertyName) {
  const value = properties[propertyName];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
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
