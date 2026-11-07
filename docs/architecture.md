# Architecture

The editor and its document run in the browser. Static assets come from S3 and CloudFront, a small
relay on EC2 carries messages between peers and stores nothing, and IndexedDB keeps a copy on each
device. Agents work in a room through MCP tools on the relay, which holds that room's canvas in memory
while they do.

## Document model

Yjs holds the canonical document ([ADR-0001](adr/0001-yjs-canonical-maxgraph-projection.md)), and its
items are the canvas language's items field for field ([ADR-0014](adr/0014-one-canvas-language.md)).
`document/types.ts` declares them. Each item is a map keyed by a short id people can type, holding its
type, a `Y.Text` name, a subtitle, its holder (`inside`), box, stacking order, a named style and a look
in plain terms, and by type a stencil, icon, line ends and ports, points or a picture. Named styles,
views and comments sit in maps beside the items. Undo tracks local origins, so remote edits stay
independent of a participant's undo history. Records a peer writes in an unknown shape are ignored.

- **Geometry.** Box positions and line and drawing points are world coordinates, and only maxGraph
  uses holder-relative geometry ([ADR-0004](adr/0004-canonical-world-geometry.md)). A line's `x` and
  `y` place its label.
- **Files.** A file is the whole canvas written in the canvas language, with picture bytes at the end.
  A PNG export holds the same text in a compressed text chunk (`document/pngCopy.ts`), and its picture
  is the graph's draw pane rendered offscreen at an export scale (`editor/pngExport.ts`). Opening a file
  keeps its ids where they are free.
- **Stacking.** Each item's `order` sets its stacking position, with its id breaking ties, because
  `Y.Map` iteration differs between peers.
- **Lines.** A line names the items at its ends and any ports where it attaches. A line with a missing
  end stays in Yjs, hidden from the graph, so out-of-order updates can complete it.
- **Holders.** Any item holds others through `inside`, and they keep world coordinates. A group's
  frame follows its members; everything else keeps its size. Cycles break deterministically during
  projection. A band marks a span behind the items it covers and holds nothing.
- **Topics.** Branches and references are line types, and a line joins them through an anchor node
  kept at its midpoint ([ADR-0010](adr/0010-topics-as-general-abilities.md)). `document/relations.ts`
  holds the tree, layout and alignment logic.
- **Look.** `editor/styles.ts` is the one place an item's type, named style and look become maxGraph
  styles. Icons, badges and pictures resolve to images there from local icon sets and validated hashes,
  so nothing a peer writes becomes an image address. Items made at deep zoom carry a scale.
- **Drawings.** Strokes are non-bendable graph edges with no terminals. Edges have no resize handles,
  so the selection frame scales and rotates them.

## Canvas language

`language/` reads and writes the canvas as text ([ADR-0014](adr/0014-one-canvas-language.md)), and
`language/reference.ts` is its reference, which agents receive as the MCP server's instructions.

- **Parsing.** `lexer.ts`, `cursor.ts`, `attributes.ts` and `parser.ts` turn text into statements, and
  report mistakes by line.
- **Writing.** `writer.ts` applies statements to a draft copy of the canvas (`draft.ts`) and commits the
  differences in one transaction, so a write that fails partway changes nothing. Items are placed in
  statement order: relations name items placed earlier and measure gaps between items with their labels
  (`layout.ts`, `placement.ts`); rows, columns and grids lay out their members (`arranging.ts`); frames
  fit their contents; lines and bands are settled once every item exists (`connections.ts`). Placement
  is applied once and stored as positions.
- **Printing.** `printer.ts` writes items canonically, so an unchanged item always prints the same and
  comparing printed items finds changes.
