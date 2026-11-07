# 0006 — Automated tests use local fixtures only

- Status: Accepted
- Date: 2026-11-07

## Context

A dependent CI job ran the browser journeys against the deployed site and real AppSync after every deployment. The owner
ruled that real AWS services are never part of automated testing, especially pay-per-use ones.

## Decision

Automated tests and CI run only against a local Vite server and an AppSync protocol fixture. The test harness has no setting
that points it at a deployed site. Deploying remains CI's job.

## Alternatives considered

- **The deployed browser job** — the earlier arrangement, removed by this decision.

## Consequences

Tests have no AWS cost or credentials. The fixture implements the AppSync client protocol, so it cannot reveal a real service
change, a permissions problem or a deployment fault.
