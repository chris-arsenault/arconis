# Changelog

All notable user-visible changes are recorded here.

## Unreleased

### Collaboration

- Replaced AWS AppSync Events with a relay on EC2 that runs only while a room needs it, with a hard monthly spending limit.
- Added a Start collaboration button and status showing that collaboration is starting, off, or off until next month. Editing and saving continue locally throughout, and work merges when collaboration returns.

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
