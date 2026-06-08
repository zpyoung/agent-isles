import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RESERVED_SLUGS = new Set(['events', '__agent-isles']);

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
  const m = String(markdown).match(/^\s{0,3}#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

export function listScreens(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const md = names.filter((n) => n.endsWith('.md')).sort();
  const used = new Set();
  const screens = [];
  for (const name of md) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // deleted between readdir and stat
    }
    if (!st.isFile()) continue;
    const baseSlug = slugForName(name);
    let slug = baseSlug;
    let n = 1;
    while (used.has(slug)) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }
    used.add(slug);
    let title = null;
    try {
      title = extractTitle(readFileSync(full, 'utf8'));
    } catch {
      /* unreadable mid-scan */
    }
    screens.push({ file: full, name, slug, mtimeMs: st.mtimeMs, size: st.size, title: title || name });
  }
  return screens;
}

export function resolveSlug(dir, slug) {
  if (typeof slug !== 'string' || !slug) return null;
  for (const screen of listScreens(dir)) {
    if (screen.slug === slug) return screen;
  }
  return null;
}
