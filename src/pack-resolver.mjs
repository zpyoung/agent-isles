import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { platform } from 'node:process';
import { loadPackManifest } from './pack-loader.mjs';

/**
 * Config file name for both project and user scopes.
 */
export const CONFIG_FILE = 'isles.config.json';

/**
 * Error class for pack resolution failures.
 */
export class PackResolutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PackResolutionError';
    this.details = details;
  }
}

/**
 * Gets the platform-specific user config directory for Agent Isles.
 *
 * @returns {string} Absolute path to user config directory
 */
export function getUserConfigDir() {
  const home = homedir();

  switch (platform) {
    case 'darwin':
      // macOS: ~/Library/Application Support/agent-isles
      return join(home, 'Library', 'Application Support', 'agent-isles');
    case 'win32':
      // Windows: %LOCALAPPDATA%\agent-isles
      return join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'agent-isles');
    default:
      // Linux/Unix: ~/.config/agent-isles
      return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'agent-isles');
  }
}

/**
 * Loads project config from a project directory.
 *
 * @param {string} projectDir - Project directory path
 * @returns {Object|null} Parsed config object or null if not found
 */
export function loadProjectConfig(projectDir) {
  if (!projectDir) {
    return null;
  }

  const configPath = join(projectDir, CONFIG_FILE);
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new PackResolutionError(
      `Failed to parse project config: ${configPath}\n${error.message}`,
      { configPath, originalError: error.message },
    );
  }
}

/**
 * Loads user config from the user config directory.
 *
 * @param {string} [userConfigDir] - Optional override for user config directory (for testing)
 * @returns {Object|null} Parsed config object or null if not found
 */
export function loadUserConfig(userConfigDir = null) {
  const configDir = userConfigDir || getUserConfigDir();
  const configPath = join(configDir, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new PackResolutionError(
      `Failed to parse user config: ${configPath}\n${error.message}`,
      { configPath, originalError: error.message },
    );
  }
}

/**
 * Normalizes a pack reference to an absolute path.
 * Validates that unsupported V1+ source types are rejected.
 *
 * @param {string} packRef - Pack reference (path, npm:package, git:url, etc.)
 * @param {string} [baseDir] - Base directory for resolving relative paths
 * @returns {string} Absolute pack path
 */
function normalizePackReference(packRef, baseDir = null) {
  if (typeof packRef !== 'string') {
    throw new PackResolutionError(
      'Pack reference must be a string',
      { packRef },
    );
  }

  // Check for V1+ source types
  const unsupportedPrefixes = ['npm:', 'git:', 'https:', 'http:'];
  for (const prefix of unsupportedPrefixes) {
    if (packRef.startsWith(prefix)) {
      throw new PackResolutionError(
        `Pack source type "${prefix}" is not supported in V1. ` +
        `Remote package resolution (npm, git) will be added in V1+. ` +
        `See https://github.com/zpyoung/agent-isles/discussions/64 for the roadmap.`,
        { packRef, prefix },
      );
    }
  }

  // Resolve relative paths against base directory if provided
  if (baseDir) {
    return resolve(baseDir, packRef);
  }

  return resolve(packRef);
}

function packOwnerId(packManifest) {
  return packManifest.version ? `${packManifest.name}@${packManifest.version}` : packManifest.name;
}

function packOwnerRecord(packManifest) {
  return {
    ownerId: packOwnerId(packManifest),
    name: packManifest.name,
    version: packManifest.version,
    packDir: packManifest.packDir,
  };
}

function registerPackTags(packManifest, tagOwners) {
  const owner = packOwnerRecord(packManifest);

  for (const tag of packManifest.tags || []) {
    const tagName = tag.name;
    const existingOwner = tagOwners.get(tagName);

    if (!existingOwner) {
      tagOwners.set(tagName, owner);
      continue;
    }

    if (existingOwner.ownerId === owner.ownerId) {
      continue;
    }

    throw new PackResolutionError(
      `Component pack tag conflict: tag "${tagName}" is declared by both ${existingOwner.ownerId} and ${owner.ownerId}. Each custom-element tag must have exactly one pack owner.`,
      {
        tagName,
        owners: [existingOwner, owner],
      },
    );
  }
}

