# 0011 — The relay runs in an Auto Scaling group

- Status: Accepted
- Date: 2026-11-07

## Context

ADR-0009 put the relay on one instance that stopped when idle. Replacing that instance reset its usage count, because usage was read by instance, and took collaboration down. The owner
requires that replacing an instance loses nothing, including runtime stats, and that rollouts have no downtime through an Auto Scaling group at 200%.

## Decision

The relay runs in an Auto Scaling group that scales between none and one instance. Scaling to zero is how it stops, because a group replaces an instance that merely shuts down: an idle
instance removes itself and lowers the desired capacity, and the control Lambda sets the capacity to start and to enforce the limit. Rollouts launch the replacement and wait for the ALB's health
check before terminating the old instance, at a maximum of 200% and a minimum of 100%. Usage comes from CloudWatch's metrics for the group, by its fixed name.

## Alternatives considered

- **A plain instance stopped when idle** — the earlier design, following `foundry-vtt`, whose ADR-0001 rejected a group because it replaces stopped instances. Scaling to zero avoids that conflict.

## Consequences

Each start launches a new instance rather than resuming a stopped one, so the first person waits longer, and the disk costs nothing while the relay is off. During a rollout, two instances can serve at once for
up to about a minute, so people on different instances do not see each other until the old one ends and its clients reconnect and merge. Rollouts therefore cause no data loss and no gap in service, but
can briefly split a room.
