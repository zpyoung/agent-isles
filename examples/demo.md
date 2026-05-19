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

<agent-metric label="Renderer confidence" value="92" unit="%" trend="up">
</agent-metric>

<agent-copy-block lang="bash" label="Render the demo">
npm run render -- --out dist/demo.html
</agent-copy-block>

## What changed in this pass

| Area | Status | Evidence |
| --- | --- | --- |
| Renderer smoke path | Ready | `npm run render -- --out dist/demo.html` writes a standalone page. |
| Component vocabulary | Seeded | Decision, risk, metric, and copy-block islands render as reusable Lit components. |
| Public narrative | Improved | This demo now explains why Markdown islands matter. |
| Plain Markdown readability | Preserved | The report still reads coherently before rendering. |

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

1. Render this file and open the generated HTML.
2. Use the source Markdown in pull requests so reviewers can inspect the exact report text.
3. Promote repeated Bootstrap patterns into semantic `<agent-*>` components only after they recur.

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

Plain Markdown is the sea: durable, portable, and easy to navigate. Islands are the landmarks: decisions, risks, metrics, and actions that deserve stronger shape. Agent Isles lets an agent produce both in one source file.