/**
 * Resolves pack inputs from multiple sources with deterministic ordering and deduplication.
 *
 * Resolution order (higher priority first):
 * 1. Explicit CLI packs (--pack)
 * 2. Project config packs (isles.config.json in project dir)
 * 3. User config packs (isles.config.json in user config dir, if includeUserPacks is true)
 *
 * @param {Object} options - Resolution options
 * @param {string[]} options.explicitPacks - Pack paths from CLI --pack flags
 * @param {string} [options.projectDir] - Project directory to search for config
 * @param {boolean} options.includeUserPacks - Whether to include user config packs
 * @param {string} [options.userConfigDir] - Optional override for user config directory (for testing)
 * @returns {Promise<Object>} Resolved pack data with { packs, tagOwners, packRecords, packPathRecords }
 */
export async function resolvePackInputs(options) {
  const {
    explicitPacks = [],
    projectDir = null,
    includeUserPacks = false,
    userConfigDir = null,
  } = options;

  const packPathRecords = [];
  const recordsByPath = new Map();

  // Helper to add pack path with deduplication while preserving all source claims.
  function addPackPath(packRef, baseDir = null, source) {
    const absolutePath = normalizePackReference(packRef, baseDir);
    let record = recordsByPath.get(absolutePath);

    if (!record) {
      record = { path: absolutePath, sources: [] };
      recordsByPath.set(absolutePath, record);
      packPathRecords.push(record);
    }

    record.sources.push({ ...source, packRef, baseDir, resolvedPath: absolutePath });
  }

  // 1. Explicit CLI packs (highest priority)
  for (const packRef of explicitPacks) {
    addPackPath(packRef, null, { type: 'explicit', label: 'explicit --pack' });
  }

  // 2. Project config packs
  if (projectDir) {
    const projectConfigPath = join(projectDir, CONFIG_FILE);
    const projectConfig = loadProjectConfig(projectDir);
    if (projectConfig?.packs) {
      for (const packRef of projectConfig.packs) {
        addPackPath(packRef, projectDir, {
          type: 'project',
          label: 'project config',
          configPath: projectConfigPath,
        });
      }
    }
  }

  // 3. User config packs (if enabled)
  if (includeUserPacks) {
    const configDir = userConfigDir || getUserConfigDir();
    const userConfigPath = join(configDir, CONFIG_FILE);
    const userConfig = loadUserConfig(userConfigDir);
    if (userConfig?.packs) {
      for (const packRef of userConfig.packs) {
        addPackPath(packRef, configDir, {
          type: 'user',
          label: 'user config',
          configPath: userConfigPath,
        });
      }
    }
  }

  // Load all pack manifests, dedupe by canonical pack owner, and claim tag ownership.
  const packs = [];
  const packRecords = [];
  const recordsByOwner = new Map();
  const seenOwners = new Set();
  const tagOwners = new Map();

  for (const packPathRecord of packPathRecords) {
    const packManifest = loadPackManifest(packPathRecord.path);
    const ownerId = packOwnerId(packManifest);

    if (seenOwners.has(ownerId)) {
      const existingRecord = recordsByOwner.get(ownerId);
      existingRecord.sources.push(...packPathRecord.sources);
      continue;
    }

    registerPackTags(packManifest, tagOwners);
    seenOwners.add(ownerId);
    packs.push(packManifest);
    const packRecord = {
      pack: packManifest,
      ownerId,
      sources: [...packPathRecord.sources],
    };
    recordsByOwner.set(ownerId, packRecord);
    packRecords.push(packRecord);
  }

  return { packs, tagOwners, packRecords, packPathRecords };
}
