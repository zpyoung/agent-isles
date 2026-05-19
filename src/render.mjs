import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const require = createRequire(import.meta.url);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, '..');
const themePath = join(projectRoot, 'src', 'theme', 'agent-theme.css');
const componentBundlePath = join(projectRoot, 'dist', 'agent-components.js');
const componentScriptName = 'agent-components.js';
const markdownExtensions = new Set(['.md', '.markdown']);
const localAssetDirName = 'assets';
const localAssets = [
  {
    source: require.resolve('bootstrap/dist/css/bootstrap.min.css'),
    fileName: 'bootstrap.min.css',
  },
  {
    source: require.resolve('highlight.js/styles/github-dark.min.css'),
    fileName: 'github-dark.min.css',
  },
  {
    source: require.resolve('bootstrap/dist/js/bootstrap.bundle.min.js'),
    fileName: 'bootstrap.bundle.min.js',
  },
];

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
      'agent-tabs',
      'agent-tab',
      'agent-timeline',
      'agent-step',
    ]),
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      'className',
      'data*',
      'role',
      'title',
      /^aria-[a-z][a-z0-9-]*$/,
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
    'agent-tabs': ['className', 'label'],
    'agent-tab': ['className', 'title', 'active'],
    'agent-timeline': ['className', 'label'],
    'agent-step': ['className', 'status', 'label'],
  },
};

export async function renderMarkdown(markdown, options = {}) {
  const renderMode = normalizeRenderMode(options.renderMode);
  const assetMode = normalizeAssetMode(options.assetMode);
  const sourceMarkdown = typeof options.sourceMarkdown === 'string' ? options.sourceMarkdown : markdown;
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

  return buildHtmlPage(String(body), { ...options, renderMode, assetMode, sourceMarkdown });
}

export async function renderMarkdownFile(inputPath, options = {}) {
  const filePath = validateMarkdownInput(inputPath);
  const markdown = readFileSync(filePath, 'utf8');
  const outFile = options.outFile ? resolve(options.outFile) : undefined;
  const assetMode = normalizeAssetMode(options.assetMode);
  const html = await renderMarkdown(markdown, { ...options, assetMode, sourcePath: filePath });

  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);
    copyComponentBundle(dirname(outFile));
    if (assetMode === 'local') {
      copyLocalAssets(dirname(outFile));
    }
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
  const assetMode = normalizeAssetMode(options.assetMode);
  const theme = readTheme();
  const mainClass = options.showSource
    ? 'agent-isles-page agent-isles-page--source-view container-fluid py-4'
    : 'agent-isles-page container py-4';
  const pageBody = options.showSource ? buildSourceComparison(body, options.sourceMarkdown || '') : body;
  const missingBundleComment = existsSync(componentBundlePath)
    ? ''
    : '\n  <!-- Agent Isles warning: dist/agent-components.js is missing. Run `npm run build`. -->';
  const styles = buildStyles(assetMode);
  const scripts = buildScripts(assetMode, missingBundleComment);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
${styles}
  <style>${theme}</style>
</head>
<body>
  <main class="${mainClass}">
${indent(pageBody, 4)}
  </main>
${scripts}
  <script type="module" src="./${componentScriptName}"></script>
</body>
</html>`;
}

function buildSourceComparison(renderedBody, sourceMarkdown) {
  return `<section class="agent-isles-source-comparison row g-4 align-items-start">
  <aside class="agent-isles-source-pane col-12 col-xl-5" aria-labelledby="agent-isles-source-heading">
    <div class="agent-isles-source-card card shadow-sm">
      <div class="card-header bg-dark text-light">
        <p class="text-uppercase text-info fw-bold small mb-1">Simple source</p>
        <h2 id="agent-isles-source-heading" class="h5 mb-0 text-light">Source Markdown</h2>
      </div>
      <div class="card-body p-0">
        <pre class="agent-isles-source-markdown mb-0"><code class="language-markdown">${escapeHtml(sourceMarkdown)}</code></pre>
      </div>
    </div>
  </aside>
  <section class="agent-isles-rendered-pane col-12 col-xl-7" aria-labelledby="agent-isles-rendered-heading">
    <div class="agent-isles-rendered-card card shadow-sm">
      <div class="card-header bg-white">
        <p class="text-uppercase text-primary fw-bold small mb-1">Expressive output</p>
        <h2 id="agent-isles-rendered-heading" class="h5 mb-0">Rendered output</h2>
      </div>
      <div class="card-body agent-isles-rendered-output">
${indent(renderedBody, 8)}
      </div>
    </div>
  </section>
</section>`;
}

function buildStyles(assetMode) {
  if (assetMode === 'local') {
    return `  <link href="./${localAssetDirName}/bootstrap.min.css" rel="stylesheet" />
  <link href="./${localAssetDirName}/github-dark.min.css" rel="stylesheet" />`;
  }

  return `  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
    rel="stylesheet"
    crossorigin="anonymous"
  />
  <link
    href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
    rel="stylesheet"
  />`;
}

function buildScripts(assetMode, missingBundleComment) {
  const bootstrapScript = assetMode === 'local'
    ? `  <script src="./${localAssetDirName}/bootstrap.bundle.min.js"></script>`
    : `  <script
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
    crossorigin="anonymous">
  </script>`;

  return `${bootstrapScript}${missingBundleComment}`;
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

function copyLocalAssets(outDir) {
  const assetsDir = join(outDir, localAssetDirName);
  mkdirSync(assetsDir, { recursive: true });

  for (const asset of localAssets) {
    if (!existsSync(asset.source)) {
      throw new Error(`Local asset source missing: ${asset.source}`);
    }
    copyFileSync(asset.source, join(assetsDir, asset.fileName));
  }
}

function normalizeAssetMode(assetMode = 'cdn') {
  if (assetMode === 'cdn' || assetMode === 'local') {
    return assetMode;
  }

  throw new Error(`Unsupported asset mode: ${assetMode}. Expected "cdn" or "local".`);
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
