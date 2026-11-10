# Architecture

The editor and its document run in the browser. Static assets come from S3 and CloudFront, a small
relay on EC2 carries messages between peers and stores nothing, and IndexedDB keeps a copy on each
device. Agents work in a room through MCP tools on the relay, which holds that room's canvas in memory
while they do.

User workflows are in the [documentation index](README.md). Source paths below are relative to
`frontend/src/`. The [ADR index](adr/README.md) distinguishes accepted, proposed and superseded
records; proposed records can describe implemented behavior while awaiting owner approval.
Alternatives in those records come from recorded requirements, implementations or owner decisions.

## Document model

Yjs holds the canonical document ([ADR-0001](adr/0001-yjs-canonical-maxgraph-projection.md)), and its
items are the canvas language's items field for field ([ADR-0014](adr/0014-one-canvas-language.md)).
`document/types.ts` declares them. Each item is a map keyed by a short id people can type, holding its
type, a `Y.Text` name, a subtitle, its holder (`inside`), box, stacking order, a named style and a look
in plain terms, and by type a stencil, icon, line ends and ports, points, a picture or a deck and slide
number. Every item, lines included, also carries the fields in `language/fields.ts`: `locked`,
`hidden`, `collapsed`, `tags`, `marker`, `task`, `link` and who last edited it. `CanvasDocument`
names its `author` as the editor on every write that changes an item, an agent session names
itself after each write, and opening a file keeps the editors the file names. Named styles,
views and comments sit in maps beside the items. Undo tracks local origins, so remote edits stay
independent of a participant's undo history. Records a peer writes in an unknown shape are ignored.

- **Geometry.** Box positions and line and drawing points are world coordinates, and only maxGraph
  uses holder-relative geometry ([ADR-0004](adr/0004-canonical-world-geometry.md)). A line's `x` and
  `y` place its label.
- **Files.** A file is the whole canvas written in the canvas language, with picture bytes at the end.
  `files/canvasFile.ts` supplies its model/language codec; `files/canvasFiles.ts` owns portable
  picture preparation, hash renaming and import/export sequencing. Its picture and render callbacks
  do not require a room or graph implementation. `files/download.ts` owns browser downloads.
  A PNG export holds the same text in a compressed text chunk (`document/pngCopy.ts`), and its picture
  is the graph's draw pane rendered offscreen at an export scale (`editor/pngExport.ts`). Opening a file
  keeps its ids where they are free.
- **Stacking.** Each item's `order` sets its stacking position, with its id breaking ties, because
  `Y.Map` iteration differs between peers.
- **Layers.** The `layers` map holds content layers' names and stacking orders
  ([ADR-0017](adr/0017-content-layers.md)), and an item's `layer` names its own; absent is the
  base layer. `document/layers.ts` resolves an item's layer from its outermost holder, orders
  slides, then each layer, then markup for the projection, and computes what a person's hidden
  layers take off their graph. `document/layerCommands.ts` plans create, rename, move, merge,
  delete and move-to-layer once for both the editor and `language/layerWriting.ts`.
  `CanvasDocument.patch` keeps the layer of an item leaving its holders. `editor/layerView.ts`
  holds each person's hidden layers and active layer, which `CanvasDocument.build` applies to new
  top-level objects; picture exports cover only what that person sees.
- **Lines.** A line names the items at its ends and any ports where it attaches. A line with a missing
  end stays in Yjs, hidden from the graph, so out-of-order updates can complete it.
- **Holders.** `inside` relates contents to their holder while preserving world coordinates.
  Workspace placement uses `document/capabilities.ts` to choose eligible boxes; ordinary panels hold
  ink paths, while markup stays outside workspace containment. A group's
  frame follows its members; everything else keeps its size. Cycles break deterministically during
  projection. A band marks a span behind the items it covers and holds nothing.
  `document/relations.ts` owns deletion closure over holders, line anchors and incident links.
  Document commands, language drafts and graph mutation capture apply that same policy; graph
  capture first accounts for surviving cells' new parents, so ungrouping preserves their contents.
- **Arranged frames.** A frame or group with an `arrange` keeps its members in a row, column or grid,
  in the order they sit, and sizes itself to them. Whoever edits rearranges: the writer after each
  write, and `editor/arrangements.ts` after each of a person's own edits. Arranging is deterministic
  and settles in one pass, so peers' results agree.
