# Dev supervisor with hot reload — design

**Date:** 2026-06-08
**Status:** Approved — pending implementation
**Topic:** A repo-only `pnpm dev <subcommand>` supervisor that runs an agent-isles serve command in the foreground, watches the project source, rebuilds, and hot-reloads the browser.

## Problem

Developing agent-isles itself is a slow loop today: after editing the renderer, a component, the theme, or a pack, you must manually rebuild (`npm run build`) and refresh the browser. The shipped CLI already has SSE-based browser reload (`preview <dir>` and `live <dir>` serve `/events` and the clients call `window.location.reload()` / soft-refresh), but nothing watches the **agent-isles source** and nothing ties a source edit to a rebuild + reload.

We want a developer command, invoked like `pnpm dev live ./screens` or `pnpm dev render examples/demo.md`, that closes this loop — **without shipping a new `isles` CLI command**.

## Goals / Non-goals

**Goals**
- `pnpm dev <subcommand> [args]` wraps a browser-viewable serve command and hot-reloads on source change.
- Watch scope: the target Markdown/dir **+ component packs + renderer/theme/server source** (`src/**`).
- Auto-open the browser on start (`--no-open` to disable).
- Lives entirely in repo tooling; excluded from the published npm package.

**Non-goals**
- No new `isles` subcommand, no change to the `bin` map.
- No change to `render`'s existing one-shot behavior.
- No rollup `--watch` incremental mode in v1 (deferred; see below).
- Not a general-purpose static dev server for arbitrary projects.

## Key constraint: two classes of source

Source files fall into two buckets that hot-reload differently:

1. **Component source** (`src/components/**`) → bundled by rollup into `dist/agent-components.js`. The renderer reads this file **from disk at render time** (`src/renderer/page.mjs:13`). A rollup rebuild + re-render picks it up — **no process restart needed**.
2. **Renderer / server / theme source** (`src/render.mjs`, `src/renderer/**`, `src/live.mjs`, `src/preview.mjs`, `src/theme/**`, `src/pack-*.mjs`) → loaded as **ESM modules** in the running Node process. ESM module cache means edits don't take effect without a **process restart**.

Because the chosen watch scope includes renderer/theme source, the supervisor must be able to **restart the wrapped process** — an in-process re-render is insufficient. This drives the architecture below.

## Architecture

A single dev-only script, **`scripts/dev.mjs`** (not in `package.json` `files`, so never published), wired as:

```json
// package.json
"scripts": { "dev": "node ./scripts/dev.mjs" }
```

Usage: `pnpm dev <subcommand> [args...]`, where `<subcommand>` ∈ `{ live, preview, render }`.

The supervisor has two execution modes depending on the subcommand:

### Mode A — wrapped server (`live`, `preview`)

These subcommands are already foreground SSE servers. The supervisor:

1. Runs `rollup -c` once to ensure `dist/` is current, then **spawns the child**: `spawn(process.execPath, [bin/isles.mjs, subcommand, ...args])`, piping stdout/stderr through.
2. Waits for the child's "server is up" signal (its printed URL / `state/server-info` line) and **auto-opens the browser** (unless `--no-open`).
3. Watches `src/**` + resolved component packs. On a debounced (~150 ms) change:
   - run `rollup -c` (refresh the component bundle),
   - **kill and respawn** the child.
4. The browser's `EventSource` drops when the child dies and reconnects to the new child. A small **reload-on-reconnect** behavior in the SSE clients reloads/refreshes the page once on reconnect (see Shipped touchpoints).
5. Markdown / pack-data-only edits are handled by the child server's **own** watcher (`preview`/`live` already re-render and broadcast on `/events`) — the supervisor does **not** restart for those, to avoid churn.

### Mode B — self-served render (`render <file>`)

`render` is a one-shot file writer with no server, so the supervisor serves it itself — keeping all render-dev-serving **out of shipped code**:

1. Render the target via the exported `renderMarkdownFile(inputPath, options)` (`src/render.mjs:102`) to an in-memory/temp HTML string.
2. Serve that HTML from a tiny HTTP server **inside `scripts/dev.mjs`**, with its own `/events` SSE endpoint and a reload `<script>` injected into the served HTML (dev injects its own client here — no shipped-src dependency).
3. Watch the target file + packs + `src/**`. On change: run `rollup -c` if needed, re-`renderMarkdownFile`, broadcast reload.
4. Auto-open the browser to the served URL.

