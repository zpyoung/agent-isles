# Agent Isles

> Markdown seas, component islands.

**Agent Isles** is a renderer and component vocabulary for AI-agent output. Agents write standard Markdown, then embed small HTML islands where richer UI is useful. Those islands can be raw Bootstrap markup for simple cases or semantic Lit Web Components for reusable patterns like risks, decisions, findings, metrics, tabs, copy blocks, and timelines.

## Why this exists

Agent output should be:

- easy to write,
- easy to diff,
- easy to store in git,
- richer than plain Markdown when the task calls for it,
- renderable without forcing every agent to hand-author verbose UI boilerplate.

Agent Isles keeps the source format simple while giving agents a compact UI vocabulary.

## Current status

The first renderer slice exists:

```bash
npm install
npm run build
npm run render -- --out dist/demo.html
```

That renders `examples/demo.md` to `dist/demo.html` and copies the component bundle beside it.

## CLI

```bash
isles render <file.md> [--out <file.html>]
```

During local development, run the CLI directly:

```bash
node ./bin/isles.mjs render examples/demo.md --out dist/demo.html
```

Or use the package script:

```bash
npm run render -- --out dist/demo.html
```

`isles watch` is reserved for the next slice.

## Architecture

Layers:

1. **Source format** — Markdown with explicit HTML islands.
2. **Component vocabulary** — Bootstrap primitives plus Lit Web Components for agent-specific patterns.
3. **CLI renderer** — remark/rehype pipeline that injects assets and writes browser-ready HTML.

The seed implementation guide lives at:

```txt
docs/implementation-guide.md
```

The active MVP plan lives at:

```txt
docs/plans/2026-05-12-mvp-renderer.md
```

Planning surfaces:

- Issues: https://github.com/zpyoung/agent-isles/issues
- Project board: https://github.com/users/zpyoung/projects/1
- Repo-tracked wiki notes: `docs/wiki/`

## Supported islands so far

- `<agent-decision verdict="..." title="...">...</agent-decision>`
- `<agent-risk level="low|medium|high|critical" title="...">...</agent-risk>`

More components from the guide are planned.

## Security note

The MVP renderer uses `rehype-raw` so trusted Markdown can include HTML islands. Do **not** render untrusted Markdown with this mode yet. A future sanitization mode should explicitly define which tags and attributes are allowed.

## Development

```bash
npm install
npm run build
npm test
npm run render -- --out dist/demo.html
```
