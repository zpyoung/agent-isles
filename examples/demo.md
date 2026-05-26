# Agent Isles Component Gallery

<p class="lead">A complete reference gallery showcasing every Agent Isles component and renderer feature with side-by-side rendered output and source code.</p>

> **Purpose:** This gallery serves as both a visual showcase and executable documentation. Each example pairs the rendered component with the exact Markdown/HTML source that produced it.

---

## What is Agent Isles?

Agent Isles lets agents write standard Markdown, then embed semantic HTML "islands" where richer UI helps humans scan, decide, and act. The source stays readable in git; the rendered page feels closer to a product report.

**Key principles:**
- Keep Markdown boring and portable
- Use Bootstrap classes for simple layout
- Reserve `<agent-*>` components for repeated patterns
- Maintain git-reviewability

---

## Component Reference

### Decision Islands

Use `<agent-decision>` for architectural, product, or operational decisions where the verdict should be visually scannable.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-decision verdict="go" title="Ship the feature">
All acceptance criteria met. Test coverage at 94%. Deploy to production.
      </agent-decision>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-decision verdict="go" title="Ship the feature"&gt;
All acceptance criteria met. Test coverage at 94%. Deploy to production.
&lt;/agent-decision&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-decision verdict="needs-review" title="Add authentication layer">
Scope is clear but implementation approach needs team review. Consider OAuth vs JWT.
      </agent-decision>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-decision verdict="needs-review" title="Add authentication layer"&gt;
Scope is clear but implementation approach needs team review. Consider OAuth vs JWT.
&lt;/agent-decision&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-decision verdict="ship-with-guardrails" title="Use Markdown islands for reports">
Ship the report format as Markdown plus explicit HTML islands. Keep prose portable, use Bootstrap for layout, reserve components for repeated patterns.
      </agent-decision>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-decision verdict="ship-with-guardrails" title="Use Markdown islands for reports"&gt;
Ship the report format as Markdown plus explicit HTML islands. Keep prose portable, use Bootstrap for layout, reserve components for repeated patterns.
&lt;/agent-decision&gt;</code></pre>
    </div>
  </div>
</div>

**Supported verdicts:** `go`, `approved`, `rejected`, `deferred`, `needs-review`, `ship-with-guardrails`

---

### Risk Islands

Use `<agent-risk>` for risks, blockers, hazards, or concerns that need severity and mitigation context.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-risk level="high" title="Database migration lock">
The backfill query may lock writes during peak traffic. Run in batches and keep rollback SQL ready.
      </agent-risk>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-risk level="high" title="Database migration lock"&gt;
The backfill query may lock writes during peak traffic. Run in batches and keep rollback SQL ready.
&lt;/agent-risk&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-risk level="medium" title="Raw HTML is a trust boundary">
Current renderer is for trusted Markdown. Add sanitization mode before accepting untrusted input.
      </agent-risk>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-risk level="medium" title="Raw HTML is a trust boundary"&gt;
Current renderer is for trusted Markdown. Add sanitization mode before accepting untrusted input.
&lt;/agent-risk&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-risk level="low" title="Component vocabulary sprawl">
If every report invents new tags, the vocabulary loses value. Prefer semantic primitives.
      </agent-risk>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-risk level="low" title="Component vocabulary sprawl"&gt;
If every report invents new tags, the vocabulary loses value. Prefer semantic primitives.
&lt;/agent-risk&gt;</code></pre>
    </div>
  </div>
</div>

**Supported levels:** `low`, `medium`, `high`, `critical`

---

### Metrics

Use `<agent-metric>` for compact measurements: counts, durations, pass rates, coverage, latency, scores.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-metric label="Tests passing" value="42" unit="tests" tone="good"></agent-metric>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-metric label="Tests passing" value="42" unit="tests" tone="good"&gt;&lt;/agent-metric&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-metric label="Renderer confidence" value="92" unit="%" trend="up" tone="good"></agent-metric>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-metric label="Renderer confidence" value="92" unit="%" trend="up" tone="good"&gt;&lt;/agent-metric&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-metric label="Build time" value="127" unit="ms" trend="down" tone="warning"></agent-metric>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-metric label="Build time" value="127" unit="ms" trend="down" tone="warning"&gt;&lt;/agent-metric&gt;</code></pre>
    </div>
  </div>
