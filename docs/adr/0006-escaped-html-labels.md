# 0006 — Escaped HTML labels

- Status: Accepted
- Date: 2026-11-07

## Context

Labels must wrap inside notes and shapes. maxGraph only wraps text in HTML label mode, and SVG text labels are
clipped to one line. HTML mode writes label values to the DOM as markup, and labels come from other participants in an
anonymous room.

## Decision

Render labels in maxGraph's HTML mode and escape every label in `graph.getLabel`.

## Alternatives considered

- **SVG labels with manual line breaking** — no HTML injection surface, but needs text measurement and re-breaking on
  every resize and zoom, which the browser does for free in HTML.
- **HTML labels with a sanitizer** — would allow rich text, which the product does not offer, and adds a dependency
  whose failures become cross-participant script injection.

## Consequences

Text wraps with normal browser layout, and labels are plain text only. Escaping is a security boundary: any new path
that renders a label must keep it, and a browser journey checks that markup in a label stays inert.
