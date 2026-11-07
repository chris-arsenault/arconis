# 0012 — Accounts, with workspaces encrypted before they are saved

- Status: Accepted; sign-in and the account key superseded by ADR-0015
- Date: 2026-11-07

## Context

Documents lived only in browsers, so a new device needed someone else online. The owner asked for accounts: a new Cognito pool with sign-up and required email activation, saved workspaces encrypted by the client, the
account's name replacing the one typed into a room, monitoring of accounts created, removal of accounts never activated, and DynamoDB for what Cognito does not hold.

## Decision

Arconis has its own user pool, separate from Ahara's shared one, with open sign-up and email activation. Sign-in uses SRP, so the password never leaves the browser, and it wraps a random account key at sign-in. That key encrypts each
workspace and its name before upload. A small API behind the ALB holds profiles and workspace records in DynamoDB and signs links, and the ALB validates each token against the pool. Bytes go straight between the browser and a private S3 bucket. A daily
job removes accounts not activated within a week, and publishes account counts to CloudWatch. Rooms stay usable with no account.

## Alternatives considered

- **Ahara's shared user pool** — the platform default, rejected by the owner, because it requires authenticator enrollment and has no open sign-up.

## Consequences

A forgotten password can be reset, but workspaces stay unreadable without the old one, because nothing else can open the key. The server can see account emails, display names, how many workspaces exist and their sizes. A saved copy is
a copy for one account: other people in the room do not gain it. Names shown in a room come from the sender's browser, so peers cannot verify them, and accounts do not control who can enter a room. A saved password room can be opened with the account's password alone, because the saved copy is encrypted under the account key.
