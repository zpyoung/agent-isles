import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
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
import { resolvePackInputs } from './pack-resolver.mjs';

const require = createRequire(import.meta.url);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, '..');
const themePath = join(projectRoot, 'src', 'theme', 'agent-theme.css');
const componentBundlePath = join(projectRoot, 'dist', 'agent-components.js');
const componentScriptName = 'agent-components.js';
const markdownExtensions = new Set(['.md', '.markdown']);
const localAssetDirName = 'assets';
const packAssetRootPath = `${localAssetDirName}/agent-isles/packs`;
const packMetadataPath = `${localAssetDirName}/agent-isles/packs.json`;
const localAssets = [
  {
    source: require.resolve('bootstrap/dist/css/bootstrap.min.css'),
    fileName: 'bootstrap.min.css',
  },
  {
    source: require.resolve('bootstrap/dist/css/bootstrap.min.css.map'),
    fileName: 'bootstrap.min.css.map',
  },
  {
    source: require.resolve('highlight.js/styles/github-dark.min.css'),
    fileName: 'github-dark.min.css',
  },
  {
    source: require.resolve('bootstrap/dist/js/bootstrap.bundle.min.js'),
    fileName: 'bootstrap.bundle.min.js',
  },
  {
    source: require.resolve('bootstrap/dist/js/bootstrap.bundle.min.js.map'),
    fileName: 'bootstrap.bundle.min.js.map',
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

const coreSanitizedSchema = {
  ...defaultSchema,
  tagNames: [
    ...new Set([
      ...(defaultSchema.tagNames || []),
      'agent-decision',
      'agent-risk',
      'agent-metric',
      'agent-delta',
      'agent-copy-block',
      'agent-tabs',
      'agent-tab',
      'agent-timeline',
      'agent-step',
      'agent-gantt',
      'agent-gantt-phase',
      'agent-gantt-task',
      'agent-kpi',
      'agent-dependency-map',
      'agent-dependency',
      'agent-action-list',
      'agent-action',
    ]),
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      'className',
      'data*',
      'role',
      'title',
      'ariaLabel',
      /^aria[A-Z][A-Za-z0-9]*$/,
      /^aria-[a-z][a-z0-9-]*$/,
      ...(defaultSchema.attributes?.['*'] || []),
    ],
    a: [
      'className',
      'target',
      'rel',
      'role',
      'ariaLabel',
      /^aria[A-Z][A-Za-z0-9]*$/,
      /^aria-[a-z][a-z0-9-]*$/,
      ...(defaultSchema.attributes?.a || []),
    ],
    div: [
      'className',
      'role',
      'title',
      'ariaLabel',
      /^aria[A-Z][A-Za-z0-9]*$/,
      /^aria-[a-z][a-z0-9-]*$/,
      ...(defaultSchema.attributes?.div || []),
    ],
    span: [
      'className',
      'role',
      'title',
      'ariaLabel',
      /^aria[A-Z][A-Za-z0-9]*$/,
      /^aria-[a-z][a-z0-9-]*$/,
      ...(defaultSchema.attributes?.span || []),
    ],
    img: [
      'className',
      'alt',
      'src',
      'title',
      'role',
      'ariaLabel',
      /^aria[A-Z][A-Za-z0-9]*$/,
      /^aria-[a-z][a-z0-9-]*$/,
      ...(defaultSchema.attributes?.img || []),
    ],
    code: ['className', ...(defaultSchema.attributes?.code || [])],
    pre: ['className', ...(defaultSchema.attributes?.pre || [])],
    'agent-decision': ['className', 'title', 'verdict'],
    'agent-risk': ['className', 'title', 'level'],
    'agent-metric': ['className', 'label', 'value', 'unit', 'trend', 'tone'],
    'agent-delta': ['className', 'label', 'value', 'unit', 'percent', 'direction', 'tone'],
    'agent-copy-block': ['className', 'label', 'lang'],
    'agent-tabs': ['className', 'label'],
    'agent-tab': ['className', 'title', 'active'],
    'agent-timeline': ['className', 'label'],
    'agent-step': ['className', 'status', 'label'],
    'agent-gantt': ['className', 'weeks', 'milestones', 'label'],
    'agent-gantt-phase': ['className', 'label'],
    'agent-gantt-task': ['className', 'label', 'start', 'end', 'tone', 'detail', 'parallel'],
    'agent-kpi': ['className', 'label', 'value', 'unit', 'delta', 'tone'],
    'agent-dependency-map': ['className', 'label', 'direction', 'legend'],
    'agent-dependency': [
      'className',
      'id',
      'label',
      'status',
      'blockedBy',
      'blocked-by',
      'owner',
      'priority',
      'href',
    ],
    'agent-action-list': [
      'className',
      'label',
      'layout',
      'group-by',
      'filter-status',
      'filter-priority',
      'show-done',
    ],
    'agent-action': ['className', 'owner', 'due', 'priority', 'status'],
  },
};

function buildSanitizedSchema(resolvedPacks) {
  const tagNames = new Set(coreSanitizedSchema.tagNames || []);
  const attributes = copySchemaAttributes(coreSanitizedSchema.attributes);

  for (const pack of resolvedPacks?.packs || []) {
    for (const tag of pack.tags || []) {
      if (!tag?.name) {
        continue;
      }

      tagNames.add(tag.name);
      const declaredAttributes = (tag.attributes || []).filter(isSafePackDeclaredAttribute);
      if (declaredAttributes.length === 0) {
        continue;
      }

      attributes[tag.name] = [
        ...new Set([
          ...(attributes[tag.name] || []),
          ...declaredAttributes,
        ]),
      ];
    }
  }

  return {
    ...coreSanitizedSchema,
    tagNames: [...tagNames],
    attributes,
  };
}

function copySchemaAttributes(attributes = {}) {
  return Object.fromEntries(
    Object.entries(attributes).map(([tagName, allowedAttributes]) => [
      tagName,
      [...allowedAttributes],
    ]),
  );
}

function isSafePackDeclaredAttribute(attributeName) {
  const normalizedName = String(attributeName).toLowerCase();

  return !normalizedName.startsWith('on') && normalizedName !== 'style' && normalizedName !== 'srcdoc';
}

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
    processor
      .use(dropUnsafeRawHtmlElements)
      .use(rehypeSanitize, buildSanitizedSchema(options.resolvedPacks));
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
  const resolvedPacks = await resolvePackInputs({
    explicitPacks: options.explicitPacks || [],
    projectDir: options.projectDir ?? dirname(filePath),
    includeUserPacks: options.includeUserPacks === true,
    userConfigDir: options.userConfigDir || null,
  });
  const packAssetRecords = buildPackAssetRecords(resolvedPacks.packs);
  const html = await renderMarkdown(markdown, {
    ...options,
    assetMode,
    sourcePath: filePath,
    resolvedPacks,
    packAssetRecords,
  });

  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);
    copyComponentBundle(dirname(outFile));
    if (assetMode === 'local') {
      copyLocalAssets(dirname(outFile));
    }
    copyPackAssets(dirname(outFile), packAssetRecords);
    writePackMetadata(dirname(outFile), packAssetRecords);
  }

  return { html, outFile, resolvedPacks };
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
  const packAssetRecords = options.packAssetRecords || buildPackAssetRecords(options.resolvedPacks?.packs || []);
  const mainClass = options.showSource
    ? 'agent-isles-page agent-isles-page--source-view container-fluid py-4'
    : 'agent-isles-page container py-4';
  const pageBody = options.showSource ? buildSourceComparison(body, options.sourceMarkdown || '') : body;
  const missingBundleComment = existsSync(componentBundlePath)
    ? ''
    : '\n  <!-- Agent Isles warning: dist/agent-components.js is missing. Run `npm run build`. -->';
  const styles = buildStyles(assetMode);
  const scripts = buildScripts(assetMode, missingBundleComment);
  const packMetadata = buildPackMetadataTags(packAssetRecords);
  const packStyleLinks = buildPackStyleLinks(packAssetRecords);
  const packModuleScripts = buildPackModuleScripts(packAssetRecords);

  const mainBody = options.showSource ? pageBody : indent(pageBody, 4);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
