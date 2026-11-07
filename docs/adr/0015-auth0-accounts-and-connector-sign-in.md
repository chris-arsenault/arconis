# 0015 — Accounts live in Ahara's Auth0 tenant, and connectors register there

- Status: Accepted
- Date: 2026-11-07
- Supersedes: ADR-0012's sign-in and account key; ADR-0013's agent sign-in

## Context

Agents are meant to be used from the claude.ai and ChatGPT web interfaces as custom connectors. Both
register themselves with the MCP endpoint's authorization server, through dynamic client registration or
client metadata documents, and ChatGPT gives each connector its own callback. Cognito supports neither
registration method, so a pool client entered by hand works for one fixed callback at most. The owner
asked for the canonical pattern rather than a home-grown one, and for the least security-sensitive code
of Arconis's own.

The owner also corrected the saved-workspace rule: only password rooms are encrypted. ADR-0012 encrypted
every saved workspace under a key derived from the account password, which made a password reset lose
ordinary rooms' saved copies too.

## Decision

Arconis's accounts live in the shared Ahara Auth0 tenant, which signs people in at `auth.ahara.io` under
the Ahara brand. Ahara-infra owns the tenant, its settings and its domain; Arconis owns its own database
connection, so its users are its own, and its applications and API. Arconis's Cognito pool federates that
connection over OIDC and is used only so AWS services keep validating AWS-issued tokens; nobody signs up
in the pool.

MCP connectors register with the tenant and sign in there directly. Registered clients are third-party:
people see a consent screen, and the only API granted to them is Arconis's MCP endpoint, which validates
the tenant's tokens for its own address.

Saved workspaces have no account key. An ordinary room's saved copy is stored as it is; a password room's
is sealed under its room key with the envelope its password opens. The sign-up limit and the removal of
accounts never activated move to the tenant: an Action holds sign-ups to the day's limit, another refuses
sign-in until the email is verified, and the daily job reads and removes users through the Management API.

## Alternatives considered

- **A Cognito client entered by hand in each connector.** The owner's Tastebase pattern. It works for
  claude.ai's fixed callback; ChatGPT's per-connector callbacks would each need adding to the pool, which
  the owner rejected as unworkable for unknown users.
- **A Cognito client per registration.** A registration endpoint that creates a pool client for each
  connector. The owner rejected it, because thousands of pool clients do not scale.
- **An OAuth proxy in the relay in front of Cognito.** The established pattern for providers without
  registration (FastMCP's OAuth proxy), built on the MCP SDK's authorization-server routes. It keeps
  Cognito, but Arconis would own consent, codes, token issuing and refresh, the security-sensitive code
  the owner wanted to avoid; FastMCP's own proxy needed a High-severity fix for a confused-deputy flaw in
  2026.
- **WorkOS AuthKit or Descope.** Both support registration natively. Neither configures MCP registration
  through Terraform, which Ahara requires; Auth0's official provider does.

## Consequences

- Connectors need only the server address. Sign-in, sign-up, activation emails and password resets are
  Auth0's pages, and the Arconis account panel has no password forms.
- A forgotten password loses nothing: no saved copy depends on it. A saved password room still needs that
  room's password, and a saved ordinary room is readable by the service, like the room itself.
- Registration is on for the whole tenant. Another Ahara product's connection and APIs stay unreachable to
  registered clients unless that product opts in.
- Cognito charges for federated monthly active users beyond its free allowance.
- Tests run against a local stand-in for the sign-in service, as ADR-0006 requires; the federation itself,
  the Actions in the tenant and consent are exercised only in the deployed service.
