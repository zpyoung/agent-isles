# Agent Isles Component Gallery

<p class="lead">A complete reference gallery where every supported Agent Isles component and core renderer feature is shown as an atomic rendered/source pair.</p>

> Each example below is authored once inside an `agent-isles-example` comment block. The renderer uses that exact snippet for the live pane and escapes the same snippet for the source pane, so the two columns cannot drift.

## Component Reference

### Decisions

Use `<agent-decision>` for architectural, product, or operational decisions where the verdict should be visually scannable.

<!-- agent-isles-example id="decision-island" title="Decision island" -->
<agent-decision verdict="ship-with-guardrails" title="Use Markdown islands for reports">
Ship the report format as Markdown plus explicit HTML islands. Keep prose portable, use Bootstrap for layout, reserve components for repeated patterns.
</agent-decision>
<!-- /agent-isles-example -->

Supported verdicts: `go`, `approved`, `rejected`, `deferred`, `needs-review`, `ship-with-guardrails`.

### Risks

Use `<agent-risk>` for blockers, hazards, or concerns that need severity and mitigation context.

<!-- agent-isles-example id="risk-island" title="Risk island" -->
<agent-risk level="medium" title="Raw HTML is a trust boundary">
Current renderer mode is for trusted Markdown. Use safe mode before accepting untrusted input.
</agent-risk>
<!-- /agent-isles-example -->

Supported levels: `low`, `medium`, `high`, `critical`.

### Metrics and deltas

Use `<agent-metric>` and `<agent-delta>` for compact measurements and signed comparisons.

<!-- agent-isles-example id="metric-delta-composition" title="Metric and delta composition" -->
<div class="card shadow-sm">
  <div class="card-body">
    <h5 class="card-title">Timeline comparison</h5>
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <agent-metric label="Original — no AI, new design" value="38" unit="wks" tone="neutral"></agent-metric>
      </div>
      <div class="col-md-6">
        <agent-metric label="Revised — AI + 1:1 parity + existing assets" value="28" unit="wks" tone="good"></agent-metric>
      </div>
    </div>
    <agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better">
26% faster · ~10 weeks saved
    </agent-delta>
  </div>
</div>
<!-- /agent-isles-example -->

Metric tones: `neutral`, `good`, `warning`, `danger`. Delta directions: `lower-better`, `higher-better`, `neutral`.

### KPI groups

Use `<agent-kpi>` for milestone summaries, executive dashboards, and before/after status bands.

<!-- agent-isles-example id="kpi-group" title="KPI group" -->
<div class="row g-3" role="list" aria-label="Migration milestones">
  <div class="col-md-4" role="listitem">
    <agent-kpi label="Phase 1 dev complete" value="~12" unit="wks" delta="was ~26 wks" tone="success">
From kick-off
    </agent-kpi>
  </div>
  <div class="col-md-4" role="listitem">
    <agent-kpi label="Live Ireland" value="~15" unit="wks" delta="was ~28 wks" tone="warning">
Soft launch
    </agent-kpi>
  </div>
  <div class="col-md-4" role="listitem">
    <agent-kpi label="Phase 2 complete" value="~28" unit="wks" delta="was ~38 wks" tone="primary">
Full delivery
    </agent-kpi>
  </div>
</div>
<!-- /agent-isles-example -->

KPI tones: `primary`, `success`, `warning`, `danger`, `neutral`.

### Copy blocks

Use `<agent-copy-block>` for command snippets, config fragments, and code users are likely to copy.

<!-- agent-isles-example id="copy-block" title="Copy block" -->
<agent-copy-block lang="bash" label="Render the demo">
npm run render -- --out dist/demo.html
</agent-copy-block>
<!-- /agent-isles-example -->

### Dependency map

Use `<agent-dependency-map>` and `<agent-dependency>` to show what blocks what in project plans.

<!-- agent-isles-example id="dependency-map" title="Dependency map" -->
<agent-dependency-map label="Writeback dependency chain" direction="vertical" legend="show">
  <agent-dependency id="edit-server" label="Edit server" status="ready" owner="Merlin" priority="P0">
Starts the localhost edit workflow.
  </agent-dependency>
  <agent-dependency id="source-metadata" label="Source metadata" status="blocked" blocked-by="edit-server" owner="Merlin" priority="P0">
Requires the edit server entrypoint first.
  </agent-dependency>
  <agent-dependency id="patch-api" label="Patch API" status="blocked" blocked-by="source-metadata" owner="Merlin" priority="P1">
Applies safe task-list source patches.
  </agent-dependency>
  <agent-dependency id="browser-client" label="Browser client" status="blocked" blocked-by="patch-api" owner="Merlin" priority="P1">
Enables checkbox writeback from rendered output.
  </agent-dependency>
  <agent-dependency id="docs" label="Docs and prompts" status="active" blocked-by="patch-api" owner="Nia" priority="P2">
