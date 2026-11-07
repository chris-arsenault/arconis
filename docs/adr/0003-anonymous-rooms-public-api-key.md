# 0003 — Anonymous rooms with a public API key

- Status: Accepted
- Date: 2026-11-06

## Context

People should create and join rooms with a link or code and no account. Identifiers should come from the
browser, with no server-side registry.

## Decision

Browsers generate high-entropy room identifiers, and all clients use a public AppSync API key delivered in
runtime configuration.

## Alternatives considered

- **Accounts or an authorizer** — enforce real access control, but add identity infrastructure the product
  does not otherwise need.
- **Short friendly room codes** — easier to share by voice, but guessable without additional security or a
  lookup service.

## Consequences

Joining is immediate and needs no infrastructure beyond the Events API. The key is not a secret and room codes
are not enforced access control, so rooms suit non-sensitive work and a public deployment has no dedicated abuse
protection. The key has an expiry, so deployments must recur before it lapses.
