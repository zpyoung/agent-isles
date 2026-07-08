//! Embedded reader frontend. The shell HTML and the SPA bundle are produced by
//! the Node build (`npm run build` -> dist/reader-shell.html + dist/isles-reader.js)
//! and baked into the binary so the server has no runtime asset dependencies —
//! the same "embed templates/static into the binary" approach mdlive uses.

/// The reader SPA bundle served at `/__agent-isles/reader.js`.
pub const READER_BUNDLE: &str = include_str!("../../../dist/isles-reader.js");

/// The reader shell HTML (Bootstrap, highlight.js CSS, theme, Mermaid runtime
/// inlined; references the bundle by URL). Built by buildReaderShell() so it is
/// identical to what `isles live` serves.
pub const READER_SHELL: &str = include_str!("../../../dist/reader-shell.html");

// The reader bundle is referenced by this exact tag in the shell; deep-links
// inject the seed slug immediately before it (matching the Node reader, which
// places __ISLES_INITIAL_SLUG just before the module script).
const READER_SCRIPT_TAG: &str =
    "<script type=\"module\" src=\"/__agent-isles/reader.js\"></script>";

/// The shell for `/` (no seeded document).
pub fn shell_html() -> String {
    READER_SHELL.to_string()
}

/// The shell for a deep-link `/(slug)`, seeded with `window.__ISLES_INITIAL_SLUG`.
pub fn shell_html_for_slug(slug: &str) -> String {
    // Slugs are derived (a-z0-9-/) so JSON-encoding is safe; mirror the JS
    // `replace(/</g, '\\u003c')` defense regardless.
    let encoded = serde_json::to_string(slug).unwrap_or_else(|_| "\"\"".to_string());
    let seed = format!(
        "<script>window.__ISLES_INITIAL_SLUG={};</script>\n  {}",
        encoded.replace('<', "\\u003c"),
        READER_SCRIPT_TAG
    );
    READER_SHELL.replacen(READER_SCRIPT_TAG, &seed, 1)
}
