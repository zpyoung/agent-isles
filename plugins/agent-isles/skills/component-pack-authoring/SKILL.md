---
name: agent-isles-component-pack-authoring
description: Create trusted local Agent Isles Component Packs V1 with manifests, custom-element assets, diagnostics, and render smoke verification.
---

Use this skill when the user wants to create, extend, or debug an Agent Isles component pack. Component packs are extension authoring, not ordinary report authoring: they add trusted custom elements and assets that Agent Isles injects into rendered HTML.

## Before you start

1. Prefer built-in `<agent-*>` islands or Bootstrap markup when they solve the document need. Create a pack only when the user needs reusable project-specific or third-party custom elements outside the built-in Agent Isles vocabulary.
2. Name the trust boundary plainly. Component packs are trusted code. Even `--mode sanitized` preserves declared custom-element tags/attributes and still injects pack JavaScript/CSS assets.
3. Keep V1 local-only. Do not invent npm/git pack resolution, remote fetching, sandboxing, or `isles packs validate`; those are V1+ follow-ups.
4. Read the canonical reference when available: `docs/component-packs.md`.

## Recommended directory layout

Create packs under a project-local directory so they are reviewable with the Markdown that uses them:

```txt
packs/<pack-name>/
  agent-isles.pack.json
  <element-name>.js
  <element-name>.css
```

Use lowercase hyphenated names. Pack-owned custom-element tags must contain a hyphen and must not use the reserved `agent-` prefix.

## Minimal manifest template

Each pack directory must contain `agent-isles.pack.json`:

```json
{
  "agentIslesPackVersion": 1,
  "name": "example-widget-pack",
  "version": "1.0.0",
  "description": "Project-local widgets for Agent Isles reports.",
  "tags": [
    {
      "name": "example-widget",
      "attributes": ["title", "tone"]
    }
  ],
  "assets": [
    { "type": "module", "path": "example-widget.js" },
    { "type": "style", "path": "example-widget.css" }
  ]
}
```

Manifest rules:

- `agentIslesPackVersion` is currently `1`.
- `name` is a stable lowercase ID with letters, digits, and hyphens, starting with a letter.
- `version` is optional but recommended; Agent Isles uses `name@version` as the canonical owner when present.
- `tags[].name` declares each custom element this pack owns.
- `tags[].attributes` declares sanitized-mode attributes to preserve for that tag. Do not include unsafe attributes such as `style`, `srcdoc`, or `on*` event handlers.
- `assets[].path` must be relative, stay inside the pack directory, and point to a file.

## Minimal custom element

```js
const toneClass = new Map([
  ["good", "example-widget--good"],
  ["warning", "example-widget--warning"],
  ["danger", "example-widget--danger"]
]);

class ExampleWidget extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute("title") || "Example widget";
    const tone = this.getAttribute("tone") || "good";
    const body = this.innerHTML.trim();
    this.classList.add("example-widget", toneClass.get(tone) || "example-widget--good");
    this.innerHTML = `
      <strong>${title}</strong>
      <div>${body}</div>
    `;
  }
}

customElements.define("example-widget", ExampleWidget);
```

Keep pack code boring and inspectable. Avoid network calls, global side effects, document-wide mutation, and surprising writes. If user-authored content is inserted into the DOM, treat it as already-rendered trusted/sanitized HTML from Agent Isles; do not re-parse untrusted strings into executable markup.

## Minimal CSS

```css
.example-widget {
  display: block;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  padding: 1rem;
  margin: 1rem 0;
  background: #f8fafc;
}

.example-widget--good {
  border-color: #22c55e;
}

.example-widget--warning {
  border-color: #f59e0b;
}

.example-widget--danger {
  border-color: #ef4444;
}
```

## Use the pack in Markdown

```md
# Pack smoke

<example-widget title="Pack loaded" tone="good">
This content should render inside the project-local component.
</example-widget>
```

Keep nested custom-element blocks continuous. Blank lines inside nested raw HTML structures can cause CommonMark to close the raw HTML block and escape later tags.

## Project config option

For a project-wide local pack, create `isles.config.json` beside the Markdown input:

```json
{
  "packs": ["./packs/example-widget-pack"]
}
```

Use explicit `--pack <path>` flags for one-off or CI smoke checks. Use `--no-user-packs` when reproducibility matters.

## Verification workflow

Run diagnostics before rendering:

```bash
isles packs resolve report.md --pack ./packs/example-widget-pack --no-user-packs
```

Confirm diagnostics show:

- the expected pack name and directory,
- the expected source (`explicit`, `project`, or `user`),
- the declared custom-element tag,
- sanitized-mode allowed attributes,
- copied module/style asset output paths,
- no tag ownership conflicts.

Then render a smoke artifact:

```bash
isles render report.md \
  --pack ./packs/example-widget-pack \
  --out dist/report.html \
  --mode sanitized \
  --assets local \
  --no-user-packs
```

Verify the generated HTML exists and contains:

- the custom element tag from the Markdown,
- references to the copied pack module and style assets,
- expected Agent Isles theme/component bundle references.

If the project has Agent Isles installed locally, prefer the package-manager command shape from `agent-isles-render`, for example:

```bash
npm exec -- isles render report.md --pack ./packs/example-widget-pack --out dist/report.html --assets local --no-user-packs
```

If Agent Isles is not installed and the user does not want dependency changes, use the doctor-provided `commands.oneShotRender` pattern from `agent-isles-render` and add the same pack flags.

## Failure handling

- If a render fails because two packs claim the same tag, keep the earlier source only or rename one custom element. Do not hide the conflict.
- If sanitized mode strips an attribute, add it to `tags[].attributes` only if it is safe and needed. Never allow `on*` handlers, `srcdoc`, or style injection as a convenience shortcut.
- If a pack asset is not copied, check that the manifest path is relative, inside the pack directory, and points to an existing file.
- If CI/review artifacts must be reproducible, always include `--no-user-packs` and prefer explicit `--pack` paths.

## Completion checklist

- [ ] Pack directory contains `agent-isles.pack.json` plus module/style assets.
- [ ] Manifest declares every custom element tag and sanitized-mode attribute intentionally.
- [ ] Markdown example demonstrates the pack.
- [ ] `isles packs resolve ... --no-user-packs` reports the expected pack and no conflicts.
- [ ] `isles render ... --mode sanitized --assets local --no-user-packs` succeeds.
- [ ] Generated HTML references copied pack assets and preserves the custom element.
- [ ] Security boundary is documented wherever the pack is introduced.
