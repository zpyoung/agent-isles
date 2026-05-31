import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { AgentIslesInputError } from './input.mjs';

const localAssetDirName = 'assets';
const packAssetRootPath = `${localAssetDirName}/agent-isles/packs`;
const packMetadataPath = `${localAssetDirName}/agent-isles/packs.json`;

export function buildPackMetadataTags(packAssetRecords) {
  if (packAssetRecords.length === 0) {
    return '';
  }

  const packIds = packAssetRecords.map((record) => record.id).join(',');
  return `  <meta name="agent-isles-packs" content="${escapeHtml(packIds)}" />
  <link rel="agent-isles-packs" href="./${packMetadataPath}" type="application/json" />
`;
}

// Inline assets land inside raw-text <script>/<style> elements, where a literal
// </script> or </style> would prematurely close the element and corrupt the
// single-file output. Neutralize the end-tag opener so trusted bundles and pack
// assets embed verbatim (the backslash form is inert in JS/CSS string contexts,
// the only place these sequences legitimately appear).
function escapeInlineScript(code) {
  return String(code).replace(/<\/(script)/gi, '<\\/$1');
}

function escapeInlineStyle(code) {
  return String(code).replace(/<\/(style)/gi, '<\\/$1');
}

function readInlinePackAsset(record, asset, kind) {
  if (!asset.resolvedPath || !existsSync(asset.resolvedPath)) {
    throw new AgentIslesInputError(
      `Cannot inline ${kind} asset for pack "${record.id}": declared asset "${asset.path}" was not found` +
        `${asset.resolvedPath ? ` at ${asset.resolvedPath}` : ''}. ` +
        'Ensure the file exists locally, or render with --assets local or --assets cdn instead.',
    );
  }

  const raw = readFileSync(asset.resolvedPath, 'utf8');
  return kind === 'style' ? escapeInlineStyle(raw) : escapeInlineScript(raw);
}

export function buildPackStyleLinks(packAssetRecords, assetMode = 'cdn') {
  const styleLinks = packAssetRecords.flatMap((record) => {
    const styleAssets = record.assets.filter((asset) => asset.type === 'style');

    if (assetMode === 'inline') {
      return styleAssets.map((asset) => {
        const css = readInlinePackAsset(record, asset, 'style');
        return `  <style data-agent-isles-pack="${escapeHtml(record.id)}">
/* Pack: ${escapeHtml(record.id)} - ${escapeHtml(asset.path)} */
${css}
  </style>`;
      });
    }

    return styleAssets.map((asset) =>
      `  <link href="${escapeHtml(asset.url)}" rel="stylesheet" data-agent-isles-pack="${escapeHtml(record.id)}" />`
    );
  });

  if (styleLinks.length === 0) {
    return '';
  }

  return `\n${styleLinks.join('\n')}`;
}

export function buildPackModuleScripts(packAssetRecords, assetMode = 'cdn') {
  const moduleScripts = packAssetRecords.flatMap((record) => {
    const moduleAssets = record.assets.filter((asset) => asset.type === 'module');

    if (assetMode === 'inline') {
      return moduleAssets.map((asset) => {
        const js = readInlinePackAsset(record, asset, 'module');
        return `  <script type="module" data-agent-isles-pack="${escapeHtml(record.id)}">
/* Pack: ${escapeHtml(record.id)} - ${escapeHtml(asset.path)} */
${js}
  </script>`;
      });
    }

    return moduleAssets.map((asset) =>
      `  <script type="module" src="${escapeHtml(asset.url)}" data-agent-isles-pack="${escapeHtml(record.id)}"></script>`
    );
  });

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

export function writePackMetadata(outDir, packAssetRecords) {
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

export function copyPackAssets(outDir, packAssetRecords) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