${packMetadata}${styles}
  <style>${theme}</style>${packStyleLinks}
</head>
<body>
  <main class="${mainClass}">
${mainBody}
  </main>
${scripts}
  <script type="module" src="./${componentScriptName}"></script>${packModuleScripts}
</body>
</html>`;
}

function buildSourceComparison(renderedBody, sourceMarkdown) {
  return `<section class="agent-isles-source-comparison row g-4 align-items-start">
  <aside class="agent-isles-source-pane col-12 col-xl-6" aria-labelledby="agent-isles-source-heading">
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
  <section class="agent-isles-rendered-pane col-12 col-xl-6" aria-labelledby="agent-isles-rendered-heading">
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

function buildPackMetadataTags(packAssetRecords) {
  if (packAssetRecords.length === 0) {
    return '';
  }

  const packIds = packAssetRecords.map((record) => record.id).join(',');
  return `  <meta name="agent-isles-packs" content="${escapeHtml(packIds)}" />
  <link rel="agent-isles-packs" href="./${packMetadataPath}" type="application/json" />
`;
}

function buildPackStyleLinks(packAssetRecords) {
  const styleLinks = packAssetRecords.flatMap((record) => record.assets
    .filter((asset) => asset.type === 'style')
    .map((asset) => `  <link href="${escapeHtml(asset.url)}" rel="stylesheet" data-agent-isles-pack="${escapeHtml(record.id)}" />`));

  if (styleLinks.length === 0) {
    return '';
  }

  return `\n${styleLinks.join('\n')}`;
}

