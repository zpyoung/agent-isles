# Roadmap

This roadmap uses GitHub issues as executable planning units, a GitHub Project for sequencing, and this wiki for durable architecture/context.

## Milestones

### MVP Renderer

Goal: make Agent Isles useful as a trusted Markdown-to-HTML renderer.

Issues:

- [#1 MVP: harden `isles render` into the baseline renderer](https://github.com/zpyoung/agent-isles/issues/1)
- [#2 Feature: add `isles watch` for live Markdown rebuilds](https://github.com/zpyoung/agent-isles/issues/2)

### Demo and Components

Goal: make the public demo compelling and expand the first component vocabulary.

Issues:

- [#3 Components: implement `<agent-metric>` and `<agent-copy-block>`](https://github.com/zpyoung/agent-isles/issues/3)
- [#4 Components: implement tabs and timeline islands](https://github.com/zpyoung/agent-isles/issues/4)
- [#5 Docs: turn `examples/demo.md` into a compelling public demo](https://github.com/zpyoung/agent-isles/issues/5)

### Release Readiness

Goal: prepare the project for external contributors and an eventual npm prerelease.

Issues:

- [#6 Security: add trusted vs sanitized rendering modes](https://github.com/zpyoung/agent-isles/issues/6)
- [#7 Infra: add GitHub Actions CI for build, test, and render smoke](https://github.com/zpyoung/agent-isles/issues/7)
- [#8 Release: prepare npm package publishing path](https://github.com/zpyoung/agent-isles/issues/8)

## Project board

Use the project board as the live work queue:

https://github.com/users/zpyoung/projects/1

Suggested flow:

1. Keep all planned work as issues.
2. Use labels for area, type, priority, and readiness.
3. Use milestones for release grouping.
4. Use the project board for current ordering and execution status.
5. Keep architecture rationale in this wiki rather than burying it in issue comments.
