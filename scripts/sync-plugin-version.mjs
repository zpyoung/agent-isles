#!/usr/bin/env node
// Keep the Claude Code plugin manifests in lockstep with package.json.
//
// The npm release flow bumps package.json via `npm version`, but the plugin
// marketplace/manifest carry their own version fields that the
// claude-plugin/package tests assert must equal package.json. This script is
// the single source of truth for propagating that version. It runs from the
// npm `version` lifecycle hook (local bumps) and explicitly in npm-publish.yml
// (CI releases), and is safe to run any time — it only writes on a mismatch.

import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGE_JSON = 'package.json';
// JSON manifests that carry a version that must track package.json. For each,
// list the JSON paths to update (dot notation; `plugins[]` means every array
// element).
const TARGETS = [
  { file: 'plugins/agent-isles/.claude-plugin/plugin.json', paths: ['version'] },
  { file: '.claude-plugin/marketplace.json', paths: ['version', 'plugins[].version'] },
];
// Markdown files with a `Version: \`x.y.z\`` badge that tracks package.json.
const MARKDOWN_TARGETS = [
  { file: 'plugins/agent-isles/README.md', pattern: /(Version: `)[^`]+(`)/ },
];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Preserve the repo's JSON style: 2-space indent + trailing newline.
function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function applyPath(obj, path, version) {
  const arrayMatch = path.match(/^([^[]+)\[\]\.(.+)$/);
  if (arrayMatch) {
    const [, key, rest] = arrayMatch;
    let changed = false;
    for (const item of obj[key] || []) {
      if (item[rest] !== version) {
        item[rest] = version;
        changed = true;
      }
    }
    return changed;
  }
  if (obj[path] !== version) {
    obj[path] = version;
    return true;
  }
  return false;
}

const version = readJson(PACKAGE_JSON).version;
let anyChanged = false;

for (const { file, paths } of TARGETS) {
  const data = readJson(file);
  let changed = false;
  for (const path of paths) {
    if (applyPath(data, path, version)) {
      changed = true;
    }
  }
  if (changed) {
    writeJson(file, data);
    anyChanged = true;
    console.log(`synced ${file} -> ${version}`);
  }
}

for (const { file, pattern } of MARKDOWN_TARGETS) {
  const text = readFileSync(file, 'utf8');
  const updated = text.replace(pattern, `$1${version}$2`);
  if (updated !== text) {
    writeFileSync(file, updated);
    anyChanged = true;
    console.log(`synced ${file} -> ${version}`);
  }
}

if (!anyChanged) {
  console.log(`plugin manifests already at ${version}`);
}
