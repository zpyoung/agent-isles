import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveSource,
  isMarkdownFile,
  listDocs,
  listReaderDocs,
  buildDocTree,
  resolveDocSlug,
  ReaderSourceError,
} from '../src/reader/sources.mjs';

function fixture(prefix) {
  return mkdtempSync(join(tmpdir(), `isles-reader-${prefix}-`));
}

test('isMarkdownFile accepts md/markdown/mkd/mdx and rejects others', () => {
  assert.equal(isMarkdownFile('a.md'), true);
  assert.equal(isMarkdownFile('a.MARKDOWN'), true);
  assert.equal(isMarkdownFile('a.mkd'), true);
  assert.equal(isMarkdownFile('a.mdx'), true);
  assert.equal(isMarkdownFile('a.txt'), false);
  assert.equal(isMarkdownFile('a'), false);
});

test('resolveSource resolves a directory to dir mode', () => {
  const dir = fixture('dir');
  writeFileSync(join(dir, 'a.md'), '# A');
  const src = resolveSource(dir);
  assert.equal(src.mode, 'dir');
  assert.equal(src.root, dir);
  assert.equal(src.file, null);
});

test('resolveSource resolves a markdown file to file mode rooted at its parent', () => {
  const dir = fixture('file');
  writeFileSync(join(dir, 'doc.md'), '# Doc');
  const src = resolveSource(join(dir, 'doc.md'));
  assert.equal(src.mode, 'file');
  assert.equal(src.root, dir);
  assert.equal(src.file, 'doc.md');
});

test('resolveSource rejects a missing path and a non-markdown file', () => {
  assert.throws(() => resolveSource('/no/such/path/xyz'), ReaderSourceError);
  const dir = fixture('badext');
  writeFileSync(join(dir, 'note.txt'), 'nope');
  assert.throws(() => resolveSource(join(dir, 'note.txt')), ReaderSourceError);
});

test('listDocs walks nested folders and assigns unique path-based slugs', () => {
  const dir = fixture('walk');
  writeFileSync(join(dir, 'b.md'), '# Bee');
  writeFileSync(join(dir, 'a.md'), '# Ay');
  mkdirSync(join(dir, 'guides'));
  writeFileSync(join(dir, 'guides', 'deep.md'), '# Deep');
  writeFileSync(join(dir, 'note.txt'), 'ignored');
  const { docs } = listDocs(dir);
  assert.deepEqual(docs.map((d) => d.relPath), ['a.md', 'b.md', 'guides/deep.md']);
  assert.deepEqual(docs.map((d) => d.slug), ['a', 'b', 'guides/deep']);
  assert.equal(new Set(docs.map((d) => d.slug)).size, docs.length);
});

test('listDocs skips dotfiles, node_modules, and the live state dir', () => {
  const dir = fixture('skip');
  writeFileSync(join(dir, 'keep.md'), '# Keep');
  writeFileSync(join(dir, '.hidden.md'), '# Hidden');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'dep.md'), '# Dep');
  mkdirSync(join(dir, 'state'));
  writeFileSync(join(dir, 'state', 'notes.md'), '# State');
  const names = listDocs(dir).docs.map((d) => d.relPath);
  assert.deepEqual(names, ['keep.md']);
});

test('listDocs skips symlinked files so they cannot escape root', () => {
  const dir = fixture('symlink');
  const outside = fixture('outside');
  writeFileSync(join(outside, 'secret.md'), '# Secret');
  writeFileSync(join(dir, 'real.md'), '# Real');
  symlinkSync(join(outside, 'secret.md'), join(dir, 'link.md'));
  const names = listDocs(dir).docs.map((d) => d.name);
  assert.deepEqual(names, ['real.md']);
});

test('listReaderDocs reads H1 titles with filename fallback', () => {
  const dir = fixture('titles');
  writeFileSync(join(dir, 'titled.md'), '# Real Title\n\nbody');
  writeFileSync(join(dir, 'plain.md'), 'no heading');
  const byName = Object.fromEntries(listReaderDocs(dir).docs.map((d) => [d.name, d.title]));
  assert.equal(byName['titled.md'], 'Real Title');
  assert.equal(byName['plain.md'], 'plain.md');
});

test('buildDocTree nests folders before files and sorts each level', () => {
  const dir = fixture('tree');
  writeFileSync(join(dir, 'z-root.md'), '# Z');
  mkdirSync(join(dir, 'guides'));
  writeFileSync(join(dir, 'guides', 'intro.md'), '# Intro');
  writeFileSync(join(dir, 'guides', 'advanced.md'), '# Advanced');
  const { docs } = listReaderDocs(dir);
  const tree = buildDocTree(docs);
  // Folder 'guides' sorts before the root-level file 'z-root.md'.
  assert.equal(tree[0].type, 'dir');
  assert.equal(tree[0].name, 'guides');
  assert.deepEqual(tree[0].children.map((c) => c.name), ['advanced.md', 'intro.md']);
  assert.equal(tree[1].type, 'file');
  assert.equal(tree[1].name, 'z-root.md');
});

test('resolveDocSlug returns the matching doc and rejects unknown/traversal slugs', () => {
  const dir = fixture('resolve');
  writeFileSync(join(dir, 'a.md'), '# A');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'b.md'), '# B');
  assert.equal(resolveDocSlug(dir, 'a').name, 'a.md');
  assert.equal(resolveDocSlug(dir, 'sub/b').name, 'b.md');
  assert.equal(resolveDocSlug(dir, 'nope'), null);
  assert.equal(resolveDocSlug(dir, '../secret'), null);
  assert.equal(resolveDocSlug(dir, ''), null);
});
