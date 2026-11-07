# 0009 — Peers sync through a relay on EC2

- Status: Accepted
- Date: 2026-11-07
- Supersedes: ADR-0002

## Context

ADR-0002 moved document updates and presence through AppSync Events. AppSync bills each message per delivery, so cost grows
with the square of a room's size. Rooms need to support 5 to 15 people, budgeted for 10, with a $10 monthly limit. A rough model at
that usage put AppSync at about $80 a month with the code as it stood, and about $20 optimized. The browser key is public, so nothing in
the client can enforce a limit.

## Decision

Peers sync through a small relay process on one 1 vCPU EC2 instance behind Ahara's shared ALB. The relay forwards messages between the
sockets of a room and stores nothing, so documents remain in browsers. It runs only when needed: a page load with a local copy, creating a room,
repeated edits or a Start collaboration button start it, and it stops when idle. It refuses to run past a $10 monthly limit, re-enabled each month.

## Alternatives considered

From the owner's evaluation:

- **AppSync Events** — the earlier design, rejected on fan-out cost.
- **API Gateway WebSockets, AWS IoT Core** — bill per delivery as AppSync does.
- **Lambda with Kinesis or SQS, publishing batches to AppSync** — cheaper with SQS, but with about a second or two of delay, and Kinesis alone uses the budget.
- **Direct Kinesis from browsers with Cognito guest credentials** — very cheap, but readers share five reads per second per shard, and the enhanced fan-out that avoids
  this was not confirmed to work from browsers.
- **Fargate** — similar cost, but the owner prefers EC2 as the existing platform pattern and the more stable technology.
- **Lightsail** — includes transfer in a low flat price, rejected by the owner as too esoteric.
- **TrueNAS** — free to run, but Ahara reserves it for owner-only workloads.
- **Cloudflare Durable Objects** — excluded by the brief's AWS-only constraint.
- **WebRTC** — avoids the server for most traffic, but needs STUN, fails on blocked networks and exposes IP addresses. It remains an option for later.

## Consequences

This reverses the brief's exclusion of custom WebSocket servers. There is now one server to run and patch, with no redundancy, so a relay failure stops collaboration until it
returns while local editing continues. The first person in a session waits for it to start, estimated at about a minute. Spend no longer depends on message count, and
the relay can enforce limits per connection and room. A new device still needs an active peer holding the document.