- **Junctions.** A junction is a node with the `junction` stencil where lines meet, which lets several
  lines share a trunk.
- **Slides.** A slide is a box item with a `deck` name and a `slide` number
  ([ADR-0016](adr/0016-slides-are-canvas-items.md)). `document/slides.ts` orders a deck's slides by
  number then id, numbers a new slide after the deck's highest, and gives it the deck's size and a
  place behind everything. A slide is a viewport and holds nothing: `document/capabilities.ts`
  excludes it from placement, the writer places a slide block's items over it at the top level,
  and `CanvasDocument` reads a stored holder that names a slide as the top level. A deck has no
  record of its own. Its slide 0 is its template: `editor/templates.ts` computes, on every
  projection, copies of the top-level workspace items centred within the template, with their
  contents, under each other slide of the deck. The copies exist only as graph cells that
  mutation capture skips and nothing can select, hold or connect to.
- **Topics.** Branches and references are line types, and a line joins them through an anchor node
  kept at its midpoint ([ADR-0010](adr/0010-topics-as-general-abilities.md)). `document/relations.ts`
  holds the tree, layout and alignment logic.
- **Look.** `document/appearance.ts` distinguishes sparse authored looks from effective semantic
  defaults, resolving named styles and item overrides for controls, preview, measurement and rendering.
  `document/capabilities.ts` owns repeated eligibility and geometry constraints. Adapter-specific
  behavior remains explicit: numeric sizing and collective transforms preserve different aspect
  policies, and authored fields still round-trip unchanged. `editor/styles.ts` translates semantic
  appearance into maxGraph styles, applying scale once. Icons, badges and pictures resolve to images
  there from local icon sets and validated hashes,
  so nothing a peer writes becomes an image address. Items made at deep zoom carry a scale.
- **Text.** The name's existing `Y.Text` contains Markdown source, including language-labelled code
  fences and LaTeX math. `text/markdown.ts` derives HTML with markdown-it, highlight.js and KaTeX;
  it accepts only a small set of attribute-free semantic tags and disables text images. Fonts,
  colors, size, spacing and nine-way alignment are box-level look properties. Files and agent tools
  carry raw multiline names in the same language, and Copy Markdown returns the exact source.
- **Drawings.** Strokes are non-bendable graph edges with no terminals. Edges have no resize handles,
  so the selection frame scales and rotates them.
  The `drawing` item remains a world-coordinate path, with optional ink geometry and markup
  membership. Ordinary frames and groups collect paths alongside other content.
  `highlight` references a target, and shared removal policy follows
  that relation. Semantic appearance resolves closed fills, stroke opacity and gradient terms.
  Language attributes, files and MCP read/write carry the same fields.
  `editor/inkCommands.ts` and `inkTransfer.ts` own drawing mutations and Undo/action
  boundaries. `drawingInput.ts` supplies local previews and completes each pointer gesture;
  `drawingEditor.ts` composes focused controls and graph selection. Visibility and the active
  destination are local application state. Draw targets the current content layer and Markup
  targets annotations; both share brushes. `drawingTools.ts` supplies tool identity to the palette,
  commands and cursor policy; `drawingPreferences.ts` stores independent local brushes and migrates
  previous preferences. Selected-path paint edits use `inkStyle.ts` without mutating those defaults.
  `cursors.ts` defines every persistent tool's native cursor or SVG, hotspot and fallback;
  `interactionCursors.ts` binds that registry once, including temporary-pan precedence over graph
  child cursors. `temporaryPan.ts` restores the suspended tool and its placement payload.
  `inkShape.ts` and the ink view adapters render editable
  paths, gradients and target outlines, including template underlays.
  Hiding annotations never deletes their graph records. CanvasFiles filters clean exports
  before printing and picture preparation; the PNG adapter applies the same choice to pixels
  and bounds, and carries SVG definitions into rasterization.
  `document/ink.ts` computes painted bounds through semantic appearance, including stroke width
  and arrowheads. `document/geometry.ts` supplies rotated
  box hit testing, and `document/inkHit.ts` supplies segment-crossing tests for erasers.
  `document/panelResize.ts` uses the shared transform policy for frames/groups with
  `scaleContents`, across graph geometry edits and `language/drawing.ts`. It scales descendants
  once, including ink, shapes, text and paint. Images and vendor icons retain their proportions.
  `document/legacyDrawing.ts` converts old Drawing holders to ordinary scalable frames without
  replacing their ids. Panels do not clip their contents.
  See the [drawing guide](drawing.md) for the user workflow.

