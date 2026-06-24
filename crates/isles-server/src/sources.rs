//! Source resolution for the Markdown reader, ported from `src/reader/sources.mjs`.
//!
//! Accepts a single file OR a folder and walks a folder recursively into a
//! bounded, symlink-safe tree of Markdown documents. The slug algorithm,
//! traversal order, and JSON shapes match the Node reader byte-for-byte so the
//! Rust server is a drop-in for the same frontend (`dist/isles-reader.js`).

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use serde_json::{json, Value};

const MARKDOWN_EXTENSIONS: [&str; 4] = ["md", "markdown", "mkd", "mdx"];

// Bounds so a pathological tree (deep nesting, huge fan-out) can't hang the
// server or blow memory. A reader over a docs folder needs neither.
const MAX_DEPTH: usize = 12;
const MAX_DOCS: usize = 5000;

// Directories we never descend into: VCS/build noise and the live server's own
// state/ scratch dir. None hold reader content.
const SKIP_DIRS: [&str; 6] = [".git", "node_modules", "state", "dist", ".svn", ".hg"];

#[derive(Debug, Clone, PartialEq)]
pub enum SourceMode {
    File,
    Dir,
}

#[derive(Debug, Clone)]
pub struct ReaderSource {
    pub mode: SourceMode,
    /// Directory the server serves from; never escaped.
    pub root: PathBuf,
    /// In file mode, the single relative filename to scope to; else None.
    pub file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Doc {
    #[serde(skip)]
    pub file: PathBuf,
    #[serde(rename = "relPath")]
    pub rel_path: String,
    pub name: String,
    pub slug: String,
    pub dir: String,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
    #[serde(skip)]
    pub size: u64,
    pub title: String,
}

pub fn is_markdown_file(name: &str) -> bool {
    match Path::new(name).extension().and_then(|e| e.to_str()) {
        Some(ext) => MARKDOWN_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()),
        None => false,
    }
}

/// Resolve a CLI path into a reader source (file -> parent dir + filename;
/// directory -> itself). Mirrors `resolveSource`.
pub fn resolve_source(input: &str) -> Result<ReaderSource, String> {
    let target = fs::canonicalize(input).map_err(|_| format!("Path not found: {input}"))?;
    let meta = fs::metadata(&target).map_err(|_| format!("Path not found: {input}"))?;
    if meta.is_dir() {
        return Ok(ReaderSource {
            mode: SourceMode::Dir,
            root: target,
            file: None,
        });
    }
    if meta.is_file() {
        let name = target
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Unsupported path: {input}"))?
            .to_string();
        if !is_markdown_file(&name) {
            return Err(format!(
                "Not a Markdown file: {}\nExpected an extension of .md, .markdown, .mkd, or .mdx.",
                target.display()
            ));
        }
        let root = target.parent().unwrap_or(Path::new(".")).to_path_buf();
        return Ok(ReaderSource {
            mode: SourceMode::File,
            root,
            file: Some(name),
        });
    }
    Err(format!("Unsupported path: {input}"))
}

/// Lowercase, collapse runs of non-[a-z0-9] to `-`, trim leading/trailing `-`.
/// Mirrors the shared core of the JS slug regexes.
fn slug_core(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

/// Mirrors `slugForName` in live-docs.mjs: strip a single trailing `.md`
/// (case-insensitive) before slugging, default `doc`, and avoid the reserved
/// `events` slug used by the agent-screen state dir.
fn slug_for_name(name: &str) -> String {
    let base = if name.len() >= 3 && name[name.len() - 3..].eq_ignore_ascii_case(".md") {
        &name[..name.len() - 3]
    } else {
        name
    };
    let mut slug = slug_core(base);
    if slug.is_empty() {
        slug = "doc".to_string();
    }
    if slug == "events" {
        slug = "events-doc".to_string();
    }
    slug
}

/// Mirrors `slugifySegment`: like slug_for_name without extension stripping or
/// the reserved-slug guard (used for folder path segments).
fn slugify_segment(segment: &str) -> String {
    let slug = slug_core(segment);
    if slug.is_empty() {
        "doc".to_string()
    } else {
        slug
    }
}

/// Slug a `/`-joined relative path: folder segments via slugify_segment, the
/// final (file) segment via slug_for_name. Mirrors `slugForRelPath`.
fn slug_for_rel_path(rel_path: &str) -> String {
    let parts: Vec<&str> = rel_path
        .split(['/', '\\'])
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        return "doc".to_string();
    }
    let last = parts.len() - 1;
    let slugged: Vec<String> = parts
        .iter()
        .enumerate()
        .map(|(i, part)| {
            if i == last {
                slug_for_name(part)
            } else {
                slugify_segment(part)
            }
        })
        .collect();
    slugged.join("/")
}

