# 0005 — One toolbar instead of editing modes

- Status: Accepted
- Date: 2026-11-06

## Context

The product brief described sticky-note and diagram modes that change the active toolbar without changing the
document. Those modes only hid tools, and every object stayed available in both.

## Decision

One toolbar exposes every tool. The owner approved removing the Diagram and Ideas switch.

## Alternatives considered

- **Diagram and Ideas modes** — keep a shorter palette per task, but add a control that changes nothing about the
  document, and hide tools a person may want next.

## Consequences

The interface has one fewer concept, and every tool is one click away. The toolbar is longer, which matters most on
small screens.
