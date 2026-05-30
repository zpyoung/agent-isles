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
- `<agent-risk>` elements for caveats and mitigations,
- `<agent-gantt>` schedules for phase lanes, milestone weeks, overlapping work, and task details,
- `<agent-status-board>` boards for derived RAG/health rollups across workstreams.

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

Release-readiness smoke before any approved publish:

```bash
npm test
npm run render -- --out dist/demo.html --assets local
npm pack
mkdir -p /tmp/agent-isles-package-smoke
cd /tmp/agent-isles-package-smoke
npm init -y
npm install /path/to/agent-isles-0.1.0-alpha.N.tgz
cat > report.md <<'MD'
# Package smoke

<agent-decision verdict="go" title="Install smoke">
The packed Agent Isles CLI rendered this file outside the repository.
</agent-decision>
MD
./node_modules/.bin/isles --help
./node_modules/.bin/isles render ./report.md --out ./report.html --assets local --no-user-packs
```

Only after those checks pass and the maintainer explicitly approves publication should the release command be run:

```bash
npm publish --tag next
```

## Claude Code plugin marketplace

Agent Isles also ships a Claude Code plugin from this repository. The plugin version intentionally tracks the npm package version so one marketplace install gives Claude the matching install/update, render, and component-authoring guidance.

Install from the in-repo marketplace:

```text
/plugin marketplace add zpyoung/agent-isles
/plugin install agent-isles@agent-isles
/reload-plugins
```

The plugin includes:

- `agent-isles-install-update` — detects npm, pnpm, or yarn and installs/updates `agent-isles@next` as a project dev dependency.
- `agent-isles-render` — renders or watches Markdown and verifies the generated HTML artifact.
- `agent-isles-component-authoring` — guides supported `<agent-*>` island usage and trusted/sanitized rendering boundaries.
- `agent-isles-component-pack-authoring` — guides trusted local Component Packs V1 creation, including `agent-isles.pack.json`, custom-element assets, diagnostics, and render smoke verification.
- `plugins/agent-isles/bin/isles-doctor.mjs` — deterministic package-manager detection, smoke-check command generation, and an explicit `commands.oneShotRender` npx fallback for one-off renders without dependency changes.

The plugin does not auto-install on session start, publish releases, or mutate projects without an explicit install/update request. If Agent Isles is not installed or the user only wants a one-off render, the plugin can use the doctor-provided `npx agent-isles@next render ...` command instead.

## CLI

```bash
isles render <file.md> [--out <file.html>] [--mode trusted|sanitized] [--assets cdn|local] [--pack <path>]... [--no-user-packs]
isles render <file.md> [--out <file.html>] [--safe|--sanitize] [--assets cdn|local] [--pack <path>]... [--no-user-packs]
isles packs resolve <file.md> [--pack <path>]... [--no-user-packs]
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
- `--assets inline` embeds all JavaScript and CSS directly into the HTML file, producing a single self-contained artifact with no external dependencies. Use this for portable single-file documents, ephemeral previews, or when you need a single artifact that can be opened anywhere without managing companion asset files.

Example local/offline render:

```bash
node ./bin/isles.mjs render examples/demo.md --out dist/demo.html --assets local
```

Example single-file inline render:

```bash
node ./bin/isles.mjs render examples/demo.md --out dist/demo.html --assets inline
```

**Note on inline mode**: The generated HTML file will be larger (typically 400-500KB for a basic document) because it contains the full Bootstrap CSS/JS, Highlight.js theme, and Agent Isles component runtime. However, it requires no external files and can be opened directly in any browser without network access or an asset directory. Inline scripts may require Content Security Policy adjustments if you're serving the HTML from a web server with strict CSP headers.

**Known limitation**: Inline mode embeds each declared pack asset's file contents verbatim; it does not bundle or rewrite references *inside* those files. A pack module that uses relative `import './helper.js'`, dynamic `import()`, `import.meta.url`, or a stylesheet with `@import`/`url(...)` will resolve those references against the output HTML's location rather than the pack directory, so packs that rely on transitive local references are better served by `--assets local`. Self-contained packs whose declared assets have no further local dependencies inline cleanly.

**Security boundary**: Inline mode only inlines trusted, locally resolvable assets — the built-in runtime and component-pack `style`/`module` files declared in a pack manifest that point at files inside the pack directory. It never fetches remote pack assets and never executes arbitrary user-authored JavaScript beyond the existing trusted/raw-HTML model: producing a single portable file does **not** make untrusted Markdown safe to render in `trusted` mode, and the raw-HTML and component-pack boundaries remain security-sensitive regardless of asset mode. If a declared pack asset cannot be resolved locally, inline rendering **fails fast** with an error naming the pack and asset path rather than silently emitting incomplete HTML — fix the asset or fall back to `--assets local`/`--assets cdn`.

`isles watch` renders immediately and rebuilds when the Markdown source changes, and accepts the same `--mode`, `--assets` (including `inline`), `--show-source`, and `--pack` options as `isles render`, so watch rebuilds can also produce single-file inline output. It remains source-driven: browser interactions in the generated HTML do not write back to the Markdown file.

## Component Packs V1

Component Packs V1 supports trusted local packs from explicit CLI paths, project config, and user config. The full V1 reference is in `docs/component-packs.md`.

Resolution order is deterministic:

1. repeated `--pack <path>` flags,
2. `isles.config.json` beside the Markdown input,
3. user config at `${XDG_CONFIG_HOME:-~/.config}/agent-isles/isles.config.json` on Linux/Unix, `~/Library/Application Support/agent-isles/isles.config.json` on macOS, or `%LOCALAPPDATA%\agent-isles\isles.config.json` on Windows.

Use `--no-user-packs` for reproducible renders that should not depend on a developer machine. Use diagnostics before rendering when the pack set matters:

```bash
isles packs resolve examples/pack-demo.md --pack examples/packs/demo-widget-pack --no-user-packs
```

A local pack directory contains `agent-isles.pack.json` with `agentIslesPackVersion`, `name`, optional `version`/metadata, declared custom-element `tags`, sanitized-mode `attributes`, and `module`/`style` assets. V1 is local-only: npm/git source resolution, full strict validation, and authoring tools are V1+ follow-ups tracked from https://github.com/zpyoung/agent-isles/discussions/64.

Packs are trusted code. Sanitized Markdown mode can preserve declared custom-element tags and safe manifest-declared attributes, but pack module/style assets are still injected into the generated HTML. Only load reviewed local/project/user packs.

The repo includes a tiny fixture pack for tests and examples:

```bash
isles render examples/pack-demo.md \
  --pack examples/packs/demo-widget-pack \
  --out dist/pack-demo.html \
  --mode sanitized
