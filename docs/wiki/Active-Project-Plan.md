# Active Project Plan

This page is a lightweight operating summary. GitHub issues remain authoritative for executable scope, labels, and status.

Last refreshed for issue state: 2026-05-20.

## Now

| Priority | Issue | Milestone | Workstream | Notes |
|---|---|---|---|---|
| P1 | [#26 Components: add focused Gantt chart island](https://github.com/zpyoung/agent-isles/issues/26) | Demo and Components | Components | In progress; active component implementation surface. |
| P1 | [#63 Docs: create wiki planning spine](https://github.com/zpyoung/agent-isles/issues/63) | Release Readiness | Docs | Defines wiki planning surfaces and removes stale planning assumptions. |

## Ready next

| Priority | Issue | Milestone | Workstream | Notes |
|---|---|---|---|---|
| P1 | [#31 Writeback: task-list writeback MVP](https://github.com/zpyoung/agent-isles/issues/31) | Interactive Writeback | Writeback | Parent work packet for the writeback feature chain. |
| P1 | [#33 Writeback 1/5: add explicit `isles edit` localhost server](https://github.com/zpyoung/agent-isles/issues/33) | Interactive Writeback | CLI / Writeback | First executable writeback slice. |
| P2 | [#28 Components: add composable metric comparison primitives](https://github.com/zpyoung/agent-isles/issues/28) | Demo and Components | Components | Ready component expansion work. |
| P2 | [#49 Components: add status board island](https://github.com/zpyoung/agent-isles/issues/49) | Demo and Components | Components | Ready component expansion work. |
| P2 | [#50 Components: add action list island](https://github.com/zpyoung/agent-isles/issues/50) | Demo and Components | Components | Ready component expansion work. |
| P2 | [#52 Components: add vertical dependency DAG island](https://github.com/zpyoung/agent-isles/issues/52) | Demo and Components | Components | Ready component expansion work. |

## Blocked

| Issue | Milestone | Blocker |
|---|---|---|
| [#34 Writeback 2/5: add edit-mode task-list source metadata](https://github.com/zpyoung/agent-isles/issues/34) | Interactive Writeback | Blocked behind the initial `isles edit` server slice. |
| [#35 Writeback 3/5: implement task-list patcher and writeback API](https://github.com/zpyoung/agent-isles/issues/35) | Interactive Writeback | Blocked behind source metadata and edit-mode foundation. |
| [#36 Writeback 4/5: add browser writeback client for task checkboxes](https://github.com/zpyoung/agent-isles/issues/36) | Interactive Writeback | Blocked behind patch API. |
| [#37 Writeback 5/5: add browser smoke tests and documentation](https://github.com/zpyoung/agent-isles/issues/37) | Interactive Writeback | Blocked behind writeback implementation slices. |

## Draft backlog

Draft issues are intentionally not ready for implementation. They capture useful component ideas that should be refined before work starts.

| Issue | Concept |
|---|---|
| [#53 Components: add roadmap milestone island](https://github.com/zpyoung/agent-isles/issues/53) | Milestone-oriented planning display. |
| [#54 Components: add RAID log island](https://github.com/zpyoung/agent-isles/issues/54) | Risks, assumptions, issues, and dependencies. |
| [#55 Components: add owner matrix island](https://github.com/zpyoung/agent-isles/issues/55) | Ownership and responsibility display. |
| [#56 Components: add progress meter island](https://github.com/zpyoung/agent-isles/issues/56) | Progress visualization primitive. |
| [#57 Components: add scope table island](https://github.com/zpyoung/agent-isles/issues/57) | In/out-of-scope planning table. |
| [#58 Components: add deliverable table island](https://github.com/zpyoung/agent-isles/issues/58) | Deliverables and acceptance tracking. |
| [#59 Components: add change log island](https://github.com/zpyoung/agent-isles/issues/59) | Human-readable change history block. |

## Maintenance rules

- Keep this page short enough to scan.
- Link to issues rather than duplicating their full acceptance criteria.
- Update this page when issue labels or milestone sequencing materially change.
- Use issue comments and PR comments for execution notes; use this page for orientation.
