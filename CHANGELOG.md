# Changelog

All notable user-visible changes are recorded here.

## Unreleased

### Diagrams from other tools, and canvas aids

- Added pasting and importing of Mermaid, D2, PlantUML and draw.io diagrams and OPML or text
  outlines as ordinary editable objects. Pasted text is offered as its diagram beside the
  plain-text choices; **Import document** reads the files.
- Added **Copy canvas as Mermaid** and **Export tree as CSV**.
- Connectors hop where they cross, so a crossing reads differently from a junction.
- A dragged object snaps to equal spacing with its neighbours, with each equal gap marked.
- Added an overview peek: hold **O** to see the whole canvas and release to return, or to land
  where the pointer was moved.
- Added **Q** to keep a placing tool in hand, so several objects of one kind go down in a row.

### Layer locks and room defaults

- Added a lock on each layer. A locked layer's objects ignore the pointer for everyone, so clicks
  reach what is beneath; anyone can unlock it.
- Added a default layer: everyone's new objects go into it when they enter the room, until they
  choose another.
- Added an opening view: one jump point can be where the room opens for everyone who enters
  without a link to another object.

### Clocks

- Added a clock object from **Shapes**: the time of day, a stopwatch or a countdown timer that
  everyone in the room sees running, with Start, Pause and Reset and three looks. Files and
  assistants write it as `clock time`, `clock stopwatch` or `clock timer <seconds>` on a node.

### Measurement in its place

- Moved **Measure** into the left rail's tools. Its length now reads at the middle of the
  measured line; click it and type the real length to calibrate the canvas.
- Moved **Scale and units**, with grid spacing, into **Settings**, and the scale bar into the
  bottom view controls. Removed the measurement panel and the scale controls above Undo.

### A simpler canvas

- Replaced saved views with jump points: mark any object, and **Navigate** lists it for everyone
  in the room to fly to. Files and assistants carry the mark as `jump`.
- Changed markers to six plain shapes (star, circle, square, triangle, diamond, hexagon) whose
  meaning the room decides. Removed the priority and progress markers.
- Made **Tidy branches** one command. A tree remembers its direction, compact spacing and sorting,
  set under Relationships or with `tidy <id> down sorted`; removed the separate directional,
  compact, sort and balance commands.
- Moved the bracket, brace and revision cloud from Draw to Markup, and removed Draw's Highlight
  tools; Markup keeps the marker and object outline.
- Removed per-object Hide with its **N hidden** button and Reveal in find. Layers and Collapse put
  objects out of view.
- Removed **Gather into frame**, cursor chat, **Select same fill**, the table commands, the
  **Screen size** property and `{name}` property placeholders in labels.
- Combined the five indicator visibility settings into one.
- Gave the welcome screen one **Create a room** action, with password and device-only rooms under
  **Room options**.
- Files written with the removed words (`hidden`, `view`, `sketch`, the earlier markers) are not
  read, and rooms holding the earlier Drawing holders are not converted.

### Zoom, units and measurement

- Unified zoom controls across a reciprocal `2⁻²⁰` to `2²⁰` range around `1×`, with multiplier
  readouts, precise numeric entry and four steps per doubling. Removed fixed coordinate rounding
  that made deep editing and file round trips coarse.
- Added shared calibration, working-scale presets, custom units, a zoom-aware scale bar and
  calibration from a measured distance. Geometry fields convert compatible units, while grid
  snapping supports automatic intervals and fixed distances such as 2.54 mm.
- Added temporary distance measurement with pointer and keyboard input, object/grid snapping,
  horizontal and vertical components, and calibrated gap and resize feedback.
- Kept visible children and long connections when their holders or endpoints become tiny;
  selected objects remain drawn. Window resizing preserves the view center and panel changes
  preserve content position.

### Accounts and saved work

- Combined local and private account copies in **Your canvases**, with search, availability and
  separate open/removal actions. Local work stays available when account browsing fails.
- Added **My layouts** to save, rename, delete and insert private selections with pictures and
  internal links. Each insertion creates independent objects and supports one Undo.
