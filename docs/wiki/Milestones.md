# Milestones

Agent Isles uses GitHub milestones to group executable issues into release phases. This page gives the durable narrative for each milestone; GitHub remains authoritative for individual issue state.

Milestones: https://github.com/zpyoung/agent-isles/milestones

## MVP Renderer

**Goal:** make Agent Isles useful as a trusted Markdown-to-HTML renderer with CI guardrails.

**Status:** baseline complete; keep this milestone as historical context for the first vertical slice.

**Exit criteria:**

- `isles render` can render the demo Markdown into browser-ready HTML.
- The rendered output includes the Agent Isles theme and component bundle.
- `isles watch` supports the local authoring loop.
- CI covers build/test/render smoke for the baseline.

**Core issues:**

- [#1 MVP: harden `isles render` into the baseline renderer](https://github.com/zpyoung/agent-isles/issues/1)
- [#2 Feature: add `isles watch` for live Markdown rebuilds](https://github.com/zpyoung/agent-isles/issues/2)
- [#7 Infra: add GitHub Actions CI for build, test, and render smoke](https://github.com/zpyoung/agent-isles/issues/7)

## Demo and Components

**Goal:** make the public demo compelling and expand the first component vocabulary.

**Status:** active component expansion; several draft component ideas are intentionally kept as backlog candidates.

**Exit criteria:**

- The demo explains the product through rendered output and inspectable source Markdown.
- The first component vocabulary is documented and visually credible.
- Browser smoke coverage protects hydration behavior.
- Draft component ideas are either promoted into executable issues or deliberately left as backlog.

**Core and active issues:**

- [#3 Components: implement `<agent-metric>` and `<agent-copy-block>`](https://github.com/zpyoung/agent-isles/issues/3)
- [#4 Components: implement tabs and timeline islands](https://github.com/zpyoung/agent-isles/issues/4)
- [#5 Docs: turn `examples/demo.md` into a compelling public demo](https://github.com/zpyoung/agent-isles/issues/5)
- [#10 Docs: define Agent Isles component vocabulary reference](https://github.com/zpyoung/agent-isles/issues/10)
- [#26 Components: add focused Gantt chart island](https://github.com/zpyoung/agent-isles/issues/26)
- [#27 Components: add KPI strip island for grouped metrics](https://github.com/zpyoung/agent-isles/issues/27)
- [#28 Components: add composable metric comparison primitives](https://github.com/zpyoung/agent-isles/issues/28)
- [#49 Components: add status board island](https://github.com/zpyoung/agent-isles/issues/49)
- [#50 Components: add action list island](https://github.com/zpyoung/agent-isles/issues/50)
- [#52 Components: add vertical dependency DAG island](https://github.com/zpyoung/agent-isles/issues/52)
- Draft backlog: [#53](https://github.com/zpyoung/agent-isles/issues/53), [#54](https://github.com/zpyoung/agent-isles/issues/54), [#55](https://github.com/zpyoung/agent-isles/issues/55), [#56](https://github.com/zpyoung/agent-isles/issues/56), [#57](https://github.com/zpyoung/agent-isles/issues/57), [#58](https://github.com/zpyoung/agent-isles/issues/58), [#59](https://github.com/zpyoung/agent-isles/issues/59)

## Release Readiness

**Goal:** prepare the project for external contributors and an eventual npm prerelease.

**Status:** foundational release-readiness work is mostly complete; current remaining work is documentation/planning structure and any future release gates.

**Exit criteria:**

- Security posture is documented and reflected in renderer behavior.
- Browser smoke and local asset reliability are covered.
- npm publishing path is prepared, but actual publishing remains an approval-required action.
- The public planning/wiki surfaces are coherent enough for contributors and future agents.

**Core issues:**

- [#6 Security: add trusted vs sanitized rendering modes](https://github.com/zpyoung/agent-isles/issues/6)
- [#8 Release: prepare npm package publishing path](https://github.com/zpyoung/agent-isles/issues/8)
- [#9 Test: add browser smoke test for rendered demo hydration](https://github.com/zpyoung/agent-isles/issues/9)
- [#11 Docs: publish rendered demo via GitHub Pages](https://github.com/zpyoung/agent-isles/issues/11)
- [#12 Renderer: support local asset mode for offline/reliable output](https://github.com/zpyoung/agent-isles/issues/12)
- [#63 Docs: create wiki planning spine](https://github.com/zpyoung/agent-isles/issues/63)

## Interactive Writeback

**Goal:** add an explicit localhost edit mode that can safely patch supported interactions back to Markdown source.

**Status:** planned as an ordered feature chain; downstream work remains blocked until the initial edit server slice lands.

**Exit criteria:**

- `isles edit` starts an explicit localhost server rather than silently enabling writeback in normal render mode.
- Supported interactions include enough source metadata to patch Markdown safely.
- Browser writeback behavior is covered by smoke tests and documentation.
- Security boundaries are explicit: local-only, deliberate edit mode, constrained patch operations.

**Core issues:**

- [#31 Writeback: task-list writeback MVP](https://github.com/zpyoung/agent-isles/issues/31)
- [#33 Writeback 1/5: add explicit `isles edit` localhost server](https://github.com/zpyoung/agent-isles/issues/33)
- [#34 Writeback 2/5: add edit-mode task-list source metadata](https://github.com/zpyoung/agent-isles/issues/34)
- [#35 Writeback 3/5: implement task-list patcher and writeback API](https://github.com/zpyoung/agent-isles/issues/35)
- [#36 Writeback 4/5: add browser writeback client for task checkboxes](https://github.com/zpyoung/agent-isles/issues/36)
- [#37 Writeback 5/5: add browser smoke tests and documentation](https://github.com/zpyoung/agent-isles/issues/37)