</div>

**Supported tones:** `neutral`, `good`, `warning`, `danger`
**Supported trends:** `up`, `down`, `flat`

---

### Delta Comparisons

Use `<agent-delta>` for signed change summaries: weeks saved, percent improvement, cost reduction.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better">
26% faster · ~10 weeks saved
      </agent-delta>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-delta label="Timeline delta" value="-10" unit="wks" percent="-26" direction="lower-better"&gt;
26% faster · ~10 weeks saved
&lt;/agent-delta&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-delta label="Cost increase" value="+15" unit="%" direction="lower-better">
Infrastructure costs up 15% due to scaling
      </agent-delta>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-delta label="Cost increase" value="+15" unit="%" direction="lower-better"&gt;
Infrastructure costs up 15% due to scaling
&lt;/agent-delta&gt;</code></pre>
    </div>
  </div>
</div>

**Supported directions:** `lower-better`, `higher-better`, `neutral`

---

### KPI Cards

Use `<agent-kpi>` for milestone summaries, exec dashboards, before/after status bands.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
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
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;div class="row g-3" role="list" aria-label="Migration milestones"&gt;
  &lt;div class="col-md-4" role="listitem"&gt;
    &lt;agent-kpi label="Phase 1 dev complete" value="~12" unit="wks" delta="was ~26 wks" tone="success"&gt;
From kick-off
    &lt;/agent-kpi&gt;
  &lt;/div&gt;
  &lt;div class="col-md-4" role="listitem"&gt;
    &lt;agent-kpi label="Live Ireland" value="~15" unit="wks" delta="was ~28 wks" tone="warning"&gt;
Soft launch
    &lt;/agent-kpi&gt;
  &lt;/div&gt;
  &lt;div class="col-md-4" role="listitem"&gt;
    &lt;agent-kpi label="Phase 2 complete" value="~28" unit="wks" delta="was ~38 wks" tone="primary"&gt;
Full delivery
    &lt;/agent-kpi&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
    </div>
  </div>
</div>

**Supported tones:** `primary`, `success`, `warning`, `danger`, `neutral`

---

### Copy Blocks

Use `<agent-copy-block>` for command snippets, config fragments, or code users are likely to copy.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-copy-block lang="bash" label="Render the demo">
npm run render -- --out dist/demo.html
      </agent-copy-block>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-copy-block lang="bash" label="Render the demo"&gt;
npm run render -- --out dist/demo.html
&lt;/agent-copy-block&gt;</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-copy-block lang="javascript" label="Example configuration">
const config = {
  mode: 'production',
  output: './dist'
};
      </agent-copy-block>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-copy-block lang="javascript" label="Example configuration"&gt;
const config = {
  mode: 'production',
  output: './dist'
};
&lt;/agent-copy-block&gt;</code></pre>
    </div>
  </div>
</div>

---

### Dependency Maps

Use `<agent-dependency-map>` to show what blocks what in project plans.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-dependency-map label="Feature dependencies" direction="vertical" legend="show">
        <agent-dependency id="api" label="API design" status="done" owner="Alex" priority="P0">
REST endpoints defined and reviewed.
        </agent-dependency>
        <agent-dependency id="impl" label="Implementation" status="active" blocked-by="api" owner="Jordan" priority="P0">
Building the service layer.
        </agent-dependency>
        <agent-dependency id="tests" label="Integration tests" status="blocked" blocked-by="impl" owner="Sam" priority="P1">
Waiting for service completion.
        </agent-dependency>
      </agent-dependency-map>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-dependency-map label="Feature dependencies" direction="vertical" legend="show"&gt;
  &lt;agent-dependency id="api" label="API design" status="done" owner="Alex" priority="P0"&gt;
REST endpoints defined and reviewed.
  &lt;/agent-dependency&gt;
  &lt;agent-dependency id="impl" label="Implementation" status="active" blocked-by="api" owner="Jordan" priority="P0"&gt;
Building the service layer.
  &lt;/agent-dependency&gt;
  &lt;agent-dependency id="tests" label="Integration tests" status="blocked" blocked-by="impl" owner="Sam" priority="P1"&gt;
Waiting for service completion.
  &lt;/agent-dependency&gt;
