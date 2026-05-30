# Agent Isles Writeback Contract

Agent Isles keeps static rendering inert. Source writeback is available only to an explicit localhost edit/preview server that opts into the contract below.

## Boundaries

- Static `isles render` and `isles watch` output must not expose active writeback endpoints or source metadata by default.
- Edit/preview mode may opt in by rendering with `writeback.enabled: true` and an active workspace root.
- Requests are accepted only from a localhost edit context.
- Every request is scoped to one source file under the active root and one supported component operation.
- Every request carries a source version hash and exact source range so stale or ambiguous writes fail instead of fuzzy-patching.
- Browser clients cannot submit arbitrary replacement text. The server chooses a registered operation handler for the requested operation type and that handler returns the replacement.

## Render-time metadata

A future edit/preview server can mark a supported component with the reserved opt-in attribute:

```html
<agent-decision
  id="decision-1"
  data-agent-isles-writeback-op="fixture:set-decision-state">
  Pending
</agent-decision>
```

When rendered with writeback enabled, Agent Isles strips the opt-in attribute and adds a `data-agent-isles-writeback` JSON payload to the component:

```json
{
  "contractVersion": 1,
  "sourcePath": "plan.md",
  "sourceVersion": "sha256-...",
  "target": {
    "componentId": "decision-1",
    "tagName": "agent-decision",
    "range": {
      "start": { "line": 3, "column": 1, "offset": 8 },
      "end": { "line": 3, "column": 116, "offset": 123 }
    }
  },
  "operation": { "type": "fixture:set-decision-state" }
}
```

The generated page also includes:

```html
<meta name="agent-isles-writeback-endpoint" content="/__agent-isles/writeback" />
```

That meta tag is emitted only when writeback rendering is explicitly enabled.

## Request shape

A browser client submits a structured request using the metadata plus operation payload:

```json
{
  "sourcePath": "plan.md",
  "sourceVersion": "sha256-...",
  "target": {
    "componentId": "decision-1",
    "tagName": "agent-decision",
    "range": {
      "start": { "line": 3, "column": 1, "offset": 8 },
      "end": { "line": 3, "column": 116, "offset": 123 }
    },
    "anchor": { "text": "Pending" }
  },
  "operation": {
    "type": "component-operation-token",
    "payload": { "state": "approved" }
  }
}
```

`anchor.text` is optional, but operation implementations should include it when a short exact anchor is available. It gives the server an additional conflict check before writing.

## Server validation and patching

The server-side helper in `src/writeback.mjs` enforces:

1. `editMode === true`.
2. `localhost === true`.
3. `sourcePath` resolves under the active root.
4. `sourceVersion` matches the current file content hash.
5. `operation.type` is registered in the active edit context.
6. `target.tagName` is component-scoped (`agent-*`).
7. `target.range.start.offset` and `target.range.end.offset` are valid for the current source.
8. `target.anchor.text`, when present, exactly matches the current range text.
9. The registered operation returns a string replacement.

Successful responses include the old and new source versions:

```json
{
  "ok": true,
  "sourcePath": "plan.md",
  "sourceVersion": "sha256-old",
  "nextSourceVersion": "sha256-new",
  "range": { "start": { "offset": 8 }, "end": { "offset": 123 } },
  "operation": { "type": "component-operation-token" }
}
```

Failures are structured `WritebackContractError` objects with stable `code` values such as:

- `ERR_WRITEBACK_DISABLED`
- `ERR_WRITEBACK_NON_LOCAL`
- `ERR_WRITEBACK_PATH_OUTSIDE_ROOT`
- `ERR_WRITEBACK_STALE_SOURCE`
- `ERR_WRITEBACK_UNSUPPORTED_OPERATION`
- `ERR_WRITEBACK_MALFORMED_RANGE`
- `ERR_WRITEBACK_ANCHOR_MISMATCH`

## Extension pattern

Future component writeback should add a narrow operation type rather than accepting arbitrary text replacement from the browser. Examples:

- `markdown-task:toggle` for task-list checkbox markers.
- `agent-decision:set-verdict` for a constrained verdict token.
- `agent-status-item:set-status` for a constrained status token.

Each operation handler should validate its payload, inspect the exact source range/anchor, and return only the minimal replacement required for that supported interaction.
