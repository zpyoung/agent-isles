import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, normalize, resolve, sep } from 'node:path';

/**
 * Supported pack manifest version.
 */
export const SUPPORTED_PACK_VERSION = 1;

/**
 * Default pack manifest file name.
 */
export const PACK_MANIFEST_FILE = 'agent-isles.pack.json';

/**
 * Reserved tag prefix that cannot be declared in user packs.
 */
export const RESERVED_TAG_PREFIX = 'agent-';

/**
 * Supported asset types in pack manifests.
 */
export const ASSET_TYPES = Object.freeze({
  MODULE: 'module',
  STYLE: 'style',
});

/**
 * Pack loader error codes.
 */
export const PACK_ERROR_CODES = Object.freeze({
  MANIFEST_NOT_FOUND: 'ERR_PACK_MANIFEST_NOT_FOUND',
  INVALID_JSON: 'ERR_PACK_INVALID_JSON',
  UNSUPPORTED_VERSION: 'ERR_PACK_UNSUPPORTED_VERSION',
  INVALID_NAME: 'ERR_PACK_INVALID_NAME',
  INVALID_TAG_NAME: 'ERR_PACK_INVALID_TAG_NAME',
  RESERVED_TAG_PREFIX: 'ERR_PACK_RESERVED_TAG_PREFIX',
  INVALID_ATTRIBUTE_NAME: 'ERR_PACK_INVALID_ATTRIBUTE_NAME',
  INVALID_ASSET_TYPE: 'ERR_PACK_INVALID_ASSET_TYPE',
  INVALID_ASSET_PATH: 'ERR_PACK_INVALID_ASSET_PATH',
  PATH_TRAVERSAL: 'ERR_PACK_PATH_TRAVERSAL',
  ASSET_NOT_FOUND: 'ERR_PACK_ASSET_NOT_FOUND',
  MISSING_REQUIRED_FIELD: 'ERR_PACK_MISSING_REQUIRED_FIELD',
});

/**
 * Error class for pack loading failures.
 */
export class PackLoadError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PackLoadError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates a pack name.
 * Pack names must be stable identifiers: lowercase, alphanumeric, hyphens, starting with a letter.
 */
function validatePackName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new PackLoadError(
      'Pack name must be a non-empty string',
      PACK_ERROR_CODES.INVALID_NAME,
      { name },
    );
  }

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new PackLoadError(
      `Invalid pack name: "${name}". Pack names must start with a lowercase letter and contain only lowercase letters, digits, and hyphens.`,
      PACK_ERROR_CODES.INVALID_NAME,
      { name },
    );
  }
}

/**
 * Validates a custom element tag name.
 * Tag names must follow HTML custom element rules and not use the reserved 'agent-' prefix.
 */
function validateTagName(tagName, packName) {
  if (typeof tagName !== 'string' || tagName.length === 0) {
    throw new PackLoadError(
      `Invalid tag name: "${tagName}". Tag names must be non-empty strings.`,
      PACK_ERROR_CODES.INVALID_TAG_NAME,
      { tagName, packName },
    );
  }

  // Custom element names must contain a hyphen and follow specific rules
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(tagName)) {
    throw new PackLoadError(
      `Invalid tag name: "${tagName}". Custom element tag names must contain at least one hyphen, start with a lowercase letter, and contain only lowercase letters, digits, and hyphens.`,
      PACK_ERROR_CODES.INVALID_TAG_NAME,
      { tagName, packName },
    );
  }

  // Check for reserved prefix
  if (tagName.startsWith(RESERVED_TAG_PREFIX)) {
    throw new PackLoadError(
      `Pack "${packName}" declares tag "${tagName}", which uses the reserved "${RESERVED_TAG_PREFIX}" prefix. Core agent islands are reserved and cannot be declared in user packs.`,
      PACK_ERROR_CODES.RESERVED_TAG_PREFIX,
      { tagName, packName },
    );
  }
}

/**
 * Validates an HTML attribute name.
 */
function validateAttributeName(attrName, tagName, packName) {
  if (typeof attrName !== 'string' || attrName.length === 0) {
    throw new PackLoadError(
      `Invalid attribute name: "${attrName}". Attribute names must be non-empty strings.`,
      PACK_ERROR_CODES.INVALID_ATTRIBUTE_NAME,
      { attrName, tagName, packName },
    );
  }

  // HTML attribute names: lowercase letters, digits, hyphens
  // We allow data-* and aria-* patterns
  if (!/^[a-z][a-z0-9-]*$/.test(attrName)) {
    throw new PackLoadError(
      `Invalid attribute name: "${attrName}". Attribute names must start with a lowercase letter and contain only lowercase letters, digits, and hyphens.`,
      PACK_ERROR_CODES.INVALID_ATTRIBUTE_NAME,
      { attrName, tagName, packName },
    );
  }
}

