# Code Review Agent — Architecture & Flow

<agent-theme-toggle label="Theme"></agent-theme-toggle>

This report uses the `<agent-flow>` island to describe a code-review agent two
ways: a **C4 context diagram** for the system shape, and a **flowchart** for the
runtime decision path. Both are JSON-first — the canonical data lives in the
fenced block, so a reader can inspect or hand-edit it without leaving the source.

## System context (C4 pack)

The `c4` pack vocabulary is `person`, `softwareSystem`, `container`, and
`component`, connected by `relationship` edges.

```agent-flow
kind: c4
title: Review Agent — System Context
mode: viewer
---
{
  "version": "0.1",
  "kind": "c4",
  "title": "Review Agent — System Context",
  "nodes": {
    "dev": { "id": "dev", "type": "person", "label": "Developer" },
    "agent": { "id": "agent", "type": "softwareSystem", "label": "Review Agent" },
    "orchestrator": { "id": "orchestrator", "type": "container", "label": "Orchestrator" },
    "fetcher": { "id": "fetcher", "type": "container", "label": "Diff Fetcher" },
    "analyzer": { "id": "analyzer", "type": "component", "label": "Static Analyzer" },
    "vcs": { "id": "vcs", "type": "softwareSystem", "label": "GitHub" }
  },
  "edges": {
    "opens": { "id": "opens", "source": "dev", "target": "agent", "label": "Opens PR" },
    "coordinates": { "id": "coordinates", "source": "agent", "target": "orchestrator", "label": "Coordinates run" },
    "fetches": { "id": "fetches", "source": "orchestrator", "target": "fetcher", "label": "Requests diff" },
    "pulls": { "id": "pulls", "source": "fetcher", "target": "vcs", "label": "Pulls changes" },
    "scans": { "id": "scans", "source": "orchestrator", "target": "analyzer", "label": "Runs analysis" }
  },
  "views": {
    "context": {
      "id": "context",
      "title": "System Context",
      "nodeIds": ["dev", "agent", "orchestrator", "fetcher", "analyzer", "vcs"]
    }
  }
}
```

## Runtime decision path (flowchart pack)

The `flowchart` pack vocabulary is `start`, `process`, `decision`, and `end`,
connected by `flow` edges. This view traces what the agent does when a pull
request arrives.

```agent-flow
kind: flowchart
title: Review Agent — Decision Flow
mode: viewer
---
{
  "version": "0.1",
  "kind": "flowchart",
  "title": "Review Agent — Decision Flow",
  "nodes": {
    "open": { "id": "open", "type": "start", "label": "PR opened" },
    "fetch": { "id": "fetch", "type": "process", "label": "Fetch diff" },
    "analyze": { "id": "analyze", "type": "process", "label": "Run static analysis" },
    "found": { "id": "found", "type": "decision", "label": "Findings?" },
    "comment": { "id": "comment", "type": "process", "label": "Post review comments" },
    "request": { "id": "request", "type": "end", "label": "Request changes" },
    "approve": { "id": "approve", "type": "end", "label": "Approve PR" }
  },
  "edges": {
    "e1": { "id": "e1", "source": "open", "target": "fetch", "label": "" },
    "e2": { "id": "e2", "source": "fetch", "target": "analyze", "label": "" },
    "e3": { "id": "e3", "source": "analyze", "target": "found", "label": "" },
    "e4": { "id": "e4", "source": "found", "target": "comment", "label": "Yes" },
    "e5": { "id": "e5", "source": "comment", "target": "request", "label": "" },
    "e6": { "id": "e6", "source": "found", "target": "approve", "label": "No" }
  },
  "views": {
    "flow": {
      "id": "flow",
      "title": "Decision Flow",
      "nodeIds": ["open", "fetch", "analyze", "found", "comment", "request", "approve"]
    }
  }
}
```

## Editable variant

Set `mode="editor"` when the reader should see the palette and node inspector
instead of a read-only canvas — useful when a report invites the reader to tweak
the diagram.

```agent-flow
kind: flowchart
title: Decision Flow (editor)
mode: editor
---
{
  "version": "0.1",
  "kind": "flowchart",
  "title": "Decision Flow (editor)",
  "nodes": {
    "open": { "id": "open", "type": "start", "label": "PR opened" },
    "fetch": { "id": "fetch", "type": "process", "label": "Fetch diff" },
    "found": { "id": "found", "type": "decision", "label": "Findings?" },
    "approve": { "id": "approve", "type": "end", "label": "Approve PR" }
  },
  "edges": {
    "e1": { "id": "e1", "source": "open", "target": "fetch", "label": "" },
    "e2": { "id": "e2", "source": "fetch", "target": "found", "label": "" },
    "e3": { "id": "e3", "source": "found", "target": "approve", "label": "No" }
  },
  "views": {
    "flow": {
      "id": "flow",
      "title": "Decision Flow",
      "nodeIds": ["open", "fetch", "found", "approve"]
    }
  }
}
```
