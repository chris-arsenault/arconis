# 0010 — Automated tests use local fixtures only

- Status: Accepted
- Date: 2026-11-07

## Context

Collaboration depends on AppSync Events, a pay-per-use service. A dependent CI job ran the browser journeys against the
deployed site and real AppSync after every deployment, which spent on a metered service from automation. The owner ruled
that real AWS services are never part of automated testing, especially pay-per-use ones.

## Decision

Automated tests and CI run only against a local Vite server and an AppSync protocol fixture. The test harness has no
setting that points it at a deployed site. Deploying remains CI's job.

## Alternatives considered

- **A deployed browser job after each release** — exercises the real service and the deployed revision, and caught a real
  offline defect, but runs on metered infrastructure from every push.
- **A scheduled or reduced live suite** — costs less, but still puts a pay-per-use service in automated testing.

## Consequences

Tests have no AWS cost, no credentials and no dependency on service availability. The fixture implements the AppSync client
protocol, so it cannot reveal a real service change, a permissions problem or a deployment fault. Those surface when
someone uses the site or runs a deliberate manual check.