- Retained five successful account saves with timestamps and recovery into a separate room.
  Upload verification and conditional publication preserve the last saved copy on failure;
  concurrent saves merge and retry against the latest revision.
- Unified room frames, local persistence, pictures and account copies under room encryption.
  Rooms without a password prompt use the internal `nopass` default with unchanged guest UI.
  Removed the separate plaintext storage and saved-copy formats without compatibility readers.
- Fixed first-save autosave, resaving after account-copy deletion, password-only saved updates
  and restoring shared work while the relay is stopped. History recovery preserves device-only mode.
- Fixed copied layouts so internal Markdown and object links follow the copied objects.
- Prevented account deletion from racing new saves and kept interrupted deletion retryable.
  Reusing an existing revision cannot prune its data.
- Fixed picture retries so an issued upload link cannot mark missing bytes as shared, and preserved
  authored text when converting picture hashes during file import/export.
- Made copied links, creation defaults, room links and layout diagnostics consistent across their
  existing entry points by sharing their policy implementations.

### Layers and slides

- Added content layers beneath markup, with a Layers task area to create, choose, rename, drag
  or step reorder, hide locally, merge down and delete them, and to move the selection between
  layers. Properties gains a Layer field. PNG and SVG exports follow the layers you can see;
  canvas files keep every layer.
- Added layers to the canvas language (`layer`, `merge … into`, `delete layer`, `in-layer`) and
  to assistants, which list layers in `describe_canvas` and give self-contained additions their
  own layer.
- Changed slides into viewports that hold nothing: objects placed on a slide stay free, and
  moving or deleting a slide leaves them in place. Earlier rooms and files read slide contents as
  top-level objects where they were. Templates repeat the objects centred within them.

### Help

- Added a help zone at the foot of the left panel that names the control under the pointer or
  focus and explains it in one sentence; every workspace control and command has its sentence.
  It docks below the header when the panel is hidden, and Settings can hide it. Floating tooltips
  now carry only information about content and people.
- Added **Help** and the **?** key: a centred dialog with topics on the left and the user guides,
  search and every command with its shortcut on the right. **?** opens the guide for the area under
  the pointer.
- Added an orientation tour, offered on a first visit in any room, that highlights each area of the
  workspace in turn, Feedback included. Its canvas steps accept real input, so the right-button
  menu and ring can be tried while the tour describes them.
- Changed a right-button drag released anywhere but a wedge to cancel instead of leaving the menu
  open, and kept the browser's own menu away when such a drag ends outside the canvas.
- Removed the sample-room tutorial and its Help entry, which switched away from the current
  canvas. The orientation tour continues to run in the current room.
- Fixed a guide link to the Lasso section of the drawing guide.

### Canvas interactions

- Arranged the workspace with what you make on the left and the document on the right. The left
  rail keeps Select, Pan, Connect and Markup above two panels, **Shapes** and **Draw**. A right
  dock shows the selection's properties above **Layers**, **Slides** and **Navigate** (saved
  views, outline, tags and history); it narrows to its tabs when there is nothing to show.
- Gave Markup (M) its own bar over the canvas for temporary annotations: pen, marker, arrow, box,
  object outline, eraser and selection, one colour and size, with show/hide, clear and a count on
  the Markup button. It leaves the side panels as they were, remembers its choices apart from the
  Draw brush, and no longer appears as a layer.
- Made Draw (P) paint into the active layer chosen in Layers, with one tool palette, tool options
  beneath it, and a brush grouped into Stroke, Fill and Opacity. Selected ink is edited in the
  property panel, which also moves it between Markup and the content layer. Renamed Erase whole
  stroke to Erase stroke.
- Replaced special Drawing holders with ordinary panels and added Scale content on resize for
  general panel content, including ink, text and shapes, across browser and MCP edits.
- Reorganized drawing around Freehand, Highlight and Vector with independent remembered brushes,
  contextual Stroke, Fill and opacity controls, immediate undoable selected-ink styling and a stroke
  preview. Radial menus and shortcuts use the same tools. Added a shared cursor registry for drawing,
  erasing, navigation, connection and placement, including temporary pan restoration.
