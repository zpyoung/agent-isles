# Agent Isles Component Vocabulary

This reference defines the semantic `<agent-*>` HTML islands that agents may embed in otherwise ordinary Markdown. The goal is a compact vocabulary that stays readable in source form, survives git diffs, and renders into richer UI when Agent Isles loads the component bundle.

Repo source: `docs/component-vocabulary.md`. Wiki mirror: `docs/wiki/Component-Vocabulary.md`.

## Authoring principles

- Write normal Markdown first; use a component only when structure, status, or interaction would otherwise require repeated UI boilerplate.
- Keep child content readable as plain text or Markdown-friendly HTML. A reviewer should understand the source without rendering it.
- Prefer explicit attributes over hidden conventions. Attribute values should be lowercase, hyphenated tokens when they behave like enums.
- Put long prose in the element body, not in attributes.
- Keep nested custom-element HTML blocks continuous: blank lines inside raw HTML islands can make CommonMark close the HTML block and turn later indented custom elements into escaped code.
- Use Bootstrap classes directly for one-off layout primitives; use `<agent-*>` components for repeated agent-report patterns.

## Rendering and trust model

The renderer has two explicit trust modes:

- Trusted mode preserves raw HTML islands with `rehype-raw`, copies the built component bundle next to the rendered output, and injects it as `./agent-components.js`. Only render Markdown from trusted repo/workspace sources in this mode.
- Sanitized mode preserves documented `<agent-*>` tags and documented safe attributes while rejecting executable/event-handler HTML such as `onclick`, arbitrary scripts, unsupported component attributes, and unsafe URL protocols.

## Status levels

- **Supported**: implemented in `src/components/` and exported by `src/components/index.js`.
- **Planned**: named in the public vocabulary, but not implemented yet. Use placeholders only in issues, wiki context, or plans on the dedicated `plans` branch unless the matching implementation PR has merged.

## Supported components

### `<agent-decision>`

Use for architectural, product, implementation, or operational decisions where the outcome should be visually scannable.

Status: supported.

Attributes:

| Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- |
| `verdict` | No | `go`, `approved`, `rejected`, `deferred`, `needs-review`, `ship-with-guardrails`; unknown tokens render with a generic badge | `needs-review` | Prefer the documented tokens so reports stay consistent. |
| `title` | No | Plain text | `Decision` | Short label for the decision. Put rationale in the body. |

Child content:

- Short prose, links, lists, or inline code explaining why the decision was made.
- Avoid nested interactive components until the renderer has browser smoke coverage for nested islands.

Accessibility notes:

- Rendered as a section-like card with visible title and verdict text, not color alone.
- Use specific `title` text so screen-reader users can distinguish multiple decisions.
- Do not encode the only important meaning in emoji; the badge label must carry the state.

Trusted/sanitized behavior:

- Trusted mode preserves the tag, attributes, and child HTML.
- Sanitized mode should allow only `verdict` and `title` on this tag, plus safe child Markdown/HTML.

Example:

```markdown
<agent-decision verdict="ship-with-guardrails" title="Use Markdown islands">
Agents can keep normal prose in Markdown and reserve custom elements for richer, repeated UI patterns.
</agent-decision>
```

### `<agent-risk>`

Use for risks, blockers, hazards, or migration concerns that need severity and mitigation context.

Status: supported.

Attributes:

| Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- |
| `level` | No | `low`, `medium`, `high`, `critical` | `medium` | Unknown or missing values render as medium. |
| `title` | No | Plain text | `Risk` | Short risk label. Put impact and mitigation in the body. |

Child content:

- Prose describing impact, likelihood, mitigation, owner, or next action.
- Keep the body readable if the custom element is ignored by a plain Markdown viewer.

Accessibility notes:

- Rendered with severity text and icon, not color alone.
- Use `critical` only for immediate action or severe impact; overuse makes reports noisy.
- Include mitigation or next-step text when possible so the card is actionable.

Trusted/sanitized behavior:

