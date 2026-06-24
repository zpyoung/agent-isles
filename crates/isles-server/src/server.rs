//! Axum router implementing the reader's HTTP/SSE/WS contract — the same routes
//! `src/live.mjs` serves in reader mode, so the embedded frontend is unchanged:
//!   GET  /                          reader shell
//!   GET  /<slug>                    reader shell seeded with __ISLES_INITIAL_SLUG (or 404)
//!   GET  /__agent-isles/reader.js   the SPA bundle
//!   GET  /__agent-isles/tree        { tree, docs, newest, truncated }
//!   GET  /__agent-isles/raw?slug=   raw Markdown (O_NOFOLLOW), for client-side render
//!   GET  /events                    SSE: live:ready, live:reload/advance/screens
//!   POST /__agent-isles/signal      island selection/proceed signal (origin-checked)
//!   WS   /__agent-isles/signal      same, over a socket (what the reader uses)

use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, HeaderName, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::get,
    Router,
};
use futures::stream::{self, Stream, StreamExt};
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

use crate::shell;
use crate::sources::{list_reader_docs, read_file_no_follow, resolve_doc_slug, tree_payload, Doc};
use crate::watch::SseEvent;

const SIGNAL_MAX_STR: usize = 256;
const SIGNAL_MAX_SELECTED: usize = 64;

pub struct AppState {
    pub root: PathBuf,
    /// In file mode, the single relative filename to scope to.
    pub reader_file: Option<String>,
    pub tx: broadcast::Sender<SseEvent>,
    /// Browser origins allowed to POST/connect signals (CSRF guard). Empty set
    /// only rejects requests that actually carry a disallowed Origin header.
    pub allowed_origins: HashSet<String>,
}

impl AppState {
    fn scoped_docs(&self) -> (Vec<Doc>, bool) {
        let (docs, truncated) = list_reader_docs(&self.root);
        match &self.reader_file {
            Some(f) => (
                docs.into_iter().filter(|d| &d.rel_path == f).collect(),
                truncated,
            ),
            None => (docs, truncated),
        }
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(root_handler))
        .route("/events", get(events_handler))
        .route("/__agent-isles/reader.js", get(reader_bundle_handler))
        .route("/__agent-isles/tree", get(tree_handler))
        .route("/__agent-isles/raw", get(raw_handler))
        .route(
            "/__agent-isles/signal",
            get(ws_signal_handler).post(post_signal_handler),
        )
        .fallback(slug_handler)
        .with_state(state)
}

async fn root_handler() -> Response {
    html(shell::shell_html())
}

async fn reader_bundle_handler() -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache, no-transform"),
        ],
        shell::READER_BUNDLE,
    )
        .into_response()
}

async fn tree_handler(State(state): State<Arc<AppState>>) -> Response {
    let (docs, truncated) = state.scoped_docs();
    json_response(tree_payload(&docs, truncated))
}

async fn raw_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let slug = params.get("slug").map(|s| s.as_str()).unwrap_or("");
    let (docs, _) = state.scoped_docs();
    let Some(doc) = resolve_doc_slug(&docs, slug) else {
        return not_found();
    };
    match read_file_no_follow(&doc.file) {
        Ok(markdown) => (
            [
                (
                    header::CONTENT_TYPE,
                    "text/markdown; charset=utf-8".to_string(),
                ),
                (header::CACHE_CONTROL, "no-cache, no-transform".to_string()),
                (
                    HeaderName::from_static("x-agent-isles-slug"),
                    doc.slug.clone(),
                ),
            ],
            markdown,
        )
            .into_response(),
        Err(_) => not_found(),
    }
}

/// Deep-link fallback: a known slug serves the shell seeded with that doc; an
/// unknown path 404s, preserving the `/<unknown>` -> 404 contract.
async fn slug_handler(State(state): State<Arc<AppState>>, uri: axum::http::Uri) -> Response {
    let raw = uri.path().trim_start_matches('/');
    let slug = match urlencoding_decode(raw) {
        Some(s) => s,
        None => return not_found(),
    };
    if slug.is_empty() {
        return html(shell::shell_html());
    }
    let (docs, _) = state.scoped_docs();
    match resolve_doc_slug(&docs, &slug) {
        Some(doc) => html(shell::shell_html_for_slug(&doc.slug)),
        None => not_found(),
    }
}

