#!/usr/bin/env node

import {
  AgentIslesInputError,
  defaultOutFile,
  normalizeRenderMode,
  renderMarkdownFile,
  RENDER_MODES,
} from '../src/render.mjs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { watchMarkdownFile } from '../src/watch.mjs';

const USAGE = `Agent Isles — Markdown seas, component islands.

Usage:
  isles render <file.md> [--out <file.html>] [--mode trusted|sanitized] [--assets cdn|local]
  isles render <file.md> [--out <file.html>] [--safe|--sanitize] [--assets cdn|local]
  isles watch <file.md> [--out <file.html>]

Commands:
  render   Render Markdown to browser-ready HTML
  watch    Render immediately and rebuild when the Markdown file changes

Options:
  --assets cdn|local   Use CDN assets by default, or copy local offline assets
`;

const [, , command, ...args] = process.argv;

if (!command || command === '--help' || command === '-h') {
  console.log(USAGE);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log('0.0.0');
  process.exit(0);
}

if (command === 'render') {
  await runRender(args);
} else if (command === 'watch') {
  await runWatch(args);
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
    });
    console.log(`Rendered: ${result.outFile} (${parsed.renderMode} mode)`);
    console.log(`Assets: ${parsed.assetMode}`);
  } catch (error) {
    if (error instanceof AgentIslesInputError) {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}

function parseRenderArgs(args) {
  const parsed = {
    input: undefined,
    outFile: undefined,
    renderMode: RENDER_MODES.TRUSTED,
    assetMode: 'cdn',
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
        console.error('Missing value for --assets. Expected cdn or local.');
        process.exit(2);
      }
      if (value !== 'cdn' && value !== 'local') {
        console.error(`Invalid --assets value: ${value}. Expected cdn or local.`);
        process.exit(2);
      }
      parsed.assetMode = value;
      index += 1;
      continue;
    }

    if (arg === '--safe' || arg === '--sanitize') {
      parsed.renderMode = RENDER_MODES.SANITIZED;
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
  const input = args.find((arg) => !arg.startsWith('-'));
  const outFlagIndex = args.indexOf('--out');
  const outFile = outFlagIndex >= 0 ? args[outFlagIndex + 1] : defaultOutFile(input || 'output.md');

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

  await watchMarkdownFile(inputPath, { outFile, exitOnSignal: true });
}