- Added Markdown object links using `[label](canvas://object-id)`, with a `local://` alias.
  The Markdown toolbar can pick a target directly on the canvas or search by name, tag or id,
  preserving the text selection through peer edits. Following a link uses canvas navigation and
  view history, including drawings and routed lines.
- Added guest usability feedback saved to private S3 storage with diagnostic metadata and tags.
  An unchecked screenshot option attaches the standard whole-canvas PNG export only when selected.
- Gave every radial one layout: Mode west and the menu south-west on the canvas, objects, lines
  and slides and in every mode. One stroke west then toward Select, Add, Draw, Markup or Connect
  switches mode with nothing further to choose; Draw, Markup and Add then show their own tools in
  the ring. Wedges that open another ring do so in place on a rest or a stroke through them,
  with Back where the wedge was and no ring more than two levels deep. The menu opens only when
  a right click is released; a held button shows the ring alone. Shape, Capture, Straighten
  and Copy link moved from the ring to the menu and toolbar. Drawing hides workspace connection
  and resize widgets while retaining transform handles for lassoed ink.
- Attached object indicators directly to the painted edge, centered so lone badges stay close to
  curved stencils. Connected-copy handles move only when they overlap the indicator strip.
- Added Settings with independent Show, Selected and Hide preferences for comments, tags, markers,
  relationships and task/lock indicators. Indicators follow their object's paint order, rise on
  selection and use compact icons until selected. Markup and grid visibility share the display screen.
- Reduced default text padding from 14 to 8 units on ordinary objects and from 20 to 8 on sticky
  notes; free text and frame headers use 4. Cards reserve an image gutter only when they have an icon.
  Short objects retain usable text space while explicit padding stays intact. Frame titles retain
  their natural line height at low zoom rather than clipping their minimum readable font.
- Unified appearance and inline Markdown tools in one object-anchored container, with the same
  positioning for tag and relation controls. Child controls leave container titles draggable.
- Widened the radial menu and matched its neutral center, outer edge and submenu sectors to
  their visible hit regions. Relate now picks the next object clicked on the canvas, with Escape
  and right-click cancellation and optional name search.
- Moved comments, tags, markers and task/lock indicators out of label text into object chrome.
  Redesigned discussions with readable threads, explicit reply/resolve controls and a fixed composer.
- Added a visible Find and filter surface with named tag/marker highlights, counts and matching
  objects. Clicking an object's tag or marker opens the same discovery workflow.

### Agents

- Added explicit room sessions: `open_room` returns `session_id`, required by describe, read, write,
  undo and the new `close_room` tool. Room and edit history survive MCP reconnections and repeated
  initialization; tool calls also work without an initialization handshake or transport session header.
  Sessions remain caller-owned and memory-only, expiring after 30 minutes unused or relay replacement.

- Added discoverable canvas-language help with complete topic reads, replacing the full manual at
  connection time. MCP refusals signal errors and explain recovery; unexpected failures return
  references matched to server diagnostics. Relay journals ship to Ahara's shared logging stack.

- Changed the MCP instructions to the way assistants work best: plan the result and write it in
  large batches with chosen ids, treat slides as viewports with slide 0 as the deck's template,
  and keep people's edits when a result reports them. A line written in the language now joins
  the frame, group or slide its ends share, as a drawn line does; `in none` keeps it at the top
  level. Tools carry read-only and destructive hints for connector clients.

- Added `check_layout`, which reports overlaps, objects outside their holder and text that may
  not fit, without drawing anything. Findings are advisory, text overflow is estimated, and
  slide viewports and hidden or folded content do not produce overlap warnings. The instructions
  ask assistants to check after substantial batches; a complete batched-workspace example covers
  two diagrams, a wireframe, a mind map, four slide viewports and one template footer.

- Routed public MCP through the control Lambda so discovery, sign-in and clear availability
  messages work while the relay is stopped or starting. Room operations still execute on the
  relay, with the same authentication and session ownership. Forwarded writes are never retried.

### Canvas

- Fixed contextual popups retaining old participant names when shared information changed during
  the hover delay. Open popups also follow subsequent updates.