Document the safe authoring + edit boundaries and ship example prompts.
  </agent-dependency>
  <agent-dependency id="writeback-release" label="Writeback release" status="risk" blocked-by="browser-client, docs" owner="Ariel" priority="P0">
Launch when the client and docs converge; treat cross-surface integration as a risk gate.
  </agent-dependency>
</agent-dependency-map>
<!-- /agent-isles-example -->

Dependency statuses: `ready`, `active`, `blocked`, `done`, `risk`.

### Tabs

Use `<agent-tabs>` and `<agent-tab>` for alternate views, platform-specific instructions, or evidence groups.

<!-- agent-isles-example id="tabs" title="Tabs" -->
<agent-tabs>
  <agent-tab title="Phase 1 — Discover" active>
    <p>Map current Markdown patterns and identify reusable component seams.</p>
  </agent-tab>
  <agent-tab title="Phase 2 — Build">
    <p>Implement renderer features, hydrate components, and keep examples inspectable.</p>
  </agent-tab>
  <agent-tab title="Phase 3 — Ship">
    <p>Run browser smoke, publish docs, and keep deployment settings separate.</p>
  </agent-tab>
</agent-tabs>
<!-- /agent-isles-example -->

### Timelines

Use `<agent-timeline>` and `<agent-step>` for chronological steps, incident logs, release phases, or execution traces.

<!-- agent-isles-example id="timeline" title="Timeline" -->
<agent-timeline label="Discovery progress">
  <agent-step status="done" label="Renderer baseline">
Markdown, raw HTML islands, theme injection, and browser smoke are in place.
  </agent-step>
  <agent-step status="active" label="Component expansion">
Status, dependency, action, and schedule islands are being rounded out.
  </agent-step>
  <agent-step status="pending" label="Browser polish">
Responsive gallery and visual smoke coverage remain the final pass.
  </agent-step>
</agent-timeline>
<!-- /agent-isles-example -->

Step statuses: `done`, `active`, `pending`, `blocked`, `risk`.

### Gantt charts

Use `<agent-gantt>`, `<agent-gantt-phase>`, and `<agent-gantt-task>` for phase lanes, week axes, milestone markers, overlapping work, and task detail.

<!-- agent-isles-example id="gantt" title="Gantt chart" -->
<agent-gantt weeks="28" milestones="12,15,28" label="Migration schedule">
  <agent-gantt-phase label="Core build">
    <agent-gantt-task label="Components + Storybook" start="3" end="5" tone="components" detail="2 wks — was 8 wks; 1:1 parity removes design review loop">
Component parity keeps the source Markdown simple while the rendered chart shows schedule compression.
    </agent-gantt-task>
    <agent-gantt-task label="Testing — parallel" start="3" end="12" tone="testing" detail="Runs continuously beside component work" parallel>
Regression and browser smoke coverage run alongside build work instead of waiting for handoff.
    </agent-gantt-task>
  </agent-gantt-phase>
  <agent-gantt-phase label="Launch readiness">
    <agent-gantt-task label="UAT" start="13" end="15" tone="validation" detail="Migration-critical paths only">
UAT stays scoped to flows that decide whether launch can proceed.
    </agent-gantt-task>
    <agent-gantt-task label="Go-live checkpoint" start="28" end="28" tone="launch" detail="Milestone week 28">
Final readiness review and publish decision.
    </agent-gantt-task>
  </agent-gantt-phase>
</agent-gantt>
<!-- /agent-isles-example -->

### Status board

Use `<agent-status-board>` and `<agent-status-item>` for RAG/health rollups across workstreams.

<!-- agent-isles-example id="status-board" title="Status board" -->
<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status">
  <agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g">
CI green; render smoke passing for 9 days.
  </agent-status-item>
  <agent-status-item label="Writeback" status="amber" owner="Zach" updated="tue" history="g,g,a,a">
Blocked on API boundary decision. Localhost auth design due Thu.
  </agent-status-item>
  <agent-status-item label="Pages" status="amber" owner="Merlin" updated="wed" history="a,a,a,a">
Publishing is pending until GitHub Pages is enabled by a repo owner.
  </agent-status-item>
  <agent-status-item label="Docs" status="green" owner="Merlin" updated="wed" history="g,g,g,g">
Component vocabulary mirror is current with the public wiki.
  </agent-status-item>
</agent-status-board>
<!-- /agent-isles-example -->

Item statuses: `green`, `amber`, `red`, `grey` (aliases: `g`, `a`, `r`).

### Action lists

Use `<agent-action-list>` and `<agent-action>` for follow-up work, with table, kanban, or priority layouts.

<!-- agent-isles-example id="action-list" title="Action list" -->
<agent-action-list label="From this demo" layout="table" group-by="status" filter-status="open,in-progress" filter-priority="high,normal" show-done="false">
  <agent-action owner="You" status="open" priority="normal">
Open `examples/demo.md` and inspect the source beside the rendered output.
  </agent-action>
  <agent-action owner="You" status="in-progress" priority="high" due="2026-05-24">
