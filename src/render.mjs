import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, '..');
const themePath = join(projectRoot, 'src', 'theme', 'agent-theme.css');
const componentBundlePath = join(projectRoot, 'dist', 'agent-components.js');
const componentScriptName = 'agent-components.js';
const markdownExtensions = new Set(['.md', '.markdown']);

export class AgentIslesInputError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AgentIslesInputError';
    this.code = code;
  }
}

export function validateMarkdownInput(inputPath) {
  const filePath = resolve(inputPath);

  if (!existsSync(filePath)) {
    throw new AgentIslesInputError(
      `Input file not found: ${filePath}`,
      'ERR_AGENT_ISLES_INPUT_NOT_FOUND',
    );
  }

  const extension = extname(filePath).toLowerCase();
  if (!markdownExtensions.has(extension)) {
    throw new AgentIslesInputError(
      `Unsupported input file extension: ${filePath}\nExpected a Markdown file ending in .md or .markdown.`,
      'ERR_AGENT_ISLES_UNSUPPORTED_INPUT_EXTENSION',
    );
  }

  return filePath;
}

export const RENDER_MODES = Object.freeze({
  TRUSTED: 'trusted',
  SANITIZED: 'sanitized',
});

const sanitizedSchema = {
  ...defaultSchema,
  tagNames: [
    ...new Set([
      ...(defaultSchema.tagNames || []),
      'agent-decision',
      'agent-risk',
      'agent-metric',
      'agent-copy-block',
    ]),
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      'className',
      'data*',
      'role',
      'title',
      /^aria[A-Z].*/,
      ...(defaultSchema.attributes?.['*'] || []),
    ],
    a: ['className', 'target', 'rel', ...(defaultSchema.attributes?.a || [])],
    div: ['className', 'role', ...(defaultSchema.attributes?.div || [])],
    span: ['className', 'role', ...(defaultSchema.attributes?.span || [])],
    img: ['className', 'alt', 'src', 'title', ...(defaultSchema.attributes?.img || [])],
    code: ['className', ...(defaultSchema.attributes?.code || [])],
    pre: ['className', ...(defaultSchema.attributes?.pre || [])],
    'agent-decision': ['className', 'title', 'verdict'],
    'agent-risk': ['className', 'title', 'level'],
    'agent-metric': ['className', 'label', 'value', 'unit', 'trend'],
    'agent-copy-block': ['className', 'label', 'lang'],
  },
};

export async function renderMarkdown(markdown, options = {}) {
  const renderMode = normalizeRenderMode(options.renderMode);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw);

  if (renderMode === RENDER_MODES.SANITIZED) {
    processor.use(dropUnsafeRawHtmlElements).use(rehypeSanitize, sanitizedSchema);
  }

  const body = await processor
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: renderMode === RENDER_MODES.TRUSTED })
    .process(markdown);

  return buildHtmlPage(String(body), { ...options, renderMode });
}

export async function renderMarkdownFile(inputPath, options = {}) {
  const filePath = validateMarkdownInput(inputPath);
  const markdown = readFileSync(filePath, 'utf8');
  const outFile = options.outFile ? resolve(options.outFile) : undefined;
  const html = await renderMarkdown(markdown, { ...options, sourcePath: filePath });

  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);
    copyComponentBundle(dirname(outFile));
  }

  return { html, outFile };
}

export function defaultOutFile(inputPath) {
  const filePath = resolve(inputPath);
  const ext = extname(filePath);
  const baseName = basename(ext ? filePath.slice(0, -ext.length) : filePath);
  return resolve('dist', `${baseName || 'output'}.html`);
}

export function normalizeRenderMode(renderMode = RENDER_MODES.TRUSTED) {
  if (renderMode === RENDER_MODES.TRUSTED || renderMode === RENDER_MODES.SANITIZED) {
    return renderMode;
  }

  throw new Error(
    `Unknown render mode: ${renderMode}. Use "${RENDER_MODES.TRUSTED}" or "${RENDER_MODES.SANITIZED}".`,
  );
}

function dropUnsafeRawHtmlElements() {
  const blockedTagNames = new Set(['script', 'style', 'iframe', 'object', 'embed']);

  return (tree) => {
    visitChildren(tree, (children, index, node) => {
      if (node.type === 'element' && blockedTagNames.has(node.tagName)) {
        children.splice(index, 1);
        return index;
      }

      return undefined;
    });
  };
}

function visitChildren(node, visitor) {
  if (!Array.isArray(node.children)) {
    return;
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const nextIndex = visitor(node.children, index, child);

    if (typeof nextIndex === 'number') {
      index = nextIndex - 1;
      continue;
    }

    visitChildren(child, visitor);
  }
}

function buildHtmlPage(body, options = {}) {
  const title = options.title || 'Agent Isles Output';
  const theme = readTheme();
  const missingBundleComment = existsSync(componentBundlePath)
    ? ''
    : '\n  <!-- Agent Isles warning: dist/agent-components.js is missing. Run `npm run build`. -->';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
    rel="stylesheet"
    crossorigin="anonymous"
  />
  <link
    href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
    rel="stylesheet"
  />
  <style>${theme}</style>
</head>
<body>
  <main class="agent-isles-page container py-4">
${indent(body, 4)}
  </main>
  <script
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
    crossorigin="anonymous">
  </script>${missingBundleComment}
  <script type="module" src="./${componentScriptName}"></script>
</body>
</html>`;
}

function readTheme() {
  if (!existsSync(themePath)) {
    return '/* Agent Isles theme missing */';
  }

  return readFileSync(themePath, 'utf8');
}

function copyComponentBundle(outDir) {
  if (!existsSync(componentBundlePath)) {
    return;
  }

  copyFileSync(componentBundlePath, join(outDir, componentScriptName));
}

function indent(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : line))
    .join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