/// Read a file refusing to follow a symlink at the final component (O_NOFOLLOW
/// on Unix), so a linked `.md` cannot expose a path outside root. Mirrors
/// `readFileNoFollow`.
pub fn read_file_no_follow(path: &Path) -> io::Result<String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let file = fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc_o_nofollow())
            .open(path)?;
        let meta = file.metadata()?;
        if !meta.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "not a regular file",
            ));
        }
        io::read_to_string(file)
    }
    #[cfg(not(unix))]
    {
        let meta = fs::symlink_metadata(path)?;
        if !meta.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "not a regular file",
            ));
        }
        fs::read_to_string(path)
    }
}

#[cfg(unix)]
fn libc_o_nofollow() -> i32 {
    // O_NOFOLLOW is 0x100 on Linux and 0x100/0x0100 varies per platform; use the
    // libc-free constant for Linux/macOS without pulling in the libc crate.
    #[cfg(target_os = "linux")]
    {
        0o400000
    }
    #[cfg(target_os = "macos")]
    {
        0x0100
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        0
    }
}

fn mtime_ms(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// Extract the first H1 from Markdown, skipping fenced code blocks. Mirrors
/// `extractTitle`.
pub fn extract_title(markdown: &str) -> Option<String> {
    let mut in_fence = false;
    let mut fence_char = ' ';
    let mut fence_len = 0usize;
    for line in markdown
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
    {
        if let Some((ch, len, rest)) = fence_marker(line) {
            if !in_fence {
                in_fence = true;
                fence_char = ch;
                fence_len = len;
            } else if ch == fence_char && len >= fence_len && rest.trim().is_empty() {
                in_fence = false;
            }
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(text) = h1_text(line) {
            return Some(text);
        }
    }
    None
}

// Up to 3 leading spaces/tabs, then >=3 of ` or ~. Returns (char, len, info).
fn fence_marker(line: &str) -> Option<(char, usize, String)> {
    let bytes = line.as_bytes();
    let mut idx = 0;
    while idx < bytes.len() && idx < 3 && (bytes[idx] == b' ' || bytes[idx] == b'\t') {
        idx += 1;
    }
    if idx >= bytes.len() || (bytes[idx] != b'`' && bytes[idx] != b'~') {
        return None;
    }
    let marker = bytes[idx];
    let mut len = 0;
    while idx < bytes.len() && bytes[idx] == marker {
        idx += 1;
        len += 1;
    }
    if len < 3 {
        return None;
    }
    while idx < bytes.len() && (bytes[idx] == b' ' || bytes[idx] == b'\t') {
        idx += 1;
    }
    Some((marker as char, len, line[idx..].to_string()))
}

// A single leading `#` (up to 3 indent), then >=1 space, then heading text with
// trailing closing-ATX `#`s stripped. Mirrors the h1 regex + replace.
fn h1_text(line: &str) -> Option<String> {
    let bytes = line.as_bytes();
    let mut idx = 0;
    while idx < bytes.len() && idx < 3 && (bytes[idx] == b' ' || bytes[idx] == b'\t') {
        idx += 1;
    }
    if idx >= bytes.len() || bytes[idx] != b'#' {
        return None;
    }
    idx += 1;
    if idx >= bytes.len() || !(bytes[idx] == b' ' || bytes[idx] == b'\t') {
        return None; // `##` (h2+) or bare `#` -> not an H1
    }
    while idx < bytes.len() && (bytes[idx] == b' ' || bytes[idx] == b'\t') {
        idx += 1;
    }
    let rest = &line[idx..];
    let text = strip_trailing_atx(rest).trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

// Strip a trailing ` #...` closing sequence: whitespace then `#`+ at end. A `#`
// not preceded by whitespace (e.g. "C#") is kept.
fn strip_trailing_atx(s: &str) -> &str {
    let trimmed = s.trim_end_matches([' ', '\t']);
    let without_hashes = trimmed.trim_end_matches('#');
    if without_hashes.len() == trimmed.len() {
        return s; // no trailing '#'
    }
    if without_hashes.ends_with([' ', '\t']) {
        without_hashes
    } else {
        s
    }
}

/// Recursively collect Markdown docs under `root`, bounded and symlink-safe,
/// path-sorted with unique slugs. Mirrors `listDocs`/`listReaderDocs`.
pub fn list_reader_docs(root: &Path) -> (Vec<Doc>, bool) {
    let mut docs = Vec::new();
    let mut used = HashSet::new();
    let mut truncated = false;
    walk(root, root, 0, &mut docs, &mut used, &mut truncated);
    (docs, truncated)
}

fn walk(
    root: &Path,
    dir: &Path,
    depth: usize,
    docs: &mut Vec<Doc>,
    used: &mut HashSet<String>,
    truncated: &mut bool,
) {
    if *truncated || depth > MAX_DEPTH {
        return;
    }
    let mut names: Vec<(String, PathBuf)> = match fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| (e.file_name().to_string_lossy().into_owned(), e.path()))
            .collect(),
        Err(_) => return,
    };
    names.sort_by(|a, b| a.0.cmp(&b.0));

    for (name, full) in names {
        if *truncated {
            return;
        }
        if name.starts_with('.') {
            continue; // dotfiles / dotdirs
        }
        let meta = match fs::symlink_metadata(&full) {
            Ok(m) => m,
            Err(_) => continue, // vanished between read_dir and stat
        };
        if meta.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            walk(root, &full, depth + 1, docs, used, truncated);
            continue;
        }
        if !meta.is_file() {
            continue; // symlinks, sockets, fifos
        }
        if !is_markdown_file(&name) {
            continue;
        }
        if docs.len() >= MAX_DOCS {
            *truncated = true;
            return;
        }
        let rel_path = full
            .strip_prefix(root)
            .unwrap_or(&full)
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        let base_slug = slug_for_rel_path(&rel_path);
        let mut slug = base_slug.clone();
        let mut n = 1;
        while used.contains(&slug) {
            n += 1;
            slug = format!("{base_slug}-{n}");
        }
        used.insert(slug.clone());
        let dir_field = match rel_path.rfind('/') {
            Some(i) => rel_path[..i].to_string(),
            None => String::new(),
        };
        let title = read_file_no_follow(&full)
            .ok()
            .and_then(|md| extract_title(&md))
            .unwrap_or_else(|| name.clone());
        docs.push(Doc {
            file: full,
            rel_path,
            name,
            slug,
            dir: dir_field,
            mtime_ms: mtime_ms(&meta),
            size: meta.len(),
            title,
        });
    }
}

