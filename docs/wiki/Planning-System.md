# Planning System

Agent Isles uses a small set of planning surfaces, each with a different job. The goal is to keep work executable without burying durable context in scattered issue comments.

## Issues are executable work packets

GitHub issues are the source of truth for work that needs doing.

Each issue should have:

- a clear goal,
- scope boundaries,
- acceptance criteria,
- labels for type, area, priority, and readiness,
- a milestone when it contributes to a release group,
- links to relevant reference material when it informs the work.

Common label families:

- `type:*` — kind of work, such as docs, feature, security, or test
- `area:*` — subsystem touched, such as renderer, components, CLI, docs, CI, or writeback
- `priority:*` — ordering signal
- `status:*` — readiness or blocking signal

## Milestones group release intent

GitHub milestones group issues into phases. They answer:

- What release or project phase is this?
- What must be true before the phase is done?
- Which issues belong together?

The wiki may summarize milestones, but issue state remains authoritative.

See [Milestones](Milestones).

## Wiki is the durable project map

The wiki holds context that should not need to be rediscovered from issue comments:

- roadmap shape and sequencing rationale,
- milestone briefs and exit criteria,
- architecture notes,
- naming and API rationale,
- security posture,
- release process once established,
- durable product and planning decisions.

The wiki may include lightweight status summaries, but it should not duplicate full issue bodies or become a second task tracker.

## Active Project Plan is a readable summary

The [Active Project Plan](Active-Project-Plan) page is a lightweight operating summary for humans and future agents. It should answer:

- What is active now?
- What is ready next?
- What is blocked?
- Which milestone or workstream does each item belong to?

Keep it concise and link back to GitHub issues for details.

If a repo-tracked `docs/PROJECT_PLAN.md` is present for internal live ordering, keep it consistent with the wiki summary rather than letting the two drift.

## Detailed implementation plans live on the plans branch

Code-adjacent technical plans belong on the dedicated `plans` branch under `docs/plans/` when they should be versioned without shipping on `main`.

Use detailed plans for:

- multi-step implementation sequences,
- dependency chains across issues,
- technical design notes that are too detailed for an issue body,
- plans that future agents may need to resume.

Issues remain the executable work packets even when a detailed plan exists.

## Rule of thumb

- Put **work to do** in issues.
- Put **release grouping** in milestones.
- Put **current operating summaries** in the wiki Active Project Plan.
- Put **why the system is shaped this way** in the wiki.
- Put **deep technical execution plans** on the `plans` branch under `docs/plans/`.

In one line: **issues execute; milestones group; the wiki explains; detailed plans version the spellwork.**
