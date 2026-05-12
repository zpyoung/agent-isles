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

## Planned shape

```bash
isles render examples/demo.md
isles watch examples/demo.md
```

Layers:

1. **Source format** — Markdown with explicit HTML islands.
2. **Component vocabulary** — Bootstrap primitives plus Lit Web Components for agent-specific patterns.
3. **CLI renderer** — remark/rehype pipeline that injects assets and opens or writes browser-ready HTML.

## Repository status

This repository has just been initialized. The seed implementation guide lives at:

```txt
docs/implementation-guide.md
```

Next step: build the first vertical slice of the `isles` CLI and component bundle.
