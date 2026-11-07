# Using the canvas

Create a room, then click a stencil in the left rail and click the canvas, or drag a stencil onto the
canvas. New notes and text open ready for typing; double-click edits any object directly.

## Selecting and transforming

- Shift-click, Ctrl-click or Command-click toggles an object in the selection.
- Dragging across empty canvas selects an area.
- Handles resize a shape, and the top handle rotates it.
- Several objects or a drawing get a frame: its corners scale and its top handle rotates the whole
  selection. Hold Shift to keep proportions or snap the angle.

Selecting something opens the property panel on the right, showing only what applies to it. With
several objects selected, it applies styles to all of them.

## Composing

Any object can hold others. Dragging an object onto a larger one, or placing one inside it, adds it,
and dragging it out releases it. Moving an object moves what it holds, and resizing leaves them alone.

A panel is a titled container from the stencil rail, and the Screens stencils are panels at common
device sizes, which the property panel can change. Select several objects to align or distribute
them, and guides appear while dragging.

## Topics and depth

Any object can be a topic, including a screen, a panel of notes or a line.

- Tab grows a branch from the selection, and Alt Enter adds a sibling. Both also work while typing, so
  a tree can be written from the keyboard.
- Moving a topic moves its branches. Hold Alt to move it alone. Tidy Branches lays out its tree.
- Select two objects and choose Add Reference to link them without a line. A topic shows `↗` and a
  count, and the property panel lists references to follow. The Reference Lines button beside the zoom
  controls draws them.
- Z zooms into the selection and Shift Z zooms back out. Anything placed while zoomed in lands inside
  what it is placed on, at that scale. Objects too small to see are not drawn, and a label shows `⊕`
  when it holds hidden detail.

A group ties a selection together with a frame that fits its members. Select several objects and
choose Group in the property panel, or press Ctrl/Command G. Ungroup dissolves a group.

## Accounts and saved workspaces

Rooms need no account. Signing up takes an email, which must be activated with a code within 7 days, and
a name, which then replaces the name you would otherwise type into rooms. The cloud button in the header
saves the room to your account and keeps it saved, merging with anything saved from another device.
Saved workspaces open from the account menu on any device, with nobody else online.

Workspaces are encrypted with your password in your browser. Resetting a forgotten password keeps them
only if you still know the old one; otherwise they are lost.

## Password rooms

"Create a password room" on the welcome screen asks for a password, and everyone joining by link needs
it. Everything in the room is encrypted in the browser: the document, presence, pictures and the copy on
this device. Nothing can recover a forgotten password, so the room would be lost. The key button in the
header changes it; people already in the room stay in, and anyone joining later needs the new one.

Someone joining from a new device needs another person in the room to be online, because they hold what
the password opens.

## Pictures

Paste a picture to place it at the pointer, or drop an image file on the canvas. Pictures keep their
proportions when resized. While collaboration is off, a picture stays on this device and uploads when
it returns. In a device-only room, pictures never leave the browser. Exported files carry their pictures.

## Comments

Select an object or line to comment on it in the property panel, reply, resolve or delete. Everyone in
the room sees comments, signed with the display name at the time. A label shows `💬` and a count of open
threads. Comments stay out of undo, and return with their object if its deletion is undone.

## Icons

Search the stencil rail for shapes and icons, or browse its sets, including AWS, Azure and Google Cloud.
Icons place, connect, resize and label like other objects. Vendor icons keep their colors and
proportions and cannot rotate, as their terms ask.

## Connecting

Connect objects in any of three ways:

- Choose the connector tool and click two objects.
- Hover an object to see its connection points, then drag from a point to a point on another object.
  Dropping on an object's body leaves that end free to follow its outline.
- Select two objects and choose Connect.

## Shortcuts

| Keys | Action |
| --- | --- |
| V | Select |
| H, or hold Space | Pan |
| Scroll | Zoom around the pointer |
| N, R, D, P | Note, rectangle, decision, draw |
| Delete | Remove the selection |
| Ctrl/Command Z, with Shift to redo | Undo and redo your own work |
| Ctrl/Command D | Duplicate |
| Ctrl/Command A | Select all |
| Ctrl/Command G, with Shift to ungroup | Group and ungroup |
| ] and [ | Bring to front and send to back |
| Enter | Edit the selection's text |
| Tab, Alt Enter | Add a branch, add a sibling |
| Z, with Shift to go back | Zoom into the selection |

## Rooms and sharing

Share Room provides the link. Visitors arriving by link are asked for a display name once, and the
participant badge changes it. Peers' cursors appear on the canvas, with a dashed outline around
anything they are dragging or resizing. The status bar shows whether the room is looking for
participants, receiving the canvas, in sync or alone on this device.

## Views and files

Saved views at the bottom of the left rail store a place and zoom. Save the current place with the
plus button, click a view to fly there, and hover it to rename or remove it. Views are shared with the
room and do not move other participants. Export downloads a
portable `.arconis` document, and Import adds its contents to the current room.

Export PNG downloads a picture of the selection, or of the whole canvas when nothing is selected. The
file carries a copy of those objects, so Import loads it like a document, in any room.

## Grid

The grid button beside the zoom controls shows or hides the grid, and objects snap to it only while it
shows. The setting belongs to each person and stays with their browser.

## Rooms on this device

"Work on this device only" on the welcome screen creates a room that never connects to the relay.
Nothing in it leaves the browser, and it has no link to share.