/**
 * Validates an optional manifest array field.
 */
function validateOptionalArrayField(value, fieldName, code, details = {}) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new PackLoadError(
      `Manifest field "${fieldName}" must be an array when provided.`,
      code,
      { ...details, value },
    );
  }

  return value;
}

/**
 * Validates that a path is relative and does not contain traversal patterns.
 */
function validateRelativePath(path, packDir) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new PackLoadError(
      `Invalid asset path: "${path}". Asset paths must be non-empty strings.`,
      PACK_ERROR_CODES.INVALID_ASSET_PATH,
      { path },
    );
  }

  // Reject absolute paths
  if (resolve(path) === normalize(path)) {
    throw new PackLoadError(
      `Invalid asset path: "${path}". Asset paths must be relative to the pack directory.`,
      PACK_ERROR_CODES.INVALID_ASSET_PATH,
      { path },
    );
  }

  // Reject paths that traverse outside the pack directory
  const normalizedPath = normalize(path);
  const resolvedPath = resolve(packDir, normalizedPath);
  const relativeToPack = resolve(packDir);

  // Check if the resolved path is within the pack directory
  if (!resolvedPath.startsWith(relativeToPack + sep) && resolvedPath !== relativeToPack) {
    throw new PackLoadError(
      `Path traversal detected: "${path}". Asset paths must remain within the pack directory.`,
      PACK_ERROR_CODES.PATH_TRAVERSAL,
      { path, packDir },
    );
  }

  return resolvedPath;
}

/**
 * Resolves a pack directory from a given path.
 * If the path is a directory, returns it.
 * If the path is a manifest file, returns its directory.
 */
function resolvePackDirectory(packPath) {
  const absolutePath = resolve(packPath);

  if (!existsSync(absolutePath)) {
    throw new PackLoadError(
      `Pack path not found: ${absolutePath}`,
      PACK_ERROR_CODES.MANIFEST_NOT_FOUND,
      { packPath: absolutePath },
    );
  }

  const stats = statSync(absolutePath);

  if (stats.isDirectory()) {
    return absolutePath;
  }

  if (stats.isFile()) {
    if (basename(absolutePath) !== PACK_MANIFEST_FILE) {
      throw new PackLoadError(
        `Invalid pack manifest path: ${absolutePath}. Expected manifest file named ${PACK_MANIFEST_FILE}.`,
        PACK_ERROR_CODES.MANIFEST_NOT_FOUND,
        { packPath: absolutePath, expectedFile: PACK_MANIFEST_FILE },
      );
    }
    return dirname(absolutePath);
  }

  throw new PackLoadError(
    `Invalid pack path: ${absolutePath}. Expected a directory or manifest file.`,
    PACK_ERROR_CODES.MANIFEST_NOT_FOUND,
    { packPath: absolutePath },
  );
}

/**
 * Loads and parses a pack manifest from a local directory or manifest path.
 *
 * @param {string} packPath - Path to pack directory or manifest file
 * @returns {Object} Normalized pack metadata
 */
