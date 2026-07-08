# Agent Isles — Agent Operating Notes

## Project identity

- **Product name:** Agent Isles
- **Package/repo name:** `agent-isles`
- **CLI command:** `isles`
- **Tagline:** Markdown seas, component islands.

## Core idea

Agent Isles renders agent-authored Markdown that may contain HTML “islands”:

1. Plain Markdown remains portable and git-friendly.
2. Simple UI can use Bootstrap classes directly.
3. Reusable rich patterns use semantic Lit Web Components, initially under the `<agent-*>` prefix.
4. The CLI renders Markdown to browser-ready HTML by injecting the component library and theme.

## Design constraints

- Keep the source format boring: Markdown + explicit HTML islands.
- Keep the renderer inspectable: unified/remark/rehype pipeline, minimal magic.
- Prefer local/offline assets for reliability once the prototype works.
- Treat raw HTML rendering as a security boundary. Do not render untrusted Markdown without a deliberate sanitization mode.
- Maintain clean separation between:
  - source Markdown format,
  - component vocabulary,
  - CLI renderer,
  - theme/assets.

## Current implementation baseline

The first usable vertical slice now exists:

```bash
isles render examples/demo.md
isles watch examples/demo.md
isles live examples/demo.md   # or a folder: isles live examples/
```

Core implementation surfaces:

- `bin/isles.mjs` CLI entrypoint
- `src/render.mjs` Markdown renderer
- `src/renderer/rehype-islands.mjs` browser-safe island transforms (shared by the Node
  renderer and the client reader); `src/renderer/rehype-plugins.mjs` keeps the Node-only
  plugins (D2, writeback, task markers)
- `src/watch.mjs` live rebuild workflow
- `src/live.mjs` background live server (agent-screen mode + reader mode)
- `src/reader/` the live Markdown reader: `sources.mjs` (file/folder → safe recursive
  doc tree), `render-browser.mjs` (client-side renderer), `reader-entry.js` (SPA bundled
  to `dist/isles-reader.js`)
- `src/components/` Lit component bundle
- `src/theme/agent-theme.css` theme and layout styles
- `examples/demo.md` public demo source
- `tests/` unit and browser smoke coverage

`isles live <file|dir>` is a full Markdown reader (recursive tree, TOC, search, themes,
live reload) that renders client-side and still supports the agent-screen push/signal
flow. A planned Phase 2 adds a Rust + TypeScript / Tauri shell that serves the same
reader as a standalone desktop app or in the browser.

## Naming/API preferences

- User-facing product: **Agent Isles**
- CLI verbs should be explicit: `render`, `watch`
- Keep `<agent-*>` component tags for now; do not force nautical names into the component API.
- Avoid overbranding internals. Boring module names are good where reliability matters.

## Verification standard

Before claiming success:

- Run the build/test command if present.
- Render an example Markdown file successfully.
- Verify generated HTML includes the expected component script/theme.
- If browser behavior matters, use a browser/screenshot check rather than guessing.

## Maintainer workflow

The dedicated Hermes profile for this project is `agent-isles`. For future Agent Isles work, that profile should behave as the project steward and use:

- `docs/MAINTAINER_PLAYBOOK.md` for maintainer workflow.
- GitHub issues as executable work packets with goal, scope, and acceptance criteria.
- `docs/PROJECT_PLAN.md` as the internal live ordering/status board.
- GitHub Wiki for public durable context: https://github.com/zpyoung/agent-isles/wiki
- `docs/wiki/` as the repo-tracked wiki mirror.
- `docs/plans/` on the dedicated `plans` branch for detailed technical implementation plans.

For non-trivial code work, prefer issue → branch → TDD → tests/render smoke → commit/PR → issue/project update.

## Recent maintainer learnings

Keep this file updated when durable project-operating lessons emerge. Prefer adding concise conventions here over relying on chat history.

- GitHub Projects V2 is not required for day-to-day planning. If Project access is unavailable, do not block work; update issues, labels, milestones, and `docs/PROJECT_PLAN.md` instead.
- Detailed implementation plans should live on the dedicated `plans` branch under `docs/plans/`; executable scope belongs in GitHub issues and current ordering/status belongs in `docs/PROJECT_PLAN.md`.
- When creating or updating issues, attach relevant reference material by default: screenshots, rendered previews, HTML references, sketches, logs, fixtures, and source examples. Use durable repo or utility-branch assets with verified raw links rather than local chat attachments.
- README and public docs should be updated alongside feature, CLI, component-vocabulary, security-boundary, and roadmap changes.
- GitHub Pages and other live/public settings are production-like surfaces. Keep workflows safe and ask before enabling or changing live website settings.
- Existing PR branches may be shared review surfaces. Avoid force-pushes by default; prefer temporary worktrees, merges, and fast-forward pushes when updating diverged PR branches.
- Multistage delegated work should use a bounded shepherd watcher by default when waiting on bots, review, or CI. The watcher should monitor the relevant issue/PR chain, address safe feedback, verify checks, merge only when explicitly authorized and safe, update issue/project state, and report only meaningful state changes.
