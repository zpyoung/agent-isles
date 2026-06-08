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
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE, getUserConfigDir, PackResolutionError, resolvePackInputs } from '../src/pack-resolver.mjs';
import { watchMarkdownFile } from '../src/watch.mjs';
import { previewMarkdown, startPreviewServer } from '../src/preview.mjs';
import { runLiveForeground, stopLive } from '../src/live.mjs';

const USAGE = `Agent Isles — Markdown seas, component islands.

Usage:
  isles render <file.md> [--out <file.html>] [--mode trusted|sanitized] [--assets cdn|local|inline] [--show-source] [--pack <path>]... [--no-user-packs]
  isles render <file.md> [--out <file.html>] [--safe|--sanitize] [--assets cdn|local|inline] [--show-source] [--pack <path>]... [--no-user-packs]
  isles packs resolve <file.md> [--pack <path>]... [--no-user-packs]
  isles watch <file.md> [--out <file.html>] [--mode trusted|sanitized] [--assets cdn|local|inline] [--show-source] [--pack <path>]... [--no-user-packs]
  isles preview (--stdin | <file.md>) [--open] [--mode trusted|sanitized] [--safe|--sanitize] [--show-source] [--pack <path>]... [--no-user-packs]
  isles preview <dir> [--port <port>] [--writeback] [--mode trusted|sanitized] [--show-source] [--pack <path>]... [--no-user-packs]
  isles live <dir> [--port <port>] [--host <host>] [--url-host <host>] [--idle-timeout <min>] [--owner-pid <pid>]
  isles live <dir> --stop

Commands:
  render         Render Markdown to browser-ready HTML
  packs resolve  Print resolved component packs, sources, asset outputs, and sanitizer permissions
  watch          Render immediately and rebuild when the Markdown file changes
  preview        Render ephemeral Markdown to a temp HTML file, or serve a localhost directory preview
  live           Serve live agent screens in the background, or stop a live server

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
} else if (command === 'live') {
  await runLive(args);
} else {
  console.error(`Unknown command: ${command}\n`);
  console.error(USAGE);
  process.exit(2);
}

async function runLive(args) {
  const parsed = { dir: undefined, port: undefined, host: undefined, urlHost: undefined,
    idleTimeoutMinutes: undefined, ownerPid: undefined, stop: false, serve: false };
  const needVal = (i, name) => {
    const v = args[i + 1];
    if (v === undefined || v === '' || v.startsWith('-')) { console.error(`${name} requires a value`); process.exit(2); }
    return v;
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--port') {
      const v = Number(needVal(i, '--port'));
      if (!Number.isInteger(v) || v < 0 || v > 65535) { console.error('--port must be an integer 0-65535'); process.exit(2); }
      parsed.port = v; i += 1; continue;
    }
    if (a === '--host') { parsed.host = needVal(i, '--host'); i += 1; continue; }
    if (a === '--url-host') { parsed.urlHost = needVal(i, '--url-host'); i += 1; continue; }
    if (a === '--idle-timeout') {
      const v = Number(needVal(i, '--idle-timeout'));
      if (!Number.isFinite(v) || v <= 0) { console.error('--idle-timeout must be a positive number'); process.exit(2); }
      parsed.idleTimeoutMinutes = v; i += 1; continue;
    }
    if (a === '--owner-pid') {
      const v = Number(needVal(i, '--owner-pid'));
      if (!Number.isInteger(v) || v <= 0) { console.error('--owner-pid must be a positive integer'); process.exit(2); }
      parsed.ownerPid = v; i += 1; continue;
    }
    if (a === '--stop') { parsed.stop = true; continue; }
    if (a === '--__serve') { parsed.serve = true; continue; }
    if (a.startsWith('-')) { console.error(`Unknown live option: ${a}`); process.exit(2); }
    if (!parsed.dir) { parsed.dir = a; continue; }
    console.error(`Unexpected extra argument: ${a}`); process.exit(2);
  }
  if (!parsed.dir) { console.error('Missing <dir> for live.\n'); console.error(USAGE); process.exit(2); }
  const dir = resolve(parsed.dir);

  if (parsed.stop) { stopLive(dir); process.exit(0); }

  if (parsed.serve) {
    // Daemon child: run the server in the foreground; process stays alive until shutdown.
    await runLiveForeground(dir, {
      port: parsed.port, host: parsed.host, urlHost: parsed.urlHost,
      idleTimeoutMinutes: parsed.idleTimeoutMinutes, ownerPid: parsed.ownerPid,
    });
    return;
  }

  // Parent: re-spawn self DETACHED, wait for server-info, print it, exit.
  const stateD = join(dir, 'state');
  const infoPath = join(stateD, 'server-info');
  const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  if (existsSync(infoPath)) {
    try {
      const st = statSync(infoPath);
      if (st.isFile()) {
        const existing = JSON.parse(readFileSync(infoPath, 'utf8'));
        if (existing && Number.isInteger(existing.pid) && existing.pid > 0
            && existing.screen_dir === dir && pidAlive(existing.pid)) {
          console.log(JSON.stringify(existing));
          process.exit(0);
        }
      }
    } catch { /* fall through to fresh launch */ }
  }
  mkdirSync(stateD, { recursive: true });
  rmSync(infoPath, { force: true, recursive: true });
  rmSync(join(stateD, 'server-stopped'), { force: true, recursive: true });

  const childArgs = [fileURLToPath(import.meta.url), 'live', dir, '--__serve'];
  if (parsed.port !== undefined) childArgs.push('--port', String(parsed.port));
  if (parsed.host) childArgs.push('--host', parsed.host);
  if (parsed.urlHost) childArgs.push('--url-host', parsed.urlHost);
  if (parsed.idleTimeoutMinutes !== undefined) childArgs.push('--idle-timeout', String(parsed.idleTimeoutMinutes));
  if (parsed.ownerPid !== undefined) childArgs.push('--owner-pid', String(parsed.ownerPid));
  const errFd = openSync(join(stateD, 'server-error.log'), 'a');
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: ['ignore', errFd, errFd] });
  child.unref();

  for (let i = 0; i < 50; i += 1) {
    if (existsSync(infoPath)) {
      try {
        if (statSync(infoPath).isFile()) {
          const txt = readFileSync(infoPath, 'utf8');
          JSON.parse(txt);
          console.log(txt.trim());
          process.exit(0);
        }
      } catch { /* keep polling */ }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.error(`isles live: server did not report ready within 5s (see ${join(stateD, 'server-error.log')})`);
  process.exit(1);
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
    port: 4173,
    writeback: false,
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

    if (arg === '--port') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        console.error('Missing value for --port.');
        process.exit(2);
      }
      parsed.port = Number(value);
      index += 1;
      continue;
    }

    if (arg === '--writeback') {
      parsed.writeback = true;
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
    console.error('Choose one input source: either --stdin or a path, not both.\n');
    console.error(USAGE);
    process.exit(2);
  }

  if (!parsed.stdin && !parsed.input) {
    console.error('Missing input. Provide --stdin, a Markdown file path, or a directory path.\n');
    console.error(USAGE);
    process.exit(2);
  }

  try {
    if (!parsed.stdin) {
      const inputPath = resolve(parsed.input);
      if (existsSync(inputPath) && statSync(inputPath).isDirectory()) {
        if (parsed.open) {
          console.error('--open is only supported for ephemeral file/stdin preview, not directory server mode.');
          process.exit(2);
        }

        const preview = await startPreviewServer(inputPath, {
          port: parsed.port,
          renderMode: parsed.renderMode,
          showSource: parsed.showSource,
          explicitPacks: parsed.explicitPacks,
          includeUserPacks: parsed.includeUserPacks,
          writeback: parsed.writeback,
        });

        console.log(`[isles] previewing ${preview.rootDir}`);
        console.log(`[isles] open ${preview.url}/`);

        function close() {
          void preview.close().finally(() => {
            console.log('[isles] stopped');
            process.exit(0);
          });
        }

        process.once('SIGINT', close);
        process.once('SIGTERM', close);
        return;
      }
    }

    let markdown;
    let projectDir;
    if (parsed.writeback) {
      console.error('--writeback is only supported for localhost directory preview mode.');
      process.exit(2);
    }
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
    if (error instanceof AgentIslesInputError || error instanceof PackResolutionError || error.name === 'PackLoadError') {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}