- Trusted mode preserves the tag, attributes, and child HTML.
- Sanitized mode should allow only `level` and `title` on this tag, plus safe child Markdown/HTML.

Example:

```markdown
<agent-risk level="high" title="Migration lock">
The backfill query may lock writes during peak traffic. Run it in batches and keep rollback SQL nearby.
</agent-risk>
```

### `<agent-gantt>`, `<agent-gantt-phase>`, and `<agent-gantt-task>`

Use for compact, data-driven project schedules where parallel work, phase lanes, milestone markers, and task duration bars matter more than narrative step order.

Status: supported.

Authoring guidance:

- Use Markdown headings and prose around the chart. `<agent-gantt>` should render only the chart itself.
- Keep milestone cards, KPI summaries, comparison cards, and narrative wrappers outside the component.
- Put concise task labels in attributes and longer explanation in `detail` or the task body.

Attributes:

| Tag | Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `agent-gantt` | `weeks` | No | Positive integer | `12` | Total chart width in week columns. |
| `agent-gantt` | `milestones` | No | Comma-separated positive week numbers | empty | Renders milestone markers and legend text. |
| `agent-gantt` | `label` | No | Plain text | `Gantt chart` | Accessible chart label. |
| `agent-gantt-phase` | `label` | No | Plain text | `Phase` | Lane-group label. |
| `agent-gantt-task` | `label` | No | Plain text | `Gantt task` | Visible task label. |
| `agent-gantt-task` | `start` | No | Positive integer | `1` | Starting week column. |
| `agent-gantt-task` | `end` | No | Positive integer | same as `start` | Ending week column, inclusive. |
| `agent-gantt-task` | `tone` | No | `components`, `testing`, `validation`, `launch`, `risk`, or any token (unknown tokens render as default) | default | Drives bar color and generated legend entry. |
| `agent-gantt-task` | `detail` | No | Plain text | empty | Short detail shown in the native disclosure panel. |
| `agent-gantt-task` | `parallel` | No | Boolean attribute | false | Adds a dashed/striped style for continuous or overlapping tracks. |

Child content:

- `<agent-gantt>` should contain one or more `<agent-gantt-phase>` children.
- `<agent-gantt-phase>` should contain `<agent-gantt-task>` children.
- `<agent-gantt-task>` may contain concise details, evidence, or notes that stay readable in source form.

Accessibility notes:

- The chart renders as a labeled grid with phase row groups and visible week headers.
- Task bars use native `<details>/<summary>` disclosure so keyboard and mouse users can expose detail text without bespoke tooltip code.
- Task accessible names include label, week range, tone label, parallel status, and `detail` text where present.
- Tone is represented in the legend and accessible labels, not color alone.

Trusted/sanitized behavior:

- Trusted mode preserves the tags, attributes, and child HTML.
- Sanitized mode allows `weeks`, `milestones`, `label`, `start`, `end`, `tone`, `detail`, and `parallel` on the Gantt tags while stripping event handlers and unsafe raw HTML.

Example:

```markdown
## Revised migration schedule

Use Markdown for surrounding context. The component owns only the chart.

<agent-gantt weeks="28" milestones="12,15,28" label="Migration schedule">
  <agent-gantt-phase label="Core build">
    <agent-gantt-task
      label="Components + Storybook"
      start="3"
      end="5"
      tone="components"
      detail="2 wks — was 8 wks">
      Component parity removes a design review loop.
    </agent-gantt-task>

    <agent-gantt-task
      label="Testing — parallel"
      start="3"
      end="12"
      tone="testing"
      parallel>
      Regression coverage runs alongside build work.
    </agent-gantt-task>
  </agent-gantt-phase>
</agent-gantt>
```

### `<agent-status-board>` and `<agent-status-item>`

Use for compact RAG/health boards where an agent report needs to answer “where are we across N workstreams?” without hand-authoring repeated Bootstrap rows.

Status: supported.

Authoring guidance:

