#!/usr/bin/env node

import {
  buildPackAssetRecords,
  AgentIslesInputError,
  defaultOutFile,
  normalizeRenderMode,
  renderMarkdownFile,
  RENDER_MODES,
  validateMarkdownInput,
} from '../src/render.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE, getUserConfigDir, PackResolutionError, resolvePackInputs } from '../src/pack-resolver.mjs';
import { watchMarkdownFile } from '../src/watch.mjs';
import { previewMarkdown } from '../src/preview.mjs';

const USAGE = `Agent Isles — Markdown seas, component islands.

Usage:
  isles render <file.md> [--out <file.html>] [--mode trusted|sanitized] [--assets cdn|local|inline] [--show-source] [--pack <path>]... [--no-user-packs]
  isles render <file.md> [--out <file.html>] [--safe|--sanitize] [--assets cdn|local|inline] [--show-source] [--pack <path>]... [--no-user-packs]
  isles packs resolve <file.md> [--pack <path>]... [--no-user-packs]
  isles watch <file.md> [--out <file.html>] [--mode trusted|sanitized] [--assets cdn|local|inline] [--show-source] [--pack <path>]... [--no-user-packs]
  isles preview (--stdin | <file.md>) [--open] [--mode trusted|sanitized] [--safe|--sanitize] [--show-source] [--pack <path>]... [--no-user-packs]

Commands:
  render         Render Markdown to browser-ready HTML
  packs resolve  Print resolved component packs, sources, asset outputs, and sanitizer permissions
  watch          Render immediately and rebuild when the Markdown file changes
  preview        Render ephemeral Markdown (stdin or a file) to a temp HTML file and print its file:// URL

Options:
  --assets cdn|local|inline   Use CDN assets (default), copy local offline assets, or inline all assets into single HTML file
  --show-source               Display escaped source Markdown beside rendered output
  --pack <path>               Load component pack from path (repeatable)
  --no-user-packs             Skip automatic user config packs for reproducible renders
`;

const packageJson = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
const [, , command, ...args] = process.argv;

if (!command || command === '--help' || command === '-h') {
  console.log(USAGE);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(packageJson.version);
  process.exit(0);
}

if (command === 'render') {
  await runRender(args);
} else if (command === 'packs') {
  await runPacks(args);
} else if (command === 'watch') {
  await runWatch(args);
} else if (command === 'preview') {
  await runPreview(args);
} else {
  console.error(`Unknown command: ${command}\n`);
  console.error(USAGE);
  process.exit(2);
}

