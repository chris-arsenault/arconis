# Changelog

All notable user-visible changes are recorded here.

## Unreleased

### Canvas interactions

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