- Fixed numeric and name fields that restored deleted values while typing. Numeric drafts now
  validate on completion, report invalid values, preserve legitimate zeroes and undo as one edit.
  Mixed selections show mixed values; untouched property fields follow peers without overwriting
  their work. Conflicting property drafts remain available for explicit resolution.
- Fixed pending capture text loss, context-menu keyboard leakage, connected-copy drag interception
  and split Undo, table column resizing and names, and Find skipping its first result. Hidden
  search results can reveal one object. Password entry can be cancelled, home lists browser-local
  recent rooms, and protected-room exports explain their readable portable copies.
- Kept canvas access at phone/tablet widths with mutually exclusive tool/property panels, reachable
  File and participant controls, and speaker notes below the slide. Added custom hover/focus/touch
  help, clipped-text preview and Fit indicators, actual toolbar/ring color samples, primary connector
  and slide controls, and relationship directions that reflect arrowheads.

- Reorganized the rail into Add, Draw, Explore and Slides. All shape and icon libraries share
  collapsible headers; saved views, outlines, tags and history live in Explore, while slide
  creation and presentation share one area. Drawing instruments now have icons and gesture
  guidance, brush presets have explicit recall and save buttons, and annotation controls explain
  local visibility and shared deletion. Stroke recoloring appears only for selected strokes.
  The panel can fold away and starts folded on phones; library labels wrap within their cells.
  Restoring annotation visibility now redraws hidden ink immediately.

- Changed the property panel to show the selection's name and More menu, folded Markdown source,
  then task-specific controls: Connection for lines, or Slide and Speaker notes for slides.
  Appearance, Layout, Relationships, Tags and status, and other Comments remain available in
  folding sections remembered on the device, with sections that do not apply left out.
  Relationships lists the parent topic, holder, references and lines, and offers Add branch,
  Relate to… and Zoom into. Added relating an object to another by name, references that show
  while either end is selected, tag chips that suggest the room's tags, a Tag… editor above the
  selection, and a Tags section in the left rail that filters the canvas.
- Changed the ring to a compass on objects (branch north, relate east, delete south, tag west,
  the full menu south-west) and to creation and navigation on empty canvas; the menu groups
  commands by intent and folds alignment, distribution, tidying and markers into submenus.
  Branches grown with Tab are compact topics that grow with their text. Export, import and
  Include markup moved into the header's File menu.

- Changed the left rail to the stencils followed by collapsible panels that all open and close
  from the same header: Drawing, Outline, History, Slides and Saved views, each remembered as it
  was left on the device. History starts closed and shows its step count; the drawing panel
  takes the stencils' place while the draw tool is active. Rail entries, frame titles and slide
  titles end in an ellipsis instead of running past their boxes; the status bar, markup toggle
  and property panel fit at narrow widths, and dark mode no longer hides field text.

- Reduced UI work on larger canvases: navigation reuses label contents, middle-button drags use
  the native pan preview, and selection handles avoid repeated SVG measurements. Editing reuses
  unchanged document entries and skips their style and geometry work; viewport and presence
  updates no longer rerender the whole workspace, and outline queries build relationships once.

- Added readable history: undo steps named by what they did, in a rail panel that returns to any
  step. Added properties on objects, shown on hover and in labels as {name}, in the canvas
  language as `property`. Added copy as PNG, SVG export carrying the canvas text, and a tree
  copied as Markdown. Frame and slide titles stay readable at any zoom. Added touch and pen
  handling: finger pan, long press for the menu, two- and three-finger undo and redo, pen
  draws. The chrome follows the system's dark mode; canvas colours stay as authored. A live
  region announces the selection and tool for assistive technology.

- Changed the pointer buttons to the standard mapping: the middle button pans, a right click
  opens the context menu, and holding or dragging the right button brings the command ring, where
  a drag strokes a wedge. Only one menu mode is visible at a time. The browser's own menu stays
  away over the canvas and the ring.
  Comments now open on purpose, from the mark, Shift C or the menu, into a modal above the
  object instead of the property panel. Added a selection toolbar, quick-create dots
  that grow connected copies, connectors that make their target when dropped in space,
  change-shape-in-place, swap positions, reverse and straighten lines, fit a frame to its
  contents, docked frames, tables, task lists, arithmetic in the geometry fields and
  Alt-resize from the centre.

