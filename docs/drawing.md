# Drawing and markup

Open **Draw** in the left rail. The panel follows the order of drawing decisions:

1. **Draw into** chooses the destination. **Layer (P)** paints editable ink into the content layer
   chosen beside it. **Markup (M)** annotates above every content layer. Switching destination keeps
   the current tool and brush.
2. **Tool** is one palette: the creation tools and the ink-editing tools are a single choice.
   Options that belong to one tool, such as Highlight's kind or Vector's geometry, appear beneath it.
3. **Brush** sets the next mark's Stroke, Fill and Opacity. With ink selected, the same section
   edits that ink instead.

The drag radial's **Mode** arc also offers Draw and Markup, followed by the shared drawing tools.
Workspace connection points, connected-copy controls and resize handles stay hidden while painting.

![Drawing controls and selected gradient ink](images/drawing.png)

## Choose a brush

| Tool          | Use                                                                  |
| ------------- | -------------------------------------------------------------------- |
| Freehand      | Drag a pen stroke.                                                   |
| Highlight     | Choose Marker, Shaped highlight or an attached Object outline.       |
| Vector        | Choose a geometric path, then drag its bounds or endpoints.          |
| Select ink    | Drag around whole paths; Shift adds to the selection.                |
| Erase stroke  | Remove every whole stroke touched by a click or sweep.               |
| Erase segment | Cut away parts of paths while keeping the surviving pieces editable. |
| Fill path     | Click a closed path to apply Fill and gradient settings.             |
| Pick color    | Sample Stroke or Fill and return to the previous creation brush.     |

Freehand, Highlight and Vector remember independent colors, widths, opacity and geometry.
Highlight remembers its last subtool. Switching brushes, presets or zoom never changes the
Draw/Markup destination.

**Stroke** groups the outline's color and width; **Fill** groups a closed interior's color and
gradient. Each color offers no paint, swatches, recent colors and a color picker. **Opacity**
applies to the whole mark. The preview shows the brush's paint and geometry.

Open **Saved brushes** to recall a brush or replace a slot with the current settings. Brushes
and presets are local browser preferences; the paths themselves are shared document content.

## Draw shapes and outlines

Choose **Vector**, or **Highlight → Shaped highlight**, then choose geometry:

| Geometry                       | Gesture                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| Line, Arrow, Double arrow      | Drag from the starting end toward the finishing end.                   |
| Rectangle, Ellipse             | Drag across opposite corners.                                          |
| Polygon                        | Click corners; click near the first corner or press Enter to close it. |
| Bracket, Brace, Revision cloud | Drag across the bounds.                                                |

Hold Shift to constrain equal sides or a fixed direction. Escape cancels an unfinished polygon.
Changing authoring tools or geometry also cancels unfinished gestures.

**Highlight → Object outline** attaches an outline to the clicked workspace object. It follows
that object's movement, size and rotation. Click again in the same destination to remove it.
Draw places the outline in the selected layer; Markup places it among annotations.

## Select, edit and transfer ink

**Select ink**, the erasers and **Fill path** operate on the current destination: annotations
under Markup, or ink in the selected content layer under Draw. Hidden and locked ink stays out
of these editing gestures. Ordinary selection can also reach content-layer ink.

After selecting paths, drag to move them or use the selection handles to scale and rotate them.
Under **Selected ink**, which replaces Brush while no creation tool is armed, paint edits apply immediately, are shared and undoable, and leave the
next brush's defaults intact. For several paths the controls show the first path and apply edits
to every selected path.

- **Move to content layer** puts selected annotations into the currently selected layer.
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
The property defaults to off. Old Drawing holders open as ordinary frames with it enabled.

Panels do not crop ink to their bounds. Container contents inherit the container's layer.

## Fill and gradients

Set **Fill** for a closed shape's interior, or **No fill** for an outline. Open **Fill gradient**
inside the Fill group to choose a second color and angle; **Solid fill** returns to one color.

For an existing shape, use **Fill path** or select ink and edit Fill directly. Select a freehand
loop and choose **Close selected paths** to make it fillable. Select a gradient-filled path
and drag its direction handle; Shift snaps the direction.

## Cursors, visibility and export

Freehand uses a pen cursor, Marker a marker, erasers an eraser, Select ink a lasso, Fill path a
bucket and Pick color a pipette. Geometry and object targeting use a crosshair. Select keeps
native manipulation cursors. Pan uses an open hand and a closed hand while dragging. Space
temporarily borrows Pan, then restores the tool; the middle mouse button also pans temporarily.

With **Markup** chosen under Draw into, the panel shows the annotation count and two controls:

- **Show** changes only your view. Presentations' **Show markup** and Layers' **Markup** eye
  control the same visibility. Other people retain their own settings.
- **Delete all** removes Markup for everyone in one undoable action. Content-layer artwork
  remains. The button is disabled when there are no annotations.
- **Include markup** independently controls document and PNG exports. Content-layer ink remains
  included when annotations are omitted.
- Saved copies retain the complete document. Layers' eyes control each person's visible content;
  canvas files keep every layer.

Fill works on one closed path rather than discovering regions between separate strokes. Lasso
selects whole paths, and erasing edits vector geometry. Dense collections of long paths can still
make editing and export slower.
