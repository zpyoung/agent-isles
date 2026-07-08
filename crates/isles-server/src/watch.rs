//! File-watching that drives the reader's live reload, mirroring the watcher in
//! `src/live.mjs`. On a debounced change under the root it diffs the Markdown
//! doc set against the previous snapshot and broadcasts typed SSE events:
//!   live:screens  membership changed (added/removed)
//!   live:reload   a known doc's content changed (per-slug)
//!   live:advance  a new doc appeared (navigate to the newest one)

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use tokio::sync::broadcast;

use crate::sources::{list_reader_docs, Doc};

/// A typed SSE event: (event name, JSON data string).
pub type SseEvent = (String, String);

const DEBOUNCE: Duration = Duration::from_millis(120);

#[derive(Clone)]
struct Snap {
    mtime_ms: f64,
    size: u64,
    slug: String,
}

fn snapshot(docs: &[Doc]) -> HashMap<String, Snap> {
    docs.iter()
        .map(|d| {
            (
                d.rel_path.clone(),
                Snap {
                    mtime_ms: d.mtime_ms,
                    size: d.size,
                    slug: d.slug.clone(),
                },
            )
        })
        .collect()
}

/// Spawn a background watcher over `root`. Returns the watcher guard (drop to
/// stop) — keep it alive for the server's lifetime. `reader_file` scopes the
/// diff to a single file (file mode).
pub fn spawn(
    root: PathBuf,
    reader_file: Option<String>,
    tx: broadcast::Sender<SseEvent>,
) -> notify::Result<Box<dyn Watcher + Send>> {
    let (raw_tx, raw_rx) = mpsc::channel::<()>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let relevant = event.paths.iter().any(|p| {
                p.extension().and_then(|e| e.to_str()).map(|e| {
                    matches!(
                        e.to_ascii_lowercase().as_str(),
                        "md" | "markdown" | "mkd" | "mdx"
                    )
                }) == Some(true)
            });
            // An empty path set (some backends) or a markdown path both warrant a
            // re-scan; ignore pure non-markdown churn (e.g. state/ writes).
            if relevant || event.paths.is_empty() {
                let _ = raw_tx.send(());
            }
        }
    })?;
    watcher.watch(&root, RecursiveMode::Recursive)?;

    let scan = move || -> (Vec<Doc>, bool) {
        let (docs, truncated) = list_reader_docs(&root);
        match &reader_file {
            Some(f) => (
                docs.into_iter().filter(|d| &d.rel_path == f).collect(),
                truncated,
            ),
            None => (docs, truncated),
        }
    };

    let mut last = snapshot(&scan().0);
    thread::spawn(move || {
        // Debounce: wait for the first signal, then coalesce a burst.
        while raw_rx.recv().is_ok() {
            while raw_rx.recv_timeout(DEBOUNCE).is_ok() {}
            let (docs, _) = scan();
            let next = snapshot(&docs);
            diff_and_broadcast(&last, &next, &tx);
            last = next;
        }
    });

    Ok(Box::new(watcher))
}

fn diff_and_broadcast(
    prev: &HashMap<String, Snap>,
    next: &HashMap<String, Snap>,
    tx: &broadcast::Sender<SseEvent>,
) {
    let added: Vec<&String> = next.keys().filter(|k| !prev.contains_key(*k)).collect();
    let removed = prev.keys().any(|k| !next.contains_key(k));
    let changed: Vec<&Snap> = next
        .iter()
        .filter_map(|(k, s)| match prev.get(k) {
            Some(p) if p.mtime_ms != s.mtime_ms || p.size != s.size => Some(s),
            _ => None,
        })
        .collect();

    if !added.is_empty() || removed || !changed.is_empty() {
        let _ = tx.send(("live:screens".into(), "{}".into()));
    }
    for s in &changed {
        let _ = tx.send((
            "live:reload".into(),
            format!("{{\"slug\":{}}}", json_str(&s.slug)),
        ));
    }
    if !added.is_empty() {
        // Newest added doc by mtime wins the advance, matching live.mjs.
        let newest = added.iter().filter_map(|k| next.get(*k)).max_by(|a, b| {
            a.mtime_ms
                .partial_cmp(&b.mtime_ms)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        if let Some(s) = newest {
            let _ = tx.send((
                "live:advance".into(),
                format!("{{\"slug\":{}}}", json_str(&s.slug)),
            ));
        }
    }
}

fn json_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}
