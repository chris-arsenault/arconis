# Editor improvement plan

Working plan. Delete this file after its durable content moves into `docs/` at closeout.

## Outcome and scope

Arconis feels like a professional editor when used directly on the canvas, and gains the stencil, panel, layout,
mind-map and picture capabilities the owner listed. Clear bug fixes land first.

Authorized so far: this plan. Implementation, commits and pushes need the owner's go-ahead; a push to `main`
deploys.

Boundaries:

- **Owner, this request:** all 13 items below, clear bug fixes first, as amended by the decisions below.
- **Owner, standing:** automated tests and CI use local fixtures only, never real AWS (ADR-0006).
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
| 8 | Add mind mapping | Feature | M6 |
| 9 | Layout/quick UX work: compose screens with rectangles, sizes and text boxes, a different layout mode than diagramming | Feature | M6 |
| 11 | No paste picture | Deferred to the end | M7 |

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
- **Available parts.** maxGraph has connection constraints (`getAllConnectionConstraints`) and alignment guides
  (`SelectionHandler.guidesEnabled`). `lucide-react`, already a dependency, ships about 3,400 module files under its ISC license.

## Decisions

### Owner decisions

- **Object browser (#12):** stencils. The left rail replaces the small tool list hovering on the canvas, and "On this
  canvas" goes away.
- **Zoom range (#6):** 1000x. Read as 1000x in each direction from 100%, so 0.1% to 100,000%.
- **Pictures (#11):** deferred to the end of the plan. The storage question stays open until then.
- **Vendor icons (#10):** yes, alongside the general icon set.
- **Bookmarks (#13):** no separate bookmark concept. Saved views and bookmarks are the same thing, so saved views deliver
  "save a place, see it in the left nav, click to zoom there".
- **Mind mapping and layout (#8, #9):** the same editing mode, with specialized objects.

### Open

- **[DECISION] AWS service icons, returned to the owner from M4.** AWS's Architecture Icons page allows customers to create
  diagrams with the icons and says nothing about redistributing them, so they are not bundled. Simple Icons, which M4 ships,
  has no AWS or Azure logos. Options: the owner accepts AWS's terms for bundling, or people use pasted pictures after M7.
- **[DECISION] Picture storage, blocks M7.** Recommended: browser-compressed pictures inside the Yjs document with a size
  cap, which keeps the no-backend boundary. Sharp full-size images would need shared storage and a backend, the owner's call.
- **[DECISION] Mind-map behavior, at M6 start.** The brief gives no requirements, so the owner reacts to the proposal in M6.

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
- **Pictures, if stored in the document, live in a separate `assets` Y.Map keyed by content hash,** outside undo tracking, with
  objects referencing an asset id. The browser re-encodes pastes through a canvas, which removes active content, and projection
  builds images from validated bytes.

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

### M6 — Layout mode with mind maps and screens (#8, #9) [depends on M1, M3, M5; DECISION at start]

Scope: one layout mode with specialized objects, in the one room document.

- **Screens:** frames with device size presets, built on panels, plus sharp-cornered rectangles and text boxes, pixel snapping, alignment
  guides and live size readouts.
- **Mind maps (proposed):** a root object, Tab for child, Enter for sibling, automatic balanced layout with curved branches, collapse and
  expand, drag to re-parent, and connectors to any other object.

Acceptance: a person composes a screen from a preset with precisely sized, aligned rectangles and text. A person builds a multi-level map
from the keyboard alone, and peers editing concurrently converge to the same layout. Peers and diagram work see all of it in the same
document. The backlog entry for mind mapping goes away when this lands.
Evidence: browser journeys, layout determinism tests, and screenshots shown to the owner.

### M7 — Pasted pictures (#11) [depends on M3; DECISION]

Scope: paste, and file drop on the same path, placing a picture at the pointer. Pictures sync to peers, resize with their proportions kept,
and travel in exported files through a new file version.
Acceptance: a pasted screenshot reaches peers, late joiners and reloads. An oversized picture is reduced or refused with a clear message, and
hostile peer data never reaches the DOM as a URL or markup.
Evidence: browser journeys through the AppSync fixture, chunking and validation tests, and measured transfer size.

### M8 — Closeout [depends on all]

Move durable content to `docs/` and ADRs, update the changelog and backlog, and delete this file.

## Sulion mapping

Root and milestone phase IDs are in the Sulion plan titled "Editor improvement plan" that lists M0 to M8. An earlier plan with the same title
and 11 milestones was canceled before any work, when owner decisions changed its milestones.

## Current state

M0 to M5 are implemented and committed locally, unpushed. The owner authorized execution up to M6 and asked to see M3's interface before it
goes out. M2 also laid labels out in screen pixels, because browsers cannot lay out text at deep-zoom world sizes. M3 kept the saved view
storage name so existing rooms keep their views. Limits: no real-device, Firefox or WebKit check. Wheel zoom on 450 objects measured about 80 ms per step in headless software rendering. Next action: the owner reviews the interface and decides on pushing, then M6.
