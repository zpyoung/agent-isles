//! End-to-end checks that the Rust server honors the reader route contract the
//! Node `isles live` reader and the embedded frontend depend on. Uses a raw
//! HTTP/1.1 client over tokio to avoid pulling in an HTTP client dependency.

use isles_server::{dir_source, router};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

async fn start(root: std::path::PathBuf) -> std::net::SocketAddr {
    let source = dir_source(root);
    let (state, _tx) = isles_server::state_for(&source);
    let app = router(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    addr
}

async fn get(addr: std::net::SocketAddr, path: &str) -> (u16, String) {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let req = format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).await.unwrap();
    let text = String::from_utf8_lossy(&buf).into_owned();
    let status = text
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse().ok())
        .unwrap_or(0);
    let body = text.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
    (status, body)
}

fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("root.md"), "# Root\n\nROOT_BODY").unwrap();
    std::fs::create_dir(dir.path().join("guides")).unwrap();
    std::fs::write(dir.path().join("guides/intro.md"), "# Intro\n\nINTRO_BODY").unwrap();
    dir
}

#[tokio::test]
async fn serves_shell_and_bundle() {
    let dir = fixture();
    let addr = start(dir.path().to_path_buf()).await;

    let (status, body) = get(addr, "/").await;
    assert_eq!(status, 200);
    assert!(
        body.contains("/__agent-isles/reader.js"),
        "shell references the bundle"
    );

    let (status, body) = get(addr, "/__agent-isles/reader.js").await;
    assert_eq!(status, 200);
    assert!(body.len() > 1000, "bundle is non-trivial");
}

#[tokio::test]
async fn tree_lists_nested_docs() {
    let dir = fixture();
    let addr = start(dir.path().to_path_buf()).await;
    let (status, body) = get(addr, "/__agent-isles/tree").await;
    assert_eq!(status, 200);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    let slugs: Vec<&str> = v["docs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["slug"].as_str().unwrap())
        .collect();
    assert!(slugs.contains(&"root"));
    assert!(slugs.contains(&"guides/intro"));
    let folder = v["tree"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["name"] == "guides")
        .unwrap();
    assert_eq!(folder["type"], "dir");
    assert_eq!(folder["children"][0]["slug"], "guides/intro");
}

#[tokio::test]
async fn raw_returns_markdown_or_404() {
    let dir = fixture();
    let addr = start(dir.path().to_path_buf()).await;

    let (status, body) = get(addr, "/__agent-isles/raw?slug=root").await;
    assert_eq!(status, 200);
    assert!(body.contains("ROOT_BODY"));
    assert!(!body.contains("<h1"), "raw, not rendered");

    let (status, _) = get(addr, "/__agent-isles/raw?slug=nope").await;
    assert_eq!(status, 404);

    let (status, _) = get(addr, "/__agent-isles/raw?slug=..%2Fsecret").await;
    assert_eq!(status, 404);
}

#[tokio::test]
async fn deep_link_seeds_slug_and_404s_unknown() {
    let dir = fixture();
    let addr = start(dir.path().to_path_buf()).await;

    let (status, body) = get(addr, "/guides/intro").await;
    assert_eq!(status, 200);
    assert!(body.contains("__ISLES_INITIAL_SLUG"));
    assert!(body.contains("guides/intro"));

    let (status, _) = get(addr, "/missing").await;
    assert_eq!(status, 404);
}
