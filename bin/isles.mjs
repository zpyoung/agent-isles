#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultOutFile, renderMarkdownFile } from '../src/render.mjs';

const USAGE = `Agent Isles — Markdown seas, component islands.

Usage:
  isles render <file.md> [--out <file.html>]
  isles watch <file.md> [--out <file.html>]

Commands:
  render   Render Markdown to browser-ready HTML
  watch    Reserved for the next slice
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
  console.error('isles watch is not implemented yet. Use `isles render <file.md> --out <file.html>` for now.');
  process.exit(1);
} else {
  console.error(`Unknown command: ${command}\n`);
  console.error(USAGE);
  process.exit(2);
}

async function runRender(args) {
  const input = args.find((arg) => !arg.startsWith('-'));
  const outFlagIndex = args.indexOf('--out');
  const outFile = outFlagIndex >= 0 ? args[outFlagIndex + 1] : defaultOutFile(input || 'output.md');

  if (!input) {
    console.error('Missing Markdown file for render.\n');
    console.error(USAGE);
    process.exit(2);
  }

  if (outFlagIndex >= 0 && !args[outFlagIndex + 1]) {
    console.error('Missing value for --out.');
    process.exit(2);
  }

  const inputPath = resolve(input);
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const result = await renderMarkdownFile(inputPath, { outFile });
  console.log(`Rendered: ${result.outFile}`);
}