## Canvas language

`language/` reads and writes the canvas as text ([ADR-0014](adr/0014-one-canvas-language.md)), and
`language/reference.ts` is its reference. Agents receive short entry instructions and use
`canvas_help` to discover topics and retrieve complete sections, or the whole reference. The topic
index derives from that same source, including its basic syntax and coordinate conventions.

- **Parsing.** `lexer.ts`, `cursor.ts`, `attributes.ts` and `parser.ts` turn text into statements, and
  report mistakes by line.
- **Writing.** `writer.ts` applies statements to a draft copy of the canvas (`draft.ts`) and commits the
  differences in one transaction, so a write that fails partway changes nothing. Items are placed in
  statement order: relations name items placed earlier and measure gaps between items with their labels
  (`document/layout.ts`, `language/placement.ts`); rows, columns and grids lay out their members
  (`language/arranging.ts`, with pure calculations in `document/arrangement.ts`); frames
  fit their contents; arranged frames reflow; shared fan-outs gain a junction (`junctions.ts`); lines
  and bands are settled once every item exists (`connections.ts`). Placement is applied once and
  stored as positions. Statement handler tables cover every non-conversation statement;
  `effects.ts` classifies every statement and supplies direct stale-check targets, nested traversal
  and conversation routing. Derived layout/deletion effects remain distinct from direct targets.
  `attributeRouting.ts` routes attributes to their actual interpretation passes or explicitly
  rejects/ignores them in context; adding a variant must account for these contracts.
  `drawing.ts` validates the final Draft, including existing connectors whose endpoints changed
  eligibility. Invalid transitions to markup reject the whole write. Existing scalable
  panel resizes carry their contents before normal holder placement; file declarations
  retain explicit geometry without reapplying authoring transforms.
- **Printing.** `printer.ts` writes items canonically, so an unchanged item always prints the same and
  comparing printed items finds changes. `look.ts` supplies one typed, key-complete descriptor for
  look keywords, value choices, ranges, flags and canonical print order.
- **Sessions.** `session.ts` is one agent's work: it records each item as it last showed it, refuses
  writes that name items someone else changed since with their current state, reports others' changes
  on every call, and undoes only its own writes.

## Editor

maxGraph is an editing and rendering projection of the document.

Unchanged read-only `CanvasDocument.list()` entries retain their identity across transactions;
deep Yjs item changes invalidate their entries, while reads inside transactions stay live.
Projection skips unchanged item, named-style and holder-origin inputs. Graph-origin geometry,
value, style and terminal edits capture affected cells and moved descendants; structural edits
retain the full deletion and reparenting policy. View notifications update canvas overlays and
presence independently of the editor notifications consumed by the rails and inspector.
HTML labels reuse their DOM during navigation, and geometric handles use their known bounds
without forcing SVG layout measurements. Middle-button drags use maxGraph's native pan preview.
Offscreen clipped objects retain their graph states for routing while skipping DOM painting;
unclipped labels remain rendered, and exports draw the complete requested scene. A ResizeObserver
keeps viewport dimensions available without forcing layout after a graph redraw.

- EditorController composes graph-facing behavior and exposes selection/navigation operations.
  Leaf property, Markdown, connection, slide and comment controls receive semantic data and focused
  callbacks. `editor/commands.ts` owns selection formatting, Undo/transaction boundaries and source
  editing follow-up. Topology commands plan endpoints before inserting anchors and relationships
  together; viewport navigation reads geometry without creating document items.
- `editor/history.ts` labels each undo step from the records its transaction changed and lists
  the stacks for `components/HistoryPanel.tsx`; there is no history beyond the undo stack and
  each item's last editor. `editor/touchInput.ts` chooses a tool for fingers and pens on the
  window's capture phase, before the drawing gesture sees the press. Properties travel in the
  cell style as JSON for tooltips and `{name}` placeholders (`editor/rendering.ts`). Exports in
  `editor/exportCommands.ts` reuse the PNG renderer's scene for SVG files.
