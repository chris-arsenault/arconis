# Using the canvas

Use the left rail to place objects and choose tools. Select an object to edit its properties on
the right. The same room holds diagrams, notes, topic trees, pictures, Drawings and slides.

For a first walkthrough, start with [your first shared canvas](getting-started.md).

## Place and name objects

Click a stencil, then click the canvas, or drag the stencil directly onto it. Basics include notes,
free text, rectangles, ellipses, decisions, frames and slides. Architecture stencils include
services, databases, clouds and people.

Notes and free text open ready for typing. Double-click another object or select it and press
Enter to edit its label. Use **Ctrl/Command Enter**, Escape, or leave the source/tools to finish
and keep the edit. Enter alone adds a line. [Text and formatting](text.md) explains Markdown,
code, equations, preview and copy controls.

The header's **Canvas title** names the document. The object label is separate from the document
title and from the name of a saved view.

## Select and transform

- Press **V** for Select. Click an object or drag across empty canvas to select an area.
- Shift-click, Ctrl-click or Command-click toggles an object in the selection. Alt-click on
  stacked objects steps down to the one beneath the selection.
- The command palette offers **Select same type**, **same style**, **same fill**, **children**,
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
canvas language restores its inherited/default behavior.

**Copy style** (Ctrl/Command Alt C) remembers one object's named style and look, and **Paste
style** (Ctrl/Command Alt V) applies them to the selection in place of its own. **Use as
default for new …** makes the selected object's look what new objects of its kind start with
on this page.

