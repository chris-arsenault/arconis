# Architecture

Everything runs in the browser. Static assets come from S3 and CloudFront, AWS AppSync Events
carries messages between peers, and IndexedDB keeps a copy on each device.

## Document model

Yjs holds the canonical document ([ADR-0001](adr/0001-yjs-canonical-maxgraph-projection.md)). Each
object is a map keyed by a stable identifier, with properties for kind, geometry, parent, connector
endpoints, stacking order and styles, plus a `Y.Text` label. Undo tracks local origins, so remote
edits stay independent of a participant's undo history.

- **Geometry.** Vertex positions and route and stroke points are world coordinates, and only
  maxGraph uses parent-relative geometry ([ADR-0004](adr/0004-canonical-world-geometry.md)).
  Connector `x` and `y` are relative label coordinates. Records written by older clients keep their
  legacy fields, and a frozen compatibility baseline stays separate from per-axis movement fields.
- **Files.** Exports declare world geometry; older file versions normalize during import.
- **Stacking.** Each record's `order` sets its stacking position, with its identifier breaking ties
  ([ADR-0007](adr/0007-explicit-stacking-order.md)).
- **Connectors.** A connector identifies its endpoint objects. A connector with a missing endpoint
  stays in Yjs, hidden from the graph and object list, so out-of-order updates can complete it.
- **Groups.** Parent cycles break deterministically during projection.
- **Drawings.** Strokes are graph edges with no terminals ([ADR-0009](adr/0009-strokes-as-graph-edges.md)).

## Editor

maxGraph is an editing and rendering projection of the document.

- `editor/projection.ts` applies the document to the graph behind a guard, so remote changes do not
  feed back into Yjs.
- `editor/graphChanges.ts` turns graph edits into Yjs transactions with a local origin. The resulting
  projection runs after maxGraph's model update ends, because edits made during its change
  notification are queued and never redrawn.
- `editor/rendering.ts` renders labels as escaped HTML ([ADR-0006](adr/0006-escaped-html-labels.md))
  and computes shape bounds from geometry instead of measuring each shape.
- `document/transform.ts` computes collective scale and rotation over a gesture's starting snapshot,
  and `components/SelectionFrame.tsx` drives it.

## Collaboration

Transport adapters know Yjs updates and state vectors, never graph or UI types. `AppSyncTransport`
serves deployed rooms and `LocalTransport` serves same-browser development.

- **Rooms.** Each room maps to one AppSync channel ([ADR-0002](adr/0002-appsync-events-peer-sync.md)).
- **Joining.** A peer publishes its state vector, and peers answer with the difference and their own
  vector, so both sides converge. Unanswered requests repeat for a short period, after which the
  room reports that nobody else is online. A periodic exchange repairs anything lost later.
- **Reconnecting.** Reconnecting repeats the same exchange in both directions.
- **Messages.** Updates are coalesced and split into bounded chunks that reassemble out of order,
  and publishing is batched within AppSync's limits. `collaboration/frames.ts` and
  `collaboration/provider.ts` declare the sizes and timings.
- **Presence.** Names, cursors and drag previews travel on Yjs awareness
  ([ADR-0008](adr/0008-drag-previews-on-awareness.md)).
- **Persistence.** y-indexeddb stores each room's document on the device and restores it before
  connecting.

## Limitations

- A new device needs an active peer holding the document, because AppSync Events retains nothing.
  Export a file for a portable copy.
- The browser API key is public and room codes are not enforced access control, so rooms suit
  non-sensitive work ([ADR-0003](adr/0003-anonymous-rooms-public-api-key.md)).
- Clients already open during a release need to reload to read new document fields.
