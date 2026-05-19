# Agent Isles Wiki

**Agent Isles** renders agent-authored Markdown with small HTML component islands.

Start here:

- [Roadmap](Roadmap) — current milestones and issue map
- [Architecture](Architecture) — how Markdown becomes browser-ready HTML
- [Component Vocabulary](Component-Vocabulary) — supported and planned `<agent-*>` islands
- [Planning System](Planning-System) — how we use issues, projects, and wiki together

## Core idea

Agents should write normal Markdown first. When richer UI helps, they can embed explicit islands like:

```html
<agent-decision verdict="go" title="Proceed">
Ship the renderer slice.
</agent-decision>
```

The renderer turns that Markdown into HTML, injects the Agent Isles theme, and loads the Lit component bundle.

## Links

- Repository: https://github.com/zpyoung/agent-isles
- Source demo Markdown: [examples/demo.md](https://github.com/zpyoung/agent-isles/blob/main/examples/demo.md)
- Published rendered demo: https://zpyoung.github.io/agent-isles/demo.html
- Project board: https://github.com/users/zpyoung/projects/1
- MVP plan: `docs/plans/2026-05-12-mvp-renderer.md`
