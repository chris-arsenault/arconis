# Editor improvement plan

Working plan. Delete this file after its durable content moves into `docs/` at closeout.

## Outcome and scope

Arconis feels like a professional editor when used directly on the canvas, runs safely as a public pay-per-use service, and
gains everything in the owner's list and `docs/backlog.md`. Remaining milestones follow the agent's suggested order, which the
owner asked for.

Authorized so far: this plan. Implementation, commits and pushes need the owner's go-ahead; a push to `main`
deploys.

Boundaries:

- **Owner, this plan:** every item below, as amended by the decisions below.
- **Owner, standing:** automated tests and CI use local fixtures only, never real AWS (ADR-0006). Limited, deliberate one-off checks against AWS
  are allowed.
- **Owner, standing:** ADR alternatives come only from recorded sources. Proposed ADRs describe the code and do
  not block changing it.
- **Project:** no custom application backend, and permissive licensing (ADR-0007). Adding shared storage needs an
  explicit owner decision.

## Owner's list

| # | Owner's words | Type | Milestone |
|---|---|---|---|
| 4 | Double click should edit text on most regions | Bug | M0 |
| 1 | Add favicon and OG integration | Bug | M0 |
| 2 | No explicit connection points on diagram objects | Bug | M1 |
| 3 | Purple connection arrow is unintuitive | Bug | M1 |
| 6 | No infinite zoom | Bug | M2 |
| 12 | "On this canvas" is not useful; left rail becomes an object browser with saved views at the bottom | Redesign | M3 |
| 7 | Property editor is a terrible use of space, not a professional product | Redesign | M3 |
| 13 | Place a bookmark, show it in left nav, click to zoom to it | Merged into saved views | M3 |
| 10 | Icon palette is lacking | Feature | M4 |
| 5 | No group/panel construct | Feature | M5 |
| B9 | Prod operations: rate limits, budgeting, alerting, hard limits; replace AppSync with an EC2 relay | Operations | M6 |
| B4 | The drop down for connections "from" and "to" is unusable after 10 objects; remove it | Bug | M7 |
| B2 | Drawings are transmitted per-stroke; they're going to clog things up | Investigate | M8 |
| B10 | Look at WebRTC for images and the app in general, degrading seamlessly, with a non-collaborative room | Architecture | M8b |
| B5 | No grid view | Feature | M9 |
| B6 | Add export PNG and copy of graph, like draw.io | Feature | M10 |
| 8 | Add mind mapping | Feature | M11 |
| 9 | Layout/quick UX work: compose screens with rectangles, sizes and text boxes, a different layout mode than diagramming | Feature | M11 |
| B1 | Comments on objects | Feature | M12 |
| 11 | No paste picture; part of image handling will be an authenticated mode | Feature | M13, M17 |
| B7 | Design the serialization format to be agent friendly | Feature | M14 |
| B3 | Password protected rooms using client-side envelope encryption | Feature | M15 |
| B8 | Signed-in users get document storage and an MCP server that interacts directly with the document using domain-native tooling | Architecture change | M16, M18 |
| Backlog | Scope Ahara's AppSync bootstrap grant; settled for Arconis by removing its AppSync permissions | Platform | M19 |

## Suggested order and why

1. **Replace AppSync first (M6).** The live site is pay-per-use with a public key and no spending controls that we know of, and AppSync's fan-out
   pricing would exceed the budget at real usage. Every later feature adds traffic, so this limits the risk already live.
2. **Small and traffic fixes next (M7, M8, M8b).** The menus are a known annoyance, and traffic affects the cap and the feel of the app. The data layer
   settles what happens when the relay is off or unreachable. Pictures depend on it.
3. **Editing features that need no new architecture (M9 to M12).** These deliver the most editor value, with no storage decisions.
4. **Pictures, then the file format (M13, M14).** The format is designed after layout objects, comments and pictures exist, so its
   schema covers them without a second version.
5. **Password rooms before accounts (M15, M16).** Accounts and storage must account for encrypted rooms, so that design needs them settled.
6. **Authenticated pictures and MCP after accounts (M17, M18).** Both need stored documents and identity. MCP also builds on the M14 format.
7. **Platform cleanup last (M19).** Removing Arconis's AppSync permissions is independent of product work.

