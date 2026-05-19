# Agent Isles — Agent Operating Notes

## Project identity

- **Product name:** Agent Isles
- **Package/repo name:** `agent-isles`
- **CLI command:** `isles`
- **Tagline:** Markdown seas, component islands.

## Core idea

Agent Isles renders agent-authored Markdown that may contain HTML “islands”:

1. Plain Markdown remains portable and git-friendly.
2. Simple UI can use Bootstrap classes directly.
3. Reusable rich patterns use semantic Lit Web Components, initially under the `<agent-*>` prefix.
4. The CLI renders Markdown to browser-ready HTML by injecting the component library and theme.

## Design constraints

- Keep the source format boring: Markdown + explicit HTML islands.
- Keep the renderer inspectable: unified/remark/rehype pipeline, minimal magic.
- Prefer local/offline assets for reliability once the prototype works.
- Treat raw HTML rendering as a security boundary. Do not render untrusted Markdown without a deliberate sanitization mode.
- Maintain clean separation between:
  - source Markdown format,
  - component vocabulary,
  - CLI renderer,
  - theme/assets.

## Current implementation baseline

The first usable vertical slice now exists:

```bash
isles render examples/demo.md
isles watch examples/demo.md
```

Core implementation surfaces:

- `bin/isles.mjs` CLI entrypoint
- `src/render.mjs` Markdown renderer
- `src/watch.mjs` live rebuild workflow
- `src/components/` Lit component bundle
- `src/theme/agent-theme.css` theme and layout styles
- `examples/demo.md` public demo source
- `tests/` unit and browser smoke coverage

## Naming/API preferences

- User-facing product: **Agent Isles**
- CLI verbs should be explicit: `render`, `watch`
- Keep `<agent-*>` component tags for now; do not force nautical names into the component API.
- Avoid overbranding internals. Boring module names are good where reliability matters.

## Verification standard

Before claiming success:

- Run the build/test command if present.
- Render an example Markdown file successfully.
- Verify generated HTML includes the expected component script/theme.
- If browser behavior matters, use a browser/screenshot check rather than guessing.

## Maintainer workflow

The dedicated Hermes profile for this project is `agent-isles`. For future Agent Isles work, that profile should behave as the project steward and use:

- `docs/MAINTAINER_PLAYBOOK.md` for maintainer workflow.
- GitHub issues as executable work packets.
- GitHub Project #1 as the live board: https://github.com/users/zpyoung/projects/1
- GitHub Wiki for public durable context: https://github.com/zpyoung/agent-isles/wiki
- `docs/wiki/` as the repo-tracked wiki mirror.

For non-trivial code work, prefer issue → branch → TDD → tests/render smoke → commit/PR → issue/project update.