Run the render smoke after changing component examples.
  </agent-action>
  <agent-action owner="Merlin" status="open" priority="high">
Verify each component appears once as an atomic rendered/source pair.
  </agent-action>
  <agent-action owner="Merlin" status="done" priority="normal">
Keep the source snippets authoritative instead of hand-copied.
  </agent-action>
</agent-action-list>

<agent-action-list label="From standup (minimal)">
  <agent-action owner="You" status="open">Review the generated demo.</agent-action>
  <agent-action owner="Merlin" status="done">Mirror component docs to the wiki.</agent-action>
</agent-action-list>

<agent-action-list label="Launch follow-ups (kanban)" layout="kanban" show-done="false">
  <agent-action owner="Merlin" status="open" priority="high">Re-run browser smoke.</agent-action>
  <agent-action owner="Zach" status="in-progress" priority="normal">Review gallery scope.</agent-action>
  <agent-action owner="Merlin" status="blocked" priority="normal">Wait for Pages enablement.</agent-action>
  <agent-action owner="Pix" status="done" priority="low">Mirror component docs to the wiki.</agent-action>
</agent-action-list>

<agent-action-list label="Launch follow-ups (priority lanes)" layout="priority" show-done="true">
  <agent-action owner="Merlin" status="open" priority="high">Re-run browser smoke.</agent-action>
  <agent-action owner="Zach" status="in-progress" priority="normal">Review gallery scope.</agent-action>
  <agent-action owner="Pix" status="done" priority="low">Mirror component docs to the wiki.</agent-action>
</agent-action-list>
<!-- /agent-isles-example -->

## Renderer Features

### Plain Markdown and Bootstrap utility classes

Agent Isles keeps regular Markdown available and supports Bootstrap utility classes for one-off layout.

<!-- agent-isles-example id="bootstrap-markdown" title="Plain Markdown plus Bootstrap" -->
<div class="alert alert-info" role="alert">
  <strong>Information:</strong> This is a Bootstrap alert using utility classes.
</div>

<div class="card">
  <div class="card-body">
    <h5 class="card-title">Bootstrap card</h5>
    <p class="card-text">Cards work well for one-off layout without a custom component.</p>
  </div>
</div>
<!-- /agent-isles-example -->

### Syntax-highlighted fenced code

Fenced code blocks are highlighted with Highlight.js. The fence stays outside raw HTML, so Markdown parses it normally.

<!-- agent-isles-example id="syntax-highlighted-code" title="Syntax-highlighted code fence" -->
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}

const message = greet('Agent Isles');
console.log(message);
```
<!-- /agent-isles-example -->

### Bundled D2 diagram fences

D2 fences render as SVG diagrams without wrapping the fence in raw HTML.

<!-- agent-isles-example id="d2-diagram" title="D2 diagram fence" -->
```d2
direction: right

user: User {
  shape: person
}

browser: Browser {
  shape: rectangle
}

server: Server {
  shape: cylinder
}

user -> browser: Opens app
browser -> server: HTTP request
server -> browser: Response
browser -> user: Renders page
```
<!-- /agent-isles-example -->

### Sanitized rendering, local assets, and source view

Some renderer features are better documented than rendered live inside the demo.

<!-- agent-isles-example id="renderer-command-reference" title="Renderer command reference" -->
```bash
# Render the trusted demo with local, network-free assets.
npm run render -- --assets local --out dist/demo.html

# Render with page-level source comparison for review.
node ./bin/isles.mjs render examples/demo.md --show-source --out dist/demo-source.html

# Render untrusted Markdown through the sanitizer boundary.
node ./bin/isles.mjs render notes.md --safe --out dist/notes.html
```
<!-- /agent-isles-example -->

### Component pack rendering and resolution

Pack resolution is covered by fixtures and tests. A minimal local pack declares custom tags and assets, then `isles render --pack ./path/to/pack` injects those assets after the core Agent Isles bundle.

<!-- agent-isles-example id="pack-fixture" title="Component pack fixture shape" -->
```json
{
  "agentIslesPackVersion": 1,
  "name": "alpha-pack",
  "version": "1.2.3",
  "tags": [{ "name": "alpha-card", "attributes": ["tone"] }],
  "assets": [
    { "type": "module", "path": "components/alpha-card.js" },
    { "type": "style", "path": "styles/alpha-card.css" }
  ]
}
```
<!-- /agent-isles-example -->

## Getting Started

<!-- agent-isles-example id="getting-started" title="Render this demo locally" -->
```bash
npm install
npm test
npm run render -- --out dist/demo.html
```
<!-- /agent-isles-example -->

Then open `dist/demo.html` in your browser.

## Why this matters

**Plain Markdown is the sea:** durable, portable, and easy to navigate.

**Islands are the landmarks:** decisions, risks, metrics, timelines, schedules, status, dependencies, and actions that deserve stronger shape.

Agent Isles lets agents produce both in one source file — keeping reports readable in git while rendering polished artifacts for humans.
