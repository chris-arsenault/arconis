# 0017 — Content layers are document records beneath markup

- Status: Accepted
- Date: 2026-11-09

## Context

The owner asked for layers as collections of objects that extend the existing workspace/markup split:
markup stays the top, temporary layer, and further content layers sit beneath it. A layer browser in
the style of Photoshop or GIMP creates, selects, orders, shows, hides, deletes and merges layers and
moves objects between them, and agents choose or create the layer for their work. The owner directed
that panels such as frames and groups live on one layer with their contents, that slides are viewports
outside the layers ([ADR-0016](0016-slides-are-canvas-items.md)), and that hiding a layer is local to
each browser.

maxGraph stacks a holder's contents within that holder, so contents cannot draw in a layer above a
sibling of their holder.

## Decision

A layer is a record of a name and a stacking order in the document's `layers` map, beside named
styles and views, and inside the same undo scope. An item names its layer in `layer`; absent means the
base layer, which always exists, is named Workspace until renamed, and needs a record only once renamed
or moved. What a holder holds is in its outermost holder's layer whatever it names itself, and an item
leaving its holders keeps the layer it was in. Markup keeps its existing flag and draws above every
layer; slides draw beneath every layer and ignore layer visibility.

The projection draws slides, then each layer bottom to top, then markup, keeping item order within a
layer, on maxGraph's single default parent. Hiding layers and choosing the layer for new objects are
local view state. A hidden layer's items, their contents and lines into them leave that person's
graph, and picture exports cover what that person sees. Canvas files carry every layer.

Merging moves a layer's items onto the top of the target layer, keeping their order, and removes the
record. Deleting a layer removes its items with the shared deletion closure. The base layer cannot be
merged away or deleted. The canvas language declares layers with `layer <id> "Name" above|below <id>`,
merges with `merge <id> into <id>`, deletes with `delete layer <id>`, and assigns items with
`in-layer <id>`; bare `layer` is not an item attribute because canvases already use it as a style name.
Layer statements keep last-write-wins semantics, as named styles do.

## Alternatives considered

- **maxGraph layers**, which maxGraph offers as extra children of its root cell. Not used: holders,
  culling, mutation capture and export all assume one default parent.

## Consequences

Older canvases open as one base layer with their stacking unchanged. Moving a holder to another layer
moves its contents; a held item cannot change layer on its own. An item naming a layer a peer deleted
draws and prints in the base layer. Two participants can see different layers of the same room, and
their PNG and SVG exports differ accordingly.
