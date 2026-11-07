# 0001 — Yjs is canonical and maxGraph is a projection

- Status: Accepted
- Date: 2026-11-06

## Context

Sticky notes and diagram shapes must share one document, and multiple people edit it at once with no
authoritative server. maxGraph supplies shapes, connections, grouping and routing, but it has its own
mutable model.

## Decision

Yjs holds the canonical document, keyed by stable object identifiers. maxGraph is an editing and
rendering projection: graph edits become Yjs transactions, and document changes project back into the
graph behind a guard.

## Alternatives considered

- **maxGraph's model as the source of truth, synchronized by serialized snapshots** — simple to start,
  but concurrent edits overwrite each other and every change costs a full snapshot.
- **A custom rendering and editing layer** — avoids the two-model boundary, but recreates mature routing,
  connection and grouping behavior. It remains the fallback if the projection becomes disproportionately
  complicated; the integration has not needed it.

## Consequences

Concurrent edits to different properties merge, and labels merge as collaborative text. The projection
boundary needs care: feedback must be guarded, and edits made during maxGraph's change notification are
not redrawn, so projection runs after its update ends. Behavior maxGraph owns during a gesture stays
local until the gesture commits.
