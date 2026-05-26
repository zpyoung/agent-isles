# Agent Isles Claude Code plugin

This plugin lets Claude Code install, update, render, and author Agent Isles documents from inside a project.

Version: `0.1.0-alpha.0`. The plugin version intentionally tracks the `agent-isles` npm package version.

## Install from this repository marketplace

```text
/plugin marketplace add zpyoung/agent-isles
/plugin install agent-isles@agent-isles
/reload-plugins
```

## Included skills

- `agent-isles-install-update` — detect npm/pnpm/yarn, install or update `agent-isles@next`, and run a render smoke check.
- `agent-isles-render` — render or watch Markdown and verify the generated HTML artifact.
- `agent-isles-component-authoring` — write readable Agent Isles Markdown with supported `<agent-*>` islands and explicit security-boundary guidance.

## Included helper

`bin/isles-doctor.mjs` performs deterministic package-manager detection and prints the install/update/smoke commands Claude should run. When a valid `--smoke` Markdown file is provided, the JSON output also includes `commands.oneShotRender`, an explicit `npx agent-isles@next render ...` fallback for rendering without adding Agent Isles to the target project's dependencies.

Example:

```bash
node plugins/agent-isles/bin/isles-doctor.mjs --cwd . --json --smoke README.md
```

The helper is intentionally local and explicit. It does not publish packages, install globally, or mutate projects by itself. Use `commands.oneShotRender` for one-off renders or when the user asks not to change project dependencies.
