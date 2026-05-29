import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { renderMarkdown } from './render.mjs';

const execAsync = promisify(exec);
const previewDirPrefix = 'agent-isles-preview-';

/**
 * Render ephemeral Markdown from stdin to a temporary HTML file.
 * The source Markdown is NOT persisted to disk - only the rendered HTML is written.
 *
 * @param {Object} options
 * @param {string} options.renderMode - 'trusted' or 'sanitized'
 * @param {string} options.assetMode - 'cdn' or 'local'
 * @param {boolean} options.open - Whether to open the preview in a browser
 * @param {ReadableStream} options.stdin - Standard input stream (defaults to process.stdin)
 * @returns {Promise<{outFile: string, tempDir: string}>}
 */
export async function previewMarkdown(options = {}) {
  const renderMode = options.renderMode || 'trusted';
  const assetMode = options.assetMode || 'cdn';
  const open = options.open || false;
  const stdin = options.stdin || process.stdin;

  // Read Markdown from stdin
  const markdown = await readStdin(stdin);

  if (!markdown || markdown.trim().length === 0) {
    throw new Error('No Markdown content received from stdin');
  }

  // Create a temporary directory for the preview
  const tempDir = mkdtempSync(join(tmpdir(), previewDirPrefix));
  const outFile = join(tempDir, 'preview.html');

  // Render the Markdown to HTML
  const html = await renderMarkdown(markdown, {
    renderMode,
    assetMode,
    sourceMarkdown: markdown,
  });

  // Write the HTML to the temp file
  writeFileSync(outFile, html);

  // Copy component bundle to temp directory
  copyComponentBundle(tempDir);

  // Copy local assets if needed
  if (assetMode === 'local') {
    copyLocalAssets(tempDir);
  }

  // Open in browser if requested
  if (open) {
    await openInBrowser(outFile);
  }

  return { outFile, tempDir };
}

/**
 * Read all input from stdin
 * @param {ReadableStream} stdin
 * @returns {Promise<string>}
 */
async function readStdin(stdin) {
  const chunks = [];

  return new Promise((resolve, reject) => {
    stdin.setEncoding('utf8');

    stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    stdin.on('end', () => {
      resolve(chunks.join(''));
    });

    stdin.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Copy the component bundle to the output directory
 * @param {string} outDir
 */
function copyComponentBundle(outDir) {
  const moduleDir = dirname(new URL(import.meta.url).pathname);
  const projectRoot = resolve(moduleDir, '..');
  const componentBundlePath = join(projectRoot, 'dist', 'agent-components.js');
  const componentScriptName = 'agent-components.js';

  if (!existsSync(componentBundlePath)) {
    return;
  }

  copyFileSync(componentBundlePath, join(outDir, componentScriptName));
}

/**
 * Copy local Bootstrap and highlight.js assets to the output directory
 * @param {string} outDir
 */
function copyLocalAssets(outDir) {
  // This would need to import the createRequire logic from render.mjs
  // For now, we'll skip local asset copying in preview mode to keep it simple
  // The preview command will default to cdn mode
}

/**
 * Open a file in the default browser
 * @param {string} filePath
 */
async function openInBrowser(filePath) {
  const platform = process.platform;
  let command;

  if (platform === 'darwin') {
    command = `open "${filePath}"`;
  } else if (platform === 'win32') {
    command = `start "" "${filePath}"`;
  } else {
    // Linux and other Unix-like systems
    command = `xdg-open "${filePath}"`;
  }

  try {
    await execAsync(command);
  } catch (error) {
    // Log the error but don't fail - user can still manually open the file
    console.error(`Failed to open browser: ${error.message}`);
    console.error(`You can manually open: ${filePath}`);
  }
}
