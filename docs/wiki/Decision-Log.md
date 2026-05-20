# Decision Log

This page captures durable product and planning decisions for Agent Isles. It is not a meeting transcript; keep entries short, dated, and linked to issues when possible.

## 2026-05-20: Use the wiki as the durable planning spine

**Decision:** Use the GitHub Wiki for roadmap context, milestone summaries, active planning orientation, and durable decisions. Keep GitHub issues as executable work packets.

**Rationale:** The wiki is easier for humans and future agents to scan than scattered issue comments, while issues remain better for concrete work, labels, acceptance criteria, and PR linkage.

**Consequences:**

- `docs/wiki/` becomes the repo-tracked mirror of the public planning map.
- The Active Project Plan page summarizes issue state but does not replace issues.
- Planning pages need periodic refresh when labels, milestones, or sequencing materially change.

**Related issues:** [#63](https://github.com/zpyoung/agent-isles/issues/63)

## 2026-05-20: Issues execute; milestones group; the wiki explains

**Decision:** Keep the planning model intentionally split:

- issues hold goal, scope, acceptance criteria, labels, and execution state,
- milestones group issues into release phases,
- wiki pages explain roadmap, decisions, architecture, and planning rules,
- detailed technical plans live on the `plans` branch under `docs/plans/` when needed.

**Rationale:** This avoids the common failure mode where roadmap documents become stale task trackers. The wiki should make the project easier to understand, not create a parallel source of truth.

**Consequences:**

- Wiki status tables should stay lightweight.
- Issue bodies remain the place to refine executable scope.
- PR bodies should continue to close/link issues rather than closing wiki checklist items.

**Related issues:** [#63](https://github.com/zpyoung/agent-isles/issues/63)

## 2026-05-20: Treat writeback as an explicit local edit mode

**Decision:** Interactive writeback should be an explicit `isles edit` localhost workflow rather than an implicit capability in normal static renders.

**Rationale:** Agent Isles renders Markdown that may contain raw HTML islands. Any source-writing behavior crosses a higher-trust boundary and should be deliberate, local, and constrained.

**Consequences:**

- Normal render/watch output remains static and portable.
- Writeback work is tracked as an ordered issue chain under the Interactive Writeback milestone.
- Browser writeback features need explicit tests and documentation.

**Related issues:** [#31](https://github.com/zpyoung/agent-isles/issues/31), [#33](https://github.com/zpyoung/agent-isles/issues/33), [#34](https://github.com/zpyoung/agent-isles/issues/34), [#35](https://github.com/zpyoung/agent-isles/issues/35), [#36](https://github.com/zpyoung/agent-isles/issues/36), [#37](https://github.com/zpyoung/agent-isles/issues/37)

## 2026-05-20: Keep source Markdown boring and component islands explicit

**Decision:** Agent Isles source files remain normal Markdown with explicit HTML custom elements for richer islands.

**Rationale:** This keeps source files portable, inspectable, git-friendly, and natural for agents to author. Rich UI remains opt-in and visible at the source level.

**Consequences:**

- The renderer must keep raw HTML handling legible and security-conscious.
- Component tags should be semantic and sparse.
- The component vocabulary should avoid overbranded names when boring names are clearer.

**Related pages:** [Architecture](Architecture), [Component Vocabulary](Component-Vocabulary)
