# 0009 — Strokes as graph edges

- Status: Accepted
- Date: 2026-11-06

## Context

Freehand drawings must live in the same document as shapes and notes, and move, group and undo with them. A drawing is a
path of points rather than a box.

## Decision

A stroke is a maxGraph edge with no terminals, storing its path as source point, waypoints and target point. Strokes are
marked non-bendable, so they show no per-point handles.

## Alternatives considered

- **A custom vertex shape holding the path** — gains native resize handles and bounds, but needs a custom shape that
  rescales its points and adds shape registration to the projection.
- **A separate drawing layer** — simple to render, but creates a second model outside selection, grouping and stacking,
  against the one-document requirement.

## Consequences

Strokes reuse maxGraph's selection, movement and grouping with no custom shape. Edges have no resize handles, so the
selection frame provides scaling and rotation for drawings. Pointer samples are simplified before storage, keeping
documents and redraws small.
