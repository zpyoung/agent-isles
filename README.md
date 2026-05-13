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

## Demo: source Markdown to rendered report

The public demo lives in `examples/demo.md`. It is intentionally readable as plain Markdown, but it also includes richer islands:

- Bootstrap cards for quick metrics,
- Markdown tables and code fences for portable evidence,
- `<agent-decision>` elements for recommendations,
- `<agent-risk>` elements for caveats and mitigations.

Render it locally:

```bash
npm install
npm test
npm run render -- --out dist/demo.html
```

Then open:

```txt
dist/demo.html
```

The renderer turns the Markdown source into a browser-ready HTML report, injects Bootstrap and the Agent Isles theme, and copies the component bundle next to the generated page. This makes the workflow reviewable in pull requests while still producing a credible artifact for humans.

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
isles render <file.md> [--out <file.html>] [--mode trusted|sanitized]
isles render <file.md> [--out <file.html>] [--safe|--sanitize]
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
- GitHub Wiki: https://github.com/zpyoung/agent-isles/wiki
- Repo-tracked wiki mirror: `docs/wiki/`
- Maintainer playbook: `docs/MAINTAINER_PLAYBOOK.md`

## Component vocabulary

The durable component vocabulary reference lives at:

```txt
docs/component-vocabulary.md
```

Supported islands so far:

- `<agent-decision verdict="..." title="...">...</agent-decision>`
- `<agent-risk level="low|medium|high|critical" title="...">...</agent-risk>`

The reference documents supported attributes, child content expectations, accessibility notes, trusted/sanitized rendering behavior, and planned placeholders for the next component set.

## Security modes

Agent Isles has two rendering modes. Name the boundary plainly before choosing one:

- **Trusted mode** is the default for authored, reviewable Markdown. It runs `rehype-raw` and preserves raw HTML islands, so scripts, event handlers, and other active HTML from the source can reach the rendered body. Use this only when the Markdown comes from a trusted author or a reviewed repository.
- **Sanitized mode** is for untrusted or mixed-trust Markdown. Use `--safe`, `--sanitize`, or `--mode sanitized` to remove unsafe raw HTML elements and restrict tags, attributes, and URL protocols while still allowing Markdown, Bootstrap classes/data attributes, and the current `<agent-*>` islands.

Examples:

```bash
# Trusted authoring mode, default behavior.
npm run render -- --out dist/demo.html

# Sanitized mode for untrusted Markdown.
node ./bin/isles.mjs render input.md --safe --out dist/safe.html
```

Sanitized mode applies to user-authored Markdown content. The generated HTML page still injects Agent Isles runtime assets, including Bootstrap and the component bundle.

## Development

```bash
npm install
npm run build
npm test
npm run render -- --out dist/demo.html
```
