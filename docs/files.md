# Files, pictures and portable copies

Arconis keeps a local room copy automatically. The header's **File** menu exports portable files
and imports them; account saving creates a saved workspace. These paths serve different tasks.

| Path                | Contents and scope                                                                                                 | Reopen with                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Browser local copy  | The room retained on this browser/device.                                                                          | The same room in that browser.                                                  |
| Export document     | The whole canvas as editable `.arconis` text, regardless of selection.                                             | Import document.                                                                |
| Export PNG          | A picture of selected items, or the whole canvas with no selection, plus an embedded editable copy of those items. | An image viewer, or Import document in Arconis.                                 |
| Export SVG          | A vector picture of the selection or visible canvas, with canvas text in its description.                          | An SVG viewer or vector editor; use `.arconis` or PNG for direct canvas import. |
| Export deck as HTML | A deck's slides as one self-contained page, without markup or speaker notes.                                       | Any web browser; it does not import back into a canvas.                         |
| Save to my account  | A saved copy of the room, kept updated after the first save, with five recent successful versions.                 | **Your canvases** on any signed-in device.                                      |
| My layouts          | A named private selection with pictures and internal references.                                                   | **My layouts**, then **Insert** in any room.                                    |

## Export an editable document

Choose **File**, then **Export document**, review the options and choose **Export document**.
It downloads the canvas in the Arconis canvas language,
including pictures, shared metadata and every layer, including layers you have hidden. It is
readable text, with `arconis 1` as its header. Full documents include the drawing's scale,
units and extension module settings. Selection copies keep the destination's settings. A copied
woodworking assembly carries its physical pieces, fits and fastening operations. You can keep the file as
a backup or import it into a new room to continue editing.

