// Emit the reader SPA shell HTML to dist/reader-shell.html so the Rust
// `isles-server` crate (Phase 2) can embed the *same* shell the Node `isles
// live` reader serves. Single source of truth: buildReaderShell() in
// src/renderer/page.mjs. The shell references /__agent-isles/reader.js by URL
// and inlines page assets (Bootstrap, highlight.js CSS, theme, Mermaid runtime);
// the only per-request dynamic bit is the optional __ISLES_INITIAL_SLUG script,
// which the Rust server injects for deep-links.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReaderShell } from '../src/renderer/page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'dist', 'reader-shell.html');

const html = buildReaderShell({ assetMode: 'inline' });
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${html.length} bytes)`);