- **Sessions.** `session.ts` is one agent's work: it records each item as it last showed it, refuses
  writes that name items someone else changed since with their current state, reports others' changes
  on every call, and undoes only its own writes.

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
- **Password rooms.** A random room key encrypts every frame's contents, the local copy and picture
  bytes with AES-GCM, and the password only wraps that key, through PBKDF2. The wrapped key is an
  envelope that peers exchange unencrypted, and it replaces another only with proof of holding the
  room key. `collaboration/lockedTransport.ts` wraps any transport, and `collaboration/roomLock.ts`
  stands in for y-indexeddb. The relay still sees each frame's sender, kind and target, plus sizes and
  timing. Nothing authenticates who a keyholder is, and removing someone requires a new room, because
  changing the password does not change the key.
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
Start collaboration button each ask the control Lambda to scale its Auto Scaling group to one
([ADR-0011](adr/0011-relay-in-an-auto-scaling-group.md)). Clients decide those
triggers and the Lambda holds the limit, so a client ignoring them can only reach the same limit.
An open tab retries its socket without waking anything, and joins when someone else starts the relay.

**Stopping.** The relay stops after a period with no connections, or with connections but no
contentful update. A broadcast Yjs update is contentful, and so is a connection arriving with the
`fresh` flag, which clients set for a created room or a loaded local copy. Presence, sync exchange
and targeted replies are not. Stopping tells clients why, then exits cleanly, and the instance removes
itself from the group. A crash restarts the process instead, and a maximum runtime catches a hung one.
Nothing lives only on an instance, so clients simply reconnect when one is replaced.

**Pictures.** Picture bytes stay outside the document. The browser re-encodes a picture through a canvas
and names it by its hash, the relay checks the storage limit and signs a link fixing the key, type, size
and checksum, and the browser uploads straight to the website's bucket under `pictures/`. Objects hold
only the validated hash, marked once the bytes have reached storage, so a peer's data never becomes a
URL. Peers fetch through the website's CloudFront, verify the hash and keep the bytes in IndexedDB.

**Limit.** `relay/control.ts` computes the month's spend from the group's CloudWatch metrics, which
outlive any instance, so no client or relay report can change it and no replacement resets it.
`relay/budget.ts` declares the rates and limit. At the limit the Lambda refuses to start the relay and
scales a running one to zero, and the relay checks periodically
to close its sockets with that reason. Counting by month re-enables it automatically, and a
month-scoped SSM parameter raises the limit by hand. Each level alerts once through Ahara's alarm
topic.

**Agents.** `relay/mcpHttp.ts` serves MCP over HTTP at `/mcp` on the relay host, with the OAuth
discovery documents MCP clients need. Cognito is the authorization server: the relay accepts only access
tokens issued to the agents' app client and bound to the endpoint. Opening a room adds a peer in the
relay's memory (`relay/serverPeer.ts`) that joins like a browser, receives the canvas from someone there
and carries a language session (`relay/agentSession.ts`). Only ordinary rooms with people in them can be
opened, agent peers do not count as connections for the idle rules, and sessions unused for a while
close with their peers. `relay/mcp.ts` holds the tools: open a room, describe, read and write in the
canvas language, undo, and search icons.

## Accounts

`accounts/` is the server side, and `account/` the browser's ([ADR-0012](adr/0012-accounts-and-encrypted-workspaces.md)).
The browser wraps a random account key with the sign-in password, through the same envelope as password
rooms, stores the wrapped key on the server, and keeps the opened key in IndexedDB until sign-out. It
encrypts each workspace and its name under that key. The API behind `/api/*` checks limits and signs
S3 links, and `account/workspaceSaver.ts` merges any newer saved copy before storing, so two devices
cannot overwrite each other's work. `accounts/maintenance.ts` runs daily.

## Limitations

- A new device needs an active peer holding the document, because the relay retains nothing. Export a
  file for a portable copy.
- Agents reach only rooms someone has open, and their sessions end when the relay instance is
  replaced.
- Room codes are not enforced access control, so rooms suit non-sensitive work
  ([ADR-0003](adr/0003-anonymous-rooms-public-api-key.md)).
- The relay is one process with no redundancy, so its failure stops collaboration until it returns.
  Local editing continues and merges afterward.
- Clients already open during a release need to reload to read new document fields.
- Moving an item does not move items that were placed beside it, because relations are not kept.
