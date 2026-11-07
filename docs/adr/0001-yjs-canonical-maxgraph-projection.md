# 0001 — Yjs is canonical and maxGraph is a projection

- Status: Proposed
- Date: 2026-11-06

## Context

Sticky notes and diagram shapes must share one document, and multiple people edit it at once with no
authoritative server. The product brief recommends maxGraph and Yjs, and asks whether maxGraph's mutable model
can integrate cleanly with shared state.

## Decision

Yjs holds the canonical document, keyed by stable object identifiers. maxGraph is an editing and rendering
projection: graph edits become Yjs transactions, and document changes project back into the graph behind a guard.

## Alternatives considered

From the product brief:

- **Synchronizing serialized canvas snapshots** — the brief requires incremental updates instead.
- **A simpler custom rendering and editing layer** — the brief allows this if the maxGraph integration becomes
  disproportionately complicated.

## Consequences

The projection boundary needs care: feedback must be guarded, and edits made during maxGraph's change notification
are not redrawn, so projection runs after its update ends.