/// Resolve a slug to a doc by recomputing the live set (never trusts a
/// caller-supplied path). Mirrors `resolveDocSlug`.
pub fn resolve_doc_slug<'a>(docs: &'a [Doc], slug: &str) -> Option<&'a Doc> {
    if slug.is_empty() {
        return None;
    }
    docs.iter().find(|d| d.slug == slug)
}

/// Build the nested folder/file tree JSON for the sidebar. Folders sort before
/// files within a level; both name-sorted. Mirrors `buildDocTree`.
pub fn build_doc_tree(docs: &[Doc]) -> Value {
    // Intermediate mutable tree.
    enum Node {
        Dir {
            name: String,
            path: String,
            children: Vec<Node>,
        },
        File {
            name: String,
            slug: String,
            title: String,
            mtime_ms: f64,
        },
    }

    fn insert(children: &mut Vec<Node>, parent_path: &str, segments: &[&str], doc: &Doc) {
        if segments.len() == 1 {
            children.push(Node::File {
                name: doc.name.clone(),
                slug: doc.slug.clone(),
                title: doc.title.clone(),
                mtime_ms: doc.mtime_ms,
            });
            return;
        }
        let seg = segments[0];
        let path = if parent_path.is_empty() {
            seg.to_string()
        } else {
            format!("{parent_path}/{seg}")
        };
        let existing = children.iter_mut().find_map(|n| match n {
            Node::Dir { name, children, .. } if name == seg => Some(children),
            _ => None,
        });
        let dir_children = match existing {
            Some(c) => c,
            None => {
                children.push(Node::Dir {
                    name: seg.to_string(),
                    path: path.clone(),
                    children: Vec::new(),
                });
                match children.last_mut() {
                    Some(Node::Dir { children, .. }) => children,
                    _ => unreachable!(),
                }
            }
        };
        insert(dir_children, &path, &segments[1..], doc);
    }

    fn sort_and_emit(children: &mut Vec<Node>) -> Value {
        children.sort_by(|a, b| {
            let rank = |n: &Node| match n {
                Node::Dir { .. } => 0,
                Node::File { .. } => 1,
            };
            let an = match a {
                Node::Dir { name, .. } | Node::File { name, .. } => name,
            };
            let bn = match b {
                Node::Dir { name, .. } | Node::File { name, .. } => name,
            };
            rank(a).cmp(&rank(b)).then_with(|| an.cmp(bn))
        });
        let items: Vec<Value> = children
            .iter_mut()
            .map(|n| match n {
                Node::Dir {
                    name,
                    path,
                    children,
                } => json!({
                    "name": name,
                    "path": path,
                    "type": "dir",
                    "children": sort_and_emit(children),
                }),
                Node::File {
                    name,
                    slug,
                    title,
                    mtime_ms,
                } => json!({
                    "name": name,
                    "type": "file",
                    "slug": slug,
                    "title": title,
                    "mtimeMs": mtime_ms,
                }),
            })
            .collect();
        Value::Array(items)
    }

    let mut root_children: Vec<Node> = Vec::new();
    for doc in docs {
        let segments: Vec<&str> = doc.rel_path.split('/').filter(|s| !s.is_empty()).collect();
        if segments.is_empty() {
            continue;
        }
        insert(&mut root_children, "", &segments, doc);
    }
    sort_and_emit(&mut root_children)
}