async fn events_handler(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    let ready = stream::once(async {
        Ok(Event::default()
            .event("live:ready")
            .data("{}")
            .retry(Duration::from_millis(500)))
    });
    let live = BroadcastStream::new(rx).filter_map(|res| async move {
        match res {
            Ok((name, data)) => Some(Ok(Event::default().event(name).data(data))),
            Err(_) => None, // lagged receiver: skip, client re-fetches on next event
        }
    });
    Sse::new(ready.chain(live)).keep_alive(KeepAlive::default())
}

async fn post_signal_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> Response {
    if !origin_allowed(&state, &headers) {
        return (StatusCode::FORBIDDEN, "Forbidden origin").into_response();
    }
    append_signal(&state, &body);
    (
        [(header::CONTENT_TYPE, "application/json")],
        "{\"ok\":true}",
    )
        .into_response()
}

async fn ws_signal_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !origin_allowed(&state, &headers) {
        return (StatusCode::FORBIDDEN, "Forbidden origin").into_response();
    }
    ws.on_upgrade(move |socket| ws_signal_loop(socket, state))
}

async fn ws_signal_loop(mut socket: WebSocket, state: Arc<AppState>) {
    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) => append_signal(&state, &text),
            Message::Close(_) => break,
            _ => {}
        }
    }
}

// ── helpers ────────────────────────────────────────────────────────────────

fn origin_allowed(state: &AppState, headers: &HeaderMap) -> bool {
    match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(origin) => state.allowed_origins.is_empty() || state.allowed_origins.contains(origin),
        None => true, // no Origin (curl, native WS) is not a cross-site browser vector
    }
}

/// Append one bounded JSONL signal record to <root>/state/events, mirroring
/// `appendSignalEvent` in live.mjs (same clamping so a hostile localhost client
/// can't inject huge or structured payloads into agent context).
fn append_signal(state: &AppState, raw: &str) {
    let detail: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let get_str = |key: &str| detail.get(key).and_then(|v| v.as_str());

    let typ = get_str("type")
        .filter(|t| valid_signal_type(t))
        .unwrap_or("click");
    let mut record = json!({
        "type": typ,
        "choice": get_str("choice").map(clamp).map(Value::String).unwrap_or(Value::Null),
        "text": get_str("text").map(clamp).unwrap_or_default(),
        "timestamp": unix_secs(),
    });
    if let Some(arr) = detail.get("selected").and_then(|v| v.as_array()) {
        let selected: Vec<Value> = arr
            .iter()
            .filter_map(|v| v.as_str())
            .take(SIGNAL_MAX_SELECTED)
            .map(|s| Value::String(clamp(s)))
            .collect();
        record["selected"] = Value::Array(selected);
    }
    if let Some(screen) = get_str("screen").filter(|s| !s.is_empty()) {
        let screen = clamp(screen);
        record["screen"] = Value::String(screen.clone());
        let (docs, _) = state.scoped_docs();
        if let Some(doc) = docs.iter().find(|d| d.slug == screen) {
            record["screen_file"] = Value::String(doc.name.clone());
        }
    }

    let state_dir = state.root.join("state");
    if std::fs::create_dir_all(&state_dir).is_ok() {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(state_dir.join("events"))
        {
            let _ = writeln!(f, "{record}");
        }
    }
}

fn valid_signal_type(t: &str) -> bool {
    let mut chars = t.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() => {}
        _ => return false,
    }
    t.len() <= 32
        && t.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn clamp(s: &str) -> String {
    if s.chars().count() > SIGNAL_MAX_STR {
        s.chars().take(SIGNAL_MAX_STR).collect()
    } else {
        s.to_string()
    }
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn html(body: String) -> Response {
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], body).into_response()
}

fn json_response(value: Value) -> Response {
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        serde_json::to_string(&value).unwrap_or_else(|_| "{}".into()),
    )
        .into_response()
}

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, "Not found").into_response()
}

// Minimal percent-decoding for path slugs (which contain a-z0-9-/ plus encoded
// bytes). Returns None on malformed escapes, matching the JS decodeURIComponent
// catch -> null path.
fn urlencoding_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' => {
                if i + 2 >= bytes.len() {
                    return None;
                }
                let hi = (bytes[i + 1] as char).to_digit(16)?;
                let lo = (bytes[i + 2] as char).to_digit(16)?;
                out.push((hi * 16 + lo) as u8);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}
