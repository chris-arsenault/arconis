# 0002 — Peers sync through AppSync Events with no server storage

- Status: Accepted
- Date: 2026-11-06

## Context

Hosting is AWS only, and the application should run without a custom backend where possible. Browsers
need a way to exchange Yjs updates, including giving a late joiner the document.

## Decision

Each room maps to an AppSync Events channel, and browsers publish and subscribe over WebSockets. The
service is only a message bus: peers exchange state vectors and differences, and y-indexeddb keeps each
device's copy.

## Alternatives considered

- **A custom WebSocket server such as y-websocket** — gives a natural place for persistence, but adds an
  application server to run and pay for.
- **Shared document persistence such as S3 or a database** — would let a new device recover a room with
  nobody online, at the cost of a backend, storage and access decisions. It should be proposed as its own
  architectural change if durable shared storage becomes a requirement.

## Consequences

There is no application server, and cost follows usage. A new device needs an active peer holding the
document, which is an accepted limitation. Messages must respect AppSync's event size and batch limits,
so large state is chunked. Status must distinguish waiting for a peer from being alone, because an empty
canvas alone cannot show which applies.
