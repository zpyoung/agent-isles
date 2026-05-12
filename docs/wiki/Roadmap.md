# Roadmap

This roadmap uses GitHub issues as executable planning units, a GitHub Project for sequencing, and this wiki for durable architecture/context.

## Current execution order

The board is the source of truth for live status. The intended near-term sequence is:

1. [#1 MVP: harden `isles render` into the baseline renderer](https://github.com/zpyoung/agent-isles/issues/1)
2. [#7 Infra: add GitHub Actions CI for build, test, and render smoke](https://github.com/zpyoung/agent-isles/issues/7)
3. [#2 Feature: add `isles watch` for live Markdown rebuilds](https://github.com/zpyoung/agent-isles/issues/2)
4. [#6 Security: add trusted vs sanitized rendering modes](https://github.com/zpyoung/agent-isles/issues/6)
5. [#3 Components: implement `<agent-metric>` and `<agent-copy-block>`](https://github.com/zpyoung/agent-isles/issues/3)
6. [#10 Docs: define Agent Isles component vocabulary reference](https://github.com/zpyoung/agent-isles/issues/10)
7. [#5 Docs: turn `examples/demo.md` into a compelling public demo](https://github.com/zpyoung/agent-isles/issues/5)
8. [#4 Components: implement tabs and timeline islands](https://github.com/zpyoung/agent-isles/issues/4)
9. [#9 Test: add browser smoke test for rendered demo hydration](https://github.com/zpyoung/agent-isles/issues/9)
10. [#12 Renderer: support local asset mode for offline/reliable output](https://github.com/zpyoung/agent-isles/issues/12)
11. [#11 Docs: publish rendered demo via GitHub Pages](https://github.com/zpyoung/agent-isles/issues/11)
12. [#8 Release: prepare npm package publishing path](https://github.com/zpyoung/agent-isles/issues/8)

Rationale: baseline renderer first, then CI guardrails, then authoring loop, then security posture, then richer demo/component work, then release-facing polish.

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

## Project board

Use the project board as the live work queue:

https://github.com/users/zpyoung/projects/1

Board fields:

- **Status** — live execution status.
- **Priority** — P0/P1/P2 execution priority.
- **Phase** — milestone-level grouping.
- **Workstream** — primary ownership area: CLI, Renderer, Components, Docs, Security, CI, or Release.

Suggested flow:

1. Keep all planned work as issues.
2. Use labels for area, type, priority, and readiness.
3. Use milestones for release grouping.
4. Use the project board for current ordering and execution status.
5. Keep architecture rationale in this wiki rather than burying it in issue comments.
