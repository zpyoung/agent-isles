import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
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

export async function renderMarkdown(markdown, options = {}) {
  const body = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  return buildHtmlPage(String(body), options);
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
