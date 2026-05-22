---
name: agent-isles-component-authoring
description: Author Agent Isles Markdown with supported <agent-*> islands, readable source, and explicit security boundaries.
---

Use this skill when the user wants help writing Agent Isles Markdown, choosing components, or converting a report into semantic islands.

## Authoring principles

- Keep the Markdown source readable first. Use normal headings, prose, lists, and tables wherever they are enough.
- Use Bootstrap classes for one-off layout that does not need reusable semantics.
- Use `<agent-*>` islands for repeated report patterns: decisions, risks, metrics, dependency maps, Gantt schedules, status boards, KPIs, copy blocks, tabs, timelines, and component packs.
- Keep nested custom-element HTML blocks continuous. Blank lines inside nested custom-element structures can close CommonMark raw HTML blocks and cause later tags to render as escaped code.
- Name the trust boundary before rendering:
  - trusted mode for authored/reviewed Markdown,
  - sanitized mode for untrusted or mixed-trust Markdown.

## Useful references

- Component vocabulary: `component-vocabulary.md`
- Component packs: `component-packs.md`
- Demo source: `demo.md`
- Security modes: `security-modes.md`

## Verification

After authoring, run a render smoke check and inspect the generated HTML for component bundle/theme references plus the specific component tags you used.
