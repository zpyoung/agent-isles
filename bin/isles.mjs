#!/usr/bin/env node

const USAGE = `Agent Isles — Markdown seas, component islands.

Usage:
  isles render <file.md> [--out <file.html>]
  isles watch <file.md> [--out <file.html>]

Status:
  The project scaffold is initialized. The renderer implementation is next.
`;

const [, , command, input] = process.argv;

if (!command || command === '--help' || command === '-h') {
  console.log(USAGE);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log('0.0.0');
  process.exit(0);
}

if ((command === 'render' || command === 'watch') && !input) {
  console.error(`Missing Markdown file for '${command}'.\n`);
  console.error(USAGE);
  process.exit(2);
}

console.error(`'${command}' is planned but not implemented yet. See docs/implementation-guide.md.`);
process.exit(1);
