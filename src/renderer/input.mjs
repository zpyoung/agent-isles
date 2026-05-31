import { existsSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

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
      `Unsupported input file extension: ${filePath}
Expected a Markdown file ending in .md or .markdown.`,
      'ERR_AGENT_ISLES_UNSUPPORTED_INPUT_EXTENSION',
    );
  }

  return filePath;
}

export const RENDER_MODES = Object.freeze({
  TRUSTED: 'trusted',
  SANITIZED: 'sanitized',
});

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

export function normalizeAssetMode(assetMode = 'cdn') {
  if (assetMode === 'cdn' || assetMode === 'local' || assetMode === 'inline') {
    return assetMode;
  }

  throw new Error(`Unsupported asset mode: ${assetMode}. Expected "cdn", "local", or "inline".`);
}
