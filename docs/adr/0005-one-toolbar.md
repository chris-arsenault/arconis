# 0005 — One toolbar instead of editing modes

- Status: Accepted
- Date: 2026-11-06

## Context

The product brief described sticky-note and diagram modes that change the active toolbar without changing the document.
The implementation had a Diagram and Ideas switch.

## Decision

One toolbar exposes every tool. The owner approved removing the switch as redundant.

## Alternatives considered

- **Diagram and Ideas modes** — the brief's original description, and the first implementation.

## Consequences

The toolbar shows every tool at all times, and all objects remain in the same document.
