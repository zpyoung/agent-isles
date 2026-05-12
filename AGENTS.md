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

## Initial implementation target

Start from `docs/implementation-guide.md` and build the first usable vertical slice:

```bash
isles render examples/demo.md
isles watch examples/demo.md
```

The first milestone should include:

- `bin/isles.mjs` CLI entrypoint
- Markdown renderer using `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-raw`, `rehype-highlight`, `rehype-stringify`
- Lit component bundle for initial `<agent-*>` elements
- Bootstrap/theme injection
- One example Markdown document
- Basic smoke test or render test

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