export function loadPackManifest(packPath) {
  const packDir = resolvePackDirectory(packPath);
  const manifestPath = join(packDir, PACK_MANIFEST_FILE);

  // Check manifest exists
  if (!existsSync(manifestPath)) {
    throw new PackLoadError(
      `Pack manifest not found: ${manifestPath}`,
      PACK_ERROR_CODES.MANIFEST_NOT_FOUND,
      { packPath, manifestPath },
    );
  }

  // Read and parse JSON
  let manifest;
  try {
    const manifestContent = readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    throw new PackLoadError(
      `Failed to parse pack manifest: ${manifestPath}\n${error.message}`,
      PACK_ERROR_CODES.INVALID_JSON,
      { manifestPath, originalError: error.message },
    );
  }

  // Validate required fields
  if (manifest.agentIslesPackVersion == null) {
    throw new PackLoadError(
      'Missing required field: agentIslesPackVersion',
      PACK_ERROR_CODES.MISSING_REQUIRED_FIELD,
      { manifestPath },
    );
  }

  if (manifest.name == null) {
    throw new PackLoadError(
      'Missing required field: name',
      PACK_ERROR_CODES.MISSING_REQUIRED_FIELD,
      { manifestPath },
    );
  }

  // Validate version
  if (manifest.agentIslesPackVersion !== SUPPORTED_PACK_VERSION) {
    throw new PackLoadError(
      `Unsupported pack version: ${manifest.agentIslesPackVersion}. Expected version ${SUPPORTED_PACK_VERSION}.`,
      PACK_ERROR_CODES.UNSUPPORTED_VERSION,
      { version: manifest.agentIslesPackVersion, supported: SUPPORTED_PACK_VERSION },
    );
  }

  // Validate pack name
  validatePackName(manifest.name);

  // Normalize tags (default to empty array)
  const tags = validateOptionalArrayField(
    manifest.tags,
    'tags',
    PACK_ERROR_CODES.INVALID_TAG_NAME,
    { manifestPath, packName: manifest.name },
  );

  // Validate and normalize tag declarations
  const normalizedTags = [];
  for (const tag of tags) {
    if (typeof tag === 'string') {
      // Simple tag name without attributes
      validateTagName(tag, manifest.name);
      normalizedTags.push({ name: tag, attributes: [] });
    } else if (typeof tag === 'object' && tag !== null) {
      // Tag with attributes
      if (!tag.name) {
        throw new PackLoadError(
          'Tag declaration missing required "name" field',
          PACK_ERROR_CODES.INVALID_TAG_NAME,
          { tag, packName: manifest.name },
        );
      }

      validateTagName(tag.name, manifest.name);

      const attributes = validateOptionalArrayField(
        tag.attributes,
        'attributes',
        PACK_ERROR_CODES.INVALID_ATTRIBUTE_NAME,
        { tagName: tag.name, packName: manifest.name },
      );
      for (const attr of attributes) {
        validateAttributeName(attr, tag.name, manifest.name);
      }

      normalizedTags.push({
        name: tag.name,
        attributes,
      });
    } else {
      throw new PackLoadError(
        `Invalid tag declaration: ${JSON.stringify(tag)}. Tags must be strings or objects with a "name" field.`,
        PACK_ERROR_CODES.INVALID_TAG_NAME,
        { tag, packName: manifest.name },
      );
    }
  }

  // Validate and normalize assets
  const assets = validateOptionalArrayField(
    manifest.assets,
    'assets',
    PACK_ERROR_CODES.INVALID_ASSET_TYPE,
    { manifestPath, packName: manifest.name },
  );
  const normalizedAssets = [];

  for (const asset of assets) {
    if (typeof asset !== 'object' || asset === null || Array.isArray(asset)) {
      throw new PackLoadError(
        'Asset declarations must be objects with "type" and "path" fields',
        PACK_ERROR_CODES.INVALID_ASSET_TYPE,
        { asset, packName: manifest.name },
      );
    }

    if (!asset.type) {
      throw new PackLoadError(
        'Asset declaration missing required "type" field',
        PACK_ERROR_CODES.INVALID_ASSET_TYPE,
        { asset, packName: manifest.name },
      );
    }

    if (!asset.path) {
      throw new PackLoadError(
        'Asset declaration missing required "path" field',
        PACK_ERROR_CODES.INVALID_ASSET_PATH,
        { asset, packName: manifest.name },
      );
    }

    // Validate asset type
    const validTypes = Object.values(ASSET_TYPES);
    if (!validTypes.includes(asset.type)) {
      throw new PackLoadError(
        `Invalid asset type: "${asset.type}". Supported types: ${validTypes.join(', ')}`,
        PACK_ERROR_CODES.INVALID_ASSET_TYPE,
        { assetType: asset.type, validTypes, packName: manifest.name },
      );
    }

    // Validate and resolve asset path
    const resolvedAssetPath = validateRelativePath(asset.path, packDir);

    // Check asset exists and points to a file
    if (!existsSync(resolvedAssetPath)) {
      throw new PackLoadError(
        `Asset file not found: ${asset.path}`,
        PACK_ERROR_CODES.ASSET_NOT_FOUND,
        { assetPath: asset.path, resolvedPath: resolvedAssetPath, packName: manifest.name },
      );
    }

    if (!statSync(resolvedAssetPath).isFile()) {
      throw new PackLoadError(
        `Invalid asset path: "${asset.path}". Asset paths must point to a file.`,
        PACK_ERROR_CODES.INVALID_ASSET_PATH,
        { assetPath: asset.path, resolvedPath: resolvedAssetPath, packName: manifest.name },
      );
    }

    normalizedAssets.push({
      type: asset.type,
      path: asset.path,
      resolvedPath: resolvedAssetPath,
    });
  }

  // Return normalized pack metadata
  return {
    packVersion: manifest.agentIslesPackVersion,
    name: manifest.name,
    version: manifest.version || undefined,
    description: manifest.description || undefined,
    homepage: manifest.homepage || undefined,
    tags: normalizedTags,
    assets: normalizedAssets,
    packDir,
    manifestPath,
  };
}
