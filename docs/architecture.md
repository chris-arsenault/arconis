# Architecture

The editor and its document run in the browser. Static assets come from S3 and CloudFront, a small
relay on EC2 carries messages between peers and stores nothing, and IndexedDB keeps a copy on each
device.

## Document model

Yjs holds the canonical document ([ADR-0001](adr/0001-yjs-canonical-maxgraph-projection.md)). Each
object is a map keyed by a stable identifier, with properties for kind, geometry, parent, connector
endpoints, stacking order and styles, plus a `Y.Text` label. Undo tracks local origins, so remote
edits stay independent of a participant's undo history.

- **Geometry.** Vertex positions and route and stroke points are world coordinates, and only
  maxGraph uses parent-relative geometry ([ADR-0004](adr/0004-canonical-world-geometry.md)).
  Connector `x` and `y` are relative label coordinates. Records written by older clients keep their
  legacy fields, and a frozen compatibility baseline stays separate from per-axis movement fields.
- **Files.** Exports declare world geometry; older file versions normalize during import. A PNG export
  holds the same document in a compressed text chunk (`document/pngCopy.ts`), and its picture is the
  graph's draw pane rendered offscreen at an export scale (`editor/pngExport.ts`).
- **Stacking.** Each record's `order` sets its stacking position, with its identifier breaking ties,
  because `Y.Map` iteration differs between peers. Records from older clients stack by identifier
  until reordered.
- **Connectors.** A connector identifies its endpoint objects, and its style map holds any chosen
  connection points. A connector with a missing endpoint stays in Yjs, hidden from the graph, so
  out-of-order updates can complete it.
- **Containers.** Any object holds children through `parent`, and children keep world coordinates. A
  group's frame follows its members; everything else keeps its size. Parent cycles break
  deterministically during projection.
- **Topics.** Branches and references are connectors marked in their style, and a line joins them
  through an anchor object kept at its midpoint ([ADR-0010](adr/0010-topics-as-general-abilities.md)).
  `document/relations.ts` holds the tree, layout and alignment logic.
- **Icons.** An icon stores a key from the local Lucide and Simple Icons sets, resolved to an image at
  projection. Document styles can never supply an image, because peers write them.
- **Drawings.** Strokes are non-bendable graph edges with no terminals. Edges have no resize handles,
  so the selection frame scales and rotates them.

## Editor

maxGraph is an editing and rendering projection of the document.

- `editor/projection.ts` applies the document to the graph behind a guard, so remote changes do not
  feed back into Yjs.
- `editor/graphChanges.ts` turns graph edits into Yjs transactions with a local origin. The resulting
  projection runs after maxGraph's model update ends, because edits made during its change
  notification are queued and never redrawn.
- `editor/rendering.ts` renders labels as escaped HTML, the maxGraph mode that wraps text, laid out in
  screen pixels so they render at any zoom, and computes shape bounds from geometry instead of measuring
  each shape. Labels come from peers, so the escaping is a security boundary.
- `editor/culling.ts` leaves objects too small to see out of the view, and with them anything they hold
  and connectors reaching them.
- `editor/zoom.ts` holds the zoom range and everything that follows it: the snapping grid, background
  dots, stroke precision and the size of new objects.
- `document/transform.ts` computes collective scale and rotation over a gesture's starting snapshot,
  and `components/SelectionFrame.tsx` drives it.

## Collaboration

Transport adapters know Yjs updates and state vectors, never graph or UI types. `RelayTransport`
serves deployed rooms and `LocalTransport` serves same-browser development.

- **Rooms.** Each room is a set of sockets on the relay ([ADR-0009](adr/0009-relay-on-ec2.md)). A
  device-only room uses `LocalTransport` whatever the configuration, so it never reaches the relay.
- **Joining.** A join request reaches one person, who answers with the difference and their own
  holdings. The joiner then broadcasts its holdings, and anyone with more sends only that.
  Unanswered requests move to the next person for a short period, after which the room reports that
  nobody else is online.
- **Repair.** Peers periodically broadcast their holdings: a state vector plus a digest of deletions,
  because a deletion does not advance a vector. A peer replies only when the two differ, so a matching
  room exchanges nothing else.
- **Reconnecting.** Reconnecting repeats the join, and holdings showing unseen edits draw them out
  immediately in either direction.
- **Messages.** Updates are coalesced and split into bounded chunks that reassemble out of order.
  `collaboration/frames.ts` and `collaboration/provider.ts` declare the sizes and timings.
- **Presence.** Names, cursors and native move and resize previews travel on Yjs awareness, adding no
  document history; the document changes on drop. Presence coalesces to a bounded rate, and hidden
  tabs send none, so peers time them out until they are shown again. Selection-frame transforms write
  to the document at a bounded rate during the gesture, with undo merged into one step.
- **Persistence.** y-indexeddb stores each room's document on the device and restores it before
  connecting.

## Relay

`relay/relay.ts` forwards frames between a room's sockets, with no echo to the sender, and sends a
targeted frame to one person. It reads only each frame's sender, kind and target, so documents stay
opaque to it. It keeps a socket to the identity it first claimed, and bounds connections, message
rates, room traffic and how far a client may fall behind. A dropped frame heals at the next state
exchange.

**Starting.** The relay runs only when needed, and local editing never depends on it. Creating a
room, loading a room with a local copy, three separate edits by one person within an hour, and the
Start collaboration button each ask the control Lambda to start the instance. Clients decide those
triggers and the Lambda holds the limit, so a client ignoring them can only reach the same limit.
An open tab retries its socket without waking anything, and joins when someone else starts the relay.

**Stopping.** The relay stops after a period with no connections, or with connections but no
contentful update. A broadcast Yjs update is contentful, and so is a connection arriving with the
`fresh` flag, which clients set for a created room or a loaded local copy. Presence, sync exchange
and targeted replies are not. Stopping tells clients why, then exits cleanly, which shuts the
instance down. A crash restarts the process instead, and a maximum runtime catches a hung one.

**Limit.** `relay/control.ts` computes the month's spend from the instance's CloudWatch metrics, so
no client or relay report can change it. `relay/budget.ts` declares the rates and limit. At the limit
the Lambda refuses to start the instance and stops a running one, and the relay checks periodically
to close its sockets with that reason. Counting by month re-enables it automatically, and a
month-scoped SSM parameter raises the limit by hand. Each level alerts once through Ahara's alarm
topic.

## Limitations

- A new device needs an active peer holding the document, because the relay retains nothing. Export a
  file for a portable copy.
- Room codes are not enforced access control, so rooms suit non-sensitive work
  ([ADR-0003](adr/0003-anonymous-rooms-public-api-key.md)).
- The relay is one process with no redundancy, so its failure stops collaboration until it returns.
  Local editing continues and merges afterward.
- Clients already open during a release need to reload to read new document fields.
