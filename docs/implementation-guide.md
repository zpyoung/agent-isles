# Agent Markdown + Bootstrap + Lit Web Components: A Complete Implementation Guide

## Overview

This guide covers a complete, production-ready system for AI agent output. The agent writes standard Markdown with embedded HTML islands. Those islands use either raw Bootstrap classes (for simple UI) or semantic `<agent-*>` custom elements (for complex, reusable patterns). A Node.js CLI tool renders the Markdown to HTML in the browser, injecting Bootstrap and the custom component library at render time.

The system has three layers:

1. **Source format** — Markdown with HTML islands (agent-written, git-stored)
2. **Component vocabulary** — Bootstrap 5 for primitives + Lit Web Components for agent-specific patterns
3. **CLI renderer** — `remark` + `rehype-raw` pipeline that injects the library and opens a browser

***

## Part 1: Project Structure

```
agent-mdview/
├── package.json
├── bin/
│   └── mdview.mjs          # CLI entry point
├── src/
│   ├── renderer.mjs        # remark/rehype pipeline
│   ├── components/
│   │   ├── agent-risk.js
│   │   ├── agent-decision.js
│   │   ├── agent-finding.js
│   │   ├── agent-metric.js
│   │   ├── agent-tabs.js
│   │   ├── agent-copy-block.js
│   │   ├── agent-timeline.js
│   │   └── index.js        # barrel export
│   └── theme/
│       ├── bootstrap.min.css  (local copy)
│       ├── highlight.min.css
│       └── agent-theme.css    # overrides + CSS custom properties
└── dist/
    └── agent-components.js    # bundled output (built from src/components/)
```

***

## Part 2: The CLI Renderer

### Installation

```bash
npm init -y
npm install unified remark-parse remark-gfm remark-rehype rehype-raw \
            rehype-highlight rehype-stringify chokidar open
```

### `bin/mdview.mjs`

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import open from 'open'
import chokidar from 'chokidar'

const [,, inputFile, ...flags] = process.argv
const watch = flags.includes('--watch') || flags.includes('-w')

if (!inputFile) {
  console.error('Usage: mdview <file.md> [--watch]')
  process.exit(1)
}

const filePath = resolve(inputFile)
const tmpFile = join(tmpdir(), `mdview-${Date.now()}.html`)

// Read bundled assets relative to this script
const __dir = new URL('.', import.meta.url).pathname
const componentScript = readFileSync(join(__dir, '../dist/agent-components.js'), 'utf8')
const agentTheme = readFileSync(join(__dir, '../src/theme/agent-theme.css'), 'utf8')

async function render() {
  const markdown = readFileSync(filePath, 'utf8')

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)

  const html = buildPage(String(result), componentScript, agentTheme)
  writeFileSync(tmpFile, html)
  return tmpFile
}

function buildPage(body, componentScript, agentTheme) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Output</title>
  <!-- Bootstrap 5 -->
  
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
    integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
    crossorigin="anonymous"
  />
  <!-- highlight.js theme -->
  
    href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" />
  <!-- Agent theme overrides -->
  <style>${agentTheme}</style>
</head>
<body class="container py-4" style="max-width:900px">
  ${body}
  <!-- Bootstrap JS bundle -->
  <script
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
    integrity="sha384-YvpcrYf0tY3lHB60NNkmXc4s9bIOgUxi8T/jzmG7h7rQKNb0hM5z2N+L6f9JIB"
    crossorigin="anonymous">
  </script>
  <!-- Agent Web Components -->
  <script type="module">${componentScript}</script>
</body>
</html>`
}

render().then(async (outFile) => {
  await open(outFile)
  console.log(`Rendered: ${outFile}`)

  if (watch) {
    console.log(`Watching ${filePath} for changes...`)
    chokidar.watch(filePath).on('change', async () => {
      await render()
      console.log('Rebuilt.')
    })
  }
})
```

### `package.json` bin entry

```json
{
  "bin": { "mdview": "./bin/mdview.mjs" },
  "type": "module"
}
```

```bash
npm link    # makes `mdview` available globally
mdview agent_output.md
mdview agent_output.md --watch
```