```

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
- `<agent-dependency-map label="..." direction="vertical">` with `<agent-dependency id="..." label="..." status="..." blocked-by="...">...</agent-dependency>`
- `<agent-gantt weeks="..." milestones="..." label="...">...</agent-gantt>` with `<agent-gantt-phase label="...">` lanes and `<agent-gantt-task label="..." start="..." end="..." tone="..." detail="..." parallel>` bars
- `<agent-status-board label="..." summary="bar" group-by="status">...</agent-status-board>` with `<agent-status-item label="..." status="green|amber|red|grey" owner="..." updated="..." history="g,g,a,a">` rows
- `<agent-metric label="..." value="..." unit="..." tone="neutral|good|warning|danger">...</agent-metric>`
- `<agent-delta label="..." value="..." unit="..." percent="..." direction="lower-better|higher-better|neutral">...</agent-delta>`
- `<agent-kpi label="..." value="..." unit="..." delta="..." tone="primary|success|warning|danger|neutral">...</agent-kpi>`
- `<agent-copy-block lang="..." label="...">...</agent-copy-block>`
- `<agent-tabs>...</agent-tabs>` with `<agent-tab title="...">...</agent-tab>` panels
- `<agent-timeline label="...">...</agent-timeline>` with `<agent-step status="done|active|pending|failed" label="...">...</agent-step>` entries

### D2 diagram support

Agent Isles includes bundled D2 support for diagram-as-code. D2 fences render diagrams without requiring external tooling:

````md
```d2
user -> server: request
server -> database: query
database -> server: result
server -> user: response
```
````

D2 diagrams are rendered at build time to SVG and embedded in the generated HTML. The D2 library (`@terrastruct/d2`) is bundled with Agent Isles under the MPL-2.0 license.

**Features:**
- Build-time SVG generation for deterministic output
- No client-side rendering or external D2 binary required
- Works in both trusted and sanitized render modes
- SVG output is fully accessible and inspectable

**Error handling:**
- Invalid D2 syntax produces clear error messages with source position
- Errors include specific details about what's wrong with the diagram

Planned component directions include:

- `<agent-finding>` for structured findings with severity, source location, and remediation context.

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

`isles edit` should start a localhost-only editing server, render the selected Markdown with writeback metadata, and accept authenticated local writeback requests for supported interactions. The shared contract is documented in [`docs/writeback-contract.md`](docs/writeback-contract.md). The first MVP is narrow by design: Markdown task-list checkboxes.

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

Component authors should treat `data-agent-isles-writeback-op` and `data-agent-isles-writeback` as reserved contract attributes. A component opts in only when an edit/preview server renders with `writeback.enabled`; static renders strip the reserved opt-in metadata and expose no endpoint.

The tracking issue is #31.

## Development

```bash
npm install
npm run build
npm test
npm run render -- --out dist/demo.html
```