function buildPackModuleScripts(packAssetRecords) {
  const moduleScripts = packAssetRecords.flatMap((record) => record.assets
    .filter((asset) => asset.type === 'module')
    .map((asset) => `  <script type="module" src="${escapeHtml(asset.url)}" data-agent-isles-pack="${escapeHtml(record.id)}"></script>`));

  if (moduleScripts.length === 0) {
    return '';
  }

  return `\n${moduleScripts.join('\n')}`;
}

export function buildPackAssetRecords(packs = []) {
  const seenSafeIds = new Map();

  return packs.map((pack) => {
    const id = packOwnerId(pack);
    const baseSafeId = safePackId(id);
    const safeIdCount = seenSafeIds.get(baseSafeId) || 0;
    seenSafeIds.set(baseSafeId, safeIdCount + 1);
    const safeId = safeIdCount === 0 ? baseSafeId : `${baseSafeId}-${safeIdCount + 1}`;
    const assets = (pack.assets || []).map((asset) => {
      const normalizedPath = normalizePackAssetPath(pack, asset);
      const outputPath = joinUrlPaths(packAssetRootPath, safeId, normalizedPath);

      return {
        ...asset,
        normalizedPath,
        outputPath,
        url: `./${outputPath}`,
      };
    });

    return {
      pack,
      id,
      safeId,
      assets,
    };
  });
}

function packOwnerId(pack) {
  return pack.version ? `${pack.name}@${pack.version}` : pack.name;
}

function safePackId(packId) {
  const safeId = String(packId)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return safeId || 'pack';
}

function normalizePackAssetPath(pack, asset) {
  const assetPath = asset.resolvedPath && pack.packDir
    ? relative(pack.packDir, asset.resolvedPath)
    : asset.path;
  const normalizedPath = String(assetPath)
    .split(/[\\/]+/)
    .filter(Boolean)
    .join('/');

  if (!normalizedPath || normalizedPath.startsWith('..') || normalizedPath.includes('/../')) {
    throw new Error(`Pack asset path must stay inside the pack directory: ${asset.path}`);
  }

  return normalizedPath;
}

function joinUrlPaths(...parts) {
  return parts
    .flatMap((part) => String(part).split('/'))
    .filter(Boolean)
    .join('/');
}

function writePackMetadata(outDir, packAssetRecords) {
  if (packAssetRecords.length === 0) {
    return;
  }

  const metadataFile = join(outDir, packMetadataPath);
  mkdirSync(dirname(metadataFile), { recursive: true });
  writeFileSync(metadataFile, `${JSON.stringify(buildPackMetadata(packAssetRecords), null, 2)}\n`);
}

function buildPackMetadata(packAssetRecords) {
  return {
    agentIslesPacksVersion: 1,
    packs: packAssetRecords.map((record) => ({
      id: record.id,
      safeId: record.safeId,
      name: record.pack.name,
      version: record.pack.version,
      description: record.pack.description,
      homepage: record.pack.homepage,
      tags: record.pack.tags || [],
      assets: record.assets.map((asset) => ({
        type: asset.type,
        path: asset.path,
        outputPath: asset.outputPath,
      })),
    })),
  };
}

function copyPackAssets(outDir, packAssetRecords) {
  for (const record of packAssetRecords) {
    for (const asset of record.assets) {
      if (!existsSync(asset.resolvedPath)) {
        throw new Error(`Pack asset source missing: ${asset.resolvedPath}`);
      }

      const destination = join(outDir, asset.outputPath);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(asset.resolvedPath, destination);
    }
  }
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
