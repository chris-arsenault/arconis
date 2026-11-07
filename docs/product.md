# Product scope

Arconis is a shared spatial workspace for creating, organizing and connecting ideas. People
brainstorm with sticky notes, connect them, add architectural components and develop the
result into a structured diagram, all in one document with no conversion between object types.

## Canvas

- Pan and zoom across a large coordinate space, zooming around the pointer.
- Place, select, multi-select, drag, resize, transform and delete objects of any type.
- Stay responsive with realistically sized diagrams.

## Diagramming

- Rectangles, ellipses, diamonds and basic architectural components.
- Editable labels and shape properties.
- Connectors attached to objects, with orthogonal routing, that stay attached when objects move.
- Grouping and ungrouping.

## Sticky notes and drawing

- Create notes anywhere, edit their text directly, move and resize them, and choose from a small
  color palette.
- Draw freehand on the same canvas, with drawings moving and transforming like other objects.
- Save named viewport positions.

## Relationships

Connectors join shape to shape, sticky to sticky and sticky to shape. Every object lives in one
document and takes part in the same relationships.

## Collaboration

- Participants in a room see object creation and deletion, position and size changes, text edits,
  connector changes, group membership and styles in near real time.
- Concurrent changes converge without lost objects or duplicate updates.
- Each participant controls their own viewport and selection.
- Presence shows names, cursors and in-progress drags.
- A late joiner receives the document from an active peer, a disconnected participant
  resynchronizes, and a returning browser restores its local copy.

## Rooms

Creating a room generates an unguessable identifier in the browser. Joining accepts a shareable
URL or room code. Participants may supply an ephemeral display name. Changes stay within their room.
Rooms are sized for small groups of up to about fifteen people working on canvases of hundreds to
thousands of items.

## Agents

A signed-in person can connect an agent, such as Claude Code, through MCP. Given a room's link, the
agent reads and writes the canvas in the Arconis canvas language: nodes, cards, frames, bands, notes,
lines, topic trees, references, named styles and discussions, placed beside or aligned with one
another. One write can lay out a whole architecture, frames within frames. People in the room see its
changes as they happen, and it is told what they change. Agents work only in ordinary rooms someone has
open.

## Boundaries

Arconis is a small multi-user visual workspace. Rooms need no account, and the relay keeps no copy of
a room. It focuses on the canvas rather than project management or facilitation tools such as voting,
timers and templates. Its files are the canvas written in its own language rather than draw.io files,
and agents read and write the same text. The [ADRs](adr/README.md) record why, and the
[backlog](backlog.md) holds planned additions.

Rooms suit non-sensitive work: see [Limitations](architecture.md#limitations).