- `editor/pointerButtons.ts` owns the middle and right buttons at the pointer-event level, so
  maxGraph only ever sees the left: the middle button pans, and the right button opens
  `editor/ui.ts`'s menu state, which `components/ContextMenu.tsx` draws as a ring and a list
  from `editor/contextMenu.ts`, itself read from the command table. A right drag past the dead
  zone picks a wedge by angle. Comments open through `showComments` into
  `components/CommentModal.tsx`, anchored to the cell's state above the object. Swapping kinds,
  swapping positions and the line and frame verbs live in `editor/swap.ts`; stencils made of
  ordinary items (tables of docked frames, task lists) in `editor/stencils.ts`; docked edges in
  `document/docking.ts`, applied by mutation capture; and connectors ending in space create
  their target through `editor/createTarget.ts`, whose cell carries `cloneOf` for capture.
- Trees are edited from the keyboard through `editor/walking.ts` (where an arrow goes),
  `editor/treeEdits.ts` (promote, reorder, insert a parent, delete keeping branches, connected
  copies, levels) and `editor/outline.ts` with `components/OutlinePanel.tsx`. Layout verbs live
  in `document/treeLayout.ts` (direction, compact, sorted, balanced), `editor/graphLayout.ts`
  (a layered flow through `@dagrejs/dagre`) and `editor/layoutCommands.ts`; the language's
  `tidy` takes the same words. The writer sees the lines a write has declared but not yet
  settled when it places and tidies branches, so a tree written in one go lays out as written.
- Views dim through `editor/highlighting.ts`: a focused item's closure (`focusClosure`) or the
  filter's matches (`editor/filter.ts`) stay bright, the rest draw faint. `document/shorthand.ts`
  turns `#tag`, `[]` and `:p1` typed into a label into fields when the edit finishes, and
  `editor/gather.ts` moves matching objects into a grid frame.
- `editor/viewHistory.ts` records the view before each flight in `editor/views.ts`, so Back and
  Forward retrace jumps without recording themselves. `editor/find.ts` matches items by their
  words and comments in reading order; `components/FindBar.tsx` steps through them.
- `editor/clipboard.ts` copies the selection as the canvas language with its pictures through
  the browser's copy, cut and paste events (`editor/clipboardInput.ts`), pastes language through
  the file importer with the new items centred where asked, and turns plain text into notes, a
  tree or a text block by writing language (`editor/pasteAs.ts`).
- `editor/commandTable.ts` is the one table of commands, each with a label, a group, its
  shortcuts and the rule for when it applies to the selection. `editor/registry.ts` reads it for
  key dispatch (`editor/input.ts`), the property panel's relationship actions, the ring and
  menu (`editor/contextMenu.ts`, which lays the ring out as a compass and folds families into
  submenus), the stencil rail's labels and the command palette (`components/CommandPalette.tsx`, ranked by
  `editor/paletteSearch.ts`). A shortcut keeps one meaning: the dispatcher runs the first
  available command whose shortcut matches exactly, and the registry's test refuses two
  commands with the same key.
- `editor/projection.ts` applies the document to the graph behind a guard, so remote changes do not
  feed back into Yjs. It projects `visibleItems`: hidden items, what collapsed items fold away and
  lines into either stay in the document and out of the graph, and a collapsed frame is drawn at
  its title bar's height while the document keeps its size. `editor/marks.ts` adds the fields'
  signs to labels, and `editor/styles.ts` makes locked items immovable.
- `editor/graphChanges.ts` turns graph edits into Yjs transactions with a local origin. The resulting
  projection runs after maxGraph's model update ends, because edits made during its change
  notification are queued and never redrawn.
- `editor/rendering.ts` renders labels as safe Markdown-derived HTML, the maxGraph mode that wraps text, laid out in
  screen pixels so they render at any zoom, and computes shape bounds from geometry instead of measuring
  each shape. Labels come from peers, so escaping and the semantic-tag allowlist are a security boundary.
  Markdown is parsed only when a label's source changes; zoom reuses its derived markup. PNG export
  embeds the matching Markdown/math CSS and required bundled font subsets before SVG rasterization.
- A line's type, cornered, diagonal or curved, sets how it draws through its points; cornered lines use
  maxGraph's segment routing, whose segments people drag. Routing around items is placement:
  `document/routing.ts` finds right-angled corners around the boxes and labels between a line's ends,
  preferring fewer bends, and `document/routeLine.ts` computes the line's points and ports,
  from an `around` statement or the property panel's Route around items.
