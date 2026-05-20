# Roadmap

This roadmap uses GitHub issues as executable planning units, GitHub milestones for release grouping, and this wiki for durable context.

## Current focus

Agent Isles has moved past the first renderer vertical slice. The active work is now split across:

1. **Demo and Components** — expanding the component vocabulary and improving the public demo.
2. **Release Readiness** — keeping docs, security, CI, packaging, and planning surfaces coherent.
3. **Interactive Writeback** — a planned explicit localhost edit mode for safe source writeback.

See [Active Project Plan](Active-Project-Plan) for the current lightweight operating summary.

## Release phases

### [MVP Renderer](Milestones#mvp-renderer)

Goal: make Agent Isles useful as a trusted Markdown-to-HTML renderer with CI guardrails.

Representative issues:

- [#1 MVP: harden `isles render` into the baseline renderer](https://github.com/zpyoung/agent-isles/issues/1)
- [#2 Feature: add `isles watch` for live Markdown rebuilds](https://github.com/zpyoung/agent-isles/issues/2)
- [#7 Infra: add GitHub Actions CI for build, test, and render smoke](https://github.com/zpyoung/agent-isles/issues/7)

### [Demo and Components](Milestones#demo-and-components)

Goal: make the public demo compelling and expand the first component vocabulary.

Representative issues:

- [#26 Components: add focused Gantt chart island](https://github.com/zpyoung/agent-isles/issues/26)
- [#28 Components: add composable metric comparison primitives](https://github.com/zpyoung/agent-isles/issues/28)
- [#49 Components: add status board island](https://github.com/zpyoung/agent-isles/issues/49)
- [#50 Components: add action list island](https://github.com/zpyoung/agent-isles/issues/50)
- [#52 Components: add vertical dependency DAG island](https://github.com/zpyoung/agent-isles/issues/52)

### [Release Readiness](Milestones#release-readiness)

Goal: prepare the project for external contributors and an eventual npm prerelease.

Representative issues:

- [#6 Security: add trusted vs sanitized rendering modes](https://github.com/zpyoung/agent-isles/issues/6)
- [#8 Release: prepare npm package publishing path](https://github.com/zpyoung/agent-isles/issues/8)
- [#9 Test: add browser smoke test for rendered demo hydration](https://github.com/zpyoung/agent-isles/issues/9)
- [#11 Docs: publish rendered demo via GitHub Pages](https://github.com/zpyoung/agent-isles/issues/11)
- [#12 Renderer: support local asset mode for offline/reliable output](https://github.com/zpyoung/agent-isles/issues/12)
- [#63 Docs: create wiki planning spine](https://github.com/zpyoung/agent-isles/issues/63)

### [Interactive Writeback](Milestones#interactive-writeback)

Goal: add an explicit localhost edit mode that can safely patch supported interactions back to Markdown source.

Representative issues:

- [#31 Writeback: task-list writeback MVP](https://github.com/zpyoung/agent-isles/issues/31)
- [#33 Writeback 1/5: add explicit `isles edit` localhost server](https://github.com/zpyoung/agent-isles/issues/33)
- [#34 Writeback 2/5: add edit-mode task-list source metadata](https://github.com/zpyoung/agent-isles/issues/34)
- [#35 Writeback 3/5: implement task-list patcher and writeback API](https://github.com/zpyoung/agent-isles/issues/35)
- [#36 Writeback 4/5: add browser writeback client for task checkboxes](https://github.com/zpyoung/agent-isles/issues/36)
- [#37 Writeback 5/5: add browser smoke tests and documentation](https://github.com/zpyoung/agent-isles/issues/37)

## Sequencing rationale

The project sequence is intentionally conservative:

1. Establish a trustworthy Markdown-to-HTML renderer.
2. Add CI and smoke coverage before expanding behavior.
3. Improve the authoring loop and public demo.
4. Expand components where they make agent-authored Markdown more useful.
5. Treat security and source writeback as explicit boundaries, not incidental features.
6. Prepare packaging and release surfaces without publishing until explicitly approved.

## Where to update what

- Change executable scope in GitHub issues.
- Change release grouping in GitHub milestones.
- Change durable rationale and roadmap narrative in this wiki.
- Put detailed technical implementation plans on the `plans` branch under `docs/plans/`.
