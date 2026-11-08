# Drawing tools and markup

## State and authorization

Planning complete; implementation has not started. The user approved the proposal in this
conversation on 2026-11-08, then requested a plan and a pause while another agent works.
All milestones remain pending. Resume only when the user instructs us to proceed, then inspect
the working tree and current sources before expanding M0. Do not wait in a background loop or
infer permission from the other agent finishing. No commit, push or deployment is authorized.

The working tree already contains another agent's changes, including editor input, projection,
styles, presentation and language files. Preserve them. This task owns only this plan file.

## Outcome and agreed scope

Provide a shared editable markup layer above the workspace, with a dedicated Drawing object
for sketches promoted into workspace content. The user's original examples were design
direction rather than individually mandatory requirements; the subsequent approved proposal
is the scope below. Tool grouping, phase order and implementation mechanisms remain revisable
when evidence supports a simpler implementation that preserves the agreed behavior.

- Markup is shared, saved and undoable, without automatic expiration. It does not participate
  in workspace layout, containment, connectors or ordinary selection. Drawing and erasing
  must not move or remove workspace objects. Freehand annotations remain at world positions.
- Show markup is local to each participant. Clear markup is undoable and leaves workspace
  content intact. Normal selection reaches workspace objects; markup lasso selects annotations.
- Pen has five visible width presets and finer adjustment. Highlighter has independent color
  and width settings and leaves underlying text readable. Offer a small color palette, recent
  colors, a picker and three editable favorites, with settings remembered per instrument.
- Highlight object adds a separate annotation that references a sticky, shape, picture or
  Drawing. Click again to remove it. It follows target geometry without changing target styles
  or vendor artwork. Multiple participants' highlights remain readable instead of accumulating
  stacked borders. Highlights obey markup visibility and export filtering.
- Pen and highlighter both work with freehand and quick shapes. Primary shapes: line, arrow,
  rectangle and ellipse. Secondary shapes: double arrow, polygon, bracket, brace and revision
  cloud. Drag arrows tail to tip with live direction preview; drag boxes and ellipses across
  bounds; Shift constrains proportions or angles; successive polygon clicks close at the start.
  Closed shapes support outline, fill or both; simple handles adjust shapes after creation.
- Whole-stroke eraser and lasso support practical markup editing. Lasso selects whole strokes
  and shapes for movement, scaling, rotation, recoloring, duplication, deletion or promotion.
  Precision eraser subsequently supports partial stroke removal.
- Make Drawing moves lassoed markup into a workspace Drawing in one undoable action, preserving
  appearance and editable source. Return to markup reverses it. A blank Drawing can also be
  placed directly. Drawings can be named, transformed, connected, commented on, and contained
  by frames and slides. They remain visible when markup is hidden.
- Double-click enters a Drawing with the same tools; Escape returns to workspace editing.
  Bounds clip its contents; Fit bounds to drawing removes empty space. Moving a Drawing moves
  its contents. Export as image is distinct from editable promotion.
- Fill applies solid color or a two-color linear gradient to a closed shape or explicitly
  closed freehand path. Gradient direction uses draggable handles. Include bucket cursor,
  eyedropper and recent colors.
- Export offers Include markup. Filtering applies to PNG pixels, embedded editable content
  and export bounds. Promoted Drawings are ordinary workspace content. Normal .arconis saves
  preserve everything by default; clean export may omit markup. Presentations have a local
  Show markup toggle.
- Keep the existing unified toolbar. Draw opens a compact contextual palette; avoid separate
  diagram/ideas workspaces or exposing every secondary setting at once.

## Boundaries and design provenance

Repository requirements: Yjs remains canonical; document fields, canvas language, files and
agent tools express one model; maxGraph remains the projection. See
[architecture](architecture.md), [ADR-0014](adr/0014-one-canvas-language.md), and
[ADR-0005](adr/0005-one-toolbar.md). Test against local servers and relays only, using real
pointer and keyboard input across independent browser contexts. No platform changes are
planned. Read Ahara integration guidance first if that scope changes.

