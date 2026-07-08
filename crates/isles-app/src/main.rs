//! Agent Isles Reader — Tauri desktop shell.
//!
//! Launches the embedded `isles-server` on an ephemeral loopback port, then
//! opens a native window pointed at it. The window renders the exact same
//! reader frontend the browser path uses — "the same server in a native window
//! via Tauri, no browser required."
//!
//! Usage: `isles-app [path]` (a Markdown file or folder; defaults to the
//! current directory).

// Hide the extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use isles_server::{resolve_source, serve_in_background};

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| ".".to_string());
    let source = match resolve_source(&path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("isles-app: {e}");
            std::process::exit(1);
        }
    };

    // Start the reader server before the UI so the window has a URL to load.
    let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
    let handle = match rt.block_on(serve_in_background(source, "127.0.0.1", 0)) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("isles-app: failed to start reader server: {e}");
            std::process::exit(1);
        }
    };
    let url = handle.url.clone();
    // Keep the runtime and server (watcher + serving task) alive for the whole
    // process; the app exits when the window closes.
    std::mem::forget(rt);
    std::mem::forget(handle);

    tauri::Builder::default()
        .setup(move |app| {
            let parsed = url::Url::parse(&url).expect("valid reader URL");
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(parsed))
                .title("Agent Isles Reader")
                .inner_size(1100.0, 800.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("run tauri application");
}
