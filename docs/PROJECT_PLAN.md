# Agent Isles Project Plan

This is the internal, repo-tracked planning board for Agent Isles.

GitHub issues remain the executable work packets. This document replaces GitHub Project #1 as the live ordering/status surface because the active maintainer bot can create and update issues, but cannot reliably access Zach's user-scoped GitHub Projects V2 board.

## How to use this document

- Keep **work scope and acceptance criteria** in GitHub issues.
- Keep **execution order, readiness, dependencies, and project-level notes** here.
- Keep **release grouping** in GitHub milestones.
- Keep **architecture rationale and public context** in `docs/wiki/`.
- Keep **detailed implementation plans** on the dedicated `plans` branch under `docs/plans/` when a feature needs code-level handoff.

When adding substantial work:

1. Create or update a GitHub issue.
2. Apply labels: `type:*`, `area:*`, `priority:*`, and `status:*`.
3. Attach the milestone when the work belongs to a release group.
4. Attach or link relevant reference material by default: HTML references, screenshots, sketches, source examples, design notes, logs, fixtures, or other artifacts that inform the work.
5. Add or reposition the issue in this document.
6. If the issue has dependencies, mark downstream items as blocked and link the blocker.

## Board fields

| Field | Meaning |
| --- | --- |
| Status | `Ready`, `Blocked`, `In progress`, `Done`, or `Deferred`. Mirrors `status:*` labels where possible. |
| Priority | `P0`, `P1`, or `P2`. Mirrors `priority:*` labels. |
| Phase | Milestone or release group. |
| Workstream | Primary subsystem: CLI, Renderer, Components, Docs, Security, CI, Release, or Writeback. |
| Issue | GitHub issue containing the executable work packet. |
| Notes / blocker | Short planning note, dependency, or reason for ordering. |

## Current execution queue

### Ready next

| Order | Status | Priority | Phase | Workstream | Issue | Notes / blocker |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Ready | P1 | Interactive Writeback | Writeback / CLI | [#33 Writeback 1/5: add explicit `isles edit` localhost server](https://github.com/zpyoung/agent-isles/issues/33) | First executable slice for writeback MVP. |
| 2 | Ready | P1 | Interactive Writeback | Writeback | [#31 Writeback: task-list writeback MVP](https://github.com/zpyoung/agent-isles/issues/31) | Parent/tracking issue for the writeback chain. |
| 3 | Ready | P1 | Demo and Components | Components | [#26 Components: add data-driven Gantt schedule island](https://github.com/zpyoung/agent-isles/issues/26) | Highest-priority component expansion. |
| 4 | Ready | P2 | Demo and Components | Components | [#27 Components: add KPI strip island for grouped metrics](https://github.com/zpyoung/agent-isles/issues/27) | Executive-summary metric island. |
| 5 | Ready | P2 | Demo and Components | Components | [#28 Components: add comparison bar island](https://github.com/zpyoung/agent-isles/issues/28) | Comparison/reporting visual island. |
| 6 | Ready | P2 | Demo and Components | Components | [#49 Components: add status board island](https://github.com/zpyoung/agent-isles/issues/49) | RAG/workstream status board based on Zach's provided HTML reference. |
| 7 | Ready | P2 | Demo and Components | Components | [#50 Components: add action list island](https://github.com/zpyoung/agent-isles/issues/50) | Action/next-step list component. |

### Blocked / dependent

| Order | Status | Priority | Phase | Workstream | Issue | Notes / blocker |
| ---: | --- | --- | --- | --- | --- | --- |
| 8 | Blocked | P1 | Interactive Writeback | Writeback / Renderer | [#34 Writeback 2/5: add edit-mode task-list source metadata](https://github.com/zpyoung/agent-isles/issues/34) | Blocked by #33. |
| 9 | Blocked | P1 | Interactive Writeback | Writeback / Renderer / Security | [#35 Writeback 3/5: implement task-list patcher and writeback API](https://github.com/zpyoung/agent-isles/issues/35) | Blocked by #34. |
| 10 | Blocked | P1 | Interactive Writeback | Writeback / Renderer | [#36 Writeback 4/5: add browser writeback client for task checkboxes](https://github.com/zpyoung/agent-isles/issues/36) | Blocked by #35. |
| 11 | Blocked | P1 | Interactive Writeback | Writeback / Docs / CI | [#37 Writeback 5/5: add browser smoke tests and documentation](https://github.com/zpyoung/agent-isles/issues/37) | Blocked by #36. |

## Maintenance rules

- Do not use GitHub Projects V2 as a required planning dependency unless project auth is deliberately restored.
- Update this document whenever issue ordering, status, blockers, or release grouping changes.
- Prefer small, explicit issue rows over broad roadmap prose.
- Keep issue bodies authoritative for acceptance criteria; keep this file authoritative for sequence.
- If this file and GitHub labels disagree, inspect the issue and reconcile both surfaces before starting implementation.

## Useful commands

List current open issues:

```bash
gh issue list --repo zpyoung/agent-isles --state open --limit 100
```

Inspect a work packet:

```bash
gh issue view ISSUE_NUMBER --repo zpyoung/agent-isles
```

Update issue labels after moving an item here:

```bash
gh issue edit ISSUE_NUMBER --repo zpyoung/agent-isles --add-label status:ready --remove-label status:blocked
```
