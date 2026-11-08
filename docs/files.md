# Files, pictures and portable copies

Arconis keeps a local room copy automatically. Header exports create portable files; account
saving creates a saved workspace. These paths serve different tasks.

| Path               | Contents and scope                                                                                                 | Reopen with                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Browser local copy | The room retained on this browser/device.                                                                          | The same room in that browser.                  |
| Export document    | The whole canvas as editable `.arconis` text, regardless of selection.                                             | Import document.                                |
| Export PNG         | A picture of selected items, or the whole canvas with no selection, plus an embedded editable copy of those items. | An image viewer, or Import document in Arconis. |
| Save to my account | A saved copy of the room, kept updated after the first save.                                                       | The account's Workspaces list on any device.    |

## Export an editable document

Use **Export document** in the header. It downloads the canvas in the Arconis canvas language,
including pictures and shared metadata. It is readable text, with `arconis 1` as its header.
The [canonical language reference](../frontend/src/language/reference.ts) is also available to
assistants through `canvas_help`.

**Include markup** is checked by default. Uncheck it to omit annotations while retaining Drawing
objects and other workspace content. This applies to the portable export, not the room's local
or account-saved copy.

## Export a PNG

1. Select the objects you want, or clear the selection to export the whole canvas.
2. Choose whether to **Include markup**.
3. Choose **Export PNG** in the header.

Selected holders include their contents and internal relationships. Merely overlapping a slide
or frame does not make an object its content. Export includes the chosen items rather than a
screenshot of your current viewport, and leaves out selection handles and interface controls.

The PNG's editable copy matches its export selection and markup choice. Hidden markup can still
be included when Include markup is checked. A clean export omits annotations from the pixels,
editable copy and bounds. Text fonts, Markdown styling, math and Drawing fills are rendered into
the picture.

A PNG needs included items to render. If **Add something to the canvas first** appears while
only markup is selected and excluded, clear the selection to include the workspace or enable
Include markup.

An Arconis PNG contains source as well as pixels. Its editable copy includes the exported
objects' text and associated document data, rather than acting as a flattened-only image.

## Import into a room

Choose **Import document**, then a `.arconis` file or an Arconis-exported PNG. Import adds the
contents to the current room as one undoable operation; it does not replace the room. The view
fits the result. For a separate workspace, create another room before importing.

Free item ids are retained; conflicting ids are replaced and internal references follow them.
A file can also supply its canvas title, named styles, discussions and views. The title can
rename the destination canvas, and a named style with the same name replaces that definition.

Importing a normal PNG without Arconis's embedded copy reports **This picture has no canvas
inside it**. To add an ordinary image as a picture instead, paste it or drag it onto the canvas.

## Add and move pictures

Paste an image to place it at the pointer, or drop an image file onto the canvas. Select it to
move, label, connect or comment on it. Resizing keeps its proportions.

While collaboration is unavailable, new pictures stay local and upload when collaboration
returns. A device-only room keeps its pictures in the browser. Portable exports include the
picture bytes, so another room can open them with the objects.

## Copies from password rooms

Password-room local storage, shared messages and account-saved copies are encrypted under the
room key. Portable `.arconis` files and PNGs are readable exports: pictures and document content
are opened before being packaged into them. A portable export therefore has its own copy of
the content outside the room-password protection.

See [rooms and collaboration](collaboration.md) and [accounts](accounts.md) for the other storage
and recovery paths.
