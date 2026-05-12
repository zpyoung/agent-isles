# Agent Isles Maintainer Playbook

This playbook is for the dedicated `agent-isles` Hermes profile and any future maintainer agent working on `zpyoung/agent-isles`.

## Source of truth

Use the planning surfaces in this order:

1. **GitHub issues** — executable work packets with acceptance criteria.
2. **GitHub Project** — live ordering/status: https://github.com/users/zpyoung/projects/1
3. **Milestones** — phase/release grouping.
4. **GitHub Wiki** — durable public context: https://github.com/zpyoung/agent-isles/wiki
5. **Repo-tracked wiki mirror** — versioned copies under `docs/wiki/`.
6. **Implementation plans** — detailed code plans under `docs/plans/`.

## Start every substantial task

```bash
git status --short --branch
gh issue list --repo zpyoung/agent-isles --state open --limit 20
gh project view 1 --owner zpyoung --format json --jq '{title,url,items:.items.totalCount}'
```

Then read:

- `AGENTS.md`
- relevant issue body
- relevant file under `docs/plans/` or `docs/wiki/`

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
4. Add the issue to Project #1.
5. If the work needs a detailed implementation plan, create `docs/plans/YYYY-MM-DD-short-name.md`.

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
- GitHub issue/project/wiki URLs for planning work,
- commit SHA or PR URL for code changes.

## Approval boundaries

Autonomous:

- branches, commits, PRs,
- issues, labels, milestones, project updates,
- wiki/docs updates,
- local tests/builds.

Ask Zach first:

- npm publish,
- creating a GitHub release,
- deleting public planning artifacts,
- force-pushing shared branches,
- destructive repository settings changes.
