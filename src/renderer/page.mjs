import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { buildPackAssetRecords, buildPackMetadataTags, buildPackModuleScripts, buildPackStyleLinks } from './pack-assets.mjs';
import { normalizeAssetMode } from './input.mjs';

const require = createRequire(import.meta.url);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, '..', '..');
const themePath = join(projectRoot, 'src', 'theme', 'agent-theme.css');
const componentBundlePath = join(projectRoot, 'dist', 'agent-components.js');
const componentScriptName = 'agent-components.js';
const mermaidRuntimePath = require.resolve('mermaid/dist/mermaid.min.js');
const mermaidRuntimeName = 'mermaid.min.js';
const mermaidCdnUrl = ['https://', 'cdn', '.', 'jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'].join('');
const localAssetDirName = 'assets';
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

export function buildHtmlPage(body, options = {}) {
  const title = options.title || 'Agent Isles Output';
  const assetMode = normalizeAssetMode(options.assetMode);
  const theme = readTheme();
  const packAssetRecords = options.packAssetRecords || buildPackAssetRecords(options.resolvedPacks?.packs || []);
  const tocHtml = options.showSource ? '' : buildTableOfContents(options.toc);
  const hasToc = Boolean(tocHtml);
  const mainClass = options.showSource
    ? 'agent-isles-page agent-isles-page--source-view container-fluid py-4'
    : `agent-isles-page container py-4${hasToc ? ' agent-isles-page--with-toc' : ''}`;
  const pageBody = options.showSource ? buildSourceComparison(body, options.sourceMarkdown || '') : body;
  const missingBundleComment = existsSync(componentBundlePath)
    ? ''
    : '\n  <!-- Agent Isles warning: dist/agent-components.js is missing. Run `npm run build`. -->';
  const styles = buildStyles(assetMode);
  const scripts = buildScripts(assetMode, missingBundleComment);
  const writebackClientScript = buildWritebackClientScript(options.writeback);
  const packMetadata = assetMode === 'inline' ? '' : buildPackMetadataTags(packAssetRecords);
  const writebackMetadata = buildWritebackMetadataTags(options.writeback);
  const packStyleLinks = buildPackStyleLinks(packAssetRecords, assetMode);
  const packModuleScripts = buildPackModuleScripts(packAssetRecords, assetMode);
  const componentScript = buildComponentScript(assetMode, missingBundleComment);
  const mermaidScripts = hasMermaidDiagrams(body) ? buildMermaidScripts(assetMode) : '';

  let mainBody;
  if (options.showSource) {
    mainBody = pageBody;
  } else if (hasToc) {
    mainBody = `    <div class="agent-isles-layout">
      <div class="agent-isles-content">
${indent(pageBody, 8)}
      </div>
${tocHtml}
    </div>`;
  } else {
    mainBody = indent(pageBody, 4);
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
${packMetadata}${writebackMetadata}${styles}
  <style>${theme}</style>${packStyleLinks}
</head>
<body>
  <main class="${mainClass}">
${mainBody}
  </main>
${scripts}${writebackClientScript}${mermaidScripts}${componentScript}${packModuleScripts}
</body>
</html>`;
}

export function hasMermaidDiagrams(html) {
  return String(html).includes('data-agent-mermaid');
}

function buildTableOfContents(toc = []) {
  const headings = toc.filter((entry) => entry.level >= 2 && entry.level <= 3);
  if (headings.length < 2) {
    return '';
  }

  const items = headings.map((entry) =>
    `      <li class="agent-isles-toc-item agent-isles-toc-item--h${entry.level}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`
  ).join('\n');

  return `    <nav class="agent-isles-toc" aria-label="Table of contents">
      <p class="agent-isles-toc-title">On this page</p>
      <ol>
${items}
      </ol>
    </nav>`;
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

function escapeInlineScript(code) {
  return String(code).replace(/<\/(script)/gi, '<\\/$1');
}

function escapeInlineStyle(code) {
  return String(code).replace(/<\/(style)/gi, '<\\/$1');
}

function buildStyles(assetMode) {
  if (assetMode === 'inline') {
    const bootstrapCss = escapeInlineStyle(readFileSync(require.resolve('bootstrap/dist/css/bootstrap.min.css'), 'utf8'));
    const highlightCss = escapeInlineStyle(readFileSync(require.resolve('highlight.js/styles/github-dark.min.css'), 'utf8'));
    return `  <style>
/* Bootstrap CSS */
${bootstrapCss}
  </style>
  <style>
/* Highlight.js CSS */
${highlightCss}
  </style>`;
  }

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
  let bootstrapScript;

  if (assetMode === 'inline') {
    const bootstrapJs = escapeInlineScript(readFileSync(require.resolve('bootstrap/dist/js/bootstrap.bundle.min.js'), 'utf8'));
    bootstrapScript = `  <script>
/* Bootstrap JS */
${bootstrapJs}
  </script>`;
  } else if (assetMode === 'local') {
    bootstrapScript = `  <script src="./${localAssetDirName}/bootstrap.bundle.min.js"></script>`;
  } else {
    bootstrapScript = `  <script
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
    crossorigin="anonymous">
  </script>`;
  }

  return `${bootstrapScript}${missingBundleComment}`;
}

function buildWritebackClientScript(writebackOptions = {}) {
  if (writebackOptions.enabled !== true) {
    return '';
  }

  return `
  <script>
/* Agent Isles local writeback client */
(function () {
  const endpointMeta = document.querySelector('meta[name="agent-isles-writeback-endpoint"]');
  const endpoint = endpointMeta && endpointMeta.getAttribute('content');
  if (!endpoint) {
    return;
  }

  function removeError(input) {
    const existing = input.parentElement && input.parentElement.querySelector('.agent-isles-writeback-error');
    if (existing) {
      existing.remove();
    }
  }

  function showError(input, message) {
    removeError(input);
    const error = document.createElement('span');
    error.className = 'agent-isles-writeback-error text-danger small ms-2';
    error.setAttribute('role', 'alert');
    error.textContent = 'Writeback failed: ' + message;
    input.insertAdjacentElement('afterend', error);
  }

  async function submitCheckboxWriteback(input) {
    const previousChecked = !input.checked;
    const rawMetadata = input.getAttribute('data-agent-isles-writeback');
    if (!rawMetadata) {
      return;
    }

    let request;
    try {
      const metadata = JSON.parse(rawMetadata);
      request = {
        ...metadata,
        operation: {
          ...(metadata.operation || {}),
          payload: {
            ...(metadata.operation && metadata.operation.payload ? metadata.operation.payload : {}),
            checked: input.checked,
          },
        },
      };
    } catch (error) {
      input.checked = previousChecked;
      showError(input, 'invalid source metadata');
      return;
    }

    input.disabled = true;
    removeError(input);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) {
        throw new Error((payload.error && payload.error.message) || payload.message || 'request was rejected');
      }
      request.sourceVersion = payload.nextSourceVersion || request.sourceVersion;
      if (request.target && request.target.anchor) {
        request.target.anchor.text = input.checked ? '[x]' : '[ ]';
      }
      input.setAttribute('data-agent-isles-writeback', JSON.stringify(request));
    } catch (error) {
      input.checked = previousChecked;
      showError(input, error && error.message ? error.message : String(error));
      console.warn('Agent Isles writeback failed:', error);
    } finally {
      input.disabled = false;
    }
  }

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (input.type !== 'checkbox' || !input.hasAttribute('data-agent-isles-writeback')) {
      return;
    }
    void submitCheckboxWriteback(input);
  });
}());
  </script>`;
}

function buildMermaidScripts(assetMode) {
  return `\n${buildMermaidRuntimeScript(assetMode)}\n${buildMermaidRendererScript()}`;
}

function buildMermaidRuntimeScript(assetMode) {
  if (assetMode === 'inline') {
    const mermaidRuntime = escapeInlineScript(readFileSync(mermaidRuntimePath, 'utf8'));
    return `  <script>
/* Mermaid runtime */
${mermaidRuntime}
  </script>`;
  }

  const src = assetMode === 'local' ? `./${localAssetDirName}/${mermaidRuntimeName}` : mermaidCdnUrl;
  return `  <script src="${src}"></script>`;
}

function buildMermaidRendererScript() {
  return `  <script>
/* Agent Isles Mermaid renderer */
(function () {
  const figures = Array.from(document.querySelectorAll('[data-agent-mermaid]'));
  if (figures.length === 0) {
    return;
  }

  const mermaid = globalThis.mermaid;
  const showError = (figure, sourceElement, message) => {
    const errorBlock = document.createElement('pre');
    errorBlock.className = 'agent-mermaid-error';
    errorBlock.setAttribute('role', 'alert');
    errorBlock.textContent = 'Mermaid render failed: ' + message;
    sourceElement.insertAdjacentElement('afterend', errorBlock);
    figure.dataset.agentMermaidRendered = 'false';
  };

  if (!mermaid) {
    for (const figure of figures) {
      const sourceElement = figure.querySelector('[data-agent-mermaid-source]');
      if (sourceElement) {
        showError(figure, sourceElement, 'Mermaid runtime failed to load.');
      }
    }
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
  });

  figures.forEach(async (figure, index) => {
    const sourceElement = figure.querySelector('[data-agent-mermaid-source]');
    if (!sourceElement) {
      return;
    }

    const source = sourceElement.textContent || '';
    const output = document.createElement('div');
    output.className = 'agent-mermaid-rendered';
    sourceElement.insertAdjacentElement('afterend', output);

    try {
      if (typeof mermaid.parse === 'function') {
        await mermaid.parse(source);
      }
      const renderResult = await mermaid.render(
        'agent-mermaid-' + index + '-' + Math.random().toString(36).slice(2),
        source,
      );
      output.innerHTML = renderResult.svg;
      sourceElement.hidden = true;
      figure.dataset.agentMermaidRendered = 'true';
    } catch (error) {
      output.remove();
      const message = error && error.message ? error.message : String(error);
      showError(figure, sourceElement, message);
      console.warn('Agent Isles Mermaid render failed:', error);
    }
  });
}());
  </script>`;
}

function buildComponentScript(assetMode, missingBundleComment) {
  if (assetMode === 'inline') {
    if (!existsSync(componentBundlePath)) {
      return missingBundleComment;
    }
    const componentJs = escapeInlineScript(readFileSync(componentBundlePath, 'utf8'));
    return `
  <script type="module">
/* Agent Isles component runtime */
${componentJs}
  </script>`;
  }

  return `
  <script type="module" src="./${componentScriptName}"></script>`;
}

function buildWritebackMetadataTags(writebackOptions = {}) {
  if (writebackOptions.enabled !== true) {
    return '';
  }

  const endpoint = writebackOptions.endpoint || '/__agent-isles/writeback';
  return `  <meta name="agent-isles-writeback-endpoint" content="${escapeHtml(endpoint)}" />
`;
}

function readTheme() {
  if (!existsSync(themePath)) {
    return '/* Agent Isles theme missing */';
  }

  return readFileSync(themePath, 'utf8');
}

export function copyComponentBundle(outDir) {
  if (!existsSync(componentBundlePath)) {
    return;
  }

  copyFileSync(componentBundlePath, join(outDir, componentScriptName));
}

export function copyLocalAssets(outDir) {
  const assetsDir = join(outDir, localAssetDirName);
  mkdirSync(assetsDir, { recursive: true });

  for (const asset of localAssets) {
    if (!existsSync(asset.source)) {
      throw new Error(`Local asset source missing: ${asset.source}`);
    }
    copyFileSync(asset.source, join(assetsDir, asset.fileName));
  }
}

export function copyMermaidRuntime(outDir) {
  if (!existsSync(mermaidRuntimePath)) {
    throw new Error(`Mermaid runtime source missing: ${mermaidRuntimePath}`);
  }

  const assetsDir = join(outDir, localAssetDirName);
  mkdirSync(assetsDir, { recursive: true });
  copyFileSync(mermaidRuntimePath, join(assetsDir, mermaidRuntimeName));
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
