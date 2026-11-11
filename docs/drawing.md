# Drawing and markup

Arconis has two ink tools for two different jobs:

- **Markup (M)** is for temporary annotations over the canvas: circling a service in a review,
  pointing an arrow at a problem. It has a short bar of its own and stays out of the layers.
- **Draw (P)** is for ink that is part of the canvas: sketches, shapes and artwork that live in
  a content layer beside the other objects.

Each remembers its own tools, so choosing a review pen never changes the Draw brush. Workspace
connection points, connected-copy controls and resize handles stay hidden while either is armed.

![Draw's Vector tools beside an editable canvas](images/drawing.png)

## Markup

Press **M**, or choose **Markup** beside Select, Pan and Connect. A bar opens over the canvas and
the side panels stay as they were, so the stencils remain in reach while you annotate.

| Tool               | Use                                                    |
| ------------------ | ------------------------------------------------------ |
| Pen                | Drag to write or sketch.                               |
| Marker             | Drag to highlight with translucent ink.                |
| Arrow              | Drag from where the arrow starts to what it points at. |
| Box                | Drag across an area to frame it.                       |
| Bracket            | Drag across what the bracket should span.              |
| Brace              | Drag across what the brace should span.                |
| Revision cloud     | Drag across an area to cloud it for revision.          |
| Outline object     | Click an object to toggle an outline that follows it.  |
| Erase              | Click or sweep across annotations to remove them.      |
| Select annotations | Drag around annotations to move, restyle or keep them. |

One colour and one size apply to every Markup tool. The bar also holds:

- **Show annotations**, with the number on the canvas. It changes only your view. Presentations'
  **Show markup** and Settings' **Show markup** control the same visibility.
- **Clear**, which removes every annotation for everyone in one undoable action. Canvas content
  remains. The button is disabled when there are no annotations.
- **Done**, which puts Markup away and returns to Select. The annotations stay on the canvas.

The Markup button counts the annotations on the canvas while its bar is away. On a narrow screen
the colours and sizes fold behind one button each.

Annotations are shared with everyone in the room. They sit above every content layer and belong
to none, so they do not appear in **Layers**.

## Draw

Open **Draw** in the left rail, or press **P**. Draw paints into the active layer, the one chosen
in **Layers**; the panel names it. The panel is always about the next mark:

1. **Tool** is one palette: the creation tools and the ink-editing tools are a single choice.
   Options that belong to one tool, such as Vector's geometry, appear beneath it.
2. **Brush** sets the next mark's Stroke, Fill and Opacity.

| Tool          | Use                                                                  |
| ------------- | -------------------------------------------------------------------- |
| Freehand      | Drag a pen stroke.                                                   |
| Vector        | Choose a geometric path, then drag its bounds or endpoints.          |
| Select ink    | Drag around whole paths; Shift adds to the selection.                |
| Erase stroke  | Remove every whole stroke touched by a click or sweep.               |
| Erase segment | Cut away parts of paths while keeping the surviving pieces editable. |
| Fill path     | Click a closed path to apply Fill and gradient settings.             |
| Pick color    | Sample Stroke or Fill and return to the previous creation brush.     |

Freehand and Vector remember independent colors, widths, opacity and geometry. For a translucent
highlighter, lower **Opacity** on a wide Freehand brush; a saved brush keeps it ready. Review
marks such as an object outline, a bracket or a revision cloud are [Markup](#markup) tools.

**Stroke** groups the outline's color and width; **Fill** groups a closed interior's color and
gradient. Each color offers no paint, swatches, recent colors and a color picker. **Opacity**
applies to the whole mark. The preview shows the brush's paint and geometry.

Open **Saved brushes** to recall a brush or replace a slot with the current settings. Brushes
and presets are local browser preferences; the paths themselves are shared document content.

The right-button ring's **Mode** wedge, to the west on every ring, switches to Draw or Markup
with the tool each last used. While drawing, the ring holds the drawing tools: freehand north,
pick color north-east, vector shapes east, the lasso south-east, the erasers south and
fill north-west. Markup's ring holds its pen, marker, arrow, selection, eraser and box.

## Draw shapes

Choose **Vector**, then choose geometry:

| Geometry                  | Gesture                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| Line, Arrow, Double arrow | Drag from the starting end toward the finishing end.                   |
| Rectangle, Ellipse        | Drag across opposite corners.                                          |
| Polygon                   | Click corners; click near the first corner or press Enter to close it. |

Hold Shift to constrain equal sides or a fixed direction. Escape cancels an unfinished polygon.
Changing tools or geometry also cancels unfinished gestures.

Markup's **Outline object** attaches an outline to the clicked workspace object. It follows
that object's movement, size and rotation. Click again to remove it. To keep an outline, a
bracket or any other annotation as content, select it and choose **Move to content layer**.

## Select, edit and transfer ink

**Select ink**, the erasers and **Fill path** work on ink in the active layer. Markup's **Erase**
and **Select annotations** work on annotations. Hidden and locked ink stays out of these gestures.
Ordinary selection can also reach content-layer ink.

After selecting paths, drag to move them or use the selection handles to scale and rotate them.
Selected ink is edited in the property panel on the right, like any selection. Its **Appearance**
section carries the same Stroke, Fill and Opacity controls as the brush. Edits apply immediately,
are shared and undoable, and leave the Draw brush and Markup's choices as they were. For several
paths the controls show the first path and apply edits to every selected path.

The property panel also moves ink between the two:

- **Move to content layer** keeps selected annotations as content of the active layer.
- **Move to Markup** makes selected content ink into annotations.

These actions preserve ids, points and paint. They do not create a wrapper object. Disconnect
ink used as a connector endpoint before moving it to Markup. Undo reverses a transfer.

## Group artwork with ordinary panels

Ink is ordinary editable content. Use the existing **Group** command or a frame to keep strokes,
shapes, text and pictures together. Move or connect the container as for other workspace content.
There is no separate Drawing object or focused Drawing-editing mode.

In a frame or group's **Layout** properties, enable **Scale content on resize** to resize its
held artwork with the container. It applies to nested content, ink points, shapes, text, pictures
and internal routes. Paint and text scale too; pictures and vendor icons retain their proportions.
With the property off, resizing keeps the ordinary panel behavior and leaves content sizes intact.
The property defaults to off.

Panels do not crop ink to their bounds. Container contents inherit the container's layer.

## Fill and gradients

Set **Fill** for a closed shape's interior, or **No fill** for an outline. Open **Fill gradient**
inside the Fill group to choose a second color and angle; **Solid fill** returns to one color.

For an existing shape, use **Fill path** or select ink and edit Fill in the property panel.
Select a freehand loop and choose **Close selected paths** there to make it fillable. Select a
gradient-filled path and drag its direction handle; Shift snaps the direction.

## Cursors and export

Freehand and Markup's Pen use a pen cursor, markers a marker, erasers an eraser, the selecting
tools a lasso, Fill path a bucket and Pick color a pipette. Geometry and object targeting use a
crosshair. Select keeps native manipulation cursors. Pan uses an open hand and a closed hand
while dragging. Space temporarily borrows Pan, then restores the tool; the middle mouse button
also pans temporarily.

- **Include markup** controls whether annotations appear in document and PNG exports.
  Content-layer ink remains included when annotations are omitted.
- Saved copies retain the complete document. Layers' eyes control each person's visible content;
  canvas files keep every layer.

Fill works on one closed path rather than discovering regions between separate strokes. Lasso
selects whole paths, and erasing edits vector geometry. Dense collections of long paths can still
make editing and export slower.
