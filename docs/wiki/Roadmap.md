# Roadmap

This roadmap uses GitHub issues as executable planning units, `docs/PROJECT_PLAN.md` for sequencing, and this wiki for durable architecture/context.

## Current execution order

`docs/PROJECT_PLAN.md` is the source of truth for live status. It currently tracks the active queue across:

- Interactive Writeback: #31 and #33–#37
- Demo and Components: #26–#28, #49, and #50

Use the plan file for exact ordering, readiness, and blocker notes. This roadmap records the broader shape; the project plan records the day-to-day queue.

## Milestones

### MVP Renderer

Goal: make Agent Isles useful as a trusted Markdown-to-HTML renderer with CI guardrails.

Issues:

- [#1 MVP: harden `isles render` into the baseline renderer](https://github.com/zpyoung/agent-isles/issues/1)
- [#7 Infra: add GitHub Actions CI for build, test, and render smoke](https://github.com/zpyoung/agent-isles/issues/7)
- [#2 Feature: add `isles watch` for live Markdown rebuilds](https://github.com/zpyoung/agent-isles/issues/2)

### Demo and Components

Goal: make the public demo compelling and expand the first component vocabulary.

Issues:

- [#3 Components: implement `<agent-metric>` and `<agent-copy-block>`](https://github.com/zpyoung/agent-isles/issues/3)
- [#10 Docs: define Agent Isles component vocabulary reference](https://github.com/zpyoung/agent-isles/issues/10)
- [#5 Docs: turn `examples/demo.md` into a compelling public demo](https://github.com/zpyoung/agent-isles/issues/5)
- [#4 Components: implement tabs and timeline islands](https://github.com/zpyoung/agent-isles/issues/4)

### Release Readiness

Goal: prepare the project for external contributors and an eventual npm prerelease.

Issues:

- [#6 Security: add trusted vs sanitized rendering modes](https://github.com/zpyoung/agent-isles/issues/6)
- [#9 Test: add browser smoke test for rendered demo hydration](https://github.com/zpyoung/agent-isles/issues/9)
- [#12 Renderer: support local asset mode for offline/reliable output](https://github.com/zpyoung/agent-isles/issues/12)
- [#11 Docs: publish rendered demo via GitHub Pages](https://github.com/zpyoung/agent-isles/issues/11)
- [#8 Release: prepare npm package publishing path](https://github.com/zpyoung/agent-isles/issues/8)

## Internal project plan

Use the repo-tracked internal project plan as the live work queue:

https://github.com/zpyoung/agent-isles/blob/main/docs/PROJECT_PLAN.md

Plan fields:

- **Status** — live execution status.
- **Priority** — P0/P1/P2 execution priority.
- **Phase** — milestone-level grouping.
- **Workstream** — primary ownership area: CLI, Renderer, Components, Docs, Security, CI, or Release.

Suggested flow:

1. Keep all planned work as issues.
2. Use labels for area, type, priority, and readiness.
3. Use milestones for release grouping.
4. Use `docs/PROJECT_PLAN.md` for current ordering and execution status.
5. Keep architecture rationale in this wiki rather than burying it in issue comments.
