# 0019 — Ahara accounts are shared; application permissions and data remain separate

- Status: Accepted
- Date: 2026-11-13
- Supersedes: ADR-0015's product-owned database and deletion of the Auth0 user

## Context

The owner requested shared accounts for future Ahara applications after reviewing how tenants,
connections and applications relate. A shared tenant with one database per product still gives
people separate credentials. Arconis also managed the entire connection's enabled-client list
and deleted Auth0 users when deleting an Arconis account; both behaviors conflict with sharing.

## Decision

Ahara-infra owns one shared database connection and its verified-email rule. It adopts the
existing connection and Action through Terraform remove/import declarations. The connection
keeps its internal name, `arconis`, to preserve existing credentials, subjects and integrations;
its display name is Ahara. Use existing records directly. The owner excludes data migration,
backwards-compatibility mappers and facades.

Products own their applications, audiences and grants, and enable clients with additive
`auth0_connection_client` associations. New consumers read the connection ID/name from
`/ahara/auth0/connection-id` and `/ahara/auth0/connection-name`. Arconis looks up the same
connection directly so its ownership-detachment deployment can precede platform adoption.
Browser authorization explicitly names the configured connection; MCP clients use the shared
domain-level connection. An API's audience and client grants still determine its token access.

Shared credentials do not share application files or room access. Arconis data deletion retains
its product-local concurrency and stale-token guard, removes only Arconis data, and never calls
the Auth0 Management API. Global account deletion belongs to the platform and is outside this
change; no new account-management portal is introduced.

Email remains from Ahara, identifies the requesting application when supplied by Auth0, and
explains the cross-application effect of a shared password reset.

## Consequences

- Future apps can opt into the same accounts without copying users or changing Arconis subjects.
- Deploy the Arconis detachment before the platform imports; neither stack destroys the objects.
- The old default database remains separate. Its misplaced accounts are not merged or recreated.
- Local fixtures validate authorization and product cleanup. Live user creation and mail-sending
  tests remain prohibited by the owner; delivery and live import plans are not inferred from tests.