## Evidence gathered

- **Double-click (#4) fails on the shape itself, not just in some regions.** A local sweep of 35 points per object,
  at revision `f76cd0e`, opened the editor on 0/35 for rectangle, sticky, service, database and text, 4/35 for ellipse,
  16/35 for diamond, 17/35 for cloud and 10/35 for person. The hits are the bounding-box areas outside the drawn shape.
  maxGraph's `CellRenderer` calls `graph.dblClick` and consumes the event on the shape node, so the bubbling
  listener in `editor/input.ts` never sees it. Existing tests missed this because they double-click object list rows.
  `docs/editing.md`'s claim that double-click edits any object is currently wrong.
- **Favicon and OG (#1).** `index.html` has neither. Other Ahara sites such as `bookmarker` ship static `favicon.svg`,
  PNG icons, `apple-touch-icon.png`, `social-card.png` and static `og:` and `twitter:` tags. The website module already
  serves those types. `../ahara/OPENGRAPH.md`'s per-route Lambda exists for entity pages backed by RDS, and rooms are
  hash routes that crawlers never see.
- **Zoom (#6).** Scale is clamped to 2%–6400% in `editor/input.ts:208`, `editor/controller.ts:349` and `:363`. Clamps are
  not the whole problem: placement snaps to a fixed world grid through `getPointForEvent`, new objects have fixed world
  sizes, `editor/input.ts` rounds stroke points to fixed world decimals, and the background dots do not follow zoom.
- **Test dependency (#12).** The browser suite references the object list about 94 times, so removing it means moving
  the test harness to canvas-level selection first.
- **Group assumptions (#5).** `"group"` is checked directly in `projection.ts`, `geometry.ts`, `transform.ts`,
  `graphChanges.ts`, `SelectionFrame.tsx` and `Inspector.tsx`.
- **Transfer cost (#11).** Targeted frames still fan out to every subscriber of a room channel, and AppSync bills per
  5 KiB, so document size multiplies across participants and late joins.
- **AppSync usage (B9).** CloudWatch reports this API's `InboundMessages` and `OutboundMessages`. On 2026-11-07, month-to-date totals were about
  6,500 and 7,900, including all testing and past live CI runs, or roughly $0.01 against a $10 cap. AWS also bills connections, subscriptions and
  pings as operations, which these two metrics exclude, so the shutoff needs headroom or a fuller count.
- **Image cost on paper (#11).** At $1 per million operations and one operation per 5 KB, a 200 KB image with 10 people costs about 440 operations
  (40 in, 400 out), or 0.044 cents, and 1 MB costs about 0.23 cents. Each AppSync transfer to a late joiner fans out to the room and costs the same
  again. This passes the fractional-cent test on paper; M13 measures it.
- **Available parts.** maxGraph has connection constraints (`getAllConnectionConstraints`) and alignment guides
  (`SelectionHandler.guidesEnabled`). `lucide-react`, already a dependency, ships about 3,400 module files under its ISC license.

## Decisions

### Owner decisions

- **Object browser (#12):** stencils. The left rail replaces the small tool list hovering on the canvas, and "On this
  canvas" goes away.
- **Zoom range (#6):** 1000x. Read as 1000x in each direction from 100%, so 0.1% to 100,000%.
- **Pictures (#11):** part of image handling is an authenticated mode (M17). Unauthenticated collaborative rooms get no images unless they are
  shown to cost fractional cents per image with 10 people collaborating. Regardless, an image is transmitted once, and its metadata (size,
  position, scale) travels separately.
- **Orchestration (B9):** replace AppSync with a relay on EC2, because AppSync's fan-out pricing is too expensive, and EC2 is the platform's existing
  pattern and the more stable technology in the owner's view. Lightsail is rejected as too esoteric. This reverses the brief's exclusion of custom
  WebSocket servers and ADR-0002.
- **Sizing:** rooms support 5, 10 or 15 people, budgeted for 10, at 20 two-hour sessions a month and hundreds to thousands of objects. TrueNAS is out.
- **Start and stop:** a start/stop Lambda with idle detection. No connections for 10 minutes is idle, and connections with no contentful update for 30
  minutes is idle. Adding, moving or updating an object counts, and so do creating a room and a full fresh page load from a local copy, such as a new tab.
  Cursor movement and acknowledgements do not. Edits start the relay with per-user hysteresis, such as 3 edits in an hour. Anyone can use a Start
  collaboration button.
- **Spend (B9):** a hard stop at $10 a month, re-enabled automatically each month. Arconis is not a production tool with paying customers, so stopping
  beats staying up. The AWS account holds much other spend, so the cap measures this tool rather than account cost.
- **Measurement:** rough estimates are enough for these decisions. Skip measuring costs and timings for their own sake.
- **Transport (B10):** look at WebRTC for images and the app in general. The data layer degrades seamlessly, for example when a corporate VPN blocks
  WebRTC. A non-collaborative room uses no relay and allows unauthenticated images.
- **WebRTC (B10):** not built. The owner decided against it after the M8b assessment.
- **Deployment:** infrastructure reaches AWS only through CI/CD. The local deploy path is removed.
- **Password rooms (B3):** client-side envelope encryption only, with no backend.
- **Vendor icons (#10):** ship AWS, Azure and Google Cloud icons, self-hosted in lazy chunks. The owner accepted the licensing gray
  area, with rotation and proportions locked and even scaling allowed (ADR-0008).
- **Bookmarks (#13):** no separate bookmark concept. Saved views and bookmarks are the same thing, so saved views deliver
  "save a place, see it in the left nav, click to zoom there".
- **Mind mapping and layout (#8, #9):** the same editing mode, with specialized objects.
- **Grid view (M9):** a visible grid with snapping.
- **Copy (M10):** "graph" was a typo. An export carries a copy of the canvas so someone can load it, just like draw.io.
- **Comments (M12):** everyone in the room sees them.
- **Password recovery (M15):** none. People need to remember their password.
- **Signed-in pictures (M17):** everyone in the room sees them.

### Open

- **[DECISION] Mind maps and layout, at M11 start.** A design session with the owner comes first.
- **[DECISION] Storage architecture, at M16 start.** The owner will design this when the work reaches it. Accounts, server storage and an MCP server reverse the standing
  no-accounts, no-backend boundary (ADR-0003). It needs answers on identity, who pays for storage, what happens to anonymous rooms, and how an agent reads an encrypted room
  from M15. A server can only act on a password-protected document if a member's client grants it the key.

### Agent proposals, revisable

- **Tools beside stencils.** Select, pan, connector and draw are tools rather than stencils, so they sit in a compact row at
  the top of the left rail. Stencils arm on click, as tools do now, and also drag onto the canvas.
- **Layout and mind-map behavior attaches to objects.** Tab and Enter belong to mind-map nodes, and pixel snapping and size
  readouts belong to screen frames and their contents. A Diagram and Layout switch selects the stencil set and creation
  defaults, and diagrams keep working in either. This reads the owner's "same editing mode" as one layout mode separate from
  diagramming; because behavior lives on objects, dropping the switch later costs little. ADR-0005 removed a switch that only
  hid tools, so its successor records the difference.
- **Static OG.** Use the `bookmarker` pattern, because every room shares one preview anyway. A per-room preview would need room
  metadata on a server.
- **Connection points replace the purple arrow.** One visible gesture serves both #2 and #3.
- **Connector anchors persist in the existing connector style map,** using maxGraph's `exitX`, `exitY`, `entryX` and `entryY`.
  `commitGraph` currently ignores edge styles, and the `connection.connect` override drops constraints, so both change.
- **Saved views store a viewport center and zoom,** so a view lands correctly on any window size. Older records keep working
  through their stored translate.
- **Panels are a new `panel` kind that reuses grouping's parent model,** with a shared "is container" check replacing direct
  `"group"` tests.
- **Icons store a name, not markup.** Projection resolves names through a local allowlist, so peers can never supply a raw URL or SVG.
- **Mind map layout is derived, not stored.** Positions compute deterministically from the tree and root position at projection,
  so concurrent edits converge with no layout conflicts.
- **Password rooms encrypt below Yjs.** Every frame and awareness update is encrypted with a room key before it reaches the relay, so the
  server sees only ciphertext and merging stays in the browser. The password unwraps the room key through a slow key derivation, so a
  password change rewraps the key rather than the document. The local copy is encrypted too.
- **Picture bytes live outside Yjs, keyed by content hash.** The object record holds only the hash and its size, position and scale, so moving or
  resizing a picture never resends it, and each peer fetches a given hash once and keeps it in IndexedDB. Yjs state exchange would otherwise
  resend the bytes on late joins. The browser re-encodes pastes through a canvas, which removes active content, and projection builds images from
  validated bytes.
- **The relay forwards and stores nothing.** One process keeps sockets per room and passes messages along, with no echo to the sender, and targeted
  messages go to one person. It enforces per-connection and per-room limits, and disconnects clients that fall behind. Documents stay in browsers, so
  the existing `Transport` interface and Yjs exchange carry over. It sits on one 1 vCPU EC2 instance, c7g.medium as the starting point, behind the shared
  ALB, which terminates TLS. A local measurement on one 3 GHz core handled a 15-person room at about 4% CPU and 65 MB, with about 1 ms in the relay.
- **The relay stops itself.** It already knows its connections and message types, so it shuts its instance down when idle, leaving only the disk to
  pay for. A small Lambda behind the ALB starts it, and a scheduled check stops an instance past a maximum runtime in case the relay hangs. This is
  simpler than a Lambda polling for idleness, and still delivers the owner's rules.
- **Contentful activity is a message type.** Clients mark broadcast object updates as contentful. Presence, cursor, sync exchange and targeted join replies
  are not. Password rooms keep that type outside the encrypted payload, which reveals only the kind of traffic.
- **The hard stop meters this tool's own usage.** The relay counts running hours and bytes sent, and the Lambda and relay refuse to run past the monthly
  limit. Client limits only give people a clear message.
- **Tabs do not wake the relay.** A tab left open cannot wake it overnight, because only a page load, room creation, edits or the button start it. A page load with a
  local copy is detectable once IndexedDB has synced into a document that has content. When the relay is off, editing continues locally and merges once it is back.
  The Lambda enforces the monthly cap regardless, because a browser's own counting can be bypassed.

## Milestones

### M0 — Double-click and site identity (#4, #1)

Scope: capture canvas double-clicks before maxGraph consumes them, and add favicon set, social card and static OG tags.
Acceptance: double-clicking anywhere on any object's body, its label included, opens the editor, whether or not it is selected.
Browser tabs show the icon, and link previews show the card.
Evidence: a browser journey repeating the point sweep for every object kind, and source review of tags and assets. Live crawler
previews need a person or a manual check after deployment.

### M1 — Connection points (#2, #3) [depends on M0]

Scope: visible points on hovered objects (sides, adapted per shape), dragging from a point to start a connector, target points
highlighted while connecting, re-anchoring existing connector ends, purple arrow removed.
Acceptance: a connector made between two chosen points stays on those points when either object moves or resizes, and for peers
and after reload. Dropping on an object's body still connects it. Connections from notes and shapes behave alike.
Evidence: real-gesture journeys across peers and reload.

### M2 — 1000x zoom (#6) [depends on M0]

Scope: widen the range through one shared limit, and make editing scale-aware: placement grid, new object size and text, stroke
width and point precision, background dots, and zoom display.
Acceptance: zooming across 0.1% to 100,000% shows no rendering break. Objects created at any zoom appear at a sensible on-screen
size. Moves, drawing and text work at both extremes.
Evidence: browser journeys at both extremes, with screenshots reviewed.

### M3 — Stencils, property editor and saved views (#12, #7, #13) [depends on M1]

Scope:

1. Move the browser test harness to canvas-level selection and the status bar's object count, keeping all journeys passing before
   any interface changes.
2. Replace the floating tool list and "On this canvas" with a left rail of categorized stencils, saved views at the bottom.
3. Make saved views the place-and-return feature: save the current place in one action, list it at the bottom of the rail, click to
   animate there, rename and delete it, and sync it to peers.
4. Rebuild the property editor as a dense, professional panel showing only what applies to the selection, with no panel when nothing
   is selected, so the canvas takes the width. Remove marketing copy from the working interface.

Acceptance: no tool list hovers on the canvas, and the left rail adds objects by click or drag. Clicking a saved view brings that place
into view at its saved zoom, on any window size. The panel fits the common case with no scrolling at ordinary laptop height and shows no
controls that do nothing for the selected kind.
Evidence: browser journeys for stencils, saved views and properties, with screenshots shown to the owner for judgment, since professional
quality is the owner's call. Uses the `frontend-design` skill.

### M4 — Icon palette (#10) [depends on M3; DECISION on vendor terms]

Scope: icon objects, searchable and categorized in the stencil rail, covering a general set and vendor architecture icons, loaded lazily
to protect the main bundle.
Acceptance: a person finds an icon by search and places it. It connects, resizes, has an optional label and syncs like any other object.
Evidence: browser journeys, bundle size comparison, and each bundled set's terms recorded alongside it.

### M5 — Panels (#5) [depends on M1, M3]

Scope: a panel object with a title bar. Dragging objects in nests them, dragging out releases them, moving moves contents, and resizing
leaves child sizes alone. Panels accept connectors and nest. Grouping stays, with discoverable commands.
Acceptance: all of the above, converging under concurrent moves between peers and surviving undo, reload and files.
Evidence: browser journeys and concurrent document tests.

### M6 — EC2 relay with start/stop and a hard stop, retiring AppSync (B9) [DECISION at start]

Scope: the relay and its client transport, a 1 vCPU EC2 instance behind the shared ALB through Ahara's `ec2-vpc-compute` admission, a start Lambda, idle
shutdown under the owner's rules, a hard stop at $10 a month, alerts through Ahara's alarm topic as usage approaches it, and then removal of the AppSync
API. A record replaces ADR-0002, and docs change with it.
Acceptance:
- Creating a room, a full page load with a local copy, three contentful edits by one person in an hour, or the Start button bring collaboration up. Editing works
  locally throughout, and people see that it is starting. Local work merges once the relay is up.
- The relay stops after 10 minutes with no connections, and after 30 minutes with connections but no contentful update. Cursor movement and open tabs do not
  keep it awake or wake it.
- At the monthly limit it stops and will not start, including for a hostile client calling the Lambda directly. People see collaboration is off, and local
  editing and saving keep working. Other AWS services are untouched.
- A 15-person room stays responsive.
- Real AWS costs for the tool stay within $10 at the agreed usage.
Evidence: tests of idle, start and limit logic with an injected clock, and journeys against a local relay replacing the AppSync fixture. Cold start is estimated at
40 to 75 seconds.

### M7 — Remove connector from and to menus (B4)

Scope: remove both menus from the property panel. Connector ends change by dragging them to another object.
Acceptance: a selected connector shows no endpoint menus, and dragging either end re-attaches it, for peers and after reload.
Evidence: a browser journey on a canvas with many objects.

### M8 — Bound traffic (B2) [depends on M6]

Scope: fix the known traffic waste: drawings, because a selection frame rewrites every point on each pointer step; cursor rates; sync exchange that replies even when
nothing is missing; every peer sending a full copy to a joiner rather than one; hidden tabs sending presence. Check browser performance at thousands of objects,
unexamined past 450, because that affects real use rather than cost.
Acceptance: heavy drawing and transforming stay within agreed limits, one peer answers a join, a late join at thousands of objects stays usable, and the canvas stays
responsive at that size. Peers may see strokes while they are being drawn if the measurements leave room for it.
Evidence: tests that count messages for those cases through the local relay.

### M8b — Data layer: seamless degradation and local rooms (B10) [depends on M6, M8; DECISION on WebRTC]

Scope: every state between full collaboration and none behaves as one experience: relay starting, relay stopped, relay unreachable and hard stop. Add the
non-collaborative room: no relay connection, nothing leaves the browser, and unauthenticated images are allowed. Give the owner a rough assessment of WebRTC, for large
transfers and for networks that block the relay, and build it only if the owner chooses to.
Acceptance: losing or regaining the relay changes only the status text, and work merges when it returns. A non-collaborative room opens no network connection at all.
Evidence: browser journeys through the local relay with it blocked, stopped and restarted, including a check that a local room opens no sockets.

### M9 — Grid view (B5)

Scope: a toggle for a visible grid that follows zoom, with snapping following it.
Acceptance: the grid stays readable at every zoom, and turning it off also frees placement from it. Each person's setting is their own.
Evidence: browser journeys at both zoom extremes, with screenshots reviewed.

### M10 — PNG export carrying a copy of the canvas (B6)

Scope: export the canvas or selection as PNG with a copy of the document inside the file, as draw.io does, so loading that PNG restores the objects.
Acceptance: an export matches the canvas, including labels, icons and connectors, for a selection and for the whole canvas. Importing the PNG through the existing import brings
the objects back, in any room, and a PNG without a copy gets a clear message.
Evidence: browser journeys comparing exported images and reloaded documents.

### M11 — Layout mode with mind maps and screens (#8, #9) [DECISION at start]

Scope: one layout mode with specialized objects, in the one room document.

- **Screens:** frames with device size presets, built on panels, plus sharp-cornered rectangles and text boxes, pixel snapping, alignment
  guides and live size readouts.
- **Mind maps (proposed):** a root object, Tab for child, Enter for sibling, automatic balanced layout with curved branches, collapse and
  expand, drag to re-parent, and connectors to any other object.

Acceptance: a person composes a screen from a preset with precisely sized, aligned rectangles and text. A person builds a multi-level map
from the keyboard alone, and peers editing concurrently converge to the same layout. Peers and diagram work see all of it in the same
document. The backlog entry for mind mapping goes away when this lands.
Evidence: browser journeys, layout determinism tests, and screenshots shown to the owner.

### M12 — Comments on objects (B1) [DECISION at start]

Scope: threaded comments attached to objects, with a visible marker, resolve and delete, stored in the room document. This reverses the
product brief's exclusion of comments, on the owner's request.
Acceptance: comments sync to peers and survive reload and files, follow their object when it moves, and leave no orphans when it is deleted.
Evidence: browser journeys across peers, and concurrent document tests.

### M13 — Pictures with once-only transfer (#11) [depends on M6, M8b]

Scope: paste, and file drop on the same path, placing a picture at the pointer. Bytes transfer once per peer, and size, position and scale sync
separately. Allowed in non-collaborative rooms. The relay's cost per image with 10 people is estimated at under half a cent for 5 MB, which meets the owner's
fractional-cent test, so unauthenticated collaborative rooms get images within size limits. Image transfers must not delay edits. Pictures resize with their proportions kept and travel
in exported files through a new file version. Hash references let M17 add stored originals without changing objects or files.
Acceptance: moving or resizing a picture sends no image bytes, and a peer fetches each image once. A picture reaches peers, late joiners and reloads
wherever the room allows it. Where it does not, people get a clear message. Hostile peer data never reaches the DOM as a URL or markup.
Evidence: browser journeys through the local relay, and chunking and validation tests.

### M14 — Agent-friendly document format (B7) [depends on M11, M12, M13]

Scope: a documented, versioned format an agent can read and write directly: stable identifiers, meaningful names rather than rendering
style keys, relationships expressed plainly, and a published schema covering layout objects, comments and pictures. Existing files keep importing.
Acceptance: an agent given only the schema can describe a document and produce a valid edited one that opens with its layout, connections
and labels intact.
Evidence: schema validation and round-trip tests, plus a trial with an agent working only from the published schema.

### M15 — Password protected rooms (B3) [DECISION at start]

Scope: optional room passwords with client-side envelope encryption of document updates, presence, pictures and the local copy. This is client side
only, with no key on any server. The relay sees only ciphertext and message types.
Acceptance: a room's contents are unreadable without the password, on the wire and on disk. The right password joins and syncs normally, a
wrong one gets a clear message and no content, and changing the password keeps the document.
Evidence: browser journeys through the local relay, inspecting frames and stored data for plaintext. An independent security review is
recommended, because this is the feature people would rely on for sensitive work.

### M16 — Accounts and document storage (B8) [depends on M14, M15; DECISION blocks]

Scope: begins as a design for the owner to approve, because it reverses the no-accounts, no-backend boundary. Proposed shape: optional sign-in
through Ahara's existing identity, and stored documents for signed-in users alongside anonymous rooms. The design covers operating costs and
extends M6's limits to the new service.
Acceptance, once the design is approved: a signed-in user's document survives every device going offline, and anonymous rooms keep working as
they do today.
Evidence: to be set with the approved design. Automated tests stay on local fixtures, under ADR-0006.

### M17 — Authenticated pictures (#11) [depends on M13, M16; DECISION at start]

Scope: the authenticated part of image handling. Signed-in users store full-resolution pictures in S3 under their content hash, served through CloudFront, so they no
longer depend on another peer being online or on the limits of unauthenticated rooms. A small Lambda issues size-limited upload links. Storage limits and costs follow
the M16 design, and metadata keeps travelling separately. Estimated at about 0.012 cents per 5 MB image at 10 people within CloudFront's free allowance.
Acceptance: a signed-in user's picture survives every device going offline and appears on another device, and is only reachable by the people
allowed to see it.
Evidence: to be set with the approved design, on local fixtures.

### M18 — MCP server (B8) [depends on M14, M16]

Scope: an MCP server whose tools are domain operations such as adding an object, connecting two objects and moving a group, built on the M14
format, for signed-in users.
Acceptance: an agent changes a live document through MCP using domain tools, and people in the room see those changes merge like any peer's.
An encrypted room stays unreadable unless a member grants access.
Evidence: tests against local fixtures, and a trial with an agent working only from the tool descriptions.

### M19 — Remove Arconis's AppSync permissions (Backlog)

Scope: once M6 retires the Events API, remove the `appsync-events` module from Arconis's Ahara registration. That settles the backlog item about scoping its bootstrap
grant for Arconis. Whether other projects need the primitive is Ahara's concern.
Acceptance: Arconis's deployer no longer holds AppSync permissions, and its deployment still succeeds.
Evidence: platform checks in `ahara-infra`, and the next Arconis deployment. Changes there follow that repository's rules.

### M20 — Closeout [depends on all]

Move durable content to `docs/` and ADRs, update the changelog and backlog, and delete this file.

## Sulion mapping

Root and milestone phase IDs are in the Sulion plan titled "Editor improvement plan". M0 to M5 and "M4b — Vendor icons" are complete. Remaining
milestones were renumbered when the plan was reorganized, so the earlier pending phases are skipped with a note, and the new ones are M6 to M20. An
earlier plan with the same title and 11 milestones was canceled before any work, when owner decisions changed its milestones.

## Current state

M0 to M5 and the vendor icons are deployed. M2 also laid labels out in screen pixels, because browsers cannot lay out text at deep-zoom world
sizes. M3 kept the saved view storage name so existing rooms keep their views. Limits: no real-device, Firefox or WebKit check. The owner authorized
execution from M6 until a design decision is needed.

M6, M7, M8 and the build part of M8b are committed locally and unpushed, with nothing deployed. Infrastructure reaches AWS only through CI/CD, never by hand. The `ahara-infra` admission change must land
through its pipeline before Arconis's. The admission change and the listener-priority row in `ahara/INTEGRATION.md` are committed in those repositories. Unverified until
deployed: the instance's boot and shutdown units, WebSockets through the shared ALB and its WAF, the Lambda's IAM and metric reads, and the
instance rate in `relay/budget.ts`, which is from memory. Strokes reach peers on pointer up. M9 and M10 are built. Next is M11, which starts with a design session with the owner on mind maps and layout. PNG exports
use system fonts where the page's web fonts are not available to an image, and have only been checked in Chromium.