Recommended deferrals from the approved proposal: arbitrary user-defined layers, Bezier-node
editing, boolean operations, masks, arbitrary-region flood fill across intersecting strokes,
pixel-fragment lasso selection and automatic shape recognition. These are scope choices,
not claims that such features necessarily cause poor performance. Whole-shape fills and
whole-stroke selection remain in scope. No hard object limits, runtime caps, mandatory
flattening or new CI performance budgets follow from performance goals.

Agent implementation proposal: reuse editable primitives for markup and Drawing contents;
promotion changes ownership and workspace behavior rather than rasterizing content. Avoid
a second opaque drawing document. Start with existing maxGraph rendering and measure it.
Do not select a cache, renderer replacement or new persistence mechanism without a measured
need that the simpler approach cannot satisfy. Any render cache is derived, never canonical.

## Context and reuse map

Sources inspected during proposal research; re-read changed files on resume:

| Source | Reuse or affected contract |
| --- | --- |
| `frontend/src/document/types.ts` | Existing drawing item stores a path; extend canonical types and shared style terms. |
| `frontend/src/document/geometry.ts` | Existing stroke simplification; reuse where it preserves appearance. |
| `frontend/src/editor/input.ts` | Pointer sampling, local SVG preview, stroke creation on release. |
| `frontend/src/editor/styles.ts` | Existing drawing projection and sole maxGraph style translation boundary. |
| `frontend/src/editor/projection.ts` | Shared document projection; markup visibility and Drawing rendering must respect its guard. |
| `frontend/src/editor/culling.ts` | Existing size-based culling, not evidence of viewport culling or dense-board performance. |
| `frontend/src/components/LeftRail.tsx` | Existing unified tools; contextual drawing controls belong with this interaction. |
| `frontend/src/components/SelectionFrame.tsx` | Existing collective scale and rotation gestures. |
| `frontend/src/language/` | Parser, writer, printer, reference and agent sessions must express the same new model. |
| `frontend/src/document/files.ts`, `frontend/src/document/pngCopy.ts` | File persistence and embedded editable PNG data. |
| `frontend/src/editor/pngExport.ts` | Current graph draw-pane export; extend bounds and content filtering together. |
| `frontend/src/editor/presenter.ts`, `frontend/src/components/Presenter.tsx` | Local presentation behavior; likely concurrent changes require reconciliation. |

Research informing the controls:

