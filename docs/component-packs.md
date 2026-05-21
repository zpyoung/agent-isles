# Component Packs V1

Component Packs V1 lets trusted local, project, and user configuration load third-party custom elements into Agent Isles renders. V1 is deliberately local-only: npm package resolution, git sources, strict authoring validation, and richer authoring tools are V1+ follow-ups tracked from discussion #64: https://github.com/zpyoung/agent-isles/discussions/64

## Supported sources and resolution order

Agent Isles resolves packs in this deterministic order:

1. Explicit CLI packs from repeated `--pack <path>` flags.
2. Project packs from `isles.config.json` beside the Markdown input.
3. User packs from the platform Agent Isles config directory, unless `--no-user-packs` is set.

Duplicate pack paths and duplicate canonical pack owners (`name` or `name@version`) are loaded once, with the earlier source taking precedence. If two different packs claim the same custom-element tag, resolution fails so ownership stays inspectable.

Use reproducibility controls when renders must be stable:

```bash
# Fully explicit render: only this local pack is loaded.
isles render report.md --pack ./packs/demo-widget-pack --no-user-packs

# Inspect what will be loaded before rendering.
isles packs resolve report.md --pack ./packs/demo-widget-pack --no-user-packs
```

## Project and user config

`isles.config.json` currently supports a single top-level `packs` array of local paths:

```json
{
  "packs": ["./packs/demo-widget-pack"]
}
```

Relative paths in project config resolve from the directory containing the Markdown input. Relative paths in user config resolve from the user config directory.

User config paths:

- macOS: `~/Library/Application Support/agent-isles/isles.config.json`
- Windows: `%LOCALAPPDATA%\agent-isles\isles.config.json`
- Linux/Unix: `${XDG_CONFIG_HOME:-~/.config}/agent-isles/isles.config.json`

Set `--no-user-packs` for reviewable or CI renders that should not depend on a developer machine.

## Pack manifest shape

Each local pack directory contains `agent-isles.pack.json`:

```json
{
  "agentIslesPackVersion": 1,
  "name": "demo-widget-pack",
  "version": "1.0.0",
  "description": "Tiny third-party pack fixture.",
  "homepage": "https://example.com/demo-widget-pack",
  "tags": [
    {
      "name": "demo-widget",
      "attributes": ["title", "tone"]
    }
  ],
  "assets": [
    { "type": "module", "path": "demo-widget.js" },
    { "type": "style", "path": "demo-widget.css" }
  ]
}
```

Required fields:

- `agentIslesPackVersion`: currently `1`.
- `name`: lowercase stable ID, letters/digits/hyphens, starting with a letter.

Optional fields:

- `version`: used with `name` to form the canonical owner (`name@version`).
- `description`, `homepage`: metadata copied into pack diagnostics/metadata.
- `tags`: custom-element tags the pack owns. Tags must contain a hyphen and cannot use the reserved `agent-` prefix.
- `attributes`: sanitized-mode attributes allowed for that tag. Unsafe attributes such as `style`, `srcdoc`, and `on*` event handlers are ignored in sanitized mode and reported by diagnostics.
- `assets`: `module` and `style` files copied under `assets/agent-isles/packs/<safe-pack-id>/` beside the rendered HTML.

Asset paths must be relative, stay inside the pack directory, and point to files.

## Diagnostics

`isles packs resolve <file.md>` prints:

- input, project config, user config, and `--no-user-packs` state,
- resolved pack names and directories,
- whether each pack came from explicit CLI, project config, or user config,
- sanitized tag/attribute permissions,
- pack asset output paths,
- warnings for manifest permissions that sanitized mode will ignore.

Example:

```bash
isles packs resolve examples/pack-demo.md --pack examples/packs/demo-widget-pack --no-user-packs
```

## Rendering a local third-party pack

The repo includes a tiny fixture pack:

```bash
isles render examples/pack-demo.md \
  --pack examples/packs/demo-widget-pack \
  --out dist/pack-demo.html \
  --mode sanitized
```

The rendered HTML keeps the third-party `<demo-widget>` island and references copied `demo-widget.js` / `demo-widget.css` assets from the output asset directory.

## Security boundary and V1 non-goals

Component packs are trusted code. Even sanitized Markdown mode still injects pack module/style assets into the generated HTML. Only load packs from reviewed local/project/user sources.

V1 intentionally does not include:

- npm package or git source resolution,
- a full `isles packs validate <pack>` strict authoring workflow,
- remote trust policy or sandboxing,
- an authoring wizard.

Those are V1+ topics for discussion #64.