> **Offline note:** For fully offline rendering, download Bootstrap and highlight.js CSS/JS to `src/theme/` and embed them as inline strings the same way `agent-components.js` is embedded. This eliminates CDN dependency entirely.

***

## Part 3: The Component Library (Lit)

Lit is a lightweight library for building fast, framework-agnostic Web Components with reactive state and scoped styles. Each component registers as a standard Custom Element — a native browser API — which means the HTML tags like `<agent-risk>` work in any browser without a framework runtime.[^1][^2][^3]

### Installation

```bash
npm install lit
npm install -D rollup @rollup/plugin-node-resolve rollup-plugin-terser
```

### Build script (`rollup.config.js`)

```js
import resolve from '@rollup/plugin-node-resolve'
import { terser } from 'rollup-plugin-terser'

export default {
  input: 'src/components/index.js',
  output: { file: 'dist/agent-components.js', format: 'esm' },
  plugins: [resolve(), terser()]
}
```

```bash
npx rollup -c   # outputs dist/agent-components.js
```

***

## Part 4: Component Implementations

### `src/components/agent-risk.js`

Displays a risk item with severity level, title, and description. Levels: `low`, `medium`, `high`, `critical`.

```js
import { LitElement, html, css } from 'lit'

const LEVEL_MAP = {
  low:      { bg: '#d1fae5', border: '#6ee7b7', color: '#065f46', icon: '✅', label: 'Low' },
  medium:   { bg: '#fef9c3', border: '#fde047', color: '#854d0e', icon: '⚠️', label: 'Medium' },
  high:     { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', icon: '🔴', label: 'High' },
  critical: { bg: '#fce7f3', border: '#f9a8d4', color: '#9d174d', icon: '🚨', label: 'Critical' },
}

class AgentRisk extends LitElement {
  static properties = { level: {}, title: {} }

  static styles = css`
    :host { display: block; margin: 1rem 0; }
    .risk-card {
      border-radius: 8px;
      border-left: 4px solid var(--border);
      background: var(--bg);
      padding: 12px 16px;
    }
    .header { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--color); }
    .body { margin-top: 6px; font-size: 0.9rem; color: #374151; }
  `

  render() {
    const l = LEVEL_MAP[this.level] ?? LEVEL_MAP.medium
    return html`
      <style>
        .risk-card { --bg: ${l.bg}; --border: ${l.border}; --color: ${l.color}; }
      </style>
      <div class="risk-card">
        <div class="header">${l.icon} ${l.label} Risk — ${this.title}</div>
        <div class="body"><slot></slot></div>
      </div>`
  }
}
customElements.define('agent-risk', AgentRisk)
```

**Usage in Markdown:**
```html
<agent-risk level="high" title="Migration lock">
  The backfill query may lock writes during peak traffic.
</agent-risk>
```

***

### `src/components/agent-decision.js`

Displays an architectural or planning decision with a verdict badge.

```js
import { LitElement, html, css } from 'lit'

const VERDICTS = {
  'approved':            { label: 'Approved',           cls: 'bg-success' },
  'rejected':            { label: 'Rejected',           cls: 'bg-danger' },
  'ship-with-guardrails':{ label: 'Ship with Guardrails', cls: 'bg-warning text-dark' },
  'needs-review':        { label: 'Needs Review',       cls: 'bg-secondary' },
  'deferred':            { label: 'Deferred',           cls: 'bg-light text-dark border' },
}

class AgentDecision extends LitElement {
  static properties = { verdict: {}, title: {} }
  static styles = css`
    :host { display: block; margin: 1rem 0; }
    .box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      background: #f8fafc;
    }
    .header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .label { font-weight: 600; font-size: 0.85rem; }
    .body { font-size: 0.9rem; color: #374151; }
  `

  render() {
    const v = VERDICTS[this.verdict] ?? VERDICTS['needs-review']
    return html`
      <div class="box">
        <div class="header">
          <span class="badge ${v.cls} label">${v.label}</span>
          ${this.title ? html`<strong>${this.title}</strong>` : ''}
        </div>
        <div class="body"><slot></slot></div>
      </div>`
  }
}
customElements.define('agent-decision', AgentDecision)
```

***

### `src/components/agent-finding.js`

Code review finding with severity, file path, and line number.

```js
import { LitElement, html, css } from 'lit'

const SEV = {
  high:   { cls: 'badge bg-danger',   dot: '🔴' },
  medium: { cls: 'badge bg-warning text-dark', dot: '🟡' },
  low:    { cls: 'badge bg-secondary', dot: '🔵' },
  info:   { cls: 'badge bg-info text-dark', dot: 'ℹ️' },
}

class AgentFinding extends LitElement {
  static properties = { severity: {}, file: {}, line: {} }
  static styles = css`
    :host { display: block; margin: 0.75rem 0; }
    .finding {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #f9fafb;
      font-size: 0.8rem;
      border-bottom: 1px solid #e5e7eb;
      flex-wrap: wrap;
    }
    .filepath { font-family: monospace; color: #4b5563; }
    .body { padding: 10px 12px; font-size: 0.9rem; color: #111827; }
  `

  render() {
    const s = SEV[this.severity] ?? SEV.info
    return html`
      <div class="finding">
        <div class="meta">
          <span class="${s.cls}">${this.severity ?? 'info'}</span>
          ${this.file ? html`<span class="filepath">${this.file}${this.line ? `:${this.line}` : ''}</span>` : ''}
        </div>
        <div class="body"><slot></slot></div>
      </div>`
  }
}
customElements.define('agent-finding', AgentFinding)
```

***

### `src/components/agent-metric.js`

A KPI/metric card with label, value, and optional trend indicator.

```js
import { LitElement, html, css } from 'lit'

class AgentMetric extends LitElement {
  static properties = { label: {}, value: {}, trend: {}, unit: {} }
  static styles = css`
    :host { display: inline-block; margin: 0.5rem; }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 20px;
      text-align: center;
      min-width: 120px;
      background: white;
    }
    .value { font-size: 2rem; font-weight: 700; color: #111827; line-height: 1; }
    .label { font-size: 0.75rem; color: #6b7280; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .trend-up   { color: #16a34a; font-size: 0.8rem; }
    .trend-down { color: #dc2626; font-size: 0.8rem; }
    .trend-flat { color: #6b7280; font-size: 0.8rem; }
  `

  render() {
    const trendIcon = this.trend === 'up' ? '▲' : this.trend === 'down' ? '▼' : this.trend === 'flat' ? '→' : ''
    const trendCls  = this.trend === 'up' ? 'trend-up' : this.trend === 'down' ? 'trend-down' : 'trend-flat'
    return html`
      <div class="card">
        <div class="value">${this.value}${this.unit ?? ''}</div>
        ${trendIcon ? html`<div class="${trendCls}">${trendIcon}</div>` : ''}
        <div class="label">${this.label}</div>
      </div>`
  }
}
customElements.define('agent-metric', AgentMetric)
```

***

### `src/components/agent-tabs.js`

Tab container backed by Bootstrap's tab component classes. The `<agent-tabs>` element collects `<agent-tab>` children and renders Bootstrap nav-tabs with correct ARIA markup — saving the agent from writing ~20 lines of nested Bootstrap boilerplate.[^4]

```js
import { LitElement, html, css } from 'lit'

class AgentTab extends LitElement {
  static properties = { title: {}, active: { type: Boolean } }
  render() { return html`<slot></slot>` }
}
customElements.define('agent-tab', AgentTab)

class AgentTabs extends LitElement {
  static styles = css`:host { display: block; margin: 1rem 0; }`

  // Use Light DOM so Bootstrap JS can find elements
  createRenderRoot() { return this }

  firstUpdated() {
    const tabs = [...this.querySelectorAll('agent-tab')]
    const id = `tabs-${Math.random().toString(36).slice(2, 7)}`

    const navItems = tabs.map((tab, i) => {
      const tabId = `${id}-tab-${i}`
      const panelId = `${id}-panel-${i}`
      const active = i === 0
      tab.setAttribute('role', 'tabpanel')
      tab.id = panelId
      if (!active) tab.style.display = 'none'
      return `
        >
          <button class="nav-link${active ? ' active' : ''}"
            id="${tabId}" data-bs-toggle="tab"
            data-bs-target="#${panelId}" type="button"
            role="tab" aria-controls="${panelId}" aria-selected="${active}">
            ${tab.getAttribute('title')}
          </button>
        </li>`
    }).join('')

    const nav = document.createElement('ul')
    nav.className = 'nav nav-tabs mb-3'
    nav.setAttribute('role', 'tablist')
    nav.innerHTML = navItems
    this.insertBefore(nav, this.firstChild)

    // Bootstrap needs tab panels inside a .tab-content wrapper
    const content = document.createElement('div')
    content.className = 'tab-content'
    tabs.forEach((tab, i) => {
      const panelId = `${id}-panel-${i}`
      tab.classList.add('tab-pane', i === 0 ? 'active' : '')
      tab.style.display = ''
      content.appendChild(tab)
    })
    this.appendChild(content)
  }
}
customElements.define('agent-tabs', AgentTabs)
```

***

### `src/components/agent-copy-block.js`

Code block with a language label and copy-to-clipboard button. Wraps highlight.js output from the remark pipeline.

```js
import { LitElement, html, css } from 'lit'

class AgentCopyBlock extends LitElement {
  static properties = { lang: {}, label: {} }
  static styles = css`
    :host { display: block; margin: 1rem 0; }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      background: #1e1e1e; color: #9ca3af; padding: 6px 14px;
      border-radius: 6px 6px 0 0; font-size: 0.75rem; font-family: monospace;
    }
    .copy-btn {
      background: transparent; border: 1px solid #4b5563; color: #9ca3af;
      border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.75rem;
    }
    .copy-btn:hover { background: #374151; color: white; }
    ::slotted(pre) { margin: 0 !important; border-radius: 0 0 6px 6px !important; }
  `

  copy() {
    const code = this.querySelector('code')
    if (code) navigator.clipboard.writeText(code.innerText)
    const btn = this.shadowRoot.querySelector('.copy-btn')
    btn.textContent = 'Copied!'
    setTimeout(() => btn.textContent = 'Copy', 2000)
  }

  render() {
    return html`
      <div class="header">
        <span>${this.label ?? this.lang ?? 'code'}</span>
        <button class="copy-btn" @click=${this.copy}>Copy</button>
      </div>
      <slot></slot>`
  }
}
customElements.define('agent-copy-block', AgentCopyBlock)
```

***

### `src/components/agent-timeline.js`

Step-by-step timeline for plans and runbooks.

```js
import { LitElement, html, css } from 'lit'

class AgentStep extends LitElement {
  static properties = { status: {}, label: {} }
  static styles = css`
    :host { display: flex; gap: 12px; margin: 0.5rem 0; }
    .dot {
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.75rem; font-weight: 700; margin-top: 2px;
    }
    .done    { background: #d1fae5; color: #065f46; }
    .active  { background: #dbeafe; color: #1e40af; }
    .pending { background: #f3f4f6; color: #9ca3af; border: 1px solid #e5e7eb; }
    .failed  { background: #fee2e2; color: #991b1b; }
    .content { flex: 1; }
    .label   { font-weight: 600; font-size: 0.9rem; }
    .body    { font-size: 0.85rem; color: #4b5563; }
  `

  render() {
    const icons = { done: '✓', active: '●', pending: '○', failed: '✗' }
    const cls = this.status ?? 'pending'
    return html`
      <div class="dot ${cls}">${icons[cls] ?? '○'}</div>
      <div class="content">
        <div class="label">${this.label}</div>
        <div class="body"><slot></slot></div>
      </div>`
  }
}
customElements.define('agent-step', AgentStep)

class AgentTimeline extends LitElement {
  static styles = css`
    :host { display: block; margin: 1rem 0; border-left: 2px solid #e5e7eb; padding-left: 8px; }
  `
  render() { return html`<slot></slot>` }
}
customElements.define('agent-timeline', AgentTimeline)
```

***

### `src/components/index.js`

```js
export * from './agent-risk.js'
export * from './agent-decision.js'
export * from './agent-finding.js'
export * from './agent-metric.js'
export * from './agent-tabs.js'
export * from './agent-copy-block.js'
export * from './agent-timeline.js'
```

***

## Part 5: The Agent Theme (`src/theme/agent-theme.css`)

Overrides that harmonize Bootstrap's defaults with the agent output aesthetic.

```css
/* Tighten up Bootstrap's default prose spacing for dense output */
body { font-size: 0.95rem; color: #1a1a2e; }
h1, h2, h3 { margin-top: 1.75rem; margin-bottom: 0.75rem; }
h1 { font-size: 1.6rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4rem; }
h2 { font-size: 1.25rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.25rem; }

/* Code block integration with highlight.js */
pre { border-radius: 6px; padding: 1rem; font-size: 0.85rem; }
code { font-size: 0.85em; }
p code, li code {
  background: #f1f5f9; color: #0f172a; padding: 2px 6px;
  border-radius: 4px; font-size: 0.82em;
}

/* Tables */
table { font-size: 0.875rem; }
thead th { background: #f8fafc; font-weight: 600; }
```

***

## Part 6: Writing Markdown with Islands

### Component vocabulary reference

| Component | Attributes | Bootstrap alternative for simple cases |
|---|---|---|
| `<agent-risk>` | `level`, `title` | `<div class="alert alert-danger">` |
| `<agent-decision>` | `verdict`, `title` | `<div class="alert alert-success">` |
| `<agent-finding>` | `severity`, `file`, `line` | `<div class="alert alert-warning">` |
| `<agent-metric>` | `label`, `value`, `trend`, `unit` | `<span class="badge bg-primary fs-5">` |
| `<agent-tabs>` | — | Raw Bootstrap nav-tabs (verbose) |
| `<agent-tab>` | `title` | — |
| `<agent-copy-block>` | `lang`, `label` | `<pre>de>` (no copy button) |
| `<agent-timeline>` | — | `<ol>` |
| `<agent-step>` | `status`, `label` | `>` |

Bootstrap classes to use directly for simple needs:[^5][^4]

- `<span class="badge bg-success">Passing</span>` — status tags inline
- `<div class="alert alert-info">` — simple notifications
- `<table class="table table-striped table-sm">` — data tables
- `<div class="card"><div class="card-body">` — content containers
- `<div class="progress">` — progress bars
- `<ul class="list-group">` — structured item lists

### Full example output document

```markdown
# Migration Plan: users_v2 Schema

This plan covers the zero-downtime migration from `users` to `users_v2`.
All changes are backwards-compatible until cutover.

## Risk Assessment

<agent-risk level="high" title="Write lock during backfill">
  The backfill SELECT+INSERT over 40M rows may lock the table.
  Mitigation: batch in 500-row chunks with a 10ms sleep between batches.
</agent-risk>

<agent-risk level="low" title="Schema compatibility">
  All existing columns are preserved. New columns are nullable.
</agent-risk>

## Metrics

<agent-metric label="Rows to migrate" value="40M"></agent-metric>
<agent-metric label="Est. duration" value="~4h" trend="flat"></agent-metric>
<agent-metric label="Rollback window" value="48h" trend="up"></agent-metric>

## Plan

<agent-tabs>
  <agent-tab title="Phase 1 — Schema">

Add nullable columns to the existing table:

<agent-copy-block lang="sql" label="migration_v2.sql">

```sql
ALTER TABLE users
  ADD COLUMN display_name TEXT,
  ADD COLUMN preferences  JSONB;
```

</agent-copy-block>

  </agent-tab>
  <agent-tab title="Phase 2 — Backfill">

<agent-timeline>
  <agent-step status="done" label="Create migration script">
    Script written and reviewed in PR #441.
  </agent-step>
  <agent-step status="active" label="Run dry-run on staging">
    Executing against staging DB now. ETA 25 min.
  </agent-step>
  <agent-step status="pending" label="Production run">
    Scheduled for Saturday 02:00 UTC.
  </agent-step>
</agent-timeline>

  </agent-tab>
  <agent-tab title="Phase 3 — Cutover">

| Step | Owner | Status |
|------|-------|--------|
| Update ORM models | @dev | <span class="badge bg-success">Done</span> |
| Deploy new app version | @ops | <span class="badge bg-warning text-dark">Pending</span> |
| Enable column in API | @dev | <span class="badge bg-secondary">Not started</span> |

  </agent-tab>
</agent-tabs>

## Decision

<agent-decision verdict="ship-with-guardrails" title="Proceed with migration">
  Proceed on Saturday with the batched backfill script.
  Rollback plan is the existing view aliasing `users_v2` back to `users`.
  Alert threshold set at p95 write latency > 200ms.
</agent-decision>
```

***

## Part 7: CLAUDE.md / AGENTS.md Rule Set

Add this to your agent's instruction file to govern output format consistently:

```markdown
## Output Format — Markdown with HTML Islands

When producing output intended for human review (plans, reviews, research,
reports, decision logs), follow these rules:

### Use standard Markdown for:
- All prose, headings, and paragraphs
- Code blocks (fenced with language tag)
- Bullet/numbered lists
- Inline emphasis and links

### Use Bootstrap classes directly for simple one-off elements:
- Status badges: `<span class="badge bg-danger">High</span>`
- Simple alerts: `<div class="alert alert-warning">`
- Data tables: `<table class="table table-striped table-sm">`
- Progress bars: `<div class="progress"><div class="progress-bar" style="width:72%">`

### Use agent components for structured, recurring patterns:
- `<agent-risk level="high|medium|low|critical" title="...">` — risk items
- `<agent-decision verdict="approved|rejected|ship-with-guardrails|needs-review|deferred" title="...">` — decisions
- `<agent-finding severity="high|medium|low|info" file="..." line="...">` — code review findings
- `<agent-metric label="..." value="..." trend="up|down|flat" unit="...">` — KPI cards
- `<agent-tabs>` / `<agent-tab title="...">` — tabbed sections
- `<agent-copy-block lang="..." label="...">` — code blocks with copy button
- `<agent-timeline>` / `<agent-step status="done|active|pending|failed" label="...">` — step lists

### Rules for HTML islands:
- No external CSS links or CDN imports — the renderer injects all dependencies
- No inline `<style>` blocks — use Bootstrap classes or agent component attributes
- All islands must render correctly when the file is opened in a browser
- The Markdown prose must be coherent if HTML islands are skipped
```

***

## Part 8: Development Workflow

### First-time setup

```bash
git clone <your-repo> agent-mdview
cd agent-mdview
npm install
npx rollup -c          # build dist/agent-components.js
npm link               # register `mdview` globally
```

### Daily use

```bash
# Render once
mdview ~/projects/flexbar/agent_output.md

# Watch mode (rebuilds on every save)
mdview ~/projects/flexbar/agent_output.md --watch
```

### Adding a new component

1. Create `src/components/agent-newname.js` following the Lit pattern above
2. Export from `src/components/index.js`
3. Run `npx rollup -c` to rebuild `dist/agent-components.js`
4. Add the component to the CLAUDE.md vocabulary table

### Offline rendering

Replace CDN links in `buildPage()` with base64-encoded or inline string assets:

```js
const bootstrapCss = readFileSync(join(__dir, '../src/theme/bootstrap.min.css'), 'utf8')
// Then in buildPage():
// <style>${bootstrapCss}</style>
// instead of the CDN >
```

This makes every generated HTML file fully self-contained and portable — shareable by copying a single file, opening via `file://`, or attaching to Slack/email.

---

## References

1. [Using custom elements - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) - A custom element is implemented as a class which extends HTMLElement (in the case of autonomous elem...

2. [lit/lit: Lit is a simple library for building fast, lightweight web ...](https://github.com/lit/lit) - Lit is a simple library for building fast, lightweight web components. At Lit's core is a boilerplat...

3. [Custom Elements v1 - Reusable Web Components | Articles](https://web.dev/articles/custom-elements-v1) - Custom elements allow web developers to define new HTML tags, extend existing ones, and create reusa...

4. [Bootstrap · The most popular HTML, CSS, and JS library in the ...](https://getbootstrap.com) - Jump right into building with Bootstrap—use the CDN, install it via package manager, or download the...

5. [Components · Bootstrap v5.0](https://getbootstrap.com/docs/5.0/customize/components/) - Bootstrap's components are largely built with a base-modifier nomenclature. We group as many shared ...

