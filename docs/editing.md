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
- Shift-click, Ctrl-click or Command-click toggles an object in the selection.
- Drag the selection to move it. Single-object handles resize it; the top handle rotates eligible objects.
- Several objects, groups and drawings get a collective frame. Its corners scale the selection
  and its top handle rotates it. Hold Shift for proportions or angle snapping.
- The property panel's geometry fields set exact positions and dimensions.
- Use **Duplicate**, **Delete**, **Bring to front** and **Send to back** in the panel or through
  their keyboard shortcuts.

Styling controls apply to the selection. Choose fill, line color/width, text appearance and
other controls that apply to the selected type. Named styles supplied by a file or assistant
appear in **Style**; item overrides apply over that style. Clearing a property through the
canvas language restores its inherited/default behavior.

Ordinary selection reaches workspace objects beneath markup. Use [Lasso](drawing.md#select-transform-and-erase-ink)
for annotation paths. Widen the browser if the property panel is hidden by the narrow layout.

## Pan, zoom and grid

Press **H** or hold Space to pan with a drag; release Space to return to Select. Right-button
drag also pans. Mouse-wheel scrolling zooms around the pointer; trackpad horizontal or smooth
scroll gestures pan, and Ctrl/Command scrolling zooms.

Use the bottom view controls to zoom or fit the canvas. **Z** zooms into the selection;
**Shift Z** returns toward the previous scale. New objects created at deep zoom have an
appropriate scale for that view.

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
available with enough objects to establish gaps. Drag guides help with placement.

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

Tab and Alt Enter also work while typing ordinary topic text. In lists and code, Tab instead
performs [source indentation](text.md#format-content).

Select two objects and choose **Add reference** to link them without adding tree structure.
The label shows `↗` and a count. References in the property panel jump to their targets, and
**Reference lines** beside the view controls toggles their visible lines.

## Comments

Select an object or line and use **Comments** in the property panel. Add a thread, reply,
resolve/reopen it, or delete a comment. Enter sends the text; Shift Enter inserts a line.

Everyone sees shared comments signed with the display name used when they were written.
The object's `💬` mark counts open threads. Comments stay outside document Undo; undoing
an object's deletion brings its retained comments back with it.

A slide's comments are also its [speaker notes](slides.md#add-speaker-notes).

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

## Shortcuts

Ctrl/Command means Ctrl on Windows/Linux or Command on macOS. Canvas shortcuts apply when a
text field is not consuming the key; [text editing](text.md#text-editing-shortcuts) and
[presenting](slides.md#present) have their own controls.

| Keys                                  | Action                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| V                                     | Select                                                              |
| H / hold Space                        | Pan                                                                 |
| N / R / D / P                         | Note / rectangle / decision / draw                                  |
| Delete / Backspace                    | Remove the selection                                                |
| Ctrl/Command Z                        | Undo your own document edit                                         |
| Ctrl/Command Shift Z / Ctrl/Command Y | Redo                                                                |
| Ctrl/Command D                        | Duplicate                                                           |
| Ctrl/Command A                        | Select workspace items                                              |
| Ctrl/Command G / Ctrl/Command Shift G | Group / ungroup                                                     |
| ] / [                                 | Bring to front / send to back                                       |
| Enter                                 | Edit the selected object's text                                     |
| Tab / Alt Enter                       | Add a branch / sibling                                              |
| Z / Shift Z                           | Zoom into the selection / back out                                  |
| Escape                                | Finish text editing, leave Drawing editing, or leave a presentation |
