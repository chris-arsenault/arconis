# Product scope

Arconis is a shared spatial workspace for creating, organizing and connecting ideas. People
combine diagrams, sticky notes, topic trees, drawings and slides in one document.

## Canvas and diagrams

- Pan and zoom around the pointer, fit the canvas, and navigate through shared saved views.
- Zoom equally far in and out from `1×`, with consistent wheel, button, keyboard and numeric controls.
- Calibrate distances with presets, a custom reference or a measured known distance; read an adaptive
  scale bar, measure between points, and use physical units in geometry fields and grid snapping.
- Place, select, multi-select, drag, resize, rotate, duplicate, group and delete workspace objects.
- Create basic shapes, architectural components and icons; label and style them in the property panel.
- Attach cornered, diagonal or curved connectors to workspace objects, set per-end arrowheads,
  adjust routes and route around objects.
- Nest workspace items in eligible holders; move contents with their holder and lay out rows,
  columns and grids in arranged frames.
- Align or distribute selections and build screen layouts with common device-frame sizes.

## Topics and relationships

- Use workspace objects and lines as topics, growing branches and siblings from the keyboard.
- Move or tidy a topic tree, add cross-references and zoom into smaller-scale detail.
- Display references and comments on labels and follow reference targets from the property panel.

## Text and pictures

- Author Markdown labels, nested lists, highlighted code and LaTeX mathematics as editable source.
- Choose bundled fonts, box-level typography, alignment, colors, spacing and text sizing.
- Preview and copy Markdown, plain text and fenced code from the source tools.
- Paste or drop pictures, then move, label, connect and resize them with preserved proportions.

## Drawing and markup

- Annotate a diagram with Markup: a short bar of pen, marker, arrow, box, object outline and
  eraser for temporary, shared annotations that stay out of the layers.
- Draw artwork into the active layer with Freehand, Highlight or Vector, each with independent
  remembered brushes and contextual paint controls.
- Lasso whole ink paths, recolor and transform them, and use whole or precision erasing.
- Fill closed paths with solid colors or linear gradients.
- Keep Markup's choices and the Draw brush apart, so each stays as it was left.
- Move selected ink between layers and Markup; group artwork with ordinary frames and groups.
- Enable Scale content on resize on a panel to resize its ink, shapes, text and other contents together.
- Hide markup locally, clear it with Undo, or omit it from portable exports.

## Layers

- Organize the canvas in named content layers, with frames and groups keeping their contents on
  one layer. Markup sits above them all and is not a layer.
- Create, choose, rename, reorder, hide, merge and delete layers in a layer browser, and move
  selected objects between layers; hiding a layer changes only your view.
- Let assistants read the layers, work in the right one and give a new addition its own layer.

## Slides

- Place bounded slide viewports over the canvas, holding nothing themselves, and organize them
  into named, numbered decks.
- Author a template slide whose framed content appears beneath the deck's other slides.
- Present locally with slide navigation, full-screen controls, speaker notes and markup visibility.
- Keep receiving peers' edits while presenting.

## Collaboration and storage

- Join ordinary rooms by link or code as a guest, with shared object, text, relationship and style edits.
- See participant names, cursors and drag previews while keeping personal selection and viewport.
- Continue editing offline, restore the browser's local copy and merge when collaboration returns.
- Create password rooms with browser encryption, or rooms that use no relay connection.
- Export editable documents or selection/whole-canvas PNGs carrying an editable copy; import them
  into another room with pictures and references.
- Use optional Ahara accounts for verified sign-in, display names and saved workspaces across devices.
  All saved copies are sealed under their room keys; the guest room workflow stays unchanged.
- Find local and private account copies in **Your canvases**, with separate open and removal actions.
- Recover any of the five recent successful account saves into a separate room.
- Save personal selected layouts, including pictures and internal links, and insert independent
  copies into any room with one Undo.

## Assistants

Signed-in people connect a remote MCP client using the server address in the account panel.
An assistant joins an ordinary room someone has open and reads and writes the same canonical
canvas language as files and browser edits. It can create diagrams, arrangements, topic trees,
text, slides, drawings and discussions in atomic writes, discover syntax on demand and undo its
own changes. Password rooms and device-only rooms remain browser-owned.

## Scope and references

Rooms provide a shared visual workspace, with account saving as a private copy for each account.
The relay forwards collaboration frames and holds an ordinary room in memory while an assistant
works; durable room data lives in browsers, portable files or account-saved copies.

[User guides](README.md) explain supported workflows. [Architecture](architecture.md) describes
the model and its operational limitations; [ADRs](adr/README.md) record decisions and rationale.
The [backlog](backlog.md) contains future work.
