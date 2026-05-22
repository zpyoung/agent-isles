# Security modes

Agent Isles has two rendering modes. Name the boundary plainly before choosing one:

- **Trusted mode** is the default for authored, reviewable Markdown. It runs `rehype-raw` and preserves raw HTML islands, so scripts, event handlers, and other active HTML from the source can reach the rendered body. Use this only when the Markdown comes from a trusted author or a reviewed repository.
- **Sanitized mode** is for untrusted or mixed-trust Markdown. Use `--safe`, `--sanitize`, or `--mode sanitized` to remove unsafe raw HTML elements and restrict tags, attributes, and URL protocols while still allowing Markdown, Bootstrap classes/data attributes, and the current `<agent-*>` islands.

Examples:

```bash
# Trusted authoring mode, default behavior.
npm run render -- --out dist/demo.html

# Sanitized mode for untrusted Markdown.
node ./bin/isles.mjs render input.md --safe --out dist/safe.html
```

Sanitized mode applies to user-authored Markdown content. The generated HTML page still injects Agent Isles runtime assets, including Bootstrap and the component bundle.
