# 0004 — Canonical world geometry

- Status: Accepted
- Date: 2026-11-06

## Context

maxGraph stores child positions relative to their parent. When those values were canonical, one peer grouping
an object while another moved it merged parent-relative coordinates with a different parent, and the object
jumped.

## Decision

Vertex positions and route and stroke points are stored in world coordinates, per axis, and converted to
parent-relative geometry only at the maxGraph boundary. Connector `x` and `y` remain relative label coordinates.

## Alternatives considered

- **Parent-relative coordinates in Yjs** — match maxGraph directly, but are only meaningful alongside a specific
  parent, so concurrent reparenting and movement cannot merge correctly.
- **A migration service for existing rooms** — rewrites old records once, but requires a backend the product does
  not have.

## Consequences

Concurrent grouping and movement converge, and transforms work directly on world coordinates. Records from older
clients stay readable: a frozen compatibility baseline is kept separate from movement fields, so initializing it
cannot overwrite a peer's move. Older file versions normalize on import. Moving a group must go through native graph
geometry so its descendants move too. Clients already open need to reload to read the new fields.