&lt;/agent-dependency-map&gt;</code></pre>
    </div>
  </div>
</div>

**Supported statuses:** `ready`, `active`, `blocked`, `done`, `risk`

---

### Status Boards

Use `<agent-status-board>` for RAG/health rollups across workstreams.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status">
        <agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g">
CI green; render smoke passing.
        </agent-status-item>
        <agent-status-item label="Writeback" status="amber" owner="Zach" updated="tue" history="g,g,a,a">
Blocked on API boundary decision.
        </agent-status-item>
        <agent-status-item label="Docs" status="green" owner="Merlin" updated="wed" history="g,g,g,g">
Component vocabulary current.
        </agent-status-item>
      </agent-status-board>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status"&gt;
  &lt;agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g"&gt;
CI green; render smoke passing.
  &lt;/agent-status-item&gt;
  &lt;agent-status-item label="Writeback" status="amber" owner="Zach" updated="tue" history="g,g,a,a"&gt;
Blocked on API boundary decision.
  &lt;/agent-status-item&gt;
  &lt;agent-status-item label="Docs" status="green" owner="Merlin" updated="wed" history="g,g,g,g"&gt;
Component vocabulary current.
  &lt;/agent-status-item&gt;
&lt;/agent-status-board&gt;</code></pre>
    </div>
  </div>
</div>

**Item statuses:** `green`, `amber`, `red`, `grey` (aliases: `g`, `a`, `r`)

---

### Tabs

Use `<agent-tabs>` for alternate views: Summary/Evidence/Fix or platform-specific instructions.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-tabs>
        <agent-tab title="macOS">
          <p>Install with Homebrew:</p>
          <pre><code>brew install agent-isles</code></pre>
        </agent-tab>
        <agent-tab title="Linux">
          <p>Install with npm:</p>
          <pre><code>npm install -g agent-isles</code></pre>
        </agent-tab>
        <agent-tab title="Windows">
          <p>Install with npm:</p>
          <pre><code>npm install -g agent-isles</code></pre>
        </agent-tab>
      </agent-tabs>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-tabs&gt;
  &lt;agent-tab title="macOS"&gt;
    &lt;p&gt;Install with Homebrew:&lt;/p&gt;
    &lt;pre&gt;&lt;code&gt;brew install agent-isles&lt;/code&gt;&lt;/pre&gt;
  &lt;/agent-tab&gt;
  &lt;agent-tab title="Linux"&gt;
    &lt;p&gt;Install with npm:&lt;/p&gt;
    &lt;pre&gt;&lt;code&gt;npm install -g agent-isles&lt;/code&gt;&lt;/pre&gt;
  &lt;/agent-tab&gt;
  &lt;agent-tab title="Windows"&gt;
    &lt;p&gt;Install with npm:&lt;/p&gt;
    &lt;pre&gt;&lt;code&gt;npm install -g agent-isles&lt;/code&gt;&lt;/pre&gt;
  &lt;/agent-tab&gt;
&lt;/agent-tabs&gt;</code></pre>
    </div>
  </div>
</div>

---

### Timelines

Use `<agent-timeline>` for chronological steps, incident logs, release phases, or execution traces.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-timeline label="Release progress">
        <agent-step status="done" label="Code review">
All PRs merged and approved.
        </agent-step>
        <agent-step status="active" label="QA testing">
Running smoke tests in staging.
        </agent-step>
        <agent-step status="pending" label="Production deploy">
Scheduled for next maintenance window.
        </agent-step>
      </agent-timeline>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-timeline label="Release progress"&gt;
  &lt;agent-step status="done" label="Code review"&gt;
All PRs merged and approved.
  &lt;/agent-step&gt;
  &lt;agent-step status="active" label="QA testing"&gt;
Running smoke tests in staging.
  &lt;/agent-step&gt;
  &lt;agent-step status="pending" label="Production deploy"&gt;
Scheduled for next maintenance window.
  &lt;/agent-step&gt;
&lt;/agent-timeline&gt;</code></pre>
    </div>
  </div>
</div>

**Step statuses:** `done`, `active`, `pending`, `failed`

---

### Gantt Charts