- `editor/culling.ts` leaves objects too small to see out of the view, and with them anything they hold
  and connectors reaching them.
- `editor/zoom.ts` holds the zoom range and everything that follows it: the snapping grid, background
  dots, stroke precision and the size of new objects.
- `document/transform.ts` computes collective scale and rotation over a gesture's starting snapshot,
  and `components/SelectionFrame.tsx` drives it.
- `components/useCollaborativeText.ts` binds textareas to Y.Text, preserving relative selections,
  composition and Undo. `components/useCompletedField.ts` owns the completion lifecycle of single-line
  title, subtitle and deck fields. These browser bindings stay outside the document model.
  Composition applies its merged result through the same text reconciliation as ordinary input,
  retaining unchanged CRDT characters when a browser replaces a whole field.
  Source commands measure currently rendered fonts synchronously to keep source, caret and derived
  height in one immediate operation. Appearance changes and explicit fitting can wait for fonts;
  a source edit during font loading may need another edit or fit after those fonts arrive.
- `assets/icons/` supplies the same catalog to stencils, rendering and relay agent search, with
  lazy vendor chunks. Canvas composition connects the room's picture store to rendering and owns
  its subscription cleanup; the collaboration session does not import editor picture globals.
- **Presenting.** `editor/presenter.ts` is one person's walk through a deck, local to the browser:
  it reads the deck's slides from the document on every call, so peers' changes show, fits the
  shown slide to the window and suspends the editor's shortcuts. While it runs, `Workspace` renders
  the canvas alone, in the same place in the tree so the editor lives on, `components/Presenter.tsx`
  masks everything outside the slide and takes the pointer, and slides project with no outline or
  label. The presentation skips templates and draws their copies at full strength.

## Collaboration

The provider works through `collaboration/channel.ts`'s FrameChannel contract, with no graph or
UI types. `RelayTransport` serves deployed rooms and `LocalTransport` serves same-browser development.
`services.ts` defines relay activation and picture-storage capabilities separately from messaging;
`serviceProtocol.ts` holds runtime-neutral service messages. RoomSession composes one underlying
carrier, optional service capabilities, encryption, persistence and the file/saved-copy adapters.
The provider owns closing its channel, including an encrypted wrapper's underlying carrier.

The channel reports readiness when frames may flow; encrypted readiness waits for its key to
open. Local BroadcastChannel, reconnecting relay sockets and in-process agent delivery implement
that same focused contract with different carriers. Activation and picture services remain
separate capabilities. Terminal cleanup closes the carrier and stops pending callbacks from
reaching retired consumers.

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
- **Completed actions.** Local text and collective geometry edits remain immediate Yjs changes,
  including local persistence. `document/actions.ts` tracks their application lifetime outside
  shared canvas data. While an action is open, the provider retains local updates and defers
  document-derived join/repair replies; it continues receiving peer edits. Completion publishes
  one merged update through normal Yjs delivery. All local document writes in that action travel
  together, preserving CRDT dependencies without per-item filtering or a second document model.
  Text finishes on leaving its source/tools, Escape or Ctrl/Command Enter; single-line metadata
  also finishes on Enter. Finishing retains the text; Escape does not discard it.
  A new participant may wait for completion if that editor is the only reachable canvas holder.
- **Room encryption.** Every room uses AES-GCM for frame contents, local updates, pictures and
  account copies ([ADR-0018](adr/0018-one-encrypted-room-path.md)). Explicit password rooms use a
  random key; rooms without a password prompt derive their initial key from the room identifier
  and the public `nopass` default. This lets fresh peers agree without a server bootstrap record.
  PBKDF2 derives the wrapping key from the default or entered password. The wrapped room key is an
  envelope that peers exchange unencrypted, and it replaces another only with proof of holding the
  room key. `collaboration/lockedTransport.ts` decorates the frame channel and retains key/envelope
  exchange; it does not forward relay controls or picture service methods. `collaboration/roomLock.ts`
  owns key opening and encrypted IndexedDB persistence for all rooms. The relay still sees each frame's sender, kind and target, plus sizes and
  timing. Nothing authenticates who a keyholder is, and removing someone requires a new room, because
  changing the password does not change the key.