/// Assemble the `/__agent-isles/tree` JSON payload: `{ tree, docs, newest, truncated }`.
pub fn tree_payload(docs: &[Doc], truncated: bool) -> Value {
    let tree = build_doc_tree(docs);
    let slim: Vec<Value> = docs
        .iter()
        .map(|d| {
            json!({
                "slug": d.slug,
                "name": d.name,
                "title": d.title,
                "relPath": d.rel_path,
                "dir": d.dir,
                "mtimeMs": d.mtime_ms,
            })
        })
        .collect();
    let newest = docs
        .iter()
        .max_by(|a, b| {
            a.mtime_ms
                .partial_cmp(&b.mtime_ms)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|d| Value::String(d.slug.clone()))
        .unwrap_or(Value::Null);
    json!({ "tree": tree, "docs": slim, "newest": newest, "truncated": truncated })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs as stdfs;
    use tempfile::tempdir;

    #[test]
    fn markdown_extension_detection() {
        assert!(is_markdown_file("a.md"));
        assert!(is_markdown_file("a.MARKDOWN"));
        assert!(is_markdown_file("a.mdx"));
        assert!(!is_markdown_file("a.txt"));
        assert!(!is_markdown_file("README"));
    }

    #[test]
    fn slugs_match_js_rules() {
        assert_eq!(slug_for_name("Hello World.md"), "hello-world");
        assert_eq!(slug_for_name("events.md"), "events-doc");
        assert_eq!(slug_for_name("  .md"), "doc");
        assert_eq!(
            slug_for_rel_path("guides/Getting Started.md"),
            "guides/getting-started"
        );
    }

    #[test]
    fn extract_title_skips_fenced_code() {
        let md = "```\n# Not a title\n```\n\n# Real Title #\n";
        assert_eq!(extract_title(md).as_deref(), Some("Real Title"));
        assert_eq!(extract_title("## Subhead only\n").as_deref(), None);
        assert_eq!(extract_title("# C# Notes\n").as_deref(), Some("C# Notes"));
    }

    #[test]
    fn file_source_scopes_to_parent_and_name() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("doc.md");
        stdfs::write(&p, "# Doc").unwrap();
        let src = resolve_source(p.to_str().unwrap()).unwrap();
        assert_eq!(src.mode, SourceMode::File);
        assert_eq!(src.file.as_deref(), Some("doc.md"));
    }

    #[test]
    fn rejects_non_markdown_file() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("notes.txt");
        stdfs::write(&p, "x").unwrap();
        assert!(resolve_source(p.to_str().unwrap()).is_err());
    }

    #[test]
    fn recursive_tree_nests_and_slugs_uniquely() {
        let dir = tempdir().unwrap();
        stdfs::write(dir.path().join("root.md"), "# Root").unwrap();
        stdfs::create_dir(dir.path().join("guides")).unwrap();
        stdfs::write(dir.path().join("guides/intro.md"), "# Intro").unwrap();
        // A skipped dir must not contribute docs.
        stdfs::create_dir(dir.path().join("node_modules")).unwrap();
        stdfs::write(dir.path().join("node_modules/dep.md"), "# Dep").unwrap();

        let (docs, truncated) = list_reader_docs(dir.path());
        assert!(!truncated);
        let mut slugs: Vec<&str> = docs.iter().map(|d| d.slug.as_str()).collect();
        slugs.sort();
        assert_eq!(slugs, vec!["guides/intro", "root"]);

        let payload = tree_payload(&docs, truncated);
        let tree = payload["tree"].as_array().unwrap();
        let folder = tree
            .iter()
            .find(|n| n["type"] == "dir" && n["name"] == "guides")
            .unwrap();
        assert_eq!(folder["children"][0]["slug"], "guides/intro");
    }

    #[test]
    fn resolve_slug_rejects_unknown_and_traversal() {
        let dir = tempdir().unwrap();
        stdfs::write(dir.path().join("doc.md"), "# Doc").unwrap();
        let (docs, _) = list_reader_docs(dir.path());
        assert!(resolve_doc_slug(&docs, "doc").is_some());
        assert!(resolve_doc_slug(&docs, "nope").is_none());
        assert!(resolve_doc_slug(&docs, "../secret").is_none());
    }
}
