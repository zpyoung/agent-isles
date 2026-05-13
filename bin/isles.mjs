#!/usr/bin/env node

import { AgentIslesInputError, defaultOutFile, renderMarkdownFile } from '../src/render.mjs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { watchMarkdownFile } from '../src/watch.mjs';

const USAGE = `Agent Isles — Markdown seas, component islands.

Usage:
  isles render <file.md> [--out <file.html>]
  isles watch <file.md> [--out <file.html>]

Commands:
  render   Render Markdown to browser-ready HTML
  watch    Render immediately and rebuild when the Markdown file changes
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
  const { input, outFile } = parseRenderArgs(args);

  if (!input) {
    console.error('Missing Markdown file for render.\n');
    console.error(USAGE);
    process.exit(2);
  }

  try {
    const result = await renderMarkdownFile(input, { outFile: outFile || defaultOutFile(input) });
    console.log(`Rendered: ${result.outFile}`);
  } catch (error) {
    if (error instanceof AgentIslesInputError) {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}

function parseRenderArgs(args) {
  let input;
  let outFile;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--out') {
      outFile = args[index + 1];
      if (!outFile) {
        console.error('Missing value for --out.');
        process.exit(2);
      }
      index += 1;
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option for render: ${arg}`);
      process.exit(2);
    } else if (!input) {
      input = arg;
    } else {
      console.error(`Unexpected extra argument for render: ${arg}`);
      process.exit(2);
    }
  }

  return { input, outFile };
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

  if (outFlagIndex >= 0 && !args[outFlagIndex + 1]) {
    console.error('Missing value for --out.');
    process.exit(2);
  }

  const inputPath = resolve(input);
  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  await watchMarkdownFile(inputPath, { outFile, exitOnSignal: true });
}
