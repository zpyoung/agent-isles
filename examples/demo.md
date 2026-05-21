# Agent Isles Demo: Launch Readiness Report

<p class="lead">A public demo of how an agent can write normal Markdown, then add small HTML islands where richer UI helps a human scan, decide, and act.</p>

> Scenario: an autonomous maintainer has finished a release-candidate pass and needs to brief a project owner. The source stays readable in git; the rendered page feels closer to a lightweight product report.

## At a glance

<div class="row g-3 my-3">
  <div class="col-md-4">
    <div class="card h-100 shadow-sm border-success">
      <div class="card-body">
        <div class="text-uppercase text-success fw-bold small">Release confidence</div>
        <div class="display-6 fw-bold">82%</div>
        <p class="mb-0">Core renderer path is working; docs and component vocabulary are the next leverage points.</p>
      </div>
    </div>
  </div>
  <div class="col-md-4">
    <div class="card h-100 shadow-sm border-primary">
      <div class="card-body">
        <div class="text-uppercase text-primary fw-bold small">Time to brief</div>
        <div class="display-6 fw-bold">3 min</div>
        <p class="mb-0">Markdown remains skimmable while rendered cards expose the important numbers first.</p>
      </div>
    </div>
  </div>
  <div class="col-md-4">
    <div class="card h-100 shadow-sm border-warning">
      <div class="card-body">
        <div class="text-uppercase text-warning fw-bold small">Open risks</div>
        <div class="display-6 fw-bold">2</div>
        <p class="mb-0">Risk islands keep caveats visible without burying them in paragraphs.</p>
      </div>
    </div>
  </div>
</div>

## Executive summary

Agent Isles is useful when the output must satisfy two audiences at once:

- **Agents and maintainers** need boring Markdown that is easy to diff, review, and archive.
- **Humans making decisions** need structure, hierarchy, and visual emphasis.
- **Future automation** needs semantic tags like `<agent-decision>` and `<agent-risk>` that can be queried later.

<agent-decision verdict="ship-with-guardrails" title="Use Markdown islands for agent reports">
Ship the report format as Markdown plus explicit HTML islands. Keep prose portable, use Bootstrap for one-off layout, and reserve Lit components for recurring decision and risk patterns.
</agent-decision>

<div class="card shadow-sm my-3">
  <div class="card-body">
    <h3 class="h5">Timeline comparison</h3>
    <div class="row g-3">
      <div class="col-md-6">
        <agent-metric label="Original — no AI, new design" value="38" unit="wks" tone="neutral">
        </agent-metric>
      </div>
      <div class="col-md-6">
        <agent-metric label="Revised — AI + 1:1 parity + existing assets" value="28" unit="wks" tone="good">
        </agent-metric>
      </div>
    </div>
    <agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better">
      26% faster · ~10 weeks saved
    </agent-delta>
  </div>
</div>

<div class="row g-3 my-4" role="list" aria-label="Migration milestones">
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

<agent-metric label="Renderer confidence" value="92" unit="%" trend="up">
</agent-metric>

<agent-copy-block lang="bash" label="Render the demo">
npm run render -- --out dist/demo.html
</agent-copy-block>

## Status board

Use `<agent-status-board>` when an agent report needs a compact “where are we across N workstreams?” rollup. The board derives its summary from child rows rather than requiring duplicated counts in Markdown.

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

<agent-status-board label="Component readiness">
  <agent-status-item label="KPI" status="green" owner="Merlin">
    Stable and covered by browser smoke.
  </agent-status-item>
  <agent-status-item label="Status board" status="amber" owner="Merlin">
    New island under review; verify grouped lanes and summary behavior.
  </agent-status-item>
</agent-status-board>

## What changed in this pass

| Area | Status | Evidence |
| --- | --- | --- |
| Renderer smoke path | Ready | `npm run render -- --out dist/demo.html` writes a standalone page. |
| Component vocabulary | Expanded | Decision, risk, metric, copy-block, tabs, and timeline islands render as reusable Lit components. |
| Public narrative | Improved | This demo now explains why Markdown islands matter. |
| Plain Markdown readability | Preserved | The report still reads coherently before rendering. |

## Dependency map: writeback chain

Project reports often need to show what blocks what. This map renders a vertical dependency DAG without requiring Mermaid.

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

## Multi-phase plan

<agent-tabs>
  <agent-tab title="Phase 1 — Discover">
    <p>Map the report shape, decide which details need richer UI, and keep the source document readable in plain Markdown.</p>
    <agent-timeline label="Discovery progress">
      <agent-step status="done" label="Renderer baseline">
        Markdown renders to a complete HTML page with Bootstrap, theme CSS, and the component bundle.
      </agent-step>
      <agent-step status="active" label="Component expansion">
        Tabs and timeline islands now cover multi-phase plans without hand-writing Bootstrap boilerplate.
      </agent-step>
      <agent-step status="pending" label="Browser polish">
        Add deeper browser smoke coverage for keyboard and hydration behavior as the vocabulary grows.
      </agent-step>
    </agent-timeline>
  </agent-tab>
  <agent-tab title="Phase 2 — Build">
    <p>Use explicit islands when structure matters. The tab component owns its own state; it does not rely on global framework state.</p>
    <ul>
      <li><code>&lt;agent-tabs&gt;</code> provides the tablist and keyboard navigation.</li>
      <li><code>&lt;agent-tab title="..."&gt;</code> marks each named panel.</li>
      <li><code>&lt;agent-timeline&gt;</code> groups ordered progress steps.</li>
      <li><code>&lt;agent-step status="done|active|pending|failed" label="..."&gt;</code> labels each status-bearing step.</li>
    </ul>
  </agent-tab>
  <agent-tab title="Phase 3 — Review">
    <p>Rendered output should be inspectable HTML with accessible labels, ARIA tab semantics, and no hidden dependency on app-level state.</p>
  </agent-tab>