> Note: Mode B re-imports nothing from the renderer across edits unless it restarts; since `renderMarkdownFile` and its renderer modules are ESM-cached, **Mode B also restarts its own process** (re-exec `scripts/dev.mjs`) on `src/**` changes to pick up renderer/theme edits, then the browser reload-on-reconnect (dev's own injected client) fires. Markdown-only and component-only edits are handled in-process (re-render after rollup) without restart.

### Watcher details (both modes)

- Watch roots: target file/dir, `src/**`, resolved component pack paths.
- **Ignore**: `dist/**` (rollup output — would otherwise self-trigger), `node_modules/**`, `.git/**`, and live/preview state dirs (`state/`, temp preview dirs).
- Debounce changes (~150 ms) and coalesce bursts (editors emit multiple events per save).
- Classify each change: `component` → rebuild + re-render/restart; `renderer/theme/server` → rebuild + restart; `markdown/pack-data` → let the child server handle it (Mode A) or re-render in-process (Mode B).

### Lifecycle & signals

- Forward `SIGINT`/`SIGTERM` to the child; ensure the child and any rollup process are killed before the supervisor exits (no orphans).
- If the child exits unexpectedly (crash), log and respawn on the next change rather than tearing down the supervisor.
- Surface child stdout/stderr verbatim so the dev sees render errors.

## Shipped-code touchpoints (minimal)

Only Mode A requires touching published `src`:

- **`src/live-client.js`** and **the preview inline SSE client** (`src/preview.mjs` ~line 788): add "reload-on-reconnect" — remember that the `EventSource` was previously connected; when it reconnects after a drop, trigger the existing refresh path (`window.location.reload()` for live; `loadFiles()` for preview) once.

This is a ~2-line, general resilience improvement (a real `live`/`preview` server restart now recovers the page automatically). It is **not** a CLI command and does not expand the CLI surface. If undesired, the fallback is to route `live`/`preview` dev through a dev-owned proxy that injects its own client — heavier, deferred.

Everything else (`scripts/dev.mjs`, the `pnpm dev` script) is repo-only and unpublished.

## Error handling

- Missing/invalid subcommand → print supported set (`live`, `preview`, `render`) and exit non-zero.
- rollup build failure → print rollup's error, keep the last good child running, do **not** restart; retry on next change.
- Child fails to start / port in use → surface the child's error and exit.
- Watcher error → log and degrade to no-watch (server still serves) rather than crash.

## Testing

- **Unit (`scripts`):** change-classification (component vs renderer vs markdown → correct action), ignore globs (a `dist/**` write does not trigger), debounce coalescing.
- **Unit:** reload-on-reconnect client snippet — assert it reloads only after a prior-connected reconnect, not on first connect.
- **Integration:** start `pnpm dev preview <tmpdir>` against a temp project; touch a `src/**` file → assert child restarted (new pid / new server-info) and an SSE reload was delivered; touch only the markdown → assert **no** restart but a reload still arrives.
- Keep dev tests separate from the published test matrix if they depend on repo layout.

## Decisions Locked

- **Target / invocation** — A wrapper over subcommands: `pnpm dev live`, `pnpm dev render`, `pnpm dev preview` (not a single-file-only server).
- **Watch scope** — Markdown + component packs + renderer/theme/server source (`src/**`).
- **Browser** — Auto-open on start, `--no-open` to disable.
- **Packaging** — Not part of the `isles` CLI; lives in `scripts/dev.mjs`, excluded from the npm package via the existing `files` allowlist.
- **Command shape (delegated → chosen)** — Standalone repo script invoked via `pnpm dev`, spawning `bin/isles.mjs` children; rejected adding a `--dev` flag to shipped commands (would put dev logic in shipped code) and rejected in-process ESM cache-busting (fragile, misses theme/pack edits).

## Industry Insights

(offline mode — external validation pending) The supervisor/restart model mirrors established dev tooling (nodemon-style process restart + a separate rollup watch), chosen over in-process module hot-swap because Node ESM provides no built-in cache invalidation and cache-busting `import('...?t=')` leaks and misses transitive renderer/theme imports. SSE + reload-on-reconnect is the standard lightweight live-reload pattern and is already the project's mechanism.

## Deferred Ideas

- rollup `--watch` incremental mode instead of `rollup -c` per change (faster; adds child-process coordination). Upgrade only if build latency is noticeable.
- A dev-owned reload proxy for `live`/`preview` that injects its own client, removing the shipped-src touchpoint entirely.
- `pnpm dev watch` / other subcommands — out of scope (no browser view).
