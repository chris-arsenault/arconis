# 0016 — Slides are canvas items, and a deck is the name its slides share

- Status: Accepted
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
deck's template is its slide number 0, the owner's suggestion: the top-level workspace items centred
within it, with what they hold, are projected again under each other slide of the deck as cells of
the graph alone, never items of the document, so one edit to the template reaches every slide and
the file carries it once.

A slide holds nothing. On 2026-11-09 the owner directed that slides are viewports, "a meta object
that follows layers hidden/shown/composition", while panels such as frames and groups hold content
on one layer. Placement never makes a slide a holder, `in <slide>` is refused, and a stored holder
that names a slide is read as the top level, so earlier rooms keep every object where it was
without a migration write. Presenting is local state in the browser that shows the canvas alone, fits the slide to the window,
masks everything outside it and suspends editing, while remote changes keep projecting.

## Alternatives considered

- **A slide as a saved view with dimensions, a deck and a number** — the owner's "maybe". Rejected
  because a view has no box on the canvas: placing, moving, resizing, holding, commenting, printing,
  exporting and agent access would each need new machinery that items already have.

## Consequences

Slides take part in everything items do except holding: handles, undo, the canvas language, files,
PNG export, culling and agents' reads and writes. Slides are created behind everything; moving or
deleting one changes only the viewport, and content that should travel with a slide goes in a frame
or group placed over it. Content parked within a template's area repeats on every slide of its deck.
A stored number means gaps and ties are possible, so the presenter shows position in the deck rather
than the number. Comments grew to 20000 characters and a multi-line box for everyone, not only for
slides.