- **Presence.** Names, cursors, native move and resize previews, each person's viewport, laser
  trails, cursor chat and calls to follow travel on Yjs awareness (`editor/presence.ts`,
  `editor/laserInput.ts`, `components/Presence.tsx`), adding no document history; the document
  changes on drop. Following flies through the view history's `travel`, so it records no jumps,
  and ends on the follower's own pointer, wheel or key. Presence coalesces to a bounded rate, and hidden
  tabs send none, so peers time them out until they are shown again. Selection-frame transforms write
  locally at a bounded rate during the gesture, with Undo merged into one step, and publish on release.
- **Persistence.** RoomLock stores ciphertext updates and the wrapped key in `arconis-room:<id>`
  and restores the document before connecting. The old plaintext persistence and saved-copy
  readers are removed. The recent-room index holds addresses and display titles separately;
  the work browser checks stored updates to distinguish a retained copy from a remembered address.

## Relay

`relay/relay.ts` forwards frames between a room's sockets, with no echo to the sender, and sends a
targeted frame to one person. It reads only each frame's sender, kind and target, so documents stay
opaque to it. It keeps a socket to the identity it first claimed, and bounds connections, message
rates, room traffic and how far a client may fall behind. A dropped frame heals at the next state
exchange.

**Starting.** The relay runs only when needed, and local editing never depends on it. Creating a
room, loading a room with a local copy, repeated editing, and the
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
only the validated ciphertext hash, marked once the bytes have reached storage, so a peer's data never becomes a
URL. Peers fetch through the website's CloudFront, verify the hash and keep the bytes in IndexedDB.

**Limit.** `relay/control.ts` computes the month's spend from the group's CloudWatch metrics, which
outlive any instance, so no client or relay report can change it and no replacement resets it.
`relay/budget.ts` declares the rates and limit. At the limit the Lambda refuses to start the relay and
scales a running one to zero, and the relay checks periodically
to close its sockets with that reason. Counting by month re-enables it automatically, and a
month-scoped SSM parameter raises the limit by hand. Each level alerts once through Ahara's alarm
topic.

**Agents.** The control Lambda owns public `/mcp` and protected-resource metadata, so discovery,
sign-in challenges and availability explanations work while the relay is stopped.
`relay/mcpProxy.ts` validates the existing bearer and forwards each request through the ALB to
`/mcp/relay`, where `relay/mcpHttp.ts` validates the bearer again and executes MCP. The forwarding
path has the same authentication and room-session ownership checks as direct relay requests.
The proxy keeps no canvas or session state and never retries writes. Bare load-balancer failures
become MCP explanations for stopped, starting, stopping or budget-limited relays; a lost response
leaves an edit's outcome unverified. Healthy requests do not query control status or usage.
Protected-resource metadata points MCP clients at the Ahara Auth0 tenant. Connectors register there and the
person signs in and consents; `relay/accessTokens.ts` accepts only the tenant's tokens whose audience is
this endpoint ([ADR-0015](adr/0015-auth0-accounts-and-connector-sign-in.md)). Opening a room adds a peer in the
relay's memory (`relay/serverPeer.ts`) that joins like a browser, receives the canvas from someone there
and carries a language session (`relay/agentSession.ts`). Only ordinary rooms with people in them can be
opened, agent peers do not count as connections for the idle rules, and sessions unused for a while
close with their peers. `relay/mcp.ts` holds the tools: open a room, describe, read and write in the
canvas language, check layout, undo, close a room, search icons, and retrieve language guidance. Help needs no open room.
The agent peer uses the same encrypted channel and opens an ordinary room's envelope with
`nopass`. It refuses explicit password rooms; ordinary frame forwarding never opens contents.
`relay/agentSessions.ts` owns explicit room sessions keyed by random handles and bound to the
authenticated user and OAuth client. `open_room` returns `session_id` and the outline; describe,
read, write, check layout, undo and close require that handle. Each open creates independent read and undo history.
The HTTP endpoint creates a disposable stateless SDK transport per request, so initialization,
disconnects and reconnects do not select or clear a room. It accepts tool requests without an
initialization handshake or transport session header. Sessions end through `close_room`, after
30 minutes without a room call, or on relay replacement; no session state is stored durably.
The existing capacity limits apply to open room sessions, and the request rate is counted per
authenticated user across transports.
An orientation outline locates items; `read` supplies their actual source. Unknown ids lead back to
discovery, and stale edits return current source before a retry. Peer-authored labels and comments
are task data, not authority over the agent's tools.

