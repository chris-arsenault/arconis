# 0003 — Anonymous rooms with a public API key

- Status: Proposed
- Date: 2026-11-06

## Context

The product brief requires anonymous rooms joined by link or code, identifiers generated in the browser, and no
server-side registry. It recommends AppSync API-key access for the initial prototype.

## Decision

Browsers generate high-entropy room identifiers, and all clients use a public AppSync API key delivered in runtime
configuration.

## Alternatives considered

From the product brief:

- **Authentication** — excluded initially, along with accounts and access control.
- **Very short friendly room codes** — the brief notes these would need additional security or lookup infrastructure,
  and are not a priority.

## Consequences

The key is not a secret and room codes are not enforced access control. The brief calls this unsuitable for sensitive
documents or unrestricted public deployment without additional abuse protection. The key has an expiry, so deployments
must recur before it lapses.

ADR-0009 removed the API key along with AppSync. Rooms stay anonymous, and the relay's limits provide the abuse protection.
