# 0002 — Peers sync through AppSync Events with no server storage

- Status: Proposed
- Date: 2026-11-06

## Context

The product brief requires AWS-only hosting, no application backend where avoidable, and AWS AppSync Events as the
initial transport, used as a communication bus rather than a document store.

## Decision

Each room maps to an AppSync Events channel, and browsers publish and subscribe over WebSockets. Peers exchange state
vectors and differences, and y-indexeddb keeps each device's copy.

## Alternatives considered

From the product brief:

- **Custom WebSocket servers** — listed as a non-goal.
- **S3 or hosted document persistence** — excluded from the initial implementation. The brief asks for it to be proposed
  as a separate architectural change if durable shared persistence becomes a requirement.

## Consequences

A new device needs an active peer holding the document, which the brief accepts as a limitation. Messages must respect
AppSync's event size limits, so large state is chunked.
