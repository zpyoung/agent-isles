---
name: agent-isles-render
description: Render or watch Agent Isles Markdown from Claude Code and verify the generated HTML artifact.
---

Use this skill when the user wants to render, preview, watch, or smoke-test an Agent Isles Markdown document.

## Workflow

1. Confirm the source Markdown path exists.
2. Prefer the project's installed CLI when `agent-isles` is already available in the project:
   - npm: `npm exec -- isles render <file.md> --out <file.html> --assets local`
   - pnpm: `pnpm exec isles render <file.md> --out <file.html> --assets local`
   - yarn: `yarn exec isles render <file.md> --out <file.html> --assets local`
3. If Agent Isles is not installed yet, or the user asked not to mutate dependencies, run the bundled doctor helper with `--json --smoke <file.md>` and use its `commands.oneShotRender` recommendation. It should look like:
   ```bash
   npx agent-isles@next render <file.md> --out <file.html> --assets local
   ```
   Use `agent-isles-install-update` only when the user wants Agent Isles added to the project.
4. Verify the output file exists and contains:
   - the Agent Isles theme reference,
   - the Agent Isles component bundle reference,
   - the expected body text or custom element from the source document.
5. For live editing, use:
   ```bash
   isles watch <file.md> --out <file.html>
   ```

## Rendering guidance

- Use `--assets local` for durable review artifacts or offline environments.
- Use `--mode sanitized` when rendering untrusted or mixed-trust Markdown.
- Keep generated HTML as an artifact; make source changes in Markdown.
