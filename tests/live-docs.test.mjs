import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { slugForName, extractTitle, listScreens, resolveSlug, readFileNoFollow } from '../src/live-docs.mjs';

test('slugForName sanitizes filenames and strips .md', () => {
  assert.equal(slugForName('Screen 1.md'), 'screen-1');
  assert.equal(slugForName('A_B--c.md'), 'a-b-c');
  assert.equal(slugForName('.md'), 'doc');
});

test('slugForName avoids reserved route names', () => {
  assert.equal(slugForName('events.md'), 'events-doc');
});

test('extractTitle returns the first h1 or null', () => {
  assert.equal(extractTitle('# Hello\n\nbody'), 'Hello');
  assert.equal(extractTitle('no heading here'), null);
});

test('listScreens lists top-level .md files alphabetically with slugs and titles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-list-'));
  writeFileSync(join(dir, 'b.md'), '# Bee');
  writeFileSync(join(dir, 'a.md'), '# Ay');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'deep.md'), '# Deep'); // must be ignored
  writeFileSync(join(dir, 'note.txt'), 'nope');         // must be ignored
  const screens = listScreens(dir);
  assert.deepEqual(screens.map((s) => s.name), ['a.md', 'b.md']);
  assert.deepEqual(screens.map((s) => s.slug), ['a', 'b']);
  assert.equal(screens[0].title, 'Ay');
});

test('listScreens disambiguates colliding slugs deterministically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-collide-'));
  writeFileSync(join(dir, 'a b.md'), '# one');
  writeFileSync(join(dir, 'a-b.md'), '# two');
  const slugs = listScreens(dir).map((s) => s.slug);
  assert.equal(new Set(slugs).size, slugs.length); // all unique
  assert.ok(slugs.includes('a-b'));
  assert.ok(slugs.includes('a-b-2'));
});

test('listScreens returns [] for a missing directory', () => {
  assert.deepEqual(listScreens('/no/such/dir/xyz'), []);
});

test('resolveSlug matches by computed slug and rejects unknown / traversal input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-resolve-'));
  writeFileSync(join(dir, 'screen-1.md'), '# One');
  utimesSync(join(dir, 'screen-1.md'), new Date(1000), new Date(1000));
  assert.equal(resolveSlug(dir, 'screen-1').name, 'screen-1.md');
  assert.equal(resolveSlug(dir, 'nope'), null);
  assert.equal(resolveSlug(dir, '../secret'), null);
  assert.equal(resolveSlug(dir, ''), null);
});

test('extractTitle ignores # inside fenced code blocks and requires a space after #', () => {
  assert.equal(extractTitle('```\n# fake\n```\n# Real Title\n'), 'Real Title');
  assert.equal(extractTitle('# Title ###'), 'Title');
  assert.equal(extractTitle('#\nBody'), null);
});

test('listScreens falls back to filename when there is no H1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-notitle-'));
  writeFileSync(join(dir, 'plain.md'), 'no heading here');
  assert.equal(listScreens(dir)[0].title, 'plain.md');
});

test('listScreens and resolveSlug skip symlinked .md files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-symlink-'));
  const outside = mkdtempSync(join(tmpdir(), 'isles-docs-outside-'));
  writeFileSync(join(outside, 'secret.md'), '# Secret');
  writeFileSync(join(dir, 'real.md'), '# Real');
  symlinkSync(join(outside, 'secret.md'), join(dir, 'link.md'));
  const names = listScreens(dir).map((s) => s.name);
  assert.deepEqual(names, ['real.md']);
  assert.equal(resolveSlug(dir, 'link'), null);
});

test('extractTitle respects fence length and info strings', () => {
  // 4-backtick fence is not closed by a 3-backtick line
  assert.equal(extractTitle('````\n```\n# fake\n````\n# Real\n'), 'Real');
  // a fence line with an info/text string does not close the block
  assert.equal(extractTitle('```\n``` not a close\n# fake\n```\n# Real\n'), 'Real');
});

test('readFileNoFollow rejects a non-regular file (directory)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'isles-docs-nonreg-'));
  mkdirSync(join(dir, 'subdir'));
  assert.throws(() => readFileNoFollow(join(dir, 'subdir')));
});