- Use `<agent-status-board>` for the rollup container and direct `<agent-status-item>` children for rows.
- Keep child item bodies as concise prose that remains readable in Markdown source.
- Use `summary="bar"` only when the derived distribution and worst-of headline add value.
- Use `group-by="status"` when red/amber/green lanes are easier to scan than source order.
- Keep nested custom-element children continuous; avoid blank lines between status items inside the board.

Attributes:

| Tag | Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `agent-status-board` | `label` | No | Plain text | `Status` | Board heading and accessible label. |
| `agent-status-board` | `meta` | No | Plain text | derived item count | Small right-aligned context such as `wk 24`. |
| `agent-status-board` | `summary` | No | `bar`, `off` | `off` | `bar` shows a distribution bar and worst-of headline derived from children. |
| `agent-status-board` | `group-by` | No | `status`, `none` | `none` | `status` renders native collapsible red/amber/green/grey lanes. |
| `agent-status-item` | `label` | No | Plain text | `Status item` | Visible row label. |
| `agent-status-item` | `status` | No | `green`, `amber`, `red`, `grey` plus aliases `g`, `a`, `r` | `grey` | Drives status pill, grouping lane, summary count, and row accent. |
| `agent-status-item` | `owner` | No | Plain text | empty | Accountable person/team rendered as metadata. |
| `agent-status-item` | `updated` | No | Plain text | empty | Free-form recency hint such as `mon`, `2d ago`, or a date. |
| `agent-status-item` | `history` | No | Comma-separated status tokens | empty | Renders a small trend strip such as `g,g,a,a`. |

Child content:

- `<agent-status-board>` should contain direct `<agent-status-item>` children.
- `<agent-status-item>` may contain short prose, evidence, or next-action context.

Accessibility notes:

- Rows expose visible status labels and generated accessible labels; status is not color-only.
- Grouped boards use native `<details>/<summary>` disclosure for keyboard-safe collapsible lanes.
- Summary bars include text counts and an `aria-label` describing the distribution.

Trusted/sanitized behavior:

- Trusted mode preserves the tags, attributes, and child HTML.
- Sanitized mode allows `label`, `meta`, `summary`, `group-by`, `status`, `owner`, `updated`, and `history` while stripping event handlers and unsafe raw HTML.

Example:

```markdown
<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status">
  <agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g">
    CI green; render smoke passing for 9 days.
  </agent-status-item>
  <agent-status-item label="Writeback" status="amber" owner="Zach" updated="tue" history="g,g,a,a">
    Blocked on API boundary decision.
  </agent-status-item>
</agent-status-board>
```

### `<agent-metric>`

Use for compact report measurements such as counts, durations, pass rates, cost, token usage, coverage, latency, or scores.

Status: supported.

Attributes:

| Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | Yes | Plain text | `Metric` | Metric name. |
| `value` | Yes | Plain text or number | `—` | Displayed value. |
| `unit` | No | Plain text | none | Unit suffix such as `%`, `ms`, `files`, `$`, or `wks`. |
| `trend` | No | `up`, `down`, `flat` | none | Direction only; pair with `tone` or surrounding prose for meaning. |
| `tone` | No | `neutral`, `good`, `warning`, `danger` | `neutral` | Semantic interpretation of the value. |

Child content: optional explanatory note; should be short and readable if the component is ignored.

Accessibility notes:

- The visible label, value, unit, trend text, and tone are represented as text, not color alone.
- `trend` is intentionally directional only; use `tone` or prose to say whether the movement is good or bad.
- Keep long explanations outside the metric or in surrounding Markdown.

Trusted/sanitized behavior:

- Trusted mode preserves the tag, documented attributes, and child HTML.
- Sanitized mode allows `label`, `value`, `unit`, `trend`, and `tone` while removing scripts and event handlers.

Example:

```markdown
<agent-metric label="Tests" value="42" unit="passing" trend="up" tone="good"></agent-metric>
```

### `<agent-delta>`

Use for signed change summaries such as weeks saved, percent improvement, cost reduction, latency regression, score lift, or coverage movement.

Status: supported.

Attributes:

| Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | No | Plain text | `Delta` | Short label for the change. |
| `value` | Yes | Signed number or text | `—` | Primary signed change value, such as `-10` or `+18`. |
| `unit` | No | Plain text | none | Unit suffix such as `wks`, `%`, `$`, `ms`, or `pts`. |
| `percent` | No | Signed number or text without `%` | none | Optional percent change displayed alongside the value. |
| `direction` | No | `lower-better`, `higher-better`, `neutral` | `neutral` | Interprets whether positive/negative movement is good or bad. |
| `tone` | No | `neutral`, `good`, `warning`, `danger` | computed from `value` + `direction` | Optional override for semantic emphasis. |

Child content: concise human summary of what changed and why it matters.

Accessibility notes:

- The value, unit, percent, direction semantics, and computed/explicit tone are exposed as text.
- Do not rely on green/red styling alone; include a child summary such as `26% faster · ~10 weeks saved`.
- Use `direction` whenever possible so a negative value can be interpreted correctly.

Trusted/sanitized behavior:

- Trusted mode preserves the tag, documented attributes, and child HTML.
- Sanitized mode allows `label`, `value`, `unit`, `percent`, `direction`, and `tone` while removing scripts and event handlers.

Example:

```markdown
<agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better">
  26% faster · ~10 weeks saved
</agent-delta>
```

### Composition recipe: comparison card

Use ordinary Markdown/Bootstrap layout for the one-off card wrapper and compose report primitives inside it:

```markdown
<div class="card shadow-sm my-3">
  <div class="card-body">
    <h3 class="h5">Timeline comparison</h3>
    <div class="row g-3">
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
```

Do not introduce `<agent-comparison-bar>` for this slice. If a specific comparison visualization repeats often enough later, promote it from this composition recipe into its own semantic island.

### `<agent-kpi>`

Use for compact report KPIs, milestone summaries, exec dashboards, and before/after status bands. Use a single `<agent-metric>` when there is only one number; use multiple `<agent-kpi>` cards when the numbers are meaningfully scanned as a set.

Status: supported.

Attributes:

| Tag | Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `agent-kpi` | `label` | Yes | Plain text | `KPI` | Metric card label. |
| `agent-kpi` | `value` | Yes | Plain text or number | `—` | Main value. |
| `agent-kpi` | `unit` | No | Plain text | none | Unit suffix such as `wks`, `%`, `ms`, or `$`. |
| `agent-kpi` | `delta` | No | Plain text | none | Short comparison note such as `was ~26 wks`. |
| `agent-kpi` | `tone` | No | `primary`, `success`, `warning`, `danger`, `neutral` | `neutral` | Semantic emphasis for the delta badge and border. |

Child content: each `<agent-kpi>` may include one short detail sentence.

Accessibility notes:

- Each KPI receives an accessible label composed from label, value, unit, and delta.
- Color is only emphasis; label/value/delta text carries the meaning.
- When grouping KPIs, prefer semantic list markup (for example `role="list"` with `role="listitem"` wrappers).

Trusted/sanitized behavior:

- Trusted mode preserves the tags, attributes, and child content.
- Sanitized mode allows documented KPI tags and attributes while removing scripts and event handlers.

Minimal example:

```markdown
<div class="row g-3" role="list" aria-label="Migration milestones">
  <div class="col-md-4" role="listitem">
    <agent-kpi label="Phase 1 dev complete" value="~12" unit="wks" delta="was ~26 wks" tone="success">
      From kick-off
    </agent-kpi>
  </div>
</div>
```

## Planned components

These names are reserved by the vocabulary so docs, examples, and implementation can converge without inventing new tags later.

### `<agent-finding>`

Intended use: code review, audit, QA, or bug-investigation findings where severity and source location matter.

Planned attributes:

| Attribute | Required | Allowed values | Notes |
| --- | --- | --- | --- |
| `severity` | No | `info`, `low`, `medium`, `high`, `critical` | Visual priority of the finding. |
| `file` | No | Repo-relative path | Source file or artifact path. |
| `line` | No | Positive integer or line range such as `42` or `42-45` | Source location hint. |
| `title` | No | Plain text | Short finding summary. |

