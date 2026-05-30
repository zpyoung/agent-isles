# Design: `isles preview` — ephemeral Markdown previews

- **Issue:** [#102 — CLI: support ephemeral Markdown previews from chat](https://github.com/zpyoung/agent-isles/issues/102)
- **Date:** 2026-05-29
- **Status:** Approved design, pending implementation plan
- **Depends on:** [#103 — renderer inline/single-file asset mode](https://github.com/zpyoung/agent-isles/issues/103) (in progress on branch `claude/renderer-support-inline-js`)

## Goal

Let an agent working in chat generate a temporary Markdown document, render it through the
normal Agent Isles renderer/theme/component bundle, and open the result in a browser — **without
persisting the source Markdown into the repo or workspace**. The flow reads Markdown from stdin (or
an already-temporary file path), renders a single self-contained HTML file to an OS temp location,
and prints a concrete `file://` path the agent can hand to a browser tool (optionally launching the
browser directly).

## Non-goals

- Long-term document storage, publishing, or GitHub Pages deployment.
- Replacing the file-based `isles render` workflow.
- Persisting chat transcripts or source Markdown unless the user explicitly exports.
- A collaborative editor or writeback workflow beyond temporary preview.
- A bundled HTTP/dev server (see Deferred Ideas — inline + `file://` removes the need).

## Decisions Locked

**Command shape**
- New top-level command: `isles preview`. The verb signals non-persistence and keeps `render`
  purely file-based.

**Input sources**
- `--stdin` is the primary source: `printf '%s' "$md" | isles preview --stdin`.
- An optional positional Markdown **file path** is also accepted (e.g. an agent's scratch file).
- Exactly one source is required: error if both `--stdin` and a path are given, or if neither is.
- Either way the source is only read; it is never copied or written back.

**Assets**
- Inline only. `preview` always renders with `assetMode: 'inline'`, producing one self-contained
  `.html` with zero sibling asset files. The `--assets` flag is **rejected** on `preview` (exit 2,
  with a message pointing to `isles render` for cdn/local output).

**Output / open behavior**
- Default: print the rendered file's `file://` URL (and absolute path) to stdout. This is the
  safe default for headless/CI/agent contexts.
- `--open`: additionally launch the OS default browser. Open failure is non-fatal (warn, still
  print the path, exit 0).

**Temp location**
- Write to `os.tmpdir()/agent-isles-preview/isles-preview-<unique>.html`. Never touches the repo;
  inline mode means a single file with no asset directory.

**Cleanup**
- Age-based prune on each run: before writing the new preview, delete entries in the preview dir
  older than a TTL (default 24h, overridable via `ISLES_PREVIEW_TTL_MS`). The freshly written file
  survives for the browser to read, which avoids the "delete a file the browser still holds open"
  race. Per-file prune errors are ignored (best-effort) and never block the new preview.

**Security boundary**
- `preview` uses the same `--mode trusted|sanitized` policy as `render` (default `trusted`).
  Ephemeral ≠ trusted. Inline runtime support means "the Agent Isles runtime is embedded," not
  "arbitrary author JS is now allowed." Raw-HTML handling follows the existing renderer policy.

## Architecture & Components

### 1. `src/render.mjs` — extract a shared render core (small refactor)

Today `renderMarkdownFile` inlines: read file → resolve packs (against `projectDir`) →
`renderMarkdown` → write output + copy assets. Extract the file-free middle so the preview flow can
render a string without any file I/O:

- **`renderMarkdownString(markdown, options) → { html, resolvedPacks }`**
  Resolves packs against `options.projectDir`, calls the existing `renderMarkdown`, returns the HTML
  string. No reads of an input file, no writes.
- **`renderMarkdownFile`** is rewritten to: `readFileSync` → `renderMarkdownString` → write/copy.
  Observable behavior is unchanged; existing `render` tests guard this.

This preserves a single rendering pipeline (the issue's "reuse the existing renderer rather than
creating a parallel preview pipeline"). `renderMarkdown` itself is untouched.

### 2. `src/preview.mjs` — new ephemeral orchestration module

**`previewMarkdown({ markdown, projectDir, renderMode, explicitPacks, includeUserPacks, showSource, open, opener }) → { outFile, fileUrl }`**

1. `renderMarkdownString(markdown, { assetMode: 'inline', renderMode, projectDir, explicitPacks, includeUserPacks, showSource })` → self-contained HTML.
2. Ensure `os.tmpdir()/agent-isles-preview/` exists (`mkdirSync({ recursive: true })`).
3. **Prune**: list the dir; delete files whose mtime is older than the TTL; ignore individual errors.
4. Write HTML to a unique filename (`isles-preview-<timestamp>-<random>.html`).
5. If `open`: launch the platform opener via Node's built-in `child_process` —
   `open` (macOS), `xdg-open` (Linux), `start` (Windows). **No new dependency.** The opener is
   injectable (`opener` option) so tests never launch a real browser.
6. Return `{ outFile, fileUrl }` where `fileUrl` is a `file://` URL built from the absolute path.

### 3. `bin/isles.mjs` — wire the command

- Add `preview` to the command dispatch and to `USAGE`.
- **`parsePreviewArgs(args)`** accepts: `--stdin`, an optional positional file path, `--open`,
  `--mode trusted|sanitized` / `--safe` / `--sanitize`, `--show-source`, `--pack <path>`
  (repeatable), `--no-user-packs`. It **rejects** `--assets` and `--out` with a clear
  "use `isles render` for persistent output / asset modes" message.
- **`runPreview(args)`**: obtain markdown from stdin (when `--stdin`) or by reading the file path;
  enforce the exactly-one-source rule. Set `projectDir = process.cwd()` for stdin, or
  `dirname(resolve(path))` for a file (so co-located packs/config resolve like `render`). Call
  `previewMarkdown`, then print the `file://` URL and absolute path; when `--open`, add a one-line
  "opened in browser" note. Errors map to the existing exit-code conventions
  (`AgentIslesInputError`/`PackResolutionError`/`PackLoadError` → exit 1; arg errors → exit 2).

## Data Flow

```
stdin / file path
  └─▶ markdown string
        └─▶ renderMarkdownString(inline, packs resolved from projectDir)
              └─▶ self-contained HTML string
                    └─▶ os.tmpdir()/agent-isles-preview/<unique>.html   (prune stale first)
                          └─▶ print file:// URL + path  [+ optional browser open]
```

Source Markdown is never written anywhere; only the rendered temp HTML is created.
`git status --short` stays clean after any `preview` run.

## Error Handling

| Condition | Behavior |
|---|---|
| Neither `--stdin` nor a path | Exit 2, print usage |
| Both `--stdin` and a path | Exit 2, "choose one input source" |
| `--assets` or `--out` supplied | Exit 2, redirect to `isles render` |
| Missing inline pack asset | Existing fail-fast `AgentIslesInputError` (already on the inline branch) surfaces; exit 1 |
| Pack resolution / load failure | Existing `PackResolutionError` / `PackLoadError` handling; exit 1 |
| Browser open failure (`--open`) | Warn to stderr, still print path, exit 0 |
| Stale-file prune error | Ignored (best-effort); never blocks the new preview |

## Testing

`tests/preview.test.mjs` (Node `node:test`, mirroring existing CLI/render tests):

- **stdin path** renders an inline single-file preview — assert 0 external `http(s)`/`./` asset refs.
- **file-path input** renders to the temp dir without writing alongside the source.
- **Non-persistence guarantee**: output path is under `os.tmpdir()` (outside cwd); the source is
  never written; cwd / `git status --short` stays clean.
- **`--assets` and `--out` rejected** with the redirect message and exit 2.
- **`--open`** uses an injected `opener` stub — assert it's invoked with the temp file path; no real
  browser launches in CI.
- **Prune** removes a pre-seeded stale file (mtime beyond TTL) while keeping the fresh preview.
- **Input errors**: missing source and dual source both exit 2.
- Reuse an existing fixture containing one `<agent-*>` island to satisfy the "components/theme work
  in the ephemeral preview" acceptance criterion.

Docs:

- README gets an agent-facing section: the `printf '%s' "$md" | isles preview --stdin --open`
  example, the file-path form, where temp files live, the prune/TTL cleanup semantics, and the
  security note (ephemeral ≠ trusted).

## Sequencing

`preview` is built entirely on inline asset mode, which is issue #103's work on branch
`claude/renderer-support-inline-js`. This spec's implementation must land **after or stacked on top
of** #103 so `renderMarkdownString(..., { assetMode: 'inline' })` and the fail-fast missing-asset
behavior are available. The implementation plan will choose stacked-branch vs. branch-after-merge.

This design doc is authored in a worktree branched off `main` (`claude/issue-102-isles-preview-spec`)
and intentionally does not yet contain the #103 inline-mode code.

## Industry Insights

From parallel `web-research-agent` runs (2026):

- **Opening files cross-platform**: the `open` npm package (sindresorhus) wraps
  `open`/`start`/`xdg-open` via `spawn` and is the common library choice, but a CLI can replicate it
  with Node's built-in `child_process` to avoid a dependency — which this design does. Printing a
  `file://` path for an external/automation browser tool to consume is a recognized 2026 agent
  pattern and is the chosen default. Sources:
  [sindresorhus/open](https://github.com/sindresorhus/open),
  [Playwright CLI for agents](https://testcollab.com/blog/playwright-cli).
- **`file://` + ES modules**: `<script type="module">` blocks *external imports* under the null
  `file://` origin (CORS). This does **not** affect us: the inlined rollup bundle has no external
  imports, and Bootstrap/pack assets are inlined too, so the single-file preview executes from
  `file://` without a server. Sources:
  [CORS null-origin module discussion](https://github.com/orgs/community/discussions/65033),
  [file:// CORS explainer](https://www.xjavascript.com/blog/access-to-script-at-from-origin-null-has-been-blocked-by-cors-policy/).
- **Temp/cleanup**: 2026 guidance favors XDG cache (`~/.cache`) for *durable* preview caches, but
  for genuinely throwaway one-shots `os.tmpdir()` is the simpler, repo-safe choice (chosen here).
  Delete-on-exit is discouraged because the browser may still be reading the file when a short-lived
  CLI exits, and it misses on SIGKILL/crash; age-based pruning on the next run is the robust
  alternative and sidesteps the open-file delete race. Real tools (Vite preview, Storybook) are
  cited as cautionary cases that leave temp artifacts uncleaned. Sources:
  [Node `tmp` library](https://www.npmjs.com/package/tmp),
  [XDG Base Directory spec](https://xdgbasedirectoryspecification.com/),
  [Vite "vite clean" request](https://github.com/vitejs/vite/issues/10986).

## Deferred Ideas

- **`--serve` / built-in `http` server** — unnecessary since inline + `file://` works; revisit only
  if a future need such as live-reload arises (use Node's built-in `http`, not Express/Hono/Vite).
- **`--text "<markdown>"` inline-string argument** — stdin already covers this; multi-line shell
  quoting makes it awkward.
- **Opt-in persistence from `preview`** — out of scope; that is `isles render`'s job.

(All three were raised and intentionally scoped out during design — discussion otherwise stayed
within scope.)
