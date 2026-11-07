# 0007 — Explicit stacking order

- Status: Accepted
- Date: 2026-11-07

## Context

Drawing order followed `Y.Map` iteration, which follows the order updates arrived, so overlapping objects could stack
differently in different browsers. There was also no way to choose an order.

## Decision

Each record carries a numeric `order`. Objects sort by `order`, with the identifier breaking ties, and the projection
applies that sequence to each parent's children. New objects take the next value, and a new group takes its highest
member's value.

## Alternatives considered

- **A shared `Y.Array` of identifiers** — gives a single sequence with no ties, but concurrent reordering can leave
  duplicate entries that need cleanup, and it adds a second structure to keep consistent with the object map.
- **Sorting by identifier alone** — deterministic and needs no new field, but gives no control over stacking and no
  relation to creation order.

## Consequences

Every peer draws the same stacking, and bring-to-front and send-to-back are single-property edits that merge normally.
Concurrent creations can tie, which the identifier resolves. Records from older clients have no `order` and stack by
identifier until someone reorders them.