Exports include a short comment telling coding agents where to obtain the
[CLI](https://arconis.ahara.io/#cli) and to ask your permission before downloading
or running it. Local CLI editing needs no MCP registration or Arconis account.
The guidance is not authorization to run commands or upload the document.

`.arconis` files are readable text suitable for Git. Item ids and meaningful
stacking order survive round trips; exporting alone does not restamp every item.
Pictures remain embedded under their content hashes, so editing a label leaves
unrelated picture data unchanged. A genuine item edit can update its attribution.

Object statements are grouped by layer and holder, then sorted top-to-bottom
(Y), left-to-right (X). Connections follow their referenced objects and use their
endpoint/bend bounds for spatial ordering. Drawing paths use their bounds and
highlights use their target's position. Coincident objects sort by type, label,
stacking value and remaining content; completely identical ties retain drawing
order. Random IDs and creation order do not determine ordinary file order.

Each item and connection carries an explicit `z` value: larger values draw in
front within the existing layer/container rules. Statement order does not control
that stacking. Export preserves these numbers, so moving or renaming one object
does not renumber the others. Moving past another object's position can relocate
its statement. The first export using spatial ordering may produce a larger diff.

Import into an empty canvas retains the stored values. Import into an occupied
canvas puts the incoming stack above existing content, keeping its relative order.
Files without `z` still use declaration order to establish their initial stack;
older Arconis versions that do not know `z` cannot read the new output.

**Include canvas annotations**, in the export options, is checked by default. These are pen and
highlighter marks drawn over the canvas. Uncheck it to omit annotations while retaining drawn
objects and other workspace content. This applies to the portable export, not the room's local
or account-saved copy.

Repository source references travel with the exported items; referenced source
contents do not. Agents maintain the corresponding backlink comments in the
repository's source files. See [repository links](agents.md#repository-links-for-coding-agents).
Older documents without source references still open; reading the new `source`
attribute requires a current Arconis browser or CLI.

## Export a PNG

1. Select the objects you want, or clear the selection to export the whole canvas.
2. Open **File → Export PNG** and choose whether to **Include canvas annotations**.
3. Choose **Export PNG** in the export options.

Selected holders include their contents and internal relationships. Merely overlapping a frame
does not make an object its content, and slides hold nothing. Export includes the chosen items rather than a
screenshot of your current viewport, and leaves out selection handles and interface controls.

The PNG's editable copy matches its export selection and markup choice. Objects on layers you
have hidden are left out of both the pixels and the editable copy. Clipboard pictures and SVG
exports also omit hidden layers. If every layer with content is hidden, the export reports it.
Hidden markup can still be included
when Include canvas annotations is checked. A clean export omits annotations from the pixels,
editable copy and bounds. Text fonts, Markdown styling, math and Drawing fills are rendered into
the picture.

A PNG needs included items to render. If **Add something to the canvas first** appears while
only markup is selected and excluded, clear the selection to include the workspace or enable
Include canvas annotations.

An Arconis PNG contains source as well as pixels. Its editable copy includes the exported
objects' text and associated document data, rather than acting as a flattened-only image.

## Copy a picture, export an SVG, copy a tree or a diagram

**Copy canvas as PNG**, or **Copy selection as PNG** with something selected, puts a picture on
the clipboard for a chat or a document. **Export canvas as SVG** (or **Export selection as SVG**)
downloads a vector picture with canvas text in its description. SVG is not accepted by
**Import document**; keep an `.arconis` file or Arconis-exported PNG to reopen the content directly.
A deck of slides exports as one HTML file to share; see
[Slides and presentations](slides.md#export-a-deck-to-share).
**Copy tree as Markdown** copies the selected tree as an indented list, which pastes back as a tree.
**Export tree as CSV** downloads the same tree with one column for each level, so a spreadsheet
shows the nesting. **Copy canvas as Mermaid**, or **Copy selection as Mermaid**, copies the boxes,
the frames and groups that hold them and the lines among them as a Mermaid flowchart. All five
are in the command palette.

## Import diagrams and outlines from other tools

**Import document** also reads what other tools write, and pasting the same text onto the canvas
offers it as a diagram or outline. Either way the result is ordinary Arconis objects, added as
one undoable change.

| Source   | Recognised by                                        | Becomes                                                                                        |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Mermaid  | Its opening line, or a `.mmd` file                   | Flowcharts, state, class and entity diagrams; a mind map becomes a tree                        |
| D2       | A `.d2` file, or pasted keys and arrowed connections | Shapes, containers and connections                                                             |
| PlantUML | `@startuml` or `@startmindmap`, or a `.puml` file    | Component, deployment, use case, class, state and sequence diagrams; a mind map becomes a tree |
| draw.io  | Its XML, in a `.drawio` or `.xml` file               | Every page's boxes, containers and lines where the file placed them                            |
| OPML     | Its XML, in an `.opml` file                          | A topic tree                                                                                   |
| Outline  | A `.txt` or `.md` file with headings or indentation  | A topic tree                                                                                   |

Boxes keep their text, their shape where Arconis has the same one, and their fill, line and text
colours. Lines keep their labels, arrowheads and dashes; draw.io's named line ends, such as
diamonds and entity-relationship cardinalities, become the canvas's matching heads. A container becomes a frame holding its
contents. Mermaid, D2 and PlantUML carry no positions, so their diagrams are laid out in ranks
along their lines, in the direction the source asks for. A sequence diagram becomes its
participants joined by numbered messages. Other styling, icons and notes stay behind, and a
diagram kind with no boxes and lines, such as a Gantt chart, is reported and adds nothing.

## Import into a room

Choose **File**, then **Import document**, then a `.arconis` file or an Arconis-exported PNG. Import adds the
contents to the current room as one undoable operation; it does not replace the room. The view
fits the result. For a separate workspace, create another room before importing.

Free item ids are retained; conflicting ids are replaced and internal references follow them.
A file can also supply its canvas title, named styles, discussions and scale calibration.
The title can rename the destination canvas, and a named style with the same name replaces that
definition. Importing a full calibrated document changes the interpretation of canvas
distances. Lumber and hardware project their physical dimensions at the resulting scale.
Use a new room to keep two
drawings with different scales separate.

In contrast, **My layouts** always inserts fresh object identities, materializes its appearance
and leaves the destination's title and named styles intact. One Undo removes one insertion.
Account **History** recovers an older room copy into a separate room, rather than importing into
the current room. See [accounts](accounts.md).

Importing a normal PNG without Arconis's embedded copy reports **This picture has no canvas
inside it**. To add an ordinary image as a picture instead, paste it or drag it onto the canvas.

## Add and move pictures

Paste an image to place it at the pointer, or drop an image file onto the canvas. Select it to
move, label, connect or comment on it. Use proportional scaling to keep it from stretching;
width and height fields can change its dimensions independently.

While collaboration is unavailable, new pictures stay local and upload when collaboration
returns. A device-only room keeps its pictures in the browser. Portable exports include the
picture bytes, so another room can open them with the objects.

## Copies from password rooms

Password-room local storage, shared messages and account-saved copies are encrypted under the
room key. Portable `.arconis` files, PNGs and SVGs are readable exports: pictures and document content
are opened before being packaged into them. A portable export therefore has its own copy of
the content outside the room-password protection.

See [rooms and collaboration](collaboration.md) and [accounts](accounts.md) for the other storage
and recovery paths.
