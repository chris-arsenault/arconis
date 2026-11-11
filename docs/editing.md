# Using the canvas

The left side holds what you make with; the right side holds the document and the selection. The
same room holds diagrams, notes, topic trees, pictures, ink and slides.

For a first walkthrough, start with [your first shared canvas](getting-started.md).
For a particular command, jump to [commands and shortcuts](#commands-and-shortcuts) or search
Help in the app. For a drawing with real distances, see [scale and measurement](#scale-units-and-measurement).

## Workspace controls

The left rail has the tools **Select**, **Pan**, **Connect** and **Markup**, and two panels:
**Shapes** for stencils and icon libraries, and **Draw** for ink in the active layer. Markup opens
its own bar over the canvas and leaves the panel as it was. **Hide panel** leaves the tools and
panel buttons available while giving the canvas more space.

The right dock shows the selected object's properties, and beneath them three document panels:
**Layers** for organising the canvas, **Slides** for building and presenting decks, and
**Navigate** for jump points, topic outlines, tags and history. Choosing a panel's tab opens it
and choosing it again folds it away. With nothing selected and no panel open, the dock narrows to
its tabs.

On phones, the left panel starts hidden; choosing a panel opens it over the canvas, and choosing
a stencil closes it for placement. **Properties**, or **Panels** when nothing is selected, opens
the dock over the canvas. The left panel and the dock share that space so the canvas stays
available.

## Help and tour

The **help zone** at the foot of the left panel names the control under the pointer or keyboard
focus and says in one sentence what it does. When the panel is hidden, the help appears below the
header while you point at a control. On touch screens, hold a control to read its help without
activating it. **Settings** can hide the help zone on this device.

**Help** in the header, or **?**, opens Help in the middle of the screen: the topics on the left,
and on the right the chosen guide section or every command with its shortcut. Search finds guide
sections, and links between guides open inside Help. Pressing **?** while pointing at a panel or
header control opens the guide for that area. Escape clears a search, then closes Help. On a
phone, Help shows the topics first and **Topics** returns to them from a guide.

The first time you open a room in a browser, Arconis offers a short tour. Each step highlights one
area of the workspace, from the canvas and tools to slides, settings, feedback and help. The canvas
steps accept real input, so you can drag, zoom and right-click while they explain it; the tour
itself changes nothing in the room. **Take the tour** in Help runs it again. Arrow keys or
**Next** and **Back** move through it; Escape ends it.

Information about content and people, such as who is in the room, an object's tags or the full
text of a clipped label, appears in a small tooltip beside it. Escape closes the tooltip before
affecting the canvas selection.

## Canvas display

Open **Settings** in the header to control your canvas display. One **Indicators** setting covers
comments, tags, markers, relationships and task/lock signs: **Show**, **Selected** or **Hide**. The
preference stays in your browser; hidden indicators leave their information available in Properties.
Unselected objects use compact icons, with tag names and single-item counts expanding on selection.
Indicators stack with their objects and rise while selected. Settings also offers markup and grid
visibility, alongside their existing drawing and view controls.

## Send usability feedback

Open **Feedback** in the header and describe what you tried and what was confusing. Guests can
submit without signing in. Reports are stored privately with your display name, available account
email, app version, browser and viewport, room details, connection state and editor diagnostics.
Passwords, room keys and authentication tokens are excluded.

**Include a screenshot of the canvas** starts unchecked. Selecting it attaches the standard PNG
export of the visible canvas, including markup and editable content, even when an object is selected.
This is a readable export outside the room's password protection. If submission fails, the form
keeps your text and screenshot choice so you can retry.

## Place and name objects

Open **Shapes**. Click a stencil, then click the canvas, or drag the stencil directly onto it.
Select returns after each object. Press **Q** to keep the tool in hand instead, so each click
places another of the same kind without opening its text; **Q** again or Escape ends it.
Basics include notes, free text, rectangles, ellipses, decisions and frames. Architecture stencils
include services, databases, clouds and people. Every library, including Screens and cloud
providers, opens and closes from its header and remembers that choice on this device. Search
finds items across libraries even when they are closed. Create slides from **Slides** in the
right dock.

Notes and free text open ready for typing. Double-click another object or select it and press
Enter to edit its label. Use **Ctrl/Command Enter**, Escape, or leave the source/tools to finish
and keep the edit. Enter alone adds a line. [Text and formatting](text.md) explains Markdown,
code, equations, preview and copy controls.

The header's **Canvas title** names the document. The object label is separate from the document
title.

## Select and transform

- Press **V** for Select. Click an object or drag across empty canvas to select an area.
- Shift-click, Ctrl-click or Command-click toggles an object in the selection. Alt-click on
  stacked objects steps down to the one beneath the selection.
- The command palette offers **Select same type**, **same style**, **children**,
  **siblings** and **connected**, and **Invert selection** (Ctrl/Command Shift I).
- Drag the selection to move it. Single-object handles resize it; the top handle rotates eligible objects.
- Several objects, groups and drawings get a collective frame. Its corners scale the selection
  and its top handle rotates it. Hold Shift for proportions or angle snapping.
- The property panel's geometry fields set exact positions and dimensions. They take
  arithmetic, such as `200+40` or `*2` against the current value, apply on Enter or when left,
  and step by one with the arrow keys or ten with Shift. Hold Alt while dragging a resize
  handle to scale from the centre.
- Use **Duplicate**, **Delete**, **Bring to front** and **Send to back** in the panel or through
  their keyboard shortcuts.

Styling controls apply to the selection. Choose fill, line color/width, text appearance and
other controls that apply to the selected type. Named styles supplied by a file or assistant
appear in **Style**; item overrides apply over that style. Clearing a property through the
canvas language restores its inherited/default behavior. Numeric fields preserve empty and partial
drafts; Enter or leaving the field applies a valid value as one Undo step, while Escape cancels.
Invalid values remain editable with an explanation. Marker, task, links and appearance show mixed
values for a selection; **Clear links** removes every selected object's link.

**Copy style** (Ctrl/Command Alt C) remembers one object's named style and look, and **Paste
style** (Ctrl/Command Alt V) applies them to the selection in place of its own. **Use as
default for new …** makes the selected object's look what new objects of its kind start with
on this page.

Ordinary selection reaches workspace objects beneath markup. Use Markup's
[Select annotations](drawing.md#markup) for annotation paths. Use **Properties** to open the
panel in the narrow layout.

## Pan, zoom and grid

Press **H** or hold Space to pan with a drag; release Space to return to Select. The middle
button drags the view as well. Mouse-wheel scrolling zooms around the pointer; trackpad
horizontal or smooth scroll gestures pan, and Ctrl/Command scrolling zooms.

Use the bottom view controls to zoom or fit the canvas; click the multiplier to type a zoom,
such as `0.5` or `2`. The normal view is `1×`, centered in a reciprocal range from `2⁻²⁰` to
`2²⁰`. Four button or shortcut steps double or halve magnification. Wheel zoom keeps the
point beneath the pointer; buttons and typed values keep the viewport center.
Hold **O** to peek at the whole canvas. Releasing it returns to the view you had; move the
pointer during the peek and the release lands where it points, at the zoom you had.
**Z** zooms into the selection; **Shift Z** returns toward the previous scale. **Shift 0**,
**Shift 1** and **Shift 2** go to normal zoom, fit the canvas and fit the selection. Every jump, from
fitting to following a link or a found match, is remembered: **Ctrl/Command [** returns to the
view before it and **Ctrl/Command ]** goes forward again. When the view holds none of the
canvas, a **Back to content** button appears. New objects created at deep zoom have an
appropriate scale for that view.

At distant zoom, details too small to read can disappear from the view. Zoom in or select an
object to see it again. Objects outside the window are also skipped while drawing the view;
they remain in the document and can still appear in a full-canvas export. This is separate
from hiding a layer or collapsing a topic. Use
[Find on canvas](#find-on-canvas) to locate something you cannot see.

Resizing the browser window preserves the center of your view. Opening or closing a side panel
keeps content in place; neither operation changes the drawing's scale calibration or geometry.

The grid button shows or hides the grid. Objects snap while the grid is shown. This preference
belongs to your browser. Fine drawing paths follow the pointer rather than snapping to the grid.
For distances and grid intervals in concrete units, see [scale and measurement](#scale-units-and-measurement).

## Right button: ring and menu

A right click opens the menu at the pointer when the button is released. Holding the right
button, or moving it, brings a ring of eight commands around the press point instead; drag past
a short dead zone toward a wedge and release to stroke it without looking. Released anywhere but
a wedge, the ring closes and no menu follows. The ring and the menu change with what was pressed: an object, a line, a slide or
empty canvas. A right click on an unselected object selects it; one on a member of a selection
keeps the selection. Empty-space right-click opens canvas actions even when an object was selected.
The browser's own menu never appears over the canvas. Tab and arrows navigate the open menu;
Escape closes it and preserves the selection.

Every ring keeps two wedges in the same place, whatever was pressed and whatever the mode:
**Mode** to the west and **More**, the full menu, to the south-west. The other six belong to
what was pressed, or to the mode when it has tools of its own.

**Mode** switches what the pointer does. Stroke west onto it and a ring of **Select**, **Add**,
**Draw**, **Markup** and **Connect** takes the ring's place, with the current mode outlined;
carry on toward one and release. That is the whole switch: Select is the next wedge up, Draw and
Markup return to the tool each last used, and Add arms the shape last placed. In Draw, Markup
and Add the ring then holds that mode's tools wherever it is pressed, so changing tool is one
more stroke and never a required step.

A wedge with a rim on its outer edge opens another ring: Mode, Colour, and in Draw the
vector shapes and erasers. It opens when a held pointer rests on it or strokes
out through it, and when clicked. The new ring takes the old one's place, and **Back** takes the
place of the wedge that opened it, so the same spot leads in and out. No ring opens a third. Escape cancels an unfinished
choice.

The ring on an object reads like a compass, so a stroke can be learned once:

| Direction | Command                     | Direction | Command             |
| --------- | --------------------------- | --------- | ------------------- |
| North     | Add branch                  | South     | Delete              |
| East      | Relate to another object    | West      | Mode                |
| Northeast | Colour, a sub-ring of fills | Southwest | More: the full menu |
| Southeast | Comment                     | Northwest | Tag                 |

A line's ring keeps delete south and tag north-west, with comment, colour, reverse and route
around them; a slide's leads with Present. On empty canvas the ring places a note, text or
frame, pastes, fits the canvas or opens find. **Select all** and **Capture** are in the canvas
menu, and the grid and reference lines live in the view controls. The selection toolbar's
**Change shape** opens a ring of kinds the object can become, keeping its text, size, contents
and lines.

The menu groups the same commands by intent: text, structure (branch, sibling, relate,
connect), tags and status, arrangement, visibility, clipboard, view, and delete last. Families
fold into submenus that open in place: **Align**, **Distribute** and **Marker**.

The **selection toolbar** sits beside the selected object, with fills, line colour, text size,
shape, comment and the rest of the menu. Editing text swaps its contents for Markdown tools in
the same container. It follows the object through pan and zoom and steps aside while dragging;
the ring brings the same commands to the pointer. The one
selected object also shows a dot on each side: click a dot for a connected copy in that
direction, or drag it to place the copy where you release. Dragging a connector from an
object's connection point into empty space makes a new object like the source at its end.

## Comments

Comments open deliberately, never on hover: click an object's comment badge, press **Shift C**
with it selected, or choose **Comment…** in the menu. The threads appear in a modal above the
object, at the front of everything. Each thread shows its author, time, replies and resolve action;
the new-comment composer stays available while the discussion scrolls. Resolved threads fold
behind an **N resolved** line. The modal follows the object as you pan and zoom, stays inside
the window, and closes on Escape, a click outside, or opening another object's comments. The
property panel's Comments section only counts the threads and opens the modal. Lines open at
their label; slides' comments remain their [speaker notes](slides.md#add-speaker-notes).

Everyone sees shared comments signed with the display name used when they were written. The
object's comment badge counts open threads without changing the label layout. Comments stay outside document Undo; undoing an
object's deletion brings its retained comments back with it.

## Scale, units and measurement

Use a scale when the size of objects should mean something: a room plan in metres, a component
layout in millimetres, or a custom drawing in your own units. Leave the canvas uncalibrated
for diagrams whose box sizes are just for readability.

The scale bar above the bottom controls shows a distance at the current zoom. Click it to open
**Scale and units**. Paper, Electronics, Product, House, Site and Geography presets assign a
distance to the reference line of 100 canvas units, shown at `1×` in the settings. For example,
House makes that line represent 1 m. Custom accepts any positive distance and a unit label.
The bar chooses readable intervals and changes units as you zoom; calibration itself stays fixed.

| Preset      | Distance represented by the reference line at 1× |
| ----------- | ------------------------------------------------ |
| Paper       | 25 mm                                            |
| Electronics | 10 mm                                            |
| Product     | 100 mm                                           |
| House       | 1 m                                              |
| Site        | 100 m                                            |
| Geography   | 1 km                                             |

These are starting scales. Choose one for the size of drawing you are making, then use a known
distance to calibrate an imported plan when necessary. A custom unit can be a label such as
`tiles`; it has no automatic conversion to metres or other physical units.

Calibration is shared with collaborators, supports Undo and travels with a complete canvas file.
Changing it reinterprets distances without moving or resizing objects. Display units are a local
preference: switching metres to feet converts the values without changing the calibration.
Uncalibrated documents use canvas units (`u`). Paper units describe the drawing, not the physical
size of pixels on your monitor; geographical distances describe a flat drawing.

Choose **Measure distance** beside the bar, or in the command palette. Drag between two points,
or click a start and end point. The readout shows total distance and horizontal and vertical
components. It stays constant as you pan or zoom. Enter places an endpoint, arrows move it,
and Shift with an arrow takes a larger step. Shift while pointing constrains an axis; Alt bypasses
snapping. Escape clears a measurement, then exits. Measurements are temporary and do not create
objects or document Undo steps.

For a known distance in a drawing, measure it, enter its real distance and unit, then choose
**Calibrate this distance**. Geometry fields and live resize feedback use the same conversion.
Geometry fields accept compatible unit suffixes, such as `240 cm` while displaying metres.
Text and other style values keep their existing meaning.

The grid chooses `1`, `2` or `5` intervals in the working unit, with snapping to the visible minor
interval. **Set fixed grid** keeps an explicit distance, such as 2.54 mm for electronics. When
zoomed out, the display skips lines while retaining that snapping interval. The settings show the
actual interval. Grid spacing stays fixed during an active drag; changing zoom never moves objects.

Your calibration is part of the shared drawing. The display unit, grid visibility and fixed grid
choice belong to your view. For example, one person can read a house plan in metres while
another reads the same geometry in feet.

## Find on canvas

**Find and filter** at the top right, or **Ctrl/Command F**, opens search and metadata highlights.
The words you type match names, subtitles, tags, markers, comments and ids. Use `#tag` for an exact
tag match. Choose named tag or marker chips to highlight related objects and list their matches.
Enter, Shift Enter and the arrows step through the matches in reading
order, flying to each one, selecting it and ringing it briefly; the list beneath shows the first
matches. The first Enter visits the first match. Escape closes find.

## Containers and groups

Shapes, notes, pictures, frames and groups can hold workspace items. Slides are viewports and
hold nothing. Place a smaller
object inside a larger one, or drag an existing object onto it, to give it that holder.
Drag an object out to release it. Moving a holder moves its contents.

Container resizing normally leaves children at their stored positions. For a frame or group,
enable **Scale content on resize** in Properties to scale held ink, shapes, text, pictures and
paint together. Nested content scales once. Pictures and vendor icons keep their proportions.
A frame with an active arrangement also reflows its members.

## Layers

Layers stack the canvas in named collections. Open **Layers** in the right dock to see them top
first, down to **Workspace**, where existing objects start. Slides sit beneath every layer and
show whatever is visible within them. Markup annotations sit above every layer and belong to
none; [Markup's bar](drawing.md#markup) shows and hides them.

- Click a layer's name to choose it. New objects and Draw's ink go into the chosen layer.
- **New layer** adds a layer above the chosen one and chooses it. Double-click a name, or use
  **Rename**, to rename it.
- Drag a layer onto another to put it above that layer, or use **Move up** and **Move down**.
- The eye button hides or shows a layer in your view only. Other people keep their own view.
- **Merge down** moves the chosen layer's objects into the layer beneath, keeping how they stack,
  and removes the layer. **Delete** removes the layer and its objects for everyone. Undo restores
  either. Workspace stays; it cannot be merged away or deleted.
- **Move selection to** a layer puts the selected objects on top of the chosen layer. The
  **Layer** field in Properties does the same for the selection.

A frame, group or other holder keeps its contents on its own layer. Move the holder to move them,
or drag an object out of its holder first; it keeps the layer it was in.

A **Frame** is a titled container. **Screens** in the stencil rail creates frames at common
device sizes, which resize like any other frame. A **Band** supplied through
the language spans behind items without holding them.

Select several objects and choose **Group** or press Ctrl/Command G to wrap them together.
**Ungroup** dissolves a group while keeping its members. Deleting a holder deletes what it
contains and connected relationships; Undo restores the document edit.

Use **Align** with multiple boxes to align edges or centers. Distribution controls become
available with enough objects to establish gaps. While you drag, guides line up edges and
centers. An object that nears equal spacing with its neighbours in a row or column snaps there,
and each of the equal gaps is marked with its size. With one object selected, hold **Alt** and
hover another to read the distances between them.

### Docked frames and task lists

Frames whose edges meet are docked: dragging the shared edge of one resizes its neighbour so
the edge stays shared, which makes a row or column of frames behave as swimlanes without a
lane object. Move a frame as a whole and its neighbours stay where they are.

**Insert a task list** in the command palette places a column frame whose members are tasks: the
title counts how many are done, done tasks recede, **Alt Enter** while typing a task adds the
next one below it, and anything dragged into the list becomes a task. Assistants write it as
an ordinary frame and tasks in the canvas language.

### Arranged frames

An assistant or imported file can define a frame as a row, column or grid. Such a frame stays
arranged as participants add, remove or move members. Drag a member toward another slot to
reorder it. An arrangement groups positions; it does not create a separate editing mode.

See [assistants and MCP](agents.md) for creating arranged frames through the canvas language.

## Connect objects

Connect workspace objects in any of three ways:

1. Choose **Connector: click two objects** and click the start and end.
2. Hover an object to expose connection points, then drag from a point to another object.
   Dropping on its body lets that endpoint follow the outline.
3. Select two objects and choose **Connect with a line** under Relationships in the property
   panel, or **Connect** in the menu.

Select a connector to set **Line type** to Cornered, Diagonal or Curved, and choose its start
and end arrowheads. Drag either endpoint to reattach it. Drag its segments or points to adjust
the route.

Where two cornered or diagonal connectors cross, the flatter one hops over the other, so a
crossing reads differently from a junction. Curved connectors cross plainly.

**Route around items** computes a route around objects and labels between its ends. Rerun it
after moving obstacles when you need a new route. Language-authored shared fan-outs use a
junction where several lines share one trunk.

Workspace ink and panels can be connected as objects. Markup stays outside connector topology.

## Topics and depth

Any workspace object can serve as a topic, including a frame, an ink path or a line.

- **Tab** adds a branch from the selected topic; **Alt Enter** adds a sibling. A branch is a
  compact topic in its parent's style, one line tall, that grows as its text wraps.
- Moving a topic carries its branches. Hold Alt while moving to move that topic alone.
- **Tidy branches** lays out the selected topic's descendants the way that topic remembers.
- **Z** zooms into the topic. Small details are culled from the view, and a label's `⊕` mark
  signals hidden detail beneath it.

Tab and Alt Enter also work while typing ordinary topic text; Alt Enter in the middle of the
text splits it, the rest becoming the new sibling. In lists and code, Tab instead performs
[source indentation](text.md#format-content).

The keyboard walks and edits a tree without the pointer:

- **Arrows** move the selection through the tree: left and right between a topic and its
  branches, up and down between siblings. Away from a tree, an arrow selects the nearest
  object in that direction.
- **Alt Up / Alt Down** swap a topic and its whole subtree with the sibling before or after it.
- **Shift Tab** promotes a topic to its parent's level. **Insert a parent topic** in the command
  palette puts a new topic between a topic and its parent.
- **Ctrl/Command Delete** deletes a topic while its branches move up to its parent and its
  contents stay.
- **Ctrl/Command Alt Arrow** grows a connected copy in that direction: a branch in a tree, a
  line elsewhere.
- **Ctrl/Command Arrow** nudges the selection by one grid step; with Shift, by ten.
- **1 to 9** show that many levels of the selected tree, folding the deeper topics.
- **.** focuses on the selection: its tree, contents and references stay bright while all else
  dims. Escape or **.** again leaves focus. Clicking a label's `▸N` count expands it.

**Outline**, under **Navigate**, shows the selected tree as text, or every tree when nothing is
selected: the chevrons fold and unfold, a click flies to a topic, a double click or F2 renames
it, and with a row focused, Tab indents it under the topic above, Shift Tab promotes it, Enter
adds a branch, Shift Enter a sibling, and Alt Up or Down reorders it.

**Tidy branches** is one command, and the tree remembers how it is tidied. Select the topic that
heads the tree and, under **Relationships** in the property panel, choose its **Tidy direction**:
**Sides as placed** keeps each branch on the side it is on, **Balanced on both sides** alternates
the branches around the root, and **To the right**, **To the left** or **Downward** put them all
one way. **Compact** tightens the gaps and **Sorted by name** orders the branches. Each choice
tidies the tree at once, is shared with the room and travels with a file; **Tidy** afterwards
lays the tree out the same way. Assistants write the same words: `tidy root down sorted`.

For objects that are not a tree, **Tidy into a grid** lays loose objects in rows, and **Lay out
as a flow** ranks connected objects left to right along their lines.

**Number branches** under Relationships gives a topic's branches tiered numbers, 1, 1.1, 1.2,
shown before their names, so a person or an assistant can say "change 2.3".

**Slides from branches** makes a deck named for the selected root: a slide over the whole tree,
then one over each main branch, ready to present. **Capture notes** (Shift N) opens a box where
each Enter drops a note under the last at the pointer; **Make a tree** turns the stack into a
tree headed by the first note, including any pending idea still in the capture field.

A reference relates two objects without adding tree structure or a drawn connector, as "see
also". Choose **Relate to…** from the ring's east wedge, the menu or the property panel, then
left-click the target object on the canvas. Escape or a right click cancels target picking.
**Search by name** is available as an alternative; with two objects selected the same command is
**Relate these two**. A relationship badge outside the label shows the count. A reference's dashed line shows while
either end is selected, and **Reference lines** beside the view controls shows them all.

## Copy, cut and paste

**Ctrl/Command C** copies the selection, with everything it holds and the lines among it, as
canvas-language text with its pictures: the same text files and assistants use. Paste it into
another room, a file or a chat, and paste any canvas language back onto a canvas.

- **Ctrl/Command V** pastes centred under the pointer, or in the middle of the window when the
  pointer is elsewhere. **Ctrl/Command Shift V** pastes in place, at the copied positions.
- **Ctrl/Command X** cuts: a copy, then the deletion.
- Pasted plain text of one line becomes a text block. Several lines ask what they should become:
  one note per line, a topic tree read from indentation, or one text block. With an object
  selected, the tree branches from it; indented text suggests a tree, other text suggests notes.
- Text written for another tool is offered first as the objects it describes, beside the same
  plain-text choices: a Mermaid flowchart, state, class or entity diagram or mind map, a D2
  diagram, a PlantUML diagram or mind map, a draw.io diagram, or an OPML outline. See
  [diagrams and outlines from other tools](files.md#import-diagrams-and-outlines-from-other-tools).
- A pasted picture lands under the pointer, as before.

## Property panel

Selecting something shows its properties at the top of the right dock, in the same order for
every kind of object. Its head names what is selected; click the name to edit it on the canvas, or **More**
for the full menu. **Edit source** unfolds the label's Markdown. Then come:

- **Relationships**: the topic it branches from, the frame it sits in, its references and lines,
  each a row that flies to the other end, with its branch count, **Tidy** and its options,
  **Number branches**, **Add branch**, **Relate to…** and **Zoom into**. With two objects selected it offers **Relate
  these two** and **Connect with a line**.
- **Tags and status**: tags, marker, task, link and properties.
- **Appearance**: named style, fill, line, icon colour, text and, for a line, its connection.
- **Layout**: position and size, alignment for several objects, and lock, jump point and
  collapse.
- **Slide** for a slide, and **Comments**.

Each section folds from its header and stays as it was left on this device. Sections that do
not apply to the selection are left out.

**Properties** give an object named values, such as owner, environment or ticket. Hover an
object to read them. Files and assistants carry them as `property owner "Ada"`.

## History

**History**, under **Navigate**, lists your undo steps by what they did, newest first: "Move 3
objects", "Edit text of Orders API", "Delete 2 objects". Click an earlier step to return to just
after it; the steps you passed move to the top as redo steps you can click to go forward
again. Each object's **Last edited by** names who changed it most recently. There is no history
beyond this in the canvas's Undo history. Account saves have a separate
[recent-version history](accounts.md#recover-a-recent-saved-copy); an exported document is
another way to keep a version.

## Touch and pen

On a touch screen, one finger on empty canvas drags the view and a long press opens the ring
where it rests; a two-finger tap undoes and a three-finger tap redoes, each naming
what changed. A pen on empty canvas draws whatever tool is in hand, and the tool returns when
the stroke ends.

## Dark mode

Arconis follows the system's colour scheme. The chrome around the canvas darkens; objects keep
the colours they were given, so a canvas reads the same on every screen and in every export.

## Lock, collapse, jump points, tags, tasks and links

These fields apply to every kind of object, lines included, and to the whole selection at once.
Lock, jump point and collapse sit under **Layout** in the property panel; tags, marker, task and
link under **Tags and status**.

- **Lock** keeps pointer edits away: a locked object cannot be moved, resized, rotated, edited or
  deleted, a marquee and Select all pass over it, and its chrome carries a padlock. Click it and
  choose **Unlock** to release it, or run **Unlock all** from the command palette. Assistants can
  still change a locked object.
- **Mark as jump point** lists an object under [Jump points](#jump-points) in Navigate, where
  anyone in the room can fly to it. **Remove jump point** takes it off the list.
- **Collapse** folds away what an object holds or heads: a frame shrinks to its title bar, a
  topic keeps its node, and the label shows how many objects are folded, as `▸3`. Everyone sees
  the same fold. **Expand** restores it.
- **Tags** are words, shown in badges outside the object text. Click a tag badge to highlight
  other objects with that tag. Type one and press Enter, comma or
  space to add it as a chip, or pick one the room already uses. **Tag…** in the ring's north-west
  wedge or the menu opens the same editor above the selection. With several objects selected,
  the chips are the tags they share; adding or removing one changes every object.
- **Marker** adds a shape badge outside the text: a star, circle, square, triangle, diamond or
  hexagon. A shape means whatever your room decides it means. Click the badge to highlight
  objects with the same marker.
- **Task** adds a checkbox in the object chrome. Any frame, card or topic holding or heading tasks
  shows how many are done in a separate badge, as `2/5`.
- **Link** holds a web address or the id of an object or slide; the arrow beside it
  opens the address in a new tab or flies to the target.
- **Last edited by** names whoever changed the object most recently, person or assistant, and
  when. Files carry it, so an opened file keeps its editors.

While typing a label, `#word` adds a tag, `[]` or `[x]` at the start makes it an open or done
task, and `:star`, `:circle` or another shape's name sets a marker. The shorthand leaves the label when the
edit finishes and becomes the fields above.

**Tags**, under **Navigate**, lists the room's tags with how many objects carry each; choosing one
filters the canvas to it. **Ctrl/Command Shift F** opens the same **Find and filter** panel,
with named, counted chips for tags, markers, task states and editors. Chosen chips keep their objects bright, with the
lines among them, and dim everything else; chips of one kind are alternatives, and kinds
combine. **Clear highlights** restores the full canvas. Matching objects stay where they are.
Closing the bar clears the filter.

Files and assistants read and write the same fields as words of the canvas language; the
`canvas_help` topic "flags-tags-tasks-and-links" lists them.

## Icons and pictures

Search the stencil rail or browse its sets. Lucide supplies general symbols; brand and vendor
sets cover technology products, including AWS, Azure and Google Cloud. Icons place, label and
connect like other objects.

Vendor icons retain their colors and proportions, scale evenly and remain unrotated. Generic
icons can offer an icon-color control. Pictures are added by pasting or dropping image files;
see [files and pictures](files.md#add-and-move-pictures).

## Jump points

A jump point is an object marked as a place to return to. Select the object and choose **Mark as
jump point** under **Layout** in the property panel, in the menu or in the command palette; or
open **Navigate** in the right dock and choose **Mark selection** under **Jump points**.

**Jump points** lists the marked objects by name. Click one to fly to it and select it. The
button beside its name removes it from the list and leaves the object alone. The list follows
the objects: renaming one renames its entry, and deleting one removes it.

Jump points are shared with the room and travel with a file, while flying to one changes only
your viewport. Use [slides](slides.md) for bounded presentation regions.

## Other workflows

| Task                                               | Guide                                       |
| -------------------------------------------------- | ------------------------------------------- |
| Pen, highlighter, shapes, lasso, erasing and fills | [Drawing and markup](drawing.md)            |
| Markdown, code, equations and box typography       | [Text and formatting](text.md)              |
| Decks, templates and presenting                    | [Slides and presentations](slides.md)       |
| Room links, passwords, presence and offline work   | [Rooms and collaboration](collaboration.md) |
| Account names and saved workspaces                 | [Accounts](accounts.md)                     |
| Documents, PNGs, import and pictures               | [Files and pictures](files.md)              |
| Assistant connections and agent editing            | [Assistants and MCP](agents.md)             |

## Commands and shortcuts

Every action has one name, one shortcut and one rule for when it applies, whether it is reached
from a key, the property panel or the command palette. Press **Ctrl/Command K**, or the keyboard
button beside the view controls, to open the palette: type part of a command's name and press
Enter to run it. With nothing typed, the palette lists the commands you ran most recently, then
every command that applies to the current selection with its shortcut, which makes it the
shortcut sheet.

Ctrl/Command means Ctrl on Windows/Linux or Command on macOS. Canvas shortcuts apply when a
text field is not consuming the key; [text editing](text.md#text-editing-shortcuts) and
[presenting](slides.md#present) have their own controls.

| Keys                                    | Action                                                         |
| --------------------------------------- | -------------------------------------------------------------- |
| V                                       | Select                                                         |
| H / hold Space                          | Pan                                                            |
| P / M                                   | Draw on the current content layer / Markup annotations         |
| C                                       | Connector: click two objects                                   |
| N / T / R / E / D / F                   | Note / text / rectangle / ellipse / decision / frame           |
| Ctrl/Command K                          | Command palette and shortcut sheet                             |
| Delete / Backspace                      | Remove the selection                                           |
| Ctrl/Command Z                          | Undo your own document edit                                    |
| Ctrl/Command Shift Z / Ctrl/Command Y   | Redo                                                           |
| Ctrl/Command C / X                      | Copy / cut the selection as canvas language                    |
| Ctrl/Command V / Ctrl/Command Shift V   | Paste under the pointer / paste in place                       |
| Ctrl/Command D                          | Duplicate                                                      |
| Ctrl/Command Alt C / Ctrl/Command Alt V | Copy style / paste style                                       |
| Ctrl/Command Shift I                    | Invert selection                                               |
| Ctrl/Command A                          | Select everything but locked objects                           |
| Ctrl/Command G / Ctrl/Command Shift G   | Group / ungroup                                                |
| ] / [                                   | Bring to front / send to back                                  |
| Enter                                   | Edit the selected object's text                                |
| Tab / Alt Enter                         | Add a branch / sibling (Alt Enter mid-text splits the topic)   |
| Arrows                                  | Walk the tree, or select the nearest object that way           |
| Alt Up / Alt Down                       | Swap a topic with the sibling before / after it                |
| Shift Tab                               | Promote a topic to its parent's level                          |
| Ctrl/Command Delete                     | Delete a topic, keeping its branches and contents              |
| Ctrl/Command Alt Arrow                  | Grow a connected copy in that direction                        |
| Ctrl/Command Arrow                      | Nudge by a grid step; with Shift, by ten                       |
| 1 to 9                                  | Show that many levels of the selected tree                     |
| Shift N                                 | Capture notes                                                  |
| Shift C                                 | Open the selected object's comments                            |
| K (hold)                                | Point with the laser                                           |
| O (hold)                                | Peek at the whole canvas                                       |
| Q                                       | Keep the tool in hand, or stop keeping it                      |
| .                                       | Focus on the selection, or leave focus                         |
| Ctrl/Command Shift L                    | Lock / unlock                                                  |
| Ctrl/Command .                          | Collapse / expand                                              |
| Ctrl/Command Enter                      | Make a task, mark it done, then clear it                       |
| Z / Shift Z                             | Zoom into the selection / back out                             |
| Ctrl/Command + / Ctrl/Command -         | Zoom in / out                                                  |
| Shift 0 / Shift 1 / Shift 2             | Normal zoom (1×) / fit canvas / fit selection                  |
| Ctrl/Command [ / Ctrl/Command ]         | Back to the previous view / forward again                      |
| Ctrl/Command F                          | Find on canvas                                                 |
| Ctrl/Command Shift F                    | Filter by tag, marker, task or editor                          |
| Escape                                  | Finish text editing, return to Select, or leave a presentation |
