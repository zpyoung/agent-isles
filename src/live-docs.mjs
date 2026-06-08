import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RESERVED_SLUGS = new Set(['events']);

export function slugForName(name) {
  const base = String(name).replace(/\.md$/i, '');
  let slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'doc';
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-doc`;
  return slug;
}

export function extractTitle(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  let inFence = false;
  let fenceChar = '';
  for (const line of lines) {
    const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const char = fence[1][0];
      if (!inFence) { inFence = true; fenceChar = char; }
      else if (char === fenceChar) { inFence = false; }
      continue;
    }
    if (inFence) continue;
    const h1 = line.match(/^[ \t]{0,3}#[ \t]+(.+?)[ \t]*$/);
    if (h1) {
      const text = h1[1].replace(/[ \t]+#+[ \t]*$/, '').trim();
      return text || null;
    }
  }
  return null;
}

// Internal: filenames + slugs + stat, WITHOUT reading file contents. Symlinks
// are skipped (lstat → isFile() false) so a symlinked .md cannot expose a file
// outside the directory.
function listScreenFiles(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return []; // missing/unreadable dir → degrade to empty (live server stays up)
  }
  const md = names.filter((n) => n.endsWith('.md')).sort();
  const used = new Set();
  const screens = [];
  for (const name of md) {
    const full = join(dir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue; // deleted between readdir and stat
    }
    if (!st.isFile()) continue; // excludes symlinks and directories
    const baseSlug = slugForName(name);
    let slug = baseSlug;
    let n = 1;
    while (used.has(slug)) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }
    used.add(slug);
    screens.push({ file: full, name, slug, mtimeMs: st.mtimeMs, size: st.size });
  }
  return screens;
}

export function listScreens(dir) {
  return listScreenFiles(dir).map((screen) => {
    let title = null;
    try {
      title = extractTitle(readFileSync(screen.file, 'utf8'));
    } catch {
      /* unreadable mid-scan → fall back to filename */
    }
    return { ...screen, title: title || screen.name };
  });
}

export function resolveSlug(dir, slug) {
  if (typeof slug !== 'string' || !slug) return null;
  for (const screen of listScreenFiles(dir)) {
    if (screen.slug === slug) return screen;
  }
  return null;
}
