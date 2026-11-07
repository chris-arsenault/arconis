# 0004 — Canonical world geometry

- Status: Proposed
- Date: 2026-11-06

## Context

Storing maxGraph's parent-relative coordinates in Yjs let one peer's grouping merge with another peer's move, and the
object jumped. An independent review reproduced this.

## Decision

Vertex positions and route and stroke points are stored in world coordinates, per axis, and converted to parent-relative
geometry only at the maxGraph boundary. Connector `x` and `y` remain relative label coordinates.

## Alternatives considered

- **Parent-relative coordinates in Yjs** — the earlier representation, which produced the defect above.

## Consequences

Records from older clients stay readable: a frozen compatibility baseline is kept separate from movement fields, so
initializing it cannot overwrite a peer's move. Older file versions normalize on import. Clients already open need to
reload to read the new fields.
