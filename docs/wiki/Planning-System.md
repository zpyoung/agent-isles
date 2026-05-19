# Planning System

Agent Isles uses a three-part planning system.

## Issues are executable work packets

Each issue should have:

- a clear goal,
- scope boundaries,
- acceptance criteria,
- labels for type, area, priority, and readiness,
- a milestone when it contributes to a release group.

Labels:

- `type:*` — kind of work
- `area:*` — subsystem touched
- `priority:*` — ordering signal
- `status:*` — readiness/blocking signal

## The internal project plan is the live board

`docs/PROJECT_PLAN.md` is the current operating surface:

https://github.com/zpyoung/agent-isles/blob/main/docs/PROJECT_PLAN.md

Use it to answer:

- What is ready?
- What is next?
- What is blocked?
- Which milestone are we moving toward?

Board fields:

- `Status`
- `Priority`
- `Phase`
- `Workstream`
- `Issue`
- `Notes / blocker`

## Wiki is durable context

The wiki should hold context that should not be rediscovered from issue comments:

- architecture notes,
- roadmap shape,
- naming and API rationale,
- security posture,
- release process once established.

## Rule of thumb

- Put **work to do** in issues.
- Put **work ordering** in `docs/PROJECT_PLAN.md`.
- Put **why the system is shaped this way** in the wiki.
- Put **code-adjacent technical plans** on the dedicated `plans` branch under `docs/plans/` so they stay versioned without shipping on `main`.
