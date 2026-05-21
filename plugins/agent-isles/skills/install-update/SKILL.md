---
name: agent-isles-install-update
description: Install or update Agent Isles in the current Claude Code project with deterministic package-manager detection and a render smoke check.
---

Use this skill when the user wants to install, update, enable, or verify Agent Isles in a project.

## Goal

Make Agent Isles work with as few manual steps as possible while keeping package mutations explicit and reviewable.

## Workflow

1. Identify the project root. Prefer the current working directory unless the user named another path.
2. Run the bundled doctor helper to detect package-manager state:
   ```bash
   node <plugin-root>/bin/isles-doctor.mjs --cwd . --json --smoke README.md
   ```
3. Read the JSON report:
   - `packageManager.manager` chooses npm, pnpm, or yarn.
   - `commands.init` is present when no `package.json` exists.
   - `commands.installOrUpdate` installs or updates `agent-isles@next` as a dev dependency.
   - `commands.smoke` renders an existing Markdown file when one was provided.
4. If the user asked you to install/update, run the recommended init/install/update commands.
5. Run a smoke check. Prefer an existing Markdown file in the project; otherwise create a tiny temporary Markdown fixture, render it, and remove it after verification if appropriate.
6. Report the package manager detected, commands run, generated HTML path, and any remaining issue.

## Safety boundaries

- Do not install globally by default.
- Do not edit generated HTML by hand.
- Do not publish npm packages or create releases.
- Keep mutations explicit: only run install/update commands when the user asked for install/update work.
- If package-manager detection conflicts with the user's instructions, follow the user's stated package manager and mention the mismatch.
