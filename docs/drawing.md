# Drawing and markup

Choose **Draw (P)** to paint editable ink into the selected content layer. Choose **Markup (M)**
to annotate above every content layer. Both tools have the same brushes and controls; switching
between them changes the destination and keeps the current brush. The panel names that destination.

Use **Layers** to choose the content layer for Draw. Markup belongs to its own annotation plane.
The drag radial's **Mode** arc also offers Draw and Markup, followed by the shared drawing tools.
Workspace connection points, connected-copy controls and resize handles stay hidden while painting.

![Drawing controls and selected gradient ink](images/drawing.png)

## Choose a brush

| Tool               | Use                                                                  |
| ------------------ | -------------------------------------------------------------------- |
| Freehand           | Drag a pen stroke.                                                   |
| Highlight          | Choose Marker, Shaped highlight or an attached Object outline.       |
| Vector             | Choose a geometric path, then drag its bounds or endpoints.          |
| Select ink         | Drag around whole paths; Shift adds to the selection.                |
| Erase whole stroke | Remove every whole stroke touched by a click or sweep.               |
| Erase segment      | Cut away parts of paths while keeping the surviving pieces editable. |
| Fill path          | Click a closed path to apply Fill and gradient settings.             |
| Pick color         | Sample Stroke or Fill and return to the previous creation brush.     |

Freehand, Highlight and Vector remember independent colors, widths, opacity and geometry.
Highlight remembers its last subtool. Switching brushes, presets or zoom never changes the
Draw/Markup destination.

**Stroke** paints the outline and **Fill** paints closed interiors. Each offers no paint,
swatches, recent colors and a color picker. Choose a width preset or enter **Stroke width**.
**Opacity** applies to the next mark. The preview shows the brush's paint and geometry.

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
Under **Selected ink**, paint edits apply immediately, are shared and undoable, and leave the
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
to choose a second color and angle; **Solid fill** returns to one color.

For an existing shape, use **Fill path** or select ink and edit Fill directly. Select a freehand
loop and choose **Close selected paths** to make it fillable. Select a gradient-filled path
and drag its direction handle; Shift snaps the direction.

## Cursors, visibility and export

Freehand uses a pen cursor, Marker a marker, erasers an eraser, Select ink a lasso, Fill path a
bucket and Pick color a pipette. Geometry and object targeting use a crosshair. Select keeps
native manipulation cursors. Pan uses an open hand and a closed hand while dragging. Space
temporarily borrows Pan, then restores the tool; the middle mouse button also pans temporarily.

- **Show annotations** changes only your view. Presentations' **Show markup** and Layers'
  **Markup** eye control the same visibility. Other people retain their own settings.
- **Delete all annotations** removes Markup for everyone in one undoable action. Content-layer
  artwork remains. The button is disabled when there are no annotations.
- **Include markup** independently controls document and PNG exports. Content-layer ink remains
  included when annotations are omitted.
- Saved copies retain the complete document. Layers' eyes control each person's visible content;
  canvas files keep every layer.

Fill works on one closed path rather than discovering regions between separate strokes. Lasso
selects whole paths, and erasing edits vector geometry. Dense collections of long paths can still
make editing and export slower.
