# Agent Isles

> Markdown seas, component islands.

**Agent Isles** is a semantic Markdown renderer for AI-agent artifacts. Agents write standard Markdown, then embed small HTML “islands” where richer UI is useful. Those islands can be raw Bootstrap markup for simple one-off layout or semantic Lit Web Components for repeated agent-output patterns like risks, decisions, metrics, plans, timelines, checklists, and review surfaces.

Agent Isles is intentionally not a general data-app framework. Its center of gravity is agent-authored documents: plans, reports, decision records, implementation notes, reviews, checklists, and other artifacts that should stay readable as Markdown, reviewable in git, and useful when rendered for humans.

## Why this exists

Agent output should be:

- easy to write,
- easy to diff,
- easy to store in git,
- richer than plain Markdown when the task calls for it,
- renderable without forcing every agent to hand-author verbose UI boilerplate,
- structured enough for humans and agents to inspect, patch, and reuse later.

Agent Isles keeps the source format simple while giving agents a compact UI vocabulary. The aim is not maximum frontend expressiveness; the aim is a constrained, reliable document grammar that agents can emit consistently and humans can maintain.

## What Agent Isles is for

Agent Isles is designed for artifacts such as:

- project plans and implementation plans,
- decision records and recommendations,
- risk registers and mitigation notes,
- release checklists and review checklists,
- compact status reports and executive summaries,
- migration timelines and roadmap views,
- AI-generated reports that need more structure than a wall of Markdown.

The source should remain boring:

```md
# Migration Plan

<agent-decision verdict="go" title="Use Markdown islands">
Ship the first renderer slice and keep source reviewable.
</agent-decision>

- [ ] Review launch gates
- [x] Add render smoke test
```

The rendered output can be polished and interactive, but the Markdown source remains the primary artifact.

## What Agent Isles is not trying to be

Agent Isles should not grow into a broad dashboard or application framework. It should avoid becoming a place where every report requires custom JavaScript, complex data pipelines, or bespoke UI code.

Use Agent Isles when the valuable thing is the **document artifact**: a readable source file, semantic islands, and a rendered view that helps people review or act on it. For heavy data exploration, custom charting, multi-page analytical apps, or production analytics workflows, use a purpose-built data-app stack and let Agent Isles stay focused on agent-authored documents.

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

## Demo

- Source Markdown: [`examples/demo.md`](examples/demo.md)
- Published rendered demo: https://zpyoung.github.io/agent-isles/demo.html

The rendered demo is published by the GitHub Pages workflow after changes land on `main`.

## Installation and npm prerelease path

Agent Isles is prepared for a first npm prerelease, but publication is still a deliberate release action. Do not publish from routine development or automation without explicit maintainer approval.

Local development usage:

```bash
npm install
npm run build
node ./bin/isles.mjs render examples/demo.md --out dist/demo.html
```

To smoke-test the installed command locally before any registry publish:

```bash
npm link
isles render examples/demo.md --out dist/demo.html
```

After an approved npm prerelease is published, the expected consumer paths are:

```bash
npm install -g agent-isles@next
isles render ./report.md --out ./report.html

npx agent-isles@next render ./report.md --out ./report.html
```

The first prerelease versioning scheme is `0.1.0-alpha.N` under the npm `next` dist-tag. Before publishing, verify package contents with:

```bash
npm run pack:dry-run -- --json
```

The dry-run package should include only the CLI, renderer source, component source, built component bundle, demo Markdown, README, LICENSE, and package metadata.

## CLI

```bash
isles render <file.md> [--out <file.html>] [--mode trusted|sanitized] [--assets cdn|local]
isles render <file.md> [--out <file.html>] [--safe|--sanitize] [--assets cdn|local]
isles watch <file.md> [--out <file.html>]
```

Planned explicit edit/writeback mode:

```bash
isles edit <file.md>
```

`isles edit` is not static rendering. It is planned as a localhost-only editing surface that can mutate the selected Markdown source file for supported interactions, starting with Markdown task-list checkboxes.

During local development, run the CLI directly:

```bash
node ./bin/isles.mjs render examples/demo.md --out dist/demo.html
```

Or use the package script:

```bash
npm run render -- --out dist/demo.html
```

Asset modes:

- `--assets cdn` is the default prototype-friendly mode. It references Bootstrap and the Highlight.js theme from public CDNs, while still copying the Agent Isles component bundle beside the output HTML.
- `--assets local` writes network-free HTML references and copies Bootstrap CSS, Bootstrap JS, Highlight.js CSS, and the Agent Isles component bundle into the output directory. Use this for offline review, durable artifacts, or environments where CDN access is unreliable.

Example local/offline render:

```bash
node ./bin/isles.mjs render examples/demo.md --out dist/demo.html --assets local
```

`isles watch` renders immediately and rebuilds when the Markdown source changes. It remains source-driven: browser interactions in the generated HTML do not write back to the Markdown file.

## Architecture

Layers:

1. **Source format** — Markdown with explicit HTML islands.
2. **Component vocabulary** — Bootstrap primitives plus Lit Web Components for agent-specific patterns.
3. **CLI renderer** — remark/rehype pipeline that injects assets and writes browser-ready HTML.
4. **Local edit/writeback mode** — planned explicit localhost mode for source-backed interactions, starting with Markdown task-list toggles.

Static rendering and source writeback are separate boundaries. `isles render` and `isles watch` should remain inert document-generation tools; `isles edit` should be the only mode that can patch the selected source file.

Implementation plans live on the dedicated `plans` branch so planning artifacts remain versioned without shipping on `main`:

- Plans branch: https://github.com/zpyoung/agent-isles/tree/plans
- Plans directory: https://github.com/zpyoung/agent-isles/tree/plans/docs/plans

The task-list writeback roadmap is tracked in #31 with ordered implementation issues.

Planning surfaces:

- Issues: https://github.com/zpyoung/agent-isles/issues
- Project board: https://github.com/users/zpyoung/projects/1
- GitHub Wiki: https://github.com/zpyoung/agent-isles/wiki
- Repo-tracked wiki mirror: `docs/wiki/`
- Plans branch: `plans`
- Maintainer playbook: `docs/MAINTAINER_PLAYBOOK.md`

## Component vocabulary

The durable component vocabulary reference lives at:

```txt
docs/component-vocabulary.md
```

Supported islands so far:

- `<agent-decision verdict="..." title="...">...</agent-decision>`
- `<agent-risk level="low|medium|high|critical" title="...">...</agent-risk>`
- `<agent-metric label="..." value="..." unit="..." tone="neutral|good|warning|danger">...</agent-metric>`
- `<agent-delta label="..." value="..." unit="..." percent="..." direction="lower-better|higher-better|neutral">...</agent-delta>`
- `<agent-kpi label="..." value="..." unit="..." delta="..." tone="primary|success|warning|danger|neutral">...</agent-kpi>`
- `<agent-copy-block lang="..." label="...">...</agent-copy-block>`
- `<agent-tabs>...</agent-tabs>` with `<agent-tab title="...">...</agent-tab>` panels
- `<agent-timeline label="...">...</agent-timeline>` with `<agent-step status="done|active|pending|failed" label="...">...</agent-step>` entries

Planned component directions include:

- `<agent-gantt>` for compact, data-driven schedule and roadmap visuals.

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

## Source writeback roadmap

Agent Isles currently treats Markdown as the source of truth and rendered HTML as output. Checking a box or changing UI state in a static render does **not** update the original Markdown file.

The planned writeback feature is deliberately explicit:

```bash
isles edit report.md
```

`isles edit` should start a localhost-only editing server, render the selected Markdown with writeback metadata, and accept authenticated local writeback requests for supported interactions. The first MVP is narrow by design: Markdown task-list checkboxes.

Example source:

```md
- [ ] Review launch gates
- [x] Add render smoke test
```

In edit mode, checking the first item should patch the source to:

```md
- [x] Review launch gates
- [x] Add render smoke test
```

Guardrails for this roadmap:

- static `isles render` and `isles watch` remain inert,
- writeback binds to localhost by default,
- a per-session token protects writeback requests,
- only the selected source file may be patched,
- stale source metadata returns a conflict instead of fuzzy-patching,
- richer component writeback is future work, not part of the task-list MVP.

The tracking issue is #31.

## Development

```bash
npm install
npm run build
npm test
npm run render -- --out dist/demo.html
```
