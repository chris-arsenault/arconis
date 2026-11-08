# 0016 — Slides are canvas items, and a deck is the name its slides share

- Status: Proposed
- Date: 2026-11-07

## Context

The owner asked for slides: a slide is a declared viewport with specific dimensions, a deck id and a
slide number, so a room becomes a slide deck in place with no copying; a presenter mode hides the
chrome and moves between the slides of one deck with arrows; and a slide takes comments like any
other block, serving as speaker notes that can run long. The owner suggested a slide might be the
same thing as a saved view.

A saved view is a center and a zoom relative to whatever window shows it. It has no boundary to draw
or drag, nothing on the canvas to point at, and comments attach to items by id.

## Decision

A slide is an item type: a box with a fixed aspect ratio, a `deck` name and a `slide` number, drawn
as an outline with its label above it and nothing else while presenting. A deck is only the name its
slides share, with no record of its own; presenting orders a deck's slides by number, then id. A
deck's template is its slide number 0, the owner's suggestion: what it holds is projected again under
each other slide of the deck as cells of the graph alone, never items of the document, so one edit to
the template reaches every slide and the file carries it once. Presenting is local state in the browser that shows the canvas alone, fits the slide to the window,
masks everything outside it and suspends editing, while remote changes keep projecting.

## Alternatives considered

- **A slide as a saved view with dimensions, a deck and a number** — the owner's "maybe". Rejected
  because a view has no box on the canvas: placing, moving, resizing, holding, commenting, printing,
  exporting and agent access would each need new machinery that items already have.

## Consequences

Slides take part in everything items do: handles, undo, nesting, the canvas language, files, PNG
export, culling and agents' reads and writes. Like every holder, deleting a slide deletes what it
holds; slides are created behind everything and adopt nothing by themselves, so a slide drawn over
existing content leaves that content free, and only items dropped or placed on a slide move with it.
A stored number means gaps and ties are possible, so the presenter shows position in the deck rather
than the number. Comments grew to 20000 characters and a multi-line box for everyone, not only for
slides.