Child content: finding details, evidence, suggested fix, and verification notes.

Accessibility placeholder: severity must be rendered as text, and file/line metadata should be copyable as text.

Example placeholder:

```markdown
<agent-finding severity="medium" file="src/render.mjs" line="22" title="Raw HTML mode is trusted-only">
Add sanitized-mode coverage before accepting untrusted Markdown input.
</agent-finding>
```

### `<agent-copy-block>`

Intended use: command snippets, config fragments, prompts, or generated code that users are likely to copy.

Planned attributes:

| Attribute | Required | Allowed values | Notes |
| --- | --- | --- | --- |
| `label` | No | Plain text | Header label shown above the code. |
| `lang` | No | Highlight.js language token | Language hint for code styling. |

Child content: a single fenced-code-equivalent `<pre><code>` block after Markdown is rendered.

Accessibility placeholder: copy button must be keyboard-focusable and announce success without relying on color.

Example placeholder:

````markdown
<agent-copy-block label="Render smoke" lang="bash">

```bash
npm run render -- --out dist/demo.html
```

</agent-copy-block>
````

### `<agent-tabs>` and `<agent-tab>`

Intended use: alternate views of the same report section, such as Summary/Evidence/Fix or macOS/Linux/Windows instructions.

Planned attributes:

| Tag | Attribute | Required | Allowed values | Notes |
| --- | --- | --- | --- | --- |
| `agent-tabs` | `label` | No | Plain text | Accessible group label. |
| `agent-tab` | `title` | Yes | Plain text | Tab label. |
| `agent-tab` | `active` | No | Boolean attribute | Initial selected tab. Only one child should be active. |

Child content: `<agent-tabs>` should contain only `<agent-tab>` children; each tab contains normal Markdown-rendered content.

Accessibility placeholder: tabs must render correct `role="tablist"`, `role="tab"`, `role="tabpanel"`, keyboard focus behavior, and selected state.

Example placeholder:

```markdown
<agent-tabs label="Verification evidence">
  <agent-tab title="Tests" active>
    `npm test` passed.
  </agent-tab>
  <agent-tab title="Render">
    `npm run render -- --out dist/demo.html` passed.
  </agent-tab>
</agent-tabs>
```

### `<agent-timeline>` and `<agent-step>`

Intended use: chronological execution logs, incident timelines, release steps, or multi-phase plans.

Planned attributes:

| Tag | Attribute | Required | Allowed values | Notes |
| --- | --- | --- | --- | --- |
| `agent-timeline` | `title` | No | Plain text | Optional timeline heading. |
| `agent-step` | `status` | No | `todo`, `doing`, `done`, `blocked`, `skipped` | Step state. |
| `agent-step` | `time` | No | Plain text timestamp or duration | Human-readable timing context. |
| `agent-step` | `title` | No | Plain text | Short step heading. |

Child content: `<agent-timeline>` should contain `<agent-step>` children; each step contains concise details, links, or evidence.

Accessibility placeholder: status must be text-visible, and sequence order must remain meaningful in source order.

Example placeholder:

```markdown
<agent-timeline title="Autopilot run">
  <agent-step status="done" time="11:48 PM" title="Inspected issue">
    Confirmed #10 was ready and no existing PR targeted it.
  </agent-step>
  <agent-step status="doing" title="Open PR">
    Push the docs branch and request review.
  </agent-step>
</agent-timeline>
```

## Vocabulary change checklist

When adding or changing a component:

1. Add or update the implementation in `src/components/` and export it from `src/components/index.js`.
2. Add tests and render smoke coverage for the new tag.
3. Update this reference with attributes, child content, accessibility notes, trust behavior, and examples.
4. Update `examples/demo.md` only with examples that stay readable as plain Markdown.
5. If the GitHub Wiki should expose the change immediately, mirror this page to `docs/wiki/Component-Vocabulary.md` and push the wiki update separately when appropriate.
