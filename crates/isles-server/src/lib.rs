//! isles-server: a thin HTTP server for the Agent Isles Markdown reader.
//!
//! It serves the Node-built reader frontend (embedded) over the same
//! HTTP/SSE/WS contract `isles live` exposes in reader mode, and watches the
//! source for changes to drive live reload. No Markdown rendering happens here —
//! the browser/webview renders, exactly as in the Node path — which is what lets
//! the same frontend run standalone in a browser or inside the Tauri shell.

use std::collections::HashSet;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::broadcast;

pub mod server;
pub mod shell;
pub mod sources;
pub mod watch;

pub use server::{router, AppState};
pub use sources::{resolve_source, ReaderSource, SourceMode};

/// How the reader should be served.
pub struct ServeConfig {
    pub source: ReaderSource,
    pub host: String,
    pub port: u16,
    /// Hostname to show in the printed URL (defaults to `localhost` for loopback).
    pub url_host: Option<String>,
}

/// Bind, start watching, and serve until Ctrl-C / SIGTERM. Prints the URL.
pub async fn serve(config: ServeConfig) -> std::io::Result<()> {
    let ServeConfig {
        source,
        host,
        port,
        url_host,
    } = config;
    let reader_file = source.file.clone();
    let root = source.root.clone();

    let (tx, _rx) = broadcast::channel::<watch::SseEvent>(256);

    // Keep the watcher guard alive for the process lifetime.
    let _watcher = match watch::spawn(root.clone(), reader_file.clone(), tx.clone()) {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("isles-server: file watching disabled ({e}); live reload will not fire");
            None
        }
    };

    let addr: SocketAddr = format!("{host}:{port}").parse().map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("bad host/port: {e}"),
        )
    })?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let bound = listener.local_addr()?;

    let shown_host = url_host.unwrap_or_else(|| {
        if host == "127.0.0.1" || host == "0.0.0.0" {
            "localhost".to_string()
        } else {
            host.clone()
        }
    });
    let url = format!("http://{}:{}", shown_host, bound.port());

    let allowed_origins = HashSet::from([
        format!("http://localhost:{}", bound.port()),
        format!("http://127.0.0.1:{}", bound.port()),
        format!("http://{}:{}", shown_host, bound.port()),
        format!("http://{}:{}", host, bound.port()),
    ]);

    let state = Arc::new(AppState {
        root,
        reader_file,
        tx,
        allowed_origins,
    });
    let app = router(state);

    println!(
        "Agent Isles reader serving {} at {}",
        source_label(&source),
        url
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
}

fn source_label(source: &ReaderSource) -> String {
    match &source.file {
        Some(f) => format!("{}/{}", source.root.display(), f),
        None => source.root.display().to_string(),
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

/// Helper for tests/embedders: build an `AppState` with a fresh broadcast
/// channel and no origin restriction.
pub fn state_for(source: &ReaderSource) -> (Arc<AppState>, broadcast::Sender<watch::SseEvent>) {
    let (tx, _rx) = broadcast::channel::<watch::SseEvent>(256);
    let state = Arc::new(AppState {
        root: source.root.clone(),
        reader_file: source.file.clone(),
        tx: tx.clone(),
        allowed_origins: HashSet::new(),
    });
    (state, tx)
}

/// Synthesize a `ReaderSource` for a directory without touching the filesystem
/// resolver (used by tests with temp dirs).
pub fn dir_source(root: PathBuf) -> ReaderSource {
    ReaderSource {
        mode: SourceMode::Dir,
        root,
        file: None,
    }
}
