// Browser-safe Agent Isles island transforms. These rehype/remark plugins are
// pure AST work with no Node-only imports, so they can run both in the Node
// renderer (src/render.mjs, via re-export from ./rehype-plugins.mjs) and in the
// client-side reader bundle (src/reader/render-browser.mjs). Node-only plugins
// (D2 rendering, writeback metadata, source task-marker collection) live in
// ./rehype-plugins.mjs and import the shared helpers below from here.
import { parseAgentTable } from './agent-table.mjs';

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

export function rehypeAgentFlow() {
  return (tree) => {
    transformAgentFlowCodeBlocks(tree);
  };
}

export function rehypeAgentTable(options = {}) {
  const warn = options.warn ?? console.warn;
  return (tree) => {
    let tableIndex = 0;
    transformAgentTableCodeBlocks(tree, { warn, counter: () => ++tableIndex });
  };
}

function transformAgentTableCodeBlocks(node, context) {
  if (!Array.isArray(node.children)) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const tableCode = extractLanguageCodeBlock(child, 'agent-table');

    if (tableCode) {
      const tableIndex = context.counter();
      const result = parseAgentTable(tableCode.value, { tableIndex });

      for (const message of result.warnings) {
        context.warn(`[agent-isles] agent-table: ${message}`);
      }

      if (result.ok) {
        const replacement = result.node;
        replacement.position = child.position;
        node.children[index] = replacement;
      }

      continue;
    }

    transformAgentTableCodeBlocks(child, context);
  }
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

// Shared helper: detect a fenced ```<language> code block in a <pre><code> node.
// Used by the island transforms here and by the Node-only D2 plugin.
export function extractLanguageCodeBlock(node, language) {
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
    .replace(/[̀-ͯ]/g, '')
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

// Shared AST walker used by the heading-anchor plugin here and the Node-only
// writeback plugin. The visitor may return a numeric index to resume from.
export function visitChildren(node, visitor) {
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

// Shared helper: read a hast property as a string (coercing numbers). Used here
// and by the Node-only writeback plugin.
export function readStringProperty(properties = {}, propertyName) {
  const value = properties[propertyName];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}
