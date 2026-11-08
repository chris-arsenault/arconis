# Changelog

All notable user-visible changes are recorded here.

## Unreleased

### Canvas

- Added slides: fixed-proportion viewports placed over the canvas, each in a deck with a number, in
  the canvas language too, and a presentation of a deck that hides everything but the slide, moves
  with arrows and shows the slide's comments as speaker notes.
- Changed comments to allow 20000 characters and several lines.
- Added Ahara accounts, signed in at auth.ahara.io, with email activation, whose name replaces the
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