</agent-tabs>

## Revised migration schedule

Use Markdown for the section title and explanatory prose; `<agent-gantt>` owns only the chart: phase lanes, week axis, milestone markers, task bars, overlap, legend, and task details.

<agent-gantt weeks="28" milestones="12,15,28" label="Migration schedule">
  <agent-gantt-phase label="Core build">
    <agent-gantt-task
      label="Components + Storybook"
      start="3"
      end="5"
      tone="components"
      detail="2 wks — was 8 wks; 1:1 parity removes design review loop">
      Component parity keeps the source Markdown simple while the rendered chart shows schedule compression.
    </agent-gantt-task>
    <agent-gantt-task
      label="Testing — parallel"
      start="3"
      end="12"
      tone="testing"
      detail="Runs continuously beside component work"
      parallel>
      Regression and browser smoke coverage run alongside build work instead of waiting for handoff.
    </agent-gantt-task>
  </agent-gantt-phase>
  <agent-gantt-phase label="Launch readiness">
    <agent-gantt-task
      label="UAT"
      start="13"
      end="15"
      tone="validation"
      detail="Migration-critical paths only">
      UAT stays scoped to flows that decide whether launch can proceed.
    </agent-gantt-task>
    <agent-gantt-task
      label="Go-live checkpoint"
      start="28"
      end="28"
      tone="launch"
      detail="Milestone week 28">
      Final readiness review and publish decision.
    </agent-gantt-task>
  </agent-gantt-phase>
</agent-gantt>

## Decisions

<agent-decision verdict="go" title="Keep the source boring">
Use standard Markdown for headings, tables, lists, quotes, and code fences. This keeps review workflows simple and avoids turning every report into a custom app.
</agent-decision>

<agent-decision verdict="needs-review" title="Add richer components deliberately">
New custom elements should earn their place by replacing repeated report patterns. One-off visual layout can stay as Bootstrap HTML until the pattern proves durable.
</agent-decision>

## Risks and mitigations

<agent-risk level="medium" title="Raw HTML is a trust boundary">
The current renderer is intended for trusted Markdown. Before accepting untrusted input, Agent Isles needs a deliberate sanitization mode with an explicit allowlist.
</agent-risk>

<agent-risk level="low" title="Component vocabulary can sprawl">
If every report invents new tags, the vocabulary stops being useful. Prefer a small set of semantic primitives that map to common agent outputs: decisions, risks, metrics, timelines, findings, and copy blocks.
</agent-risk>

## Suggested next actions

<agent-action-list
  label="From this demo"
  layout="table"
  group-by="status"
  filter-status="open,in-progress"
  filter-priority="high,normal"
  show-done="false">
  <agent-action owner="You" status="open">
    Render this file and open the generated HTML.
  </agent-action>
  <agent-action owner="You" status="in-progress" priority="high" due="2026-05-24">
    Add an action list island for follow-ups that keeps ownership and status visible.
  </agent-action>
  <agent-action owner="Reviewers" status="open" priority="normal">
    Use the source Markdown in pull requests so reviewers can inspect the exact report text.
  </agent-action>
  <agent-action owner="Maintainers" status="done">
    Promote repeated Bootstrap patterns into semantic agent-* components only after they recur.
  </agent-action>
</agent-action-list>

<agent-action-list label="From standup (minimal)">
  <agent-action owner="Pix">Mirror docs to wiki.</agent-action>
  <agent-action owner="Merlin">Re-run smoke after component bundle changes.</agent-action>
  <agent-action owner="Zach" status="done">Open the three PRs.</agent-action>
</agent-action-list>

<agent-action-list label="Launch follow-ups (kanban)" layout="kanban" show-done="false">
  <agent-action owner="Merlin" due="2026-05-24" priority="high" status="in-progress">
    Re-run render smoke after component bundle changes.
  </agent-action>
  <agent-action owner="Zach" due="next wk" priority="normal" status="blocked">
    Decide whether writeback should support action status edits in the first pass.
  </agent-action>
  <agent-action owner="Pix" status="done">
    Mirror component docs to the wiki.
  </agent-action>
</agent-action-list>

<agent-action-list label="Launch follow-ups (priority lanes)" layout="priority" show-done="true">
  <agent-action owner="Merlin" due="2026-05-24" priority="high" status="in-progress">
    Re-run render smoke after component bundle changes.
  </agent-action>
  <agent-action owner="Zach" due="next wk" priority="normal" status="blocked">
    Decide whether writeback should support action status edits in the first pass.
  </agent-action>
  <agent-action owner="Pix" status="done" priority="low">
    Mirror component docs to the wiki.
  </agent-action>
</agent-action-list>

```bash
npm install
npm test
npm run render -- --out dist/demo.html
```

## Copyable agent prompt

Use this as a seed prompt for future report generation:

```text
Write an Agent Isles report for the current project state.
Keep the source readable as Markdown.
Use Bootstrap only for one-off layout.
Use <agent-decision> for recommendations and <agent-risk> for caveats.
End with verification evidence and concrete next actions.
```

## Why this matters

Plain Markdown is the sea: durable, portable, and easy to navigate. Islands are the landmarks: decisions, risks, metrics, timelines, and actions that deserve stronger shape. Agent Isles lets an agent produce both in one source file.
