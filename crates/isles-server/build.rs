// The server embeds the Node-built reader frontend at compile time. Fail early
// with an actionable message if it hasn't been built yet, instead of a cryptic
// include_str! "file not found" pointing inside the source.
use std::path::Path;

fn main() {
    // crates/isles-server -> repo root
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .expect("workspace root")
        .to_path_buf();

    for rel in ["dist/isles-reader.js", "dist/reader-shell.html"] {
        let path = root.join(rel);
        println!("cargo:rerun-if-changed={}", path.display());
        if !path.exists() {
            panic!(
                "Missing {rel}. Build the reader frontend first:\n\n    npm install && npm run build\n\n\
                 (npm run build emits dist/isles-reader.js and dist/reader-shell.html, which the \
                 isles-server binary embeds.)"
            );
        }
    }
}
