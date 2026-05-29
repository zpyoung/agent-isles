# Agent Isles Maintainer Playbook

This playbook is for the dedicated `agent-isles` Hermes profile and any future maintainer agent working on `zpyoung/agent-isles`.

## Source of truth

Use the planning surfaces in this order:

1. **GitHub issues** — executable work packets with acceptance criteria.
2. **GitHub Project** — live ordering/status: https://github.com/users/zpyoung/projects/1
3. **Milestones** — phase/release grouping.
4. **GitHub Wiki** — durable public context: https://github.com/zpyoung/agent-isles/wiki
5. **Repo-tracked wiki mirror** — versioned copies under `docs/wiki/`.
6. **Implementation plans** — detailed code plans on the dedicated `plans` branch under `docs/plans/`.

## Start every substantial task

```bash
git status --short --branch
gh issue list --repo zpyoung/agent-isles --state open --limit 20
gh project view 1 --owner zpyoung --format json --jq '{title,url,items:.items.totalCount}'
```

Then read:

- `AGENTS.md`
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
4. Add the issue to Project #1.
5. If the work needs a detailed implementation plan, commit it to the dedicated `plans` branch under `docs/plans/YYYY-MM-DD-short-name.md` and link the branch URL from the tracking issue.

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

## Merlin bridge work leases

The Agent Isles GitHub bridge uses optional Redis-backed work leases to prevent duplicate Merlin workers from claiming the same GitHub issue or PR.

Configuration:

- `MERLINBOT_WORK_LEASE_ENABLED` — defaults to enabled.
- `MERLINBOT_WORK_LEASE_REDIS_URL` or `REDIS_URL` — Redis endpoint. If neither is set, the bridge preserves prior behavior and does not create visible working markers.
- `MERLINBOT_WORK_LEASE_TTL_SECONDS` — defaults to `900` seconds.
- `MERLINBOT_WORK_LEASE_KEY_PREFIX` — defaults to `merlin:worklease:v1`.
- `MERLINBOT_WORK_LEASE_FAIL_OPEN` — defaults to false; configured Redis failures stop new work rather than risking duplicate workers.
- `MERLINBOT_WORKING_LABEL` — defaults to `merlin:working`.

Runtime semantics:

1. Before queueing a direct worker or Kanban handoff, the bridge claims `merlin:worklease:v1:{owner}/{repo}:{issue|pr}:{number}` with Redis `SET NX EX` semantics.
2. A live lease conflict is treated as duplicate active work: the bridge does not acknowledge, label, spawn, or create Kanban again.
3. After a successful claim, the bridge may add the disposable GitHub marker label (`merlin:working` by default). The Redis lease remains the source of truth; GitHub state is only a human-visible hint.
4. Direct workers carry the lease in their payload and release it in worker cleanup. Kanban handoffs release the lease and remove the marker after the handoff is recorded.
5. The bridge never writes lease metadata into GitHub comments.
6. Stale visible markers can be cleaned with:

```bash
/opt/hermes/.venv/bin/python /opt/data/profiles/agent-isles/scripts/github_merlinbot_mentions.py --reconcile-work-leases
```

The reconciler is suitable for deterministic quiet cron usage: it prints only when it removes stale markers or hits cleanup errors.

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