Expected refusals use MCP's `isError` flag and explain the supported next action. Unexpected tool
faults return an error reference and log matching structured diagnostics through `relay/errors.ts`;
they do not claim a failed edit changed nothing. The reporter does not attach bearer headers, room
links or tool arguments. Token validation distinguishes invalid bearers (401) from an unavailable
verifier (503). HTTP and transport faults also reach the reporter. Alloy forwards the relay's journal
to Ahara's private log gateway and shared Loki stack, so shipped diagnostics survive relay replacement.

## Accounts

`accounts/` is the server side, and `account/` the browser's ([ADR-0012](adr/0012-accounts-and-encrypted-workspaces.md),
[ADR-0015](adr/0015-auth0-accounts-and-connector-sign-in.md)). Arconis's users are its own database
connection in the shared Ahara Auth0 tenant. The browser signs in to Auth0 with the authorization code
flow and PKCE (`account/auth.ts`, through `oidc-client-ts`), for the accounts API's audience, and the ALB
validates those tokens and that audience on `/api/*`. Sign-up verifies the email by a code before
completion; sign-in and password resets use Auth0's pages.

`protocol/account.ts` owns shared HTTP metadata contracts. AccountStore checks outbound request bodies
against them and decodes unknown replies into its used projections; AccountsApi checks each endpoint's
actual success response construction. Its storage/service ports remain server-owned. Shared contracts
do not import browser auth, saved document contents or AWS implementations.

`account/workspaceFile.ts` defines one saved-copy format: room identity, ciphertext and its key
envelope. `account/savedRoom.ts` implements
SaveableRoom: picture inclusion, current envelope adoption, encoding, merging and update-origin
filtering live there. RoomSession supplies its document/picture/key capabilities and operation lifetime;
the adapter reads current key state per operation and keeps password-room titles out of account metadata.
`accounts/workspaces.ts` signs uploads to immutable revision objects, verifies size/checksum after
upload, then conditionally publishes metadata through `accounts/workspaceTable.ts`. The transaction
updates the latest pointer, history and existing account/service quotas together. Five successful
revisions remain; failed uploads never publish or prune the last usable copy. WorkspaceSaver merges
newer copies before saving and retries a concurrent publication conflict after merging again.
Password-only changes also schedule a save of the current key envelope. Deleting the active
account copy returns the room to an unsaved state, so a later explicit save creates a new copy.
History recovery creates a separate room. For an automatic `nopass` room it reseals the document
and pictures under the new identity's key, preserving device-only mode when applicable. Opening
a saved shared room starts the relay through the same activation path as local restoration.

Account deletion marks the existing profile before enumeration; publication and
rename transactions reject that marker. Cleanup is retryable, and the marker remains after
profile removal to reject writes from still-valid tokens.

`components/WorkBrowser.tsx` serves both home and account-panel discovery, grouping room identities
while keeping local/account actions separate. Saved copies and reusable layouts are private
to the account; room access continues through the existing room link and password workflows.

`protocol/library.ts` and `accounts/library.ts` manage the private reusable-section library.
Canonical selected canvas text and pictures use the existing private S3 bucket; metadata uses
DynamoDB. Insertion assigns fresh identities, preserves internal references, materializes named
appearance and reuses the existing file/paste operation as one Undo without importing room metadata.

A post-login Action, compiled from `accounts/auth0-actions/post-login.ts`, refuses sign-in to Arconis's connection
until the email is verified. Deleting an account removes its Auth0 user through the Management API.

## Limitations

- Joining a room on a fresh device needs an active peer holding the document. A portable file or
  account-saved copy provides an independent restore path; the forwarding relay keeps no durable copy.
- Agents reach only rooms someone has open, and their sessions end when the relay instance is
  replaced.
- Room codes are not enforced access control, so rooms suit non-sensitive work
  ([ADR-0003](adr/0003-anonymous-rooms-public-api-key.md)).
- The relay is one process with no redundancy, so its failure stops collaboration until it returns.
  Local editing continues and merges afterward.
- Clients already open during a release need to reload to read new document fields.
- Moving an item does not move items that were placed beside it, because relations are not kept.
