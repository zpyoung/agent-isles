# Agent Isles Maintainer Playbook

This playbook is for the dedicated `agent-isles` Hermes profile and any future maintainer agent working on `zpyoung/agent-isles`.

## Source of truth

Use the planning surfaces in this order:

1. **GitHub issues** — executable work packets with acceptance criteria.
2. **Internal project plan** — live ordering/status in `docs/PROJECT_PLAN.md`.
3. **Milestones** — phase/release grouping.
4. **GitHub Wiki** — durable public context: https://github.com/zpyoung/agent-isles/wiki
5. **Repo-tracked wiki mirror** — versioned copies under `docs/wiki/`.
6. **Implementation plans** — detailed code plans on the dedicated `plans` branch under `docs/plans/`.

## Start every substantial task

```bash
git status --short --branch
gh issue list --repo zpyoung/agent-isles --state open --limit 20
```

Then read:

- `AGENTS.md`
- `docs/PROJECT_PLAN.md`
- relevant issue body
- relevant file on the `plans` branch or under `docs/wiki/`

## Creating new work

If the work is non-trivial and does not already have an issue:

1. Create a GitHub issue with:
   - `## Goal`
   - `## Scope` or `## Proposed behavior`
   - `## Acceptance criteria`
2. Add labels:
   - one `type:*`
   - one or more `area:*`
   - one `priority:*`
   - usually `status:ready`
3. Attach the appropriate milestone.
4. Attach or link relevant reference material by default: HTML references, screenshots, sketches, source examples, design notes, logs, fixtures, or other artifacts that inform the work.
5. Store reference files on a durable repo branch or utility branch and link verified raw URLs from the issue rather than relying on local chat attachments.
6. Add or reposition the issue in `docs/PROJECT_PLAN.md`.
7. If the work needs a detailed implementation plan, commit it to the dedicated `plans` branch under `docs/plans/YYYY-MM-DD-short-name.md` and link the branch URL from the tracking issue.

## Implementing code

Use TDD for production code.

Typical flow:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/issue-N-short-name
npm test
# write failing test
npm test
# implement
npm test
npm run render -- --out dist/demo.html
git status --short
git add <files>
git commit -m "feat: short description"
git push -u origin feat/issue-N-short-name
```

Prefer opening a PR for non-trivial changes. Link it with `Closes #N` or `Refs #N` as appropriate.

## Wiki handling

The actual GitHub Wiki is available at:

- https://github.com/zpyoung/agent-isles/wiki

The repo also keeps mirrored pages in `docs/wiki/` so planning context versions with code.

When updating durable context:

1. Update `docs/wiki/*.md` in the repo.
2. Push code changes normally.
3. Copy the same pages into the wiki repo when practical:

```bash
rm -rf /tmp/agent-isles-wiki
GIT_ASKPASS=/tmp/agent-isles-wiki-askpass.sh GIT_TERMINAL_PROMPT=0 \
  git clone https://github.com/zpyoung/agent-isles.wiki.git /tmp/agent-isles-wiki
cp docs/wiki/*.md /tmp/agent-isles-wiki/
git -C /tmp/agent-isles-wiki add .
git -C /tmp/agent-isles-wiki commit -m "Update Agent Isles wiki"
GIT_ASKPASS=/tmp/agent-isles-wiki-askpass.sh GIT_TERMINAL_PROMPT=0 \
  git -C /tmp/agent-isles-wiki push origin master
```

Do not print tokens. Use `gh auth token` through an askpass script if credentials are needed.

## Verification before reporting success

Always include proof:

- tests/build output,
- render smoke output for renderer/component work,
- GitHub issue URLs and `docs/PROJECT_PLAN.md` diffs for planning work,
- commit SHA or PR URL for code changes.

## Approval boundaries

Autonomous:

- branches, commits, PRs,
- issues, labels, milestones, project-plan updates,
- wiki/docs updates,
- local tests/builds.

Ask Zach first:

- npm publish,
- creating a GitHub release,
- deleting public planning artifacts,
- force-pushing shared branches,
- destructive repository settings changes.
