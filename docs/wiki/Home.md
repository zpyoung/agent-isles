# Agent Isles Wiki

**Agent Isles** renders agent-authored Markdown with small HTML component islands.

Start here:

- [Roadmap](Roadmap) — current direction, release phases, and sequencing rationale
- [Milestones](Milestones) — milestone goals, exit criteria, and linked issue groups
- [Active Project Plan](Active-Project-Plan) — lightweight current work summary
- [Decision Log](Decision-Log) — durable planning and product decisions
- [Architecture](Architecture) — how Markdown becomes browser-ready HTML
- [Component Vocabulary](Component-Vocabulary) — supported and planned `<agent-*>` islands
- [Planning System](Planning-System) — how issues, milestones, wiki pages, and technical plans fit together

## Core idea

Agents should write normal Markdown first. When richer UI helps, they can embed explicit islands like:

```html
<agent-decision verdict="go" title="Proceed">
Ship the renderer slice.
</agent-decision>
```

The renderer turns that Markdown into HTML, injects the Agent Isles theme, and loads the Lit component bundle.

## Planning surfaces

- **GitHub issues** are executable work packets with goal, scope, and acceptance criteria.
- **GitHub milestones** group issues into release phases.
- **This wiki** is the public durable project map: roadmap, milestone briefs, decisions, architecture, and planning rules.
- **The `plans` branch** holds detailed technical implementation plans under `docs/plans/` when a plan should be versioned outside `main`.
- **The repo-tracked wiki mirror** lives under `docs/wiki/` so future agents can inspect planning context locally.

The short version: **issues execute; milestones group; the wiki explains.**

## Links

- Repository: https://github.com/zpyoung/agent-isles
- Source demo Markdown: [examples/demo.md](https://github.com/zpyoung/agent-isles/blob/main/examples/demo.md)
- Published rendered demo: https://zpyoung.github.io/agent-isles/demo.html
- Issue tracker: https://github.com/zpyoung/agent-isles/issues
- Milestones: https://github.com/zpyoung/agent-isles/milestones
- Plans branch: https://github.com/zpyoung/agent-isles/tree/plans
