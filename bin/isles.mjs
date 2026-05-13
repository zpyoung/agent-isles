#!/usr/bin/env node

import { AgentIslesInputError, defaultOutFile, renderMarkdownFile } from '../src/render.mjs';

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