- [Miro Pen](https://help.miro.com/hc/en-us/articles/360017730573-Pen): tool presets,
  highlighter, whole/partial erasing and lasso.
- [Microsoft Whiteboard ink](https://support.microsoft.com/en-us/whiteboard/draw-and-ink-in-whiteboard):
  widths, highlighter and single/double ink arrows.
- [tldraw performance](https://tldraw.dev/sdk-features/performance): culling, selective updates
  and batching are relevant approaches, not measured evidence for Arconis or a dependency choice.

## Milestones

### M0 — Canonical markup and drawing model

Scope: reconcile concurrent edits after the user resumes; settle canonical primitive ownership,
Drawing contents, highlight references, local visibility and shared ordering. Include language,
files, agent tools and undo boundaries. Decide how existing ordinary drawing strokes retain
their workspace role, rather than silently reclassifying them as temporary markup.

Acceptance: all new content has a single editable representation; round trips preserve paths,
styles, references and ownership. Concurrent changes converge, and local undo leaves peer work
intact. Define target deletion/undo behavior for highlights and containment/transform behavior
for Drawing contents before the corresponding interactions are built.

Evidence: focused model/language round trips and collaboration tests. Check existing consumers
of drawing geometry and holders; type-level coverage alone does not prove user behavior.

### M1 — Usable markup tools

[depends on M0]

Scope: compact palette, pen widths, highlighter, favorites, attached object outlines, primary
quick shapes plus double arrow/polygon, whole-stroke eraser, lasso, visibility, undoable clear,
and export filtering. Include the presentation visibility toggle.

Acceptance: participants annotate the same mixed board without disturbing underlying objects;
normal selection and markup selection reach their intended targets. Highlights track moving
and resized targets; hide is local, clear is shared and undoable. Clean PNGs exclude markup
from visible pixels, embedded content and bounds. Normal saves retain markup.

Evidence: independent browser-context journeys with real input, filtered file round trips and
PNG import checks. Inspect highlighter readability over text, pictures and colored notes.

### M2 — Promote and edit Drawing objects

[depends on M1]

Scope: blank Drawings, lasso promotion, reverse promotion, focused editing, clipped bounds,
Fit bounds, workspace transforms, naming, connections, comments and frame/slide containment.

Acceptance: a multi-stroke sketch becomes one workspace object without losing appearance or
editability; all peers see it; markup hide/clear leaves it intact. Enter/exit editing, move,
resize, rotate, undo, save/load and reverse promotion preserve geometry and ownership. Existing
workspace relationships work on Drawings without operating on their individual strokes.

Evidence: cross-context promotion/edit/undo journeys and file/PNG round trips; include nested
holders and connector attachment during transformations.

### M3 — Paint and annotation refinements

[depends on M2]

Scope: closed-shape and closed-freehand fills, gradient colors and direction, eyedropper,
precision stroke erasing, bracket, brace and revision cloud.

Acceptance: bucket fill changes the intended closed shape, without treating underlying canvas
objects as paint regions. Solid and gradient appearance survives transforms, collaboration,
files and export. Precision erasing preserves surviving stroke segments and is undoable.
Secondary shapes use the same instruments and editing conventions as primary shapes.

Evidence: representative geometry and rendering checks, browser input journeys and round trips.
Explicitly check erasing boundaries and gradient appearance after resize and rotation.

### M4 — Integrated behavior and measured performance

[depends on M1, M2, M3]

Scope: integrated browser journeys, representative dense-board measurements, documentation
and required repository checks. Measure during earlier milestones too; this is the final
integration milestone, not permission to postpone discovering performance problems.

Acceptance: the complete workflow works across independent contexts, late join, reconnect,
undo and export/import. Document observed responsiveness and material limitations honestly.
Update existing usage/architecture/reference documentation as needed; do not create a separate
verification report. Run `make ci`, `make build` and relevant `make test-browser` checks before
any subsequently authorized commit.

Proposed measurement workload: around 1,000 workspace objects plus 1,000 strokes, including
long strokes and dense overlap, with two collaborating browsers. Record point counts, browser
and viewport/zoom so comparisons are meaningful. Measure input latency, pan/zoom, memory,
synchronization and export. Compare with the current renderer before introducing machinery;
these sample sizes are workloads, not product limits or hard CI thresholds. Keep generated
measurement artifacts in ignored output locations and summarize findings in chat.

## Assumptions and deferred choices

- Existing projection and simplification may be sufficient initially. The executor resolves
  this through measurements in M0/M1 and revisits it if dense cases perform poorly.
- Exact field names and ownership structure are implementation choices for M0, constrained
  by one representation, editable promotion and existing world-coordinate geometry.
- The executor settles highlight deletion, overlapping highlight composition and primitive
  hit testing in M0/M1 using the stated user behavior; these are not pending user approvals.
- Additional layer/vector features remain deferred. Reconsider only with a concrete user
  need and performance evidence; ask before materially expanding the agreed scope.

## Sulion mapping and resume

Root: `36242596-3382-4467-8ed5-c2e8b1224632` — Drawing tools and markup.

| Milestone | Phase ID | State |
| --- | --- | --- |
| M0 | `fdb9d8de-abaa-49da-982c-c6f5e10030a7` | pending |
| M1 | `c8891d36-b9d1-4ede-a006-6b7feb477cf8` | pending |
| M2 | `e6931690-bd7e-4aac-ae34-899fdbf14406` | pending |
| M3 | `3ef678b3-dec0-435a-a346-6212ab8ac554` | pending |
| M4 | `0e83bf7e-829b-4d6f-8e0c-0909da02f12a` | pending |

No execution branches exist. After the user's resume instruction, read `sulion plan current`,
this contract, applicable instructions and changed sources. Reconcile the other agent's work,
then use plan-phase to expand M0 in this document before implementation. Preserve the pause
until that instruction arrives.