async function runRender(args) {
  const parsed = parseRenderArgs(args);
  const input = parsed.input;

  if (!input) {
    console.error('Missing Markdown file for render.\n');
    console.error(USAGE);
    process.exit(2);
  }

  try {
    const result = await renderMarkdownFile(input, {
      outFile: parsed.outFile || defaultOutFile(input),
      renderMode: parsed.renderMode,
      assetMode: parsed.assetMode,
      showSource: parsed.showSource,
      explicitPacks: parsed.explicitPacks,
      includeUserPacks: parsed.includeUserPacks,
      projectDir: dirname(resolve(input)),
    });
    const packNames = result.resolvedPacks.packs.map((pack) => pack.name);
    console.log(`Rendered: ${result.outFile} (${parsed.renderMode} mode)`);
    console.log(`Assets: ${parsed.assetMode}`);
    console.log(`Source view: ${parsed.showSource ? 'enabled' : 'disabled'}`);
    console.log(`Packs: ${packNames.length}${packNames.length > 0 ? ` (${packNames.join(', ')})` : ''}`);
  } catch (error) {
    if (error instanceof AgentIslesInputError) {
      console.error(error.message);
      process.exit(1);
    }

    if (error instanceof PackResolutionError || error.name === 'PackLoadError') {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}

async function runPacks(args) {
  const [subcommand, ...rest] = args;

  if (subcommand !== 'resolve') {
    console.error(`Unknown packs command: ${subcommand || ''}\n`);
    console.error(USAGE);
    process.exit(2);
  }

  const parsed = parsePacksResolveArgs(rest);
  if (!parsed.input) {
    console.error('Missing Markdown file for packs resolve.\n');
    console.error(USAGE);
    process.exit(2);
  }

  try {
    const inputPath = validateMarkdownInput(parsed.input);
    const projectDir = dirname(resolve(inputPath));
    const resolvedPacks = await resolvePackInputs({
      explicitPacks: parsed.explicitPacks,
      projectDir,
      includeUserPacks: parsed.includeUserPacks,
    });
    console.log(formatPackResolutionDiagnostics({
      inputPath,
      projectDir,
      includeUserPacks: parsed.includeUserPacks,
      explicitPacks: parsed.explicitPacks,
      resolvedPacks,
    }));
  } catch (error) {
    if (error instanceof AgentIslesInputError) {
      console.error(error.message);
      process.exit(1);
    }

    if (error instanceof PackResolutionError || error.name === 'PackLoadError') {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}

function parsePacksResolveArgs(args) {
  const parsed = {
    input: undefined,
    explicitPacks: [],
    includeUserPacks: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--pack') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --pack. Provide a pack directory path.');
        process.exit(2);
      }
      parsed.explicitPacks.push(value);
      index += 1;
      continue;
    }

    if (arg === '--no-user-packs') {
      parsed.includeUserPacks = false;
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(`Unknown packs resolve option: ${arg}`);
      process.exit(2);
    }

    if (parsed.input) {
      console.error(`Unexpected extra argument: ${arg}`);
      process.exit(2);
    }

    parsed.input = arg;
  }

  return parsed;
}

function formatPackResolutionDiagnostics({ inputPath, projectDir, includeUserPacks, explicitPacks, resolvedPacks }) {
  const lines = [];
  const projectConfigPath = join(projectDir, CONFIG_FILE);
  const userConfigPath = join(getUserConfigDir(), CONFIG_FILE);
  const packAssetRecords = buildPackAssetRecords(resolvedPacks.packs);
  const assetRecordsById = new Map(packAssetRecords.map((record) => [record.id, record]));
  const warnings = [];

  lines.push('Agent Isles pack resolution');
  lines.push(`Input: ${inputPath}`);
  lines.push(`Explicit packs: ${explicitPacks.length}`);
  lines.push(`Project config: ${projectConfigPath}${existsSync(projectConfigPath) ? '' : ' (not found)'}`);
  lines.push(`User packs: ${includeUserPacks ? 'enabled' : 'disabled'}`);
  if (includeUserPacks) {
    lines.push(`User config: ${userConfigPath}${existsSync(userConfigPath) ? '' : ' (not found)'}`);
  }
  lines.push(`Resolved packs: ${resolvedPacks.packs.length}`);

  for (const packRecord of resolvedPacks.packRecords || []) {
    const pack = packRecord.pack;
    const assetRecord = assetRecordsById.get(packRecord.ownerId);
    lines.push(`- ${packRecord.ownerId}`);
    lines.push(`  Directory: ${pack.packDir}`);
    lines.push(`  Manifest: ${pack.manifestPath}`);

    for (const source of packRecord.sources) {
      const details = source.configPath || source.packRef;
      const suffix = details ? ` (${details})` : '';
      lines.push(`  Source: ${source.label}${suffix}`);
    }

    lines.push('  Sanitized permissions:');
    if ((pack.tags || []).length === 0) {
      lines.push('    tags: none');
    } else {
      for (const tag of pack.tags) {
        const sanitizedAttributes = [];
        for (const attribute of tag.attributes || []) {
          if (isSanitizedPackAttribute(attribute)) {
            sanitizedAttributes.push(attribute);
          } else {
            warnings.push(`${packRecord.ownerId}: attribute ${attribute} on ${tag.name} ignored in sanitized mode`);
          }
        }
        lines.push(`    - ${tag.name}`);
        lines.push(`      sanitized attributes: ${sanitizedAttributes.length ? sanitizedAttributes.join(', ') : 'none'}`);
      }
    }

    lines.push('  Assets:');
    if (!assetRecord || assetRecord.assets.length === 0) {
      lines.push('    none');
    } else {
      for (const asset of assetRecord.assets) {
        lines.push(`    - ${asset.type} ${asset.path} -> ${asset.outputPath}`);
      }
    }
  }

  lines.push('Warnings:');
  if (warnings.length === 0) {
    lines.push('  none');
  } else {
    for (const warning of warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}

function isSanitizedPackAttribute(attributeName) {
  const normalizedName = String(attributeName).toLowerCase();
  return !normalizedName.startsWith('on') && normalizedName !== 'style' && normalizedName !== 'srcdoc';
}

function parseRenderArgs(args) {
  const parsed = {
    input: undefined,
    outFile: undefined,
    renderMode: RENDER_MODES.TRUSTED,
    assetMode: 'cdn',
    showSource: false,
    explicitPacks: [],
    includeUserPacks: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--out') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --out.');
        process.exit(2);
      }
      parsed.outFile = value;
      index += 1;
      continue;
    }

    if (arg === '--mode') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --mode. Use trusted or sanitized.');
        process.exit(2);
      }

      try {
        parsed.renderMode = normalizeRenderMode(value);
      } catch (error) {
        console.error(error.message);
        process.exit(2);
      }

      index += 1;
      continue;
    }

    if (arg === '--assets') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --assets. Expected cdn, local, or inline.');
        process.exit(2);
      }
      if (value !== 'cdn' && value !== 'local' && value !== 'inline') {
        console.error(`Invalid --assets value: ${value}. Expected cdn, local, or inline.`);
        process.exit(2);
      }
      parsed.assetMode = value;
      index += 1;
      continue;
    }

    if (arg === '--pack') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --pack. Provide a pack directory path.');
        process.exit(2);
      }
      parsed.explicitPacks.push(value);
      index += 1;
      continue;
    }

    if (arg === '--no-user-packs') {
      parsed.includeUserPacks = false;
      continue;
    }

    if (arg === '--safe' || arg === '--sanitize') {
      parsed.renderMode = RENDER_MODES.SANITIZED;
      continue;
    }

    if (arg === '--show-source') {
      parsed.showSource = true;
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(`Unknown render option: ${arg}`);
      process.exit(2);
    }

    if (parsed.input) {
      console.error(`Unexpected extra argument: ${arg}`);
      process.exit(2);
    }

    parsed.input = arg;
  }

  return parsed;
}