- Added presence that says where and what: a participant list with Follow, a call to bring
  everyone over that each person answers, a laser held on K, cursor chat on /, and links that
  open a room at an object. Viewports now travel on presence; nothing is written to the document.

- Added an outline of the selected tree in the left rail that folds, renames and reorders it;
  layout verbs that tidy a tree to one side, downward, compactly, sorted or balanced, tidy loose
  objects into a grid and lay a connected diagram out as a flow; numbered branches; slides made
  from a tree's branches; capture of notes that stack and become a tree; typed shorthand for
  tags, tasks and markers; a filter bar that dims what does not match and gathers what does.

- Added keyboard editing and walking of trees: arrows move through branches and siblings or to
  the nearest object, Alt Up and Down swap siblings, Shift Tab promotes, Ctrl Delete removes a
  topic keeping its branches, Ctrl Alt Arrow grows a connected copy, Ctrl Arrow nudges, digits
  show a number of levels, a period focuses on a subtree, and Alt Enter mid-text splits a topic.
  Trees written by an assistant in one go now lay out as they are written.

- Added copy and paste style, a per-page default look for new objects of a kind, selection by
  same type, style or fill, children, siblings and connected objects, invert selection, and Alt
  click to step down through stacked objects.

- Added find on canvas over names, subtitles, tags, comments and ids, stepping through matches
  with a pulse; zoom keys for 100%, fit canvas and fit selection; a typed zoom percentage; a view
  history with back and forward after every jump; and a Back to content button when the view
  is empty.

- Added copy, cut and paste: the selection copies as canvas language with its pictures and
  pastes into any room under the pointer or in place, canvas language from anywhere pastes as
  objects, and pasted lines become notes, a topic tree or a text block.

- Added a command palette on Ctrl/Command K that lists every command that applies with its
  shortcut, ranks what is typed and keeps recent commands first; hotkeys, the panel's actions and
  the rail's labels read the same command table. Added keys for the connector, text, ellipse and
  frame tools, lock, hide, collapse, tasks and zoom.

- Added fields every object and line carries, in the property panel, files and the canvas
  language alike: lock, hide, collapse with a folded count, tags, priority and progress markers,
  task checkboxes with done counts on holders and topics, links to addresses or canvas targets,
  and who last edited the object, person or assistant.

- Added shared markup with pen widths, highlighter, attached object outlines, drag-oriented
  arrows and common shapes, lasso selection and whole/partial erasing. Promote markup into
  editable Drawing objects, use closed fills and gradients, and export with or without markup.
  Drawings use the same canonical model and canvas language through MCP, files and the browser.

- Changed text edits and collective transforms to share their completed results while retaining
  immediate local editing, local persistence and concurrent text merging.

- Added Markdown canvas labels with nested lists, highlighted code fences, local LaTeX math,
  source-editing tools, preview, Copy Markdown, Copy plain text and Copy code. Agents and files use
  raw multiline strings for the same source. Added three bundled fonts, nine text positions,
  box-level text styling, spacing and fit/grow controls; PNG exports embed text CSS and fonts.

- Added slides: fixed-proportion viewports placed over the canvas, each in a deck with a number, in
  the canvas language too, and a presentation of a deck that hides everything but the slide, moves
  with arrows, goes full screen and shows the slide's comments as speaker notes. A deck's slide 0 is
  its template, drawn under every other slide.
- Changed comments to allow 20000 characters and several lines.
- Added Ahara accounts, signed in at auth.ahara.io, with email-code verification, whose name replaces the
  one typed into rooms.
- Added saved workspaces available on any device; a password room's saved copy stays encrypted under
  its room password, and a forgotten account password loses nothing.
- Added agents: signed-in people add Arconis to Claude or ChatGPT on the web as a custom connector
  with only its address, and the assistant reads and writes a room in the canvas language while
  people work alongside it, building a whole architecture in one write.