Use `<agent-gantt>` for project schedules with parallel work, phase lanes, milestones, and task bars.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-gantt weeks="12" milestones="6,12" label="Project schedule">
        <agent-gantt-phase label="Phase 1">
          <agent-gantt-task label="Design" start="1" end="3" tone="components" detail="Initial design phase">
Create wireframes and mockups.
          </agent-gantt-task>
          <agent-gantt-task label="Implementation" start="4" end="6" tone="components" detail="Build features">
Develop core functionality.
          </agent-gantt-task>
        </agent-gantt-phase>
        <agent-gantt-phase label="Phase 2">
          <agent-gantt-task label="Testing" start="7" end="9" tone="testing" detail="QA and verification">
Run comprehensive test suite.
          </agent-gantt-task>
          <agent-gantt-task label="Launch" start="10" end="12" tone="launch" detail="Production deployment">
Deploy to production environment.
          </agent-gantt-task>
        </agent-gantt-phase>
      </agent-gantt>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-gantt weeks="12" milestones="6,12" label="Project schedule"&gt;
  &lt;agent-gantt-phase label="Phase 1"&gt;
    &lt;agent-gantt-task label="Design" start="1" end="3" tone="components" detail="Initial design phase"&gt;
Create wireframes and mockups.
    &lt;/agent-gantt-task&gt;
    &lt;agent-gantt-task label="Implementation" start="4" end="6" tone="components" detail="Build features"&gt;
Develop core functionality.
    &lt;/agent-gantt-task&gt;
  &lt;/agent-gantt-phase&gt;
  &lt;agent-gantt-phase label="Phase 2"&gt;
    &lt;agent-gantt-task label="Testing" start="7" end="9" tone="testing" detail="QA and verification"&gt;
Run comprehensive test suite.
    &lt;/agent-gantt-task&gt;
    &lt;agent-gantt-task label="Launch" start="10" end="12" tone="launch" detail="Production deployment"&gt;
Deploy to production environment.
    &lt;/agent-gantt-task&gt;
  &lt;/agent-gantt-phase&gt;
&lt;/agent-gantt&gt;</code></pre>
    </div>
  </div>
</div>

**Task tones:** `components`, `testing`, `validation`, `launch`, `risk`

---

### Action Lists

Use `<agent-action-list>` for follow-ups, checklists, and task tracking with ownership and status.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <agent-action-list label="Release checklist" layout="table" group-by="status">
        <agent-action owner="Dev team" status="done" priority="high">
Complete code review and merge PRs.
        </agent-action>
        <agent-action owner="QA team" status="in-progress" priority="high" due="2026-05-28">
Run regression test suite in staging.
        </agent-action>
        <agent-action owner="DevOps" status="open" priority="normal" due="2026-05-30">
Prepare production deployment scripts.
        </agent-action>
      </agent-action-list>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;agent-action-list label="Release checklist" layout="table" group-by="status"&gt;
  &lt;agent-action owner="Dev team" status="done" priority="high"&gt;
Complete code review and merge PRs.
  &lt;/agent-action&gt;
  &lt;agent-action owner="QA team" status="in-progress" priority="high" due="2026-05-28"&gt;
Run regression test suite in staging.
  &lt;/agent-action&gt;
  &lt;agent-action owner="DevOps" status="open" priority="normal" due="2026-05-30"&gt;
Prepare production deployment scripts.
  &lt;/agent-action&gt;
&lt;/agent-action-list&gt;</code></pre>
    </div>
  </div>
</div>

**Action statuses:** `open`, `in-progress`, `blocked`, `done`
**Layouts:** `table`, `kanban`, `priority`

#### Additional action list examples

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
    Review the component gallery examples.
  </agent-action>
  <agent-action owner="Reviewers" status="open" priority="normal">
    Use the source Markdown in pull requests for inspection.
  </agent-action>
  <agent-action owner="Maintainers" status="done">
    Promote repeated patterns into semantic components.
  </agent-action>
</agent-action-list>

<agent-action-list label="From standup (minimal)">
  <agent-action owner="Pix">Mirror docs to wiki.</agent-action>
  <agent-action owner="Merlin">Re-run smoke after component bundle changes.</agent-action>
  <agent-action owner="Zach" status="done">Review component gallery.</agent-action>
</agent-action-list>

