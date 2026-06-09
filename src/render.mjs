import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

import { resolvePackInputs } from './pack-resolver.mjs';
import {
  RENDER_MODES,
  normalizeAssetMode,
  normalizeRenderMode,
  validateMarkdownInput,
} from './renderer/input.mjs';
import { buildSanitizedSchema, dropUnsafeRawHtmlElements } from './renderer/sanitize.mjs';
import {
  rehypeAgentD2,
  rehypeAgentFlow,
  rehypeAgentHeadingAnchors,
  rehypeAgentMermaid,
  rehypeAgentWritebackMetadata,
  remarkCollectMarkdownTaskMarkers,
} from './renderer/rehype-plugins.mjs';
import {
  buildHtmlPage,
  copyComponentBundle,
  copyLocalAssets,
  copyMermaidRuntime,
  hasMermaidDiagrams,
} from './renderer/page.mjs';
import { buildPackAssetRecords, copyPackAssets, writePackMetadata } from './renderer/pack-assets.mjs';

export {
  AgentIslesInputError,
  RENDER_MODES,
  defaultOutFile,
  normalizeAssetMode,
  normalizeRenderMode,
  validateMarkdownInput,
} from './renderer/input.mjs';
export { buildPackAssetRecords } from './renderer/pack-assets.mjs';

export async function renderMarkdown(markdown, options = {}) {
  const renderMode = normalizeRenderMode(options.renderMode);
  const assetMode = normalizeAssetMode(options.assetMode);
  const sourceMarkdown = typeof options.sourceMarkdown === 'string' ? options.sourceMarkdown : markdown;
  const markdownTaskMarkers = [];
  const toc = [];
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCollectMarkdownTaskMarkers, { records: markdownTaskMarkers, sourceMarkdown })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeAgentMermaid)
    .use(rehypeAgentD2)
    .use(rehypeAgentFlow)
    .use(rehypeRaw)
    .use(rehypeAgentWritebackMetadata, {
      ...options,
      sourceMarkdown,
      markdownTaskMarkers,
    });

  if (renderMode === RENDER_MODES.SANITIZED) {
    processor
      .use(dropUnsafeRawHtmlElements)
      .use(rehypeSanitize, buildSanitizedSchema(options.resolvedPacks));
  }

  processor.use(rehypeAgentHeadingAnchors, { toc });

  const body = await processor
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: renderMode === RENDER_MODES.TRUSTED })
    .process(markdown);

  return buildHtmlPage(String(body), { ...options, renderMode, assetMode, sourceMarkdown, toc });
}

export async function renderMarkdownString(markdown, options = {}) {
  const assetMode = normalizeAssetMode(options.assetMode);
  const resolvedPacks = await resolvePackInputs({
    explicitPacks: options.explicitPacks || [],
    projectDir: options.projectDir ?? process.cwd(),
    includeUserPacks: options.includeUserPacks === true,
    userConfigDir: options.userConfigDir || null,
  });
  const packAssetRecords = buildPackAssetRecords(resolvedPacks.packs);
  const html = await renderMarkdown(markdown, {
    ...options,
    assetMode,
    resolvedPacks,
    packAssetRecords,
  });

  return { html, resolvedPacks, packAssetRecords, assetMode };
}

export async function renderMarkdownFile(inputPath, options = {}) {
  const filePath = validateMarkdownInput(inputPath);
  const markdown = readFileSync(filePath, 'utf8');
  const outFile = options.outFile ? resolve(options.outFile) : undefined;
  const { html, resolvedPacks, packAssetRecords, assetMode } = await renderMarkdownString(markdown, {
    ...options,
    sourcePath: filePath,
    projectDir: options.projectDir ?? dirname(filePath),
  });

  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);
    if (assetMode !== 'inline') {
      copyComponentBundle(dirname(outFile));
      if (assetMode === 'local') {
        copyLocalAssets(dirname(outFile));
        if (hasMermaidDiagrams(html)) {
          copyMermaidRuntime(dirname(outFile));
        }
      }
      copyPackAssets(dirname(outFile), packAssetRecords);
      writePackMetadata(dirname(outFile), packAssetRecords);
    }
  }

  return { html, outFile, resolvedPacks };
}
