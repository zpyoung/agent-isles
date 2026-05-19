# Agent Isles Component Vocabulary

This reference defines the semantic `<agent-*>` HTML islands that agents may embed in otherwise ordinary Markdown. The goal is a compact vocabulary that stays readable in source form, survives git diffs, and renders into richer UI when Agent Isles loads the component bundle.

Repo source: `docs/component-vocabulary.md`. Wiki mirror: `docs/wiki/Component-Vocabulary.md`.

## Authoring principles

- Write normal Markdown first; use a component only when structure, status, or interaction would otherwise require repeated UI boilerplate.
- Keep child content readable as plain text or Markdown-friendly HTML. A reviewer should understand the source without rendering it.
- Prefer explicit attributes over hidden conventions. Attribute values should be lowercase, hyphenated tokens when they behave like enums.
- Put long prose in the element body, not in attributes.
- Use Bootstrap classes directly for one-off layout primitives; use `<agent-*>` components for repeated agent-report patterns.

## Rendering and trust model

Current MVP rendering is trusted: the renderer preserves raw HTML islands with `rehype-raw`, copies the built component bundle next to the rendered output, and injects it as `./agent-components.js`. Only render Markdown from trusted repo/workspace sources in this mode.

The planned sanitized mode should preserve documented `<agent-*>` tags and documented attributes while rejecting executable/event-handler HTML such as `onclick`, arbitrary scripts, and unsupported component attributes. Until that mode lands, every component below should be treated as part of the trusted authoring contract rather than a security boundary.

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

### `<agent-metric>`

Intended use: compact report KPIs such as counts, durations, pass rates, cost, token usage, or coverage.

Planned attributes:

| Attribute | Required | Allowed values | Notes |
| --- | --- | --- | --- |
| `label` | Yes | Plain text | Metric name. |
| `value` | Yes | Plain text or number | Displayed value. |
| `unit` | No | Plain text | Unit suffix such as `%`, `ms`, `files`, or `$`. |
| `trend` | No | `up`, `down`, `flat` | Direction only; pair with surrounding prose for meaning. |
| `tone` | No | `neutral`, `good`, `warning`, `danger` | Semantic interpretation of the value. |

Child content: optional explanatory note; should be short.

Accessibility placeholder: trend arrows must include text labels or accessible names, not just glyphs.

Example placeholder:

```markdown
<agent-metric label="Tests" value="42" unit="passing" trend="up" tone="good"></agent-metric>
```


### `<agent-gantt>`, `<agent-gantt-phase>`, and `<agent-gantt-task>`

Use for dense project schedules with parallel workstreams, milestone weeks, task bars, accessible details, and generated legends. Keep surrounding titles, narrative summaries, milestone cards, comparison math, and notes in ordinary Markdown or separate focused components.

Status: supported.

Attributes:

| Tag | Attribute | Required | Allowed values | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| `agent-gantt` | `weeks` | Yes | Positive integer | `1` | Total grid length. |
| `agent-gantt` | `milestones` | No | Comma-separated week numbers | none | Marks milestone columns. |
| `agent-gantt-phase` | `label` | Yes | Plain text | `Phase` | Phase/lane heading inside the chart. |
| `agent-gantt-task` | `label` | Yes | Plain text | `Task` | Task bar label. |
| `agent-gantt-task` | `start` | Yes | Positive integer week | `1` | Start week, clamped into the grid. |
| `agent-gantt-task` | `end` | Yes | Positive integer week | `start` | End week, inclusive. |
| `agent-gantt-task` | `tone` | No | `components`, `testing`, `validation`, `launch`, `content`, `platform`, `default` | `default` | Bar color and generated legend label. |
| `agent-gantt-task` | `detail` | No | Plain text | none | Accessible expandable task detail. |
| `agent-gantt-task` | `parallel` | No | Boolean attribute | false | Adds a striped visual treatment for continuous/overlapping work. |

Child content: `<agent-gantt>` contains phases; phases contain tasks; tasks may include extra detail text, though `detail` is preferred for short details.

Accessibility notes:

- The Gantt host receives `role="group"` and defaults to `aria-label="Gantt schedule"`; authors may set a more specific `aria-label`.
- Week and milestone markers are exposed as text.
- Each task exposes an accessible label including the task name and week range.
- Task details use native `<details>/<summary>` behavior for keyboard and pointer access.
- The legend is generated from task tones and includes visible text labels.

Trusted/sanitized behavior:

- Trusted mode preserves documented Gantt tags and attributes.
- Sanitized mode allows focused chart tags and safe attributes while removing scripts, event handlers, comparison-summary attributes, and unsupported subcomponents such as `agent-gantt-note`.

Minimal example:

```markdown
## Revised Migration Timeline

Use Markdown for the surrounding section title and prose.

<agent-gantt aria-label="Revised migration timeline" weeks="28" milestones="12,15,28">
  <agent-gantt-phase label="Core build">
    <agent-gantt-task label="Components + Storybook" start="3" end="5" tone="components" detail="2 wks — was 8 wks"></agent-gantt-task>
    <agent-gantt-task label="Testing — parallel" start="3" end="12" tone="testing" parallel></agent-gantt-task>
  </agent-gantt-phase>
</agent-gantt>
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