<agent-action-list label="Launch follow-ups (kanban)" layout="kanban" show-done="false">
  <agent-action owner="Merlin" due="2026-05-24" priority="high" status="in-progress">
    Re-run render smoke after component bundle changes.
  </agent-action>
  <agent-action owner="Zach" due="next wk" priority="normal" status="blocked">
    Finalize component vocabulary decisions.
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
    Finalize component vocabulary decisions.
  </agent-action>
  <agent-action owner="Pix" status="done" priority="low">
    Mirror component docs to the wiki.
  </agent-action>
</agent-action-list>

---

## Multi-Phase Plans

Use tabs and timelines together to show phased project plans:

<agent-tabs>
  <agent-tab title="Phase 1 — Discover">
    <p>Map the report shape, decide which details need richer UI, and keep the source readable in Markdown.</p>
    <agent-timeline label="Discovery progress">
      <agent-step status="done" label="Renderer baseline">
        Markdown renders to a complete HTML page with Bootstrap, theme CSS, and component bundle.
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

---

## Status board

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

---

## Dependency Map

Use `<agent-dependency-map>` to visualize project dependencies:

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

---

## Revised Migration Schedule

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

---

## Renderer Features

### Plain Markdown with Bootstrap Classes

Agent Isles supports standard Markdown with Bootstrap 5 utility classes for simple layout needs.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <div class="alert alert-info" role="alert">
        <strong>Information:</strong> This is a Bootstrap alert using utility classes.
      </div>
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Bootstrap Card</h5>
          <p class="card-text">Cards work great for one-off layout without custom components.</p>
        </div>
      </div>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>&lt;div class="alert alert-info" role="alert"&gt;
  &lt;strong&gt;Information:&lt;/strong&gt; This is a Bootstrap alert using utility classes.
&lt;/div&gt;
&lt;div class="card"&gt;
  &lt;div class="card-body"&gt;
    &lt;h5 class="card-title"&gt;Bootstrap Card&lt;/h5&gt;
    &lt;p class="card-text"&gt;Cards work great for one-off layout without custom components.&lt;/p&gt;
  &lt;/div&gt;
&lt;/div&gt;</code></pre>
    </div>
  </div>
</div>

---

### Syntax-Highlighted Code Blocks

Fenced code blocks are automatically syntax-highlighted using Highlight.js.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}

const message = greet('Agent Isles');
console.log(message);
```

    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>```javascript
function greet(name) {
  return `Hello, ${name}!`;
}

const message = greet('Agent Isles');
console.log(message);
```</code></pre>
    </div>
  </div>
</div>

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>

```python
def calculate_sum(numbers):
    """Calculate the sum of a list of numbers."""
    return sum(numbers)

result = calculate_sum([1, 2, 3, 4, 5])
print(f"Sum: {result}")
```

    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>```python
def calculate_sum(numbers):
    """Calculate the sum of a list of numbers."""
    return sum(numbers)

result = calculate_sum([1, 2, 3, 4, 5])
print(f"Sum: {result}")
```</code></pre>
    </div>
  </div>
</div>

---

### D2 Diagram Support

D2 diagram fences render as SVG diagrams without requiring external tools.

<div class="row g-4 my-4">
  <div class="col-lg-6">
    <div class="border rounded p-3 bg-light">
      <h6 class="text-muted mb-3">Rendered Output</h6>
      <div class="d2-diagram">

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

      </div>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="border rounded p-3">
      <h6 class="text-muted mb-3">Source Markdown</h6>
      <pre><code>```d2
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
```</code></pre>
    </div>
  </div>
</div>

---

## Composition Example

Combine components and Bootstrap layout for rich reports:

<div class="card shadow-sm my-4">
  <div class="card-body">
    <h3 class="h5">Timeline comparison</h3>
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

---

## Getting Started

Render this demo locally:

```bash
npm install
npm run build
npm run render -- --out dist/demo.html
```

Then open `dist/demo.html` in your browser.

---

## Why This Matters

**Plain Markdown is the sea:** durable, portable, easy to navigate.

**Islands are the landmarks:** decisions, risks, metrics, timelines, and actions that deserve stronger shape.

Agent Isles lets agents produce both in one source file — keeping reports readable in git while rendering as polished artifacts for humans.
