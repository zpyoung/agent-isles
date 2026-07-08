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

use axum::Router;
use notify::Watcher;
use tokio::net::TcpListener;
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

/// A bound-and-listening server: the URL plus the resources that must outlive
/// the bind (the file watcher and the serving task). Dropping it stops serving.
pub struct ServerHandle {
    pub url: String,
    _watcher: Option<Box<dyn Watcher + Send>>,
    task: tokio::task::JoinHandle<std::io::Result<()>>,
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

struct Prepared {
    listener: TcpListener,
    app: Router,
    url: String,
    watcher: Option<Box<dyn Watcher + Send>>,
}

async fn prepare(config: ServeConfig) -> std::io::Result<Prepared> {
    let ServeConfig {
        source,
        host,
        port,
        url_host,
    } = config;
    let reader_file = source.file.clone();
    let root = source.root.clone();

    let (tx, _rx) = broadcast::channel::<watch::SseEvent>(256);

    let watcher = match watch::spawn(root.clone(), reader_file.clone(), tx.clone()) {
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
    let listener = TcpListener::bind(addr).await?;
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
    Ok(Prepared {
        listener,
        app,
        url,
        watcher,
    })
}

/// Bind, start watching, and serve until Ctrl-C / SIGTERM (foreground). Prints
/// the URL. Used by the `isles-server` binary.
pub async fn serve(config: ServeConfig) -> std::io::Result<()> {
    let label = source_label(&config.source);
    let Prepared {
        listener,
        app,
        url,
        watcher: _watcher,
    } = prepare(config).await?;
    println!("Agent Isles reader serving {label} at {url}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
}

/// Bind and start serving on a background task, returning the URL immediately.
/// The returned handle keeps the watcher and serving task alive; drop it to
/// stop. Used by the Tauri shell, which opens a window at `handle.url`.
pub async fn serve_in_background(
    source: ReaderSource,
    host: &str,
    port: u16,
) -> std::io::Result<ServerHandle> {
    let prepared = prepare(ServeConfig {
        source,
        host: host.to_string(),
        port,
        url_host: None,
    })
    .await?;
    let Prepared {
        listener,
        app,
        url,
        watcher,
    } = prepared;
    let task = tokio::spawn(async move { axum::serve(listener, app).await });
    Ok(ServerHandle {
        url,
        _watcher: watcher,
        task,
    })
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