async function runWatch(args) {
  const parsed = parseRenderArgs(args);
  const input = parsed.input;

  if (!input) {
    console.error('Missing Markdown file for watch.\n');
    console.error(USAGE);
    process.exit(2);
  }

  const inputPath = resolve(input);
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  await watchMarkdownFile(inputPath, {
    outFile: parsed.outFile || defaultOutFile(input),
    renderMode: parsed.renderMode,
    assetMode: parsed.assetMode,
    showSource: parsed.showSource,
    explicitPacks: parsed.explicitPacks,
    includeUserPacks: parsed.includeUserPacks,
    projectDir: dirname(resolve(input)),
    exitOnSignal: true,
  });
}

function parsePreviewArgs(args) {
  const parsed = {
    stdin: false,
    input: undefined,
    open: false,
    renderMode: RENDER_MODES.TRUSTED,
    showSource: false,
    explicitPacks: [],
    includeUserPacks: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--stdin') {
      parsed.stdin = true;
      continue;
    }

    if (arg === '--open') {
      parsed.open = true;
      continue;
    }

    if (arg === '--assets' || arg === '--out') {
      console.error(`${arg} is not supported by preview. Use "isles render" for persistent output and asset modes.`);
      process.exit(2);
    }

    if (arg === '--mode') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --mode. Use trusted or sanitized.');
        process.exit(2);
      }
      try {
        parsed.renderMode = normalizeRenderMode(value);
      } catch (error) {
        console.error(error.message);
        process.exit(2);
      }
      index += 1;
      continue;
    }

    if (arg === '--safe' || arg === '--sanitize') {
      parsed.renderMode = RENDER_MODES.SANITIZED;
      continue;
    }

    if (arg === '--show-source') {
      parsed.showSource = true;
      continue;
    }

    if (arg === '--pack') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --pack. Provide a pack directory path.');
        process.exit(2);
      }
      parsed.explicitPacks.push(value);
      index += 1;
      continue;
    }

    if (arg === '--no-user-packs') {
      parsed.includeUserPacks = false;
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(`Unknown preview option: ${arg}`);
      process.exit(2);
    }

    if (parsed.input) {
      console.error(`Unexpected extra argument: ${arg}`);
      process.exit(2);
    }

    parsed.input = arg;
  }

  return parsed;
}

async function runPreview(args) {
  const parsed = parsePreviewArgs(args);

  if (parsed.stdin && parsed.input) {
    console.error('Choose one input source: either --stdin or a Markdown file path, not both.\n');
    console.error(USAGE);
    process.exit(2);
  }

  if (!parsed.stdin && !parsed.input) {
    console.error('Missing input. Provide --stdin (pipe Markdown) or a Markdown file path.\n');
    console.error(USAGE);
    process.exit(2);
  }

  let markdown;
  let projectDir;
  try {
    if (parsed.stdin) {
      markdown = readFileSync(0, 'utf8');
      projectDir = process.cwd();
    } else {
      const filePath = validateMarkdownInput(parsed.input);
      markdown = readFileSync(filePath, 'utf8');
      projectDir = dirname(resolve(filePath));
    }

    const { outFile, fileUrl, opened } = await previewMarkdown({
      markdown,
      projectDir,
      renderMode: parsed.renderMode,
      showSource: parsed.showSource,
      explicitPacks: parsed.explicitPacks,
      includeUserPacks: parsed.includeUserPacks,
      open: parsed.open,
    });

    console.log(fileUrl);
    console.log(outFile);
    if (parsed.open) {
      if (opened) {
        console.log('[isles] opening in browser (best-effort launch)');
      } else {
        console.warn('[isles] could not launch a browser; open the path above manually');
      }
    }
  } catch (error) {
    if (error instanceof AgentIslesInputError) {
      console.error(error.message);
      process.exit(1);
    }

    if (error instanceof PackResolutionError || error.name === 'PackLoadError') {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}
