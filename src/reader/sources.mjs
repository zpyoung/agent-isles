// Source resolution for the Markdown reader: accept a single file OR a folder,
// and walk a folder recursively into a bounded, symlink-safe tree of Markdown
// documents. Reuses the slugging/title/no-follow primitives from live-docs.mjs
// so the reader and the agent-screen server share one safe file model.
import { lstatSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

import { slugForName, extractTitle, readFileNoFollow } from '../live-docs.mjs';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mkd', '.mdx']);

// Bounds so a pathological tree (deep nesting, huge fan-out) can't hang the
// server or blow memory. A reader over a docs folder needs neither.
const MAX_DEPTH = 12;
const MAX_DOCS = 5000;

// Directories we never descend into: VCS/build noise and the live server's own
// state/ scratch dir (events, server-info). None hold reader content.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'state', 'dist', '.svn', '.hg']);

export function isMarkdownFile(name) {
  return MARKDOWN_EXTENSIONS.has(extname(String(name)).toLowerCase());
}

export class ReaderSourceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ReaderSourceError';
    this.code = code;
  }
}

// Resolve a CLI path into a reader source. A file resolves to its parent dir as
// the root plus the single filename; a directory resolves to itself. The root
// is what the server serves from, and never escapes it.
export function resolveSource(inputPath) {
  const target = resolve(String(inputPath ?? ''));
  let st;
  try {
    st = statSync(target);
  } catch {
    throw new ReaderSourceError(`Path not found: ${target}`, 'ERR_READER_SOURCE_NOT_FOUND');
  }
  if (st.isDirectory()) {
    return { mode: 'dir', root: target, file: null };
  }
  if (st.isFile()) {
    if (!isMarkdownFile(target)) {
      throw new ReaderSourceError(
        `Not a Markdown file: ${target}\nExpected an extension of .md, .markdown, .mkd, or .mdx.`,
        'ERR_READER_SOURCE_UNSUPPORTED',
      );
    }
    return { mode: 'file', root: dirname(target), file: basename(target) };
  }
  throw new ReaderSourceError(`Unsupported path: ${target}`, 'ERR_READER_SOURCE_UNSUPPORTED');
}

function slugifySegment(segment) {
  const slug = String(segment)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'doc';
}

// Compute a stable, URL-safe slug for a document's path relative to root.
// Folder segments are slugged as-is; the final (file) segment reuses
// slugForName so its .md/.markdown extension is stripped. Joined with '/', the
// slug doubles as a readable nested route.
function slugForRelPath(relPath) {
  const parts = relPath.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return 'doc';
  const last = parts.length - 1;
  const slugged = parts.map((part, i) => (i === last ? slugForName(part) : slugifySegment(part)));
  return slugged.join('/') || 'doc';
}

// Recursively collect Markdown files under root. Symlinks (lstat → not a regular
// file/dir) are skipped so a linked entry can't expose a path outside root.
// Returns a flat, path-sorted list with unique slugs; bounded by MAX_DEPTH/MAX_DOCS.
export function listDocs(root) {
  const docs = [];
  const usedSlugs = new Set();
  let truncated = false;

  const walk = (absDir, depth) => {
    if (truncated || depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(absDir).sort();
    } catch {
      return; // unreadable dir → skip rather than crash the walk
    }
    for (const name of entries) {
      if (truncated) return;
      if (name.startsWith('.')) continue; // dotfiles/dotdirs
      const full = join(absDir, name);
      let st;
      try {
        st = lstatSync(full); // lstat: do not follow symlinks
      } catch {
        continue; // vanished between readdir and stat
      }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!st.isFile()) continue; // symlinks, sockets, fifos
      if (!isMarkdownFile(name)) continue;
      if (docs.length >= MAX_DOCS) { truncated = true; return; }
      const relPath = relative(root, full).split(sep).join('/');
      const baseSlug = slugForRelPath(relPath);
      let slug = baseSlug;
      let n = 1;
      while (usedSlugs.has(slug)) {
        n += 1;
        slug = `${baseSlug}-${n}`;
      }
      usedSlugs.add(slug);
      docs.push({
        file: full,
        relPath,
        name,
        slug,
        dir: dirname(relPath) === '.' ? '' : dirname(relPath),
        mtimeMs: st.mtimeMs,
        size: st.size,
      });
    }
  };

  walk(root, 0);
  return { docs, truncated };
}

// Like listDocs but reads each doc's H1 for a display title (filename fallback).
// Mirrors listScreens in live-docs.mjs, extended to the recursive tree.
export function listReaderDocs(root) {
  const { docs, truncated } = listDocs(root);
  const withTitles = docs.map((doc) => {
    let title = null;
    try {
      title = extractTitle(readFileNoFollow(doc.file));
    } catch {
      /* unreadable mid-scan → fall back to filename */
    }
    return { ...doc, title: title || doc.name };
  });
  return { docs: withTitles, truncated };
}

// Build a nested folder/file tree (for the sidebar) from a flat doc list.
// Folders sort before files within each level; both are name-sorted.
export function buildDocTree(docs) {
  const root = { name: '', path: '', type: 'dir', children: new Map() };
  for (const doc of docs) {
    const segments = doc.relPath.split('/');
    let node = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i];
      const path = node.path ? `${node.path}/${seg}` : seg;
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, path, type: 'dir', children: new Map() });
      }
      node = node.children.get(seg);
    }
    node.children.set(segments[segments.length - 1], {
      name: doc.name,
      type: 'file',
      slug: doc.slug,
      title: doc.title || doc.name,
      mtimeMs: doc.mtimeMs,
    });
  }
  const toSorted = (node) => {
    const children = [...node.children.values()].map((child) =>
      child.type === 'dir' ? toSorted(child) : child,
    );
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { name: node.name, path: node.path, type: 'dir', children };
  };
  return toSorted(root).children;
}

// Resolve a slug back to an absolute file, recomputing the tree so the slug is
// validated against the live set (never trusts caller-supplied paths). Returns
// the doc record or null. Path traversal can't match because slugs are derived,
// not parsed, from filenames.
export function resolveDocSlug(root, slug) {
  if (typeof slug !== 'string' || !slug) return null;
  const { docs } = listDocs(root);
  return docs.find((doc) => doc.slug === slug) || null;
}