- Added the canvas language: frames within frames, rows, columns and grids, placement beside or
  aligned with other items, named styles, and lines with ports, labels, chains and fan-outs.
- Changed files to the canvas written in that language; earlier files and rooms no longer open.
- Added subtitles, cards, bands behind items across frames, frame badges, titles at the top or side,
  vertical text and labels, and named styles in the property panel.
- Changed the Panel stencil to Frame, and a line's comments now sit on the line itself.
- Added frames that keep their row, column or grid arranged as anyone adds, removes or drags items.
- Added routing a line around the items between its ends, which places its points for people to
  drag afterwards; lines with an arrow at each end; and lines that share a trunk and split at a
  junction.
- Changed line types to cornered, diagonal and curved.
- Added pasted and dropped pictures in every room, uploaded once and carried in exported files.
- Added threaded comments on any object or line, visible to everyone in the room.
- Added nesting in any object, with children moving along with their parent.
- Added alignment, distribution, drag guides and common screen sizes.
- Added branching topics built from the keyboard, references between them, and tidy layout, on any object or line.
- Added zooming into any object for finer detail, with objects too small to see no longer drawn.
- Added a visible grid with snapping, which each person can turn off.
- Added PNG export of the selection or whole canvas, carrying a copy that Import can load in any room.

### Collaboration

- Replaced AWS AppSync Events with a relay on EC2 that runs only while a room needs it, with a hard monthly spending limit.
- Added a Start collaboration button and status showing that collaboration is starting, off, or off until next month. Editing and saving continue locally throughout, and work merges when collaboration returns.
- Added password rooms, encrypted in the browser on the wire and on disk, with no recovery of a forgotten password.
- Added rooms that work on this device only, opening no connection at all.
- Removed the connector From and To menus; drag either end of a connector to re-attach it.
- Reduced collaboration traffic: one person answers a join, idle rooms exchange almost nothing, and hidden tabs send no presence.

### Bug fixes

- Fixed Drawing transforms through MCP, connector isolation during markup conversion, wide-stroke
  promotion bounds, sparse eraser sweeps, rotated highlight picking, drawing-only recolor,
  gradient handles and named-style clipping. Numeric resizing preserves inherited appearance.
- Fixed peer caret positions during whole-field composition and made topic creation one Undo step.

## v1.0.0 - 2026-11-07

### Canvas

- Added one canvas holding rectangles, ellipses, diamonds, services, databases, clouds, people, sticky notes, text and freehand drawings.
- Added pan, cursor-centered zoom, selection, multi-selection, dragging, resizing, deletion, duplication, grouping and undo.
- Added connectors attached to objects, with orthogonal, elbow and straight routing, between any mix of shapes and notes.
- Added rotation for single shapes, and a selection frame that scales and rotates several objects or a drawing together.
- Added bring-to-front and send-to-back controls, with the same stacking order in every browser.
- Added named saved views, and file export and import.
- Added direct text editing, with new notes opening ready for typing.
- Added a single toolbar exposing every tool.

### Collaboration

- Added anonymous rooms created and joined by link or code, with no accounts.
- Added near-real-time sync of objects, text, styles, connections and groups through AWS AppSync Events.
- Added late joining from active peers, offline editing with resynchronization, and local recovery on reload.
- Added participant names and cursors, and dashed outlines of objects peers are moving or resizing.
- Added status showing whether a room is looking for participants, receiving the canvas, in sync or alone on this device.

### Bug fixes

- Fixed long labels so they wrap inside notes and shapes instead of being clipped.
- Fixed canvas Shift-click so it adds to the selection.
- Fixed connection handles so dragging one creates a connector.
- Fixed keyboard shortcuts so they keep working after clicking interface controls.
- Fixed freehand drawing so strokes keep their drawn shape instead of snapping to a grid.
- Fixed new groups so they appear styled immediately for the person who created them.
- Fixed concurrent grouping and moving so objects keep their position.
- Fixed text editing so a peer's edit no longer moves your caret.
- Fixed offline recovery when a connection closes without completing its handshake.