Ordinary selection reaches workspace objects beneath markup. Use [Lasso](drawing.md#select-transform-and-erase-ink)
for annotation paths. Widen the browser if the property panel is hidden by the narrow layout.

## Pan, zoom and grid

Press **H** or hold Space to pan with a drag; release Space to return to Select. The middle
button drags the view as well. Mouse-wheel scrolling zooms around the pointer; trackpad
horizontal or smooth scroll gestures pan, and Ctrl/Command scrolling zooms.

## Right button: ring and menu

A right click opens the menu at the pointer. Holding the right button, or moving it, brings a
ring of eight commands around the press point, replacing the menu; drag past a short dead
zone toward a wedge and release to stroke it without looking, or release in the centre to keep
the menu. The ring and the menu change with what was pressed: an object, a line, a slide or
empty canvas. A right click on an unselected object selects it; one on a member of a selection
keeps the selection. Two wedges open sub-rings: **Colour** holds the six fills and the default,
**Shape** changes the object's kind in place, keeping its text, size, contents and lines. The
browser's own menu never appears over the canvas. Escape or a click elsewhere closes.

The **selection toolbar** sits above the view controls while something is selected, with
fills, line colour, text size, shape, comment and the rest of the menu; it steps aside while
you drag or type, and the ring brings the same commands to the pointer. The one
selected object also shows a dot on each side: click a dot for a connected copy in that
direction, or drag it to place the copy where you release. Dragging a connector from an
object's connection point into empty space makes a new object like the source at its end.

## Comments

Comments open deliberately, never on hover: click an object's `💬N` mark, press **Shift C**
with it selected, or choose **Comment…** in the menu. The threads appear in a modal above the
object, at the front of everything, with reply, resolve and a composer; resolved threads fold
behind an **N resolved** line. The modal follows the object as you pan and zoom, stays inside
the window, and closes on Escape, a click outside, or opening another object's comments. The
property panel's Comments section only counts the threads and opens the modal. Lines open at
their label; slides' comments remain their [speaker notes](slides.md#add-speaker-notes).

Everyone sees shared comments signed with the display name used when they were written. The
object's `💬` mark counts open threads. Comments stay outside document Undo; undoing an
object's deletion brings its retained comments back with it.

Use the bottom view controls to zoom or fit the canvas; click the percentage to type a zoom.
**Z** zooms into the selection; **Shift Z** returns toward the previous scale. **Shift 0**,
**Shift 1** and **Shift 2** go to 100%, fit the canvas and fit the selection. Every jump, from
fitting to following a link or a found match, is remembered: **Ctrl/Command [** returns to the
view before it and **Ctrl/Command ]** goes forward again. When the view holds none of the
canvas, a **Back to content** button appears. New objects created at deep zoom have an
appropriate scale for that view.

## Find on canvas

**Ctrl/Command F** opens find at the top right. The words you type match names, subtitles,
tags, comments and ids. Enter, Shift Enter and the arrows step through the matches in reading
order, flying to each one, selecting it and ringing it briefly; the list beneath shows the first
matches, with hidden objects marked. Escape closes find.

The grid button shows or hides the grid. Objects snap while the grid is shown. This preference
belongs to your browser. Fine drawing paths follow the pointer rather than snapping to the grid.

## Containers and groups

Shapes, notes, pictures, frames, groups and slides can hold workspace items. Place a smaller
object inside a larger one, or drag an existing object onto it, to give it that holder.
Drag an object out to release it. Moving a holder moves its contents.

Ordinary container resizing leaves its children at their stored positions. A Drawing's resize
transforms its ink, and a frame with an active arrangement reflows its members.

A **Frame** is a titled container. **Screens** in the stencil rail creates frames at common
device sizes; **Screen size** in the property panel changes them. A **Band** supplied through
the language spans behind items without holding them.

Select several objects and choose **Group** or press Ctrl/Command G to wrap them together.
**Ungroup** dissolves a group while keeping its members. Deleting a holder deletes what it
contains and connected relationships; Undo restores the document edit.

Use **Align** with multiple boxes to align edges or centers. Distribution controls become
available with enough objects to establish gaps. Drag guides help with placement. With one
object selected, hold **Alt** and hover another to read the distances between them.

### Docked frames, tables and task lists

Frames whose edges meet are docked: dragging the shared edge of one resizes its neighbour so
the edge stays shared, which makes a row or column of frames behave as swimlanes without a
lane object. Move a frame as a whole and its neighbours stay where they are.

**Insert a table** in the command palette places a group of docked frames, a header row over
cells, where the pointer is; **Add a table row** and **Add a table column** grow it from a
selected cell. **Insert a task list** places a column frame whose members are tasks: the
title counts how many are done, done tasks recede, **Alt Enter** while typing a task adds the
next one below it, and anything dragged into the list becomes a task. Assistants write both as
ordinary frames, groups and tasks in the canvas language.

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
3. Select two objects and choose **Connect** in the property panel.

Select a connector to set **Line type** to Cornered, Diagonal or Curved, and choose its start
and end arrowheads. Drag either endpoint to reattach it. Drag its segments or points to adjust
the route.

**Route around items** computes a route around objects and labels between its ends. Rerun it
after moving obstacles when you need a new route. Language-authored shared fan-outs use a
junction where several lines share one trunk.

Workspace Drawings can be connected as objects; their internal paths and markup are independent
ink, outside connector topology.

## Topics and depth

Any workspace object can serve as a topic, including a frame, a Drawing or a line.

- **Tab** adds a branch from the selected topic; **Alt Enter** adds a sibling.
- Moving a topic carries its branches. Hold Alt while moving to move that topic alone.
- **Tidy branches** lays out the selected topic's descendants.
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

**Outline**, in the left rail, shows the selected tree as text, or every tree when nothing is
selected: the chevrons fold and unfold, a click flies to a topic, a double click or F2 renames
it, and with a row focused, Tab indents it under the topic above, Shift Tab promotes it, Enter
adds a branch, Shift Enter a sibling, and Alt Up or Down reorders it.

**Layout** is a set of verbs in the command palette: **Tidy branches** keeps each branch on its
side, **Tidy branches to the right**, **to the left** or **downward** put them all one way,
**Tidy branches compactly** tightens the gaps, **Sort branches by name** orders them, and
**Balance branches on both sides** alternates them around the root. **Tidy into a grid** lays
loose objects in rows, and **Lay out as a flow** ranks connected objects left to right along
their lines. Assistants write the same: `tidy root down sorted`.

**Number branches** in the Fields section gives a topic's branches tiered numbers, 1, 1.1, 1.2,
shown before their names, so a person or an assistant can say "change 2.3".

**Slides from branches** makes a deck named for the selected root: a slide over the whole tree,
then one over each main branch, ready to present. **Capture notes** (Shift N) opens a box where
each Enter drops a note under the last at the pointer; **Make a tree** turns the stack into a
tree headed by the first note.

Select two objects and choose **Add reference** to link them without adding tree structure.
The label shows `↗` and a count. References in the property panel jump to their targets, and
**Reference lines** beside the view controls toggles their visible lines.

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
- A pasted picture lands under the pointer, as before.

## Properties

The **Properties** section gives an object named values, such as owner, environment or ticket.
Hover an object to read them, and write `{owner}` in a label to show the value there. Files and
assistants carry them as `property owner "Ada"`.

## History

**History**, in the left rail, lists your undo steps by what they did, newest first: "Move 3
objects", "Edit text of Orders API", "Delete 2 objects". Click an earlier step to return to just
after it; the steps you passed move to the top as redo steps you can click to go forward
again. Each object's **Last edited by** names who changed it most recently. There is no history
beyond this: the relay stores nothing, and a saved copy is the way to keep a version.

## Touch and pen

On a touch screen, one finger on empty canvas drags the view and a long press opens the ring
where it rests; a two-finger tap undoes and a three-finger tap redoes, each naming
what changed. A pen on empty canvas draws whatever tool is in hand, and the tool returns when
the stroke ends.

## Dark mode

Arconis follows the system's colour scheme. The chrome around the canvas darkens; objects keep
the colours they were given, so a canvas reads the same on every screen and in every export.

## Lock, hide, collapse, tags, tasks and links

The **Fields** section of the property panel applies to every kind of object, lines included,
and to the whole selection at once.

- **Lock** keeps pointer edits away: a locked object cannot be moved, resized, rotated, edited or
  deleted, a marquee and Select all pass over it, and its label carries a padlock. Click it and
  choose **Unlock** to release it, or run **Unlock all** from the command palette. Assistants can
  still change a locked object.
- **Hide** takes an object off the canvas with what it holds and the lines touching it. The
  object stays in the document, out of routing, layout and exported pictures. The **N hidden**
  button at the top right brings every hidden object back.
- **Collapse** folds away what an object holds or heads: a frame shrinks to its title bar, a
  topic keeps its node, and the label shows how many objects are folded, as `▸3`. Everyone sees
  the same fold. **Expand** restores it.
- **Tags** are words separated by commas, shown after the label as `#tag`.
- **Marker** adds a priority badge, P1 to P5, or a progress quarter from ○ to ●.
- **Task** adds a checkbox before the label. Any frame, card or topic holding or heading tasks
  shows how many are done, as `2/5`.
- **Link** holds a web address or the id of an object, slide or saved view; the arrow beside it
  opens the address in a new tab or flies to the target.
- **Last edited by** names whoever changed the object most recently, person or assistant, and
  when. Files carry it, so an opened file keeps its editors.

While typing a label, `#word` adds a tag, `[]` or `[x]` at the start makes it an open or done
task, and `:p1` to `:p5` or `:q0` to `:q4` set a marker. The shorthand leaves the label when the
edit finishes and becomes the fields above.

**Ctrl/Command Shift F** opens the filter bar at the top left, with a chip for every tag,
marker, task state and editor on the canvas. Chosen chips keep their objects bright, with the
lines among them, and dim everything else; chips of one kind are alternatives, and kinds
combine. **Gather matches** moves what matches into a new frame laid out as a grid to the right
of the canvas; with no filter, **Gather the selection into a frame** does the same for the
selection. Closing the bar clears the filter.

Files and assistants read and write the same fields as words of the canvas language; the
`canvas_help` topic "flags-tags-tasks-and-links" lists them.

## Icons and pictures

Search the stencil rail or browse its sets. Lucide supplies general symbols; brand and vendor
sets cover technology products, including AWS, Azure and Google Cloud. Icons place, label and
connect like other objects.

Vendor icons retain their colors and proportions, scale evenly and remain unrotated. Generic
icons can offer an icon-color control. Pictures are added by pasting or dropping image files;
see [files and pictures](files.md#add-and-move-pictures).

## Saved views

At the bottom of the left rail, use the plus button to save the current position and zoom.
Click a saved view to fly there; hover its entry to rename or remove it.

Saved views are shared document data, while following one changes only your viewport. Use
[slides](slides.md) for bounded presentation regions rather than navigation bookmarks.

## Other workflows

| Task                                                                  | Guide                                       |
| --------------------------------------------------------------------- | ------------------------------------------- |
| Pen, highlighter, shapes, lasso, erasing, fills and editable Drawings | [Drawing and markup](drawing.md)            |
| Markdown, code, equations and box typography                          | [Text and formatting](text.md)              |
| Decks, templates and presenting                                       | [Slides and presentations](slides.md)       |
| Room links, passwords, presence and offline work                      | [Rooms and collaboration](collaboration.md) |
| Account names and saved workspaces                                    | [Accounts](accounts.md)                     |
| Documents, PNGs, import and pictures                                  | [Files and pictures](files.md)              |
| Assistant connections and agent editing                               | [Assistants and MCP](agents.md)             |

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

| Keys                                    | Action                                                              |
| --------------------------------------- | ------------------------------------------------------------------- |
| V                                       | Select                                                              |
| H / hold Space                          | Pan                                                                 |
| C                                       | Connector: click two objects                                        |
| N / T / R / E / D / F / P               | Note / text / rectangle / ellipse / decision / frame / draw         |
| Ctrl/Command K                          | Command palette and shortcut sheet                                  |
| Delete / Backspace                      | Remove the selection                                                |
| Ctrl/Command Z                          | Undo your own document edit                                         |
| Ctrl/Command Shift Z / Ctrl/Command Y   | Redo                                                                |
| Ctrl/Command C / X                      | Copy / cut the selection as canvas language                         |
| Ctrl/Command V / Ctrl/Command Shift V   | Paste under the pointer / paste in place                            |
| Ctrl/Command D                          | Duplicate                                                           |
| Ctrl/Command Alt C / Ctrl/Command Alt V | Copy style / paste style                                            |
| Ctrl/Command Shift I                    | Invert selection                                                    |
| Ctrl/Command A                          | Select everything but locked objects                                |
| Ctrl/Command G / Ctrl/Command Shift G   | Group / ungroup                                                     |
| ] / [                                   | Bring to front / send to back                                       |
| Enter                                   | Edit the selected object's text                                     |
| Tab / Alt Enter                         | Add a branch / sibling (Alt Enter mid-text splits the topic)        |
| Arrows                                  | Walk the tree, or select the nearest object that way                |
| Alt Up / Alt Down                       | Swap a topic with the sibling before / after it                     |
| Shift Tab                               | Promote a topic to its parent's level                               |
| Ctrl/Command Delete                     | Delete a topic, keeping its branches and contents                   |
| Ctrl/Command Alt Arrow                  | Grow a connected copy in that direction                             |
| Ctrl/Command Arrow                      | Nudge by a grid step; with Shift, by ten                            |
| 1 to 9                                  | Show that many levels of the selected tree                          |
| Shift N                                 | Capture notes                                                       |
| Shift C                                 | Open the selected object's comments                                 |
| K (hold)                                | Point with the laser                                                |
| /                                       | Say something beside your cursor                                    |
| .                                       | Focus on the selection, or leave focus                              |
| Ctrl/Command Shift L                    | Lock / unlock                                                       |
| Ctrl/Command Shift H                    | Hide                                                                |
| Ctrl/Command .                          | Collapse / expand                                                   |
| Ctrl/Command Enter                      | Make a task, mark it done, then clear it                            |
| Z / Shift Z                             | Zoom into the selection / back out                                  |
| Ctrl/Command + / Ctrl/Command -         | Zoom in / out                                                       |
| Shift 0 / Shift 1 / Shift 2             | Zoom to 100% / fit canvas / fit selection                           |
| Ctrl/Command [ / Ctrl/Command ]         | Back to the previous view / forward again                           |
| Ctrl/Command F                          | Find on canvas                                                      |
| Ctrl/Command Shift F                    | Filter by tag, marker, task or editor                               |
| Escape                                  | Finish text editing, leave Drawing editing, or leave a presentation |
